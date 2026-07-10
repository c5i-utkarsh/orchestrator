"""
Prompt Strategy Selector — Phase 3 of Loop Engineering.

Selects the best planning strategy for a query using UCB1-style exploration:
    ucb_score(s) = average_score(s) + alpha * sqrt( ln(total+1) / (usage+1) )

This reuses the LinUCB exploration principle from the existing bandit without
duplicating the full implementation. No context vectors are needed here because
strategies are task-type driven, not query-embedding driven.

Classification uses fast keyword matching (zero LLM calls). The strategy is then
injected into the planner prompt as a structured guidance block.
"""
from __future__ import annotations

import hashlib
import logging
import math
import time
from dataclasses import dataclass
from typing import Any

log = logging.getLogger(__name__)

# ── UCB1 exploration constant ─────────────────────────────────────────────────
UCB_ALPHA = 0.5

# ── Keyword → strategy classification ────────────────────────────────────────
# Ordered by specificity — first match wins.
_KEYWORD_MAP = [
    ("Architecture",      ["architect", "design system", "component", "microservice", "infrastructure",
                           "api design", "deployment", "topology", "data flow"]),
    ("App Development",   ["build", "implement", "develop app", "create app", "code", "application",
                           "prototype", "mvp", "feature", "endpoint", "integration"]),
    ("Root Cause",        ["root cause", "why did", "failure", "error", "bug", "incident",
                           "5-why", "fishbone", "debug", "broken"]),
    ("Risk Analysis",     ["risk", "threat", "vulnerability", "compliance", "audit",
                           "security", "mitig", "exposure"]),
    ("Optimization",      ["optim", "improve performance", "bottleneck", "speed up", "efficiency",
                           "reduce cost", "scaling", "throughput"]),
    ("Forecasting",       ["forecast", "predict", "trend", "projection", "estimate",
                           "future", "outlook", "scenario", "growth rate"]),
    ("Executive Summary", ["executive summary", "brief", "highlight", "stakeholder",
                           "management report", "board", "summarize for"]),
    ("Workflow Design",   ["workflow", "process design", "pipeline", "automation", "step-by-step",
                           "business process", "sla", "approval flow"]),
    ("Scenario Planning", ["scenario", "what if", "contingency", "alternative", "best case",
                           "worst case", "planning ahead"]),
    ("Research",          []),  # fallback
]

# task_type → strategy override (when keyword match is absent)
_TASK_TYPE_MAP = {
    "code_generation": "App Development",
    "ui_building":     "App Development",
    "data_analysis":   "Research",
    "time_series":     "Forecasting",
    "financial":       "Forecasting",
    "geospatial":      "Research",
}


# ── Result dataclasses ────────────────────────────────────────────────────────

@dataclass
class StrategyResult:
    strategy_id: int | None
    strategy_name: str
    category: str
    template: str
    planning_style: str
    expected_output_structure: str
    verifier_expectations: str
    average_score: float
    usage_count: int
    ucb_score: float
    elapsed_ms: int


# ── Selector ──────────────────────────────────────────────────────────────────

class StrategySelector:
    """
    Selects the best prompt strategy for a query.
    Uses UCB1 exploration over DB-stored strategy scores.
    Records outcomes to the prompt_strategy_history table.
    """

    def __init__(self, enabled: bool = True):
        self._enabled = enabled

    # ── Public API ────────────────────────────────────────────────────────────

    async def select(
        self,
        query: str,
        task_type: str = "domain_qa",
    ) -> StrategyResult:
        """
        Select the best strategy for this query.
        Returns a fallback (Research) if disabled or DB unavailable.
        """
        t0 = time.monotonic()
        if not self._enabled:
            return self._fallback_strategy(t0)

        # Classify strategy by keyword / task type
        candidate_name = self._classify(query, task_type)
        log.info("[Strategy Selector] Candidate: %s (query: %.60s…)", candidate_name, query)

        try:
            strategy = await self._ucb_select(candidate_name)
            strategy.elapsed_ms = int((time.monotonic() - t0) * 1000)
            log.info("[Strategy Selector] Selected: %s (ucb=%.3f, avg=%.2f, n=%d) in %dms",
                     strategy.strategy_name, strategy.ucb_score,
                     strategy.average_score, strategy.usage_count, strategy.elapsed_ms)
            return strategy
        except Exception as exc:
            log.warning("[Strategy Selector] DB error (%s) — using fallback", exc)
            return self._fallback_strategy(t0)

    async def record_outcome(
        self,
        strategy_id: int | None,
        strategy_name: str,
        query: str,
        verifier_score: float,
        hallucination_rate: float,
        latency_ms: int,
        improvement_applied: bool,
    ) -> None:
        """
        Record the execution outcome to prompt_strategy_history.
        Update strategy average_score using exponential moving average.
        Only strengthens strategies when execution was successful (score ≥ 0.5).
        """
        if not self._enabled or strategy_id is None:
            return

        final_quality = 0.7 * verifier_score + 0.3 * (1.0 - min(hallucination_rate, 1.0))
        query_hash = hashlib.sha256(query.encode()).hexdigest()[:16]

        try:
            from app.db.database import AsyncSessionLocal
            from sqlalchemy import text

            async with AsyncSessionLocal() as db:
                # Insert history record
                await db.execute(text("""
                    INSERT INTO prompt_strategy_history
                        (query_hash, strategy_id, strategy_name, verifier_score,
                         hallucination_rate, latency_ms, improvement_applied, final_quality)
                    VALUES (:qh, :sid, :sn, :vs, :hr, :lat, :imp, :fq)
                """), {
                    "qh": query_hash, "sid": strategy_id, "sn": strategy_name,
                    "vs": verifier_score, "hr": hallucination_rate,
                    "lat": latency_ms, "imp": improvement_applied, "fq": final_quality,
                })

                # Update strategy stats (EMA with α=0.2 for slow drift)
                # Only update when score is reasonable (avoid poisoning with bad runs)
                if verifier_score >= 0.5:
                    await db.execute(text("""
                        UPDATE prompt_strategies SET
                            usage_count   = usage_count + 1,
                            last_used     = now(),
                            average_score = CASE
                                WHEN usage_count = 0 THEN CAST(:fq AS FLOAT)
                                ELSE average_score * 0.8 + CAST(:fq AS FLOAT) * 0.2
                            END
                        WHERE id = :sid
                    """), {"sid": strategy_id, "fq": final_quality})
                else:
                    # Even on failure, increment usage_count and decay slightly
                    await db.execute(text("""
                        UPDATE prompt_strategies SET
                            usage_count   = usage_count + 1,
                            last_used     = now(),
                            average_score = GREATEST(0.1, average_score * 0.95)
                        WHERE id = :sid
                    """), {"sid": strategy_id})

                await db.commit()
            log.info("[Strategy Selector] Recorded outcome for %s: quality=%.2f", strategy_name, final_quality)
        except Exception as exc:
            log.warning("[Strategy Selector] record_outcome error: %s", exc)

    # ── Classification ────────────────────────────────────────────────────────

    @staticmethod
    def _classify(query: str, task_type: str) -> str:
        """Keyword-based zero-latency classification."""
        q = query.lower()
        for strategy_name, keywords in _KEYWORD_MAP:
            if any(kw in q for kw in keywords):
                return strategy_name
        # Task type override
        if task_type in _TASK_TYPE_MAP:
            return _TASK_TYPE_MAP[task_type]
        return "Research"  # safe default

    # ── UCB1 strategy selection ───────────────────────────────────────────────

    async def _ucb_select(self, preferred_name: str) -> StrategyResult:
        """
        UCB1 selection: starts from the classified preferred strategy,
        but may pick another if its UCB score is higher.
        """
        from app.db.database import AsyncSessionLocal
        from sqlalchemy import text

        async with AsyncSessionLocal() as db:
            result = await db.execute(text("""
                SELECT id, name, category, template, planning_style,
                       expected_output_structure, verifier_expectations,
                       usage_count, average_score
                FROM prompt_strategies
                ORDER BY id
            """))
            rows = result.mappings().all()

        if not rows:
            return self._fallback_strategy(time.monotonic())

        total_uses = sum(int(r["usage_count"]) for r in rows)
        best: dict[str, Any] | None = None
        best_ucb = -1.0

        for r in rows:
            n = int(r["usage_count"]) or 0
            avg = float(r["average_score"]) or 0.5
            # UCB1: avg + alpha * sqrt(ln(T+1) / (n+1))
            ucb = avg + UCB_ALPHA * math.sqrt(math.log(total_uses + 1) / (n + 1))
            # Boost preferred strategy slightly to break ties
            if r["name"] == preferred_name:
                ucb += 0.05
            if ucb > best_ucb:
                best_ucb = ucb
                best = dict(r)
                best["_ucb"] = ucb

        assert best is not None
        return StrategyResult(
            strategy_id=int(best["id"]),
            strategy_name=str(best["name"]),
            category=str(best["category"]),
            template=str(best["template"]),
            planning_style=str(best.get("planning_style") or ""),
            expected_output_structure=str(best.get("expected_output_structure") or ""),
            verifier_expectations=str(best.get("verifier_expectations") or ""),
            average_score=float(best["average_score"]),
            usage_count=int(best["usage_count"]),
            ucb_score=float(best["_ucb"]),
            elapsed_ms=0,
        )

    @staticmethod
    def _fallback_strategy(t0: float) -> StrategyResult:
        return StrategyResult(
            strategy_id=None,
            strategy_name="Research",
            category="analysis",
            template="Identify key facts, compare sources, synthesise findings.",
            planning_style="Systematic inquiry",
            expected_output_structure="Introduction → Key Findings → Conclusion",
            verifier_expectations="Completeness, accuracy",
            average_score=0.5,
            usage_count=0,
            ucb_score=0.5,
            elapsed_ms=int((time.monotonic() - t0) * 1000),
        )
