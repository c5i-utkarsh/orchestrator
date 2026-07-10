"""
Loop Engine Controller — Phase 1 + Execution Library (Phase 2) + Prompt Strategy Optimization (Phase 3).

Flow: Planner → Executor → Verifier → Critic → Improver (opt.) → Return.
Phase 2: Execution Library search/store around Planner.
Phase 3: StrategySelector selects planner strategy via UCB1 before Planner runs.

Maximum ONE improvement pass. No recursive loops. No infinite retries.
If loop_config.enabled == false, the existing pipeline runs byte-for-byte unchanged.
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import AsyncGenerator

log = logging.getLogger(__name__)

_CONFIG_PATH = Path(__file__).resolve().parent.parent.parent / "loop_config.json"


def load_loop_config() -> dict:
    """Load loop_config.json. Returns safe defaults if file is missing."""
    try:
        with open(_CONFIG_PATH, encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception:
        cfg = {}
    lib_cfg = cfg.get("execution_library", {})
    strat_cfg = cfg.get("prompt_strategies", {})
    return {
        "enabled":                bool(cfg.get("enabled", False)),
        "verification_threshold": float(cfg.get("verification_threshold", 0.80)),
        "maximum_iterations":     int(cfg.get("maximum_iterations", 1)),
        "planner_timeout":        float(cfg.get("planner_timeout", 15)),
        "verifier_timeout":       float(cfg.get("verifier_timeout", 15)),
        "critic_timeout":         float(cfg.get("critic_timeout", 15)),
        "improver_timeout":       float(cfg.get("improver_timeout", 30)),
        # Phase 2
        "library_enabled":                  bool(lib_cfg.get("enabled", True)),
        "library_similarity_threshold":     float(lib_cfg.get("similarity_threshold", 0.88)),
        "library_min_store_score":          float(lib_cfg.get("min_store_score", 0.90)),
        # Phase 3
        "strategies_enabled":               bool(strat_cfg.get("enabled", True)),
    }


@dataclass
class LoopResult:
    final_answer: str
    was_improved: bool
    plan_goal: str
    verifier_score: float | None
    loop_events: list[dict] = field(default_factory=list)
    error: str | None = None
    total_elapsed_ms: int = 0
    # Phase 2
    plan_reused: bool = False
    plan_similarity: float | None = None
    plan_stored: bool = False
    # Phase 3
    strategy_name: str = "Research"
    strategy_id: int | None = None
    strategy_avg_score: float | None = None
    strategy_ucb_score: float | None = None


class LoopEngine:
    """
    Controls the full loop pipeline.
    Each stage is independently replaceable.
    Returns modified SSE events with the (optionally improved) final answer.
    """

    def __init__(self, adapter_registry, embed_fn=None):
        from app.modules.loop_engine.planner          import LoopPlanner
        from app.modules.loop_engine.executor         import LoopExecutor
        from app.modules.loop_engine.verifier         import LoopVerifier
        from app.modules.loop_engine.critic           import LoopCritic
        from app.modules.loop_engine.improver         import LoopImprover
        from app.modules.loop_engine.execution_library import ExecutionLibrary
        from app.modules.loop_engine.strategy_selector import StrategySelector

        cfg = load_loop_config()
        self._cfg = cfg

        # Phase 2: Execution Library
        _library = None
        if embed_fn is not None and cfg["library_enabled"]:
            _library = ExecutionLibrary(
                embed_fn=embed_fn,
                similarity_threshold=cfg["library_similarity_threshold"],
                min_store_score=cfg["library_min_store_score"],
                enabled=cfg["library_enabled"],
            )

        # Phase 3: Strategy Selector
        self._strategy_selector = StrategySelector(enabled=cfg["strategies_enabled"])

        self._planner  = LoopPlanner(adapter_registry, timeout=cfg["planner_timeout"],
                                     embed_fn=embed_fn, library=_library)
        self._executor = LoopExecutor()
        self._verifier = LoopVerifier(adapter_registry, timeout=cfg["verifier_timeout"],
                                      threshold=cfg["verification_threshold"])
        self._critic   = LoopCritic(adapter_registry, timeout=cfg["critic_timeout"])
        self._improver = LoopImprover(adapter_registry, timeout=cfg["improver_timeout"],
                                       threshold=cfg["verification_threshold"])
        self._library  = _library

    async def run(
        self,
        query: str,
        generator: AsyncGenerator,
        task_type: str = "domain_qa",
        domain: str = "general",
        context_summary: str = "",
        complexity: str = "Medium",
    ) -> LoopResult:
        t0 = time.monotonic()
        loop_events: list[dict] = []

        def _stage_event(stage: str, detail: str, data: dict | None = None) -> dict:
            ev = {"type": "stage", "step_name": stage, "detail": detail, "loop_engine": True}
            if data:
                ev["loop_data"] = data
            return ev

        try:
            # ── Phase 3: Strategy Selection ───────────────────────────────────
            log.info("[LoopEngine] === Phase 3: Strategy Selection ===")
            strategy = await self._strategy_selector.select(query=query, task_type=task_type)
            loop_events.append(_stage_event(
                f"🧠 Strategy: {strategy.strategy_name}",
                f"UCB={strategy.ucb_score:.3f} · avg={strategy.average_score:.2f} · n={strategy.usage_count} · {strategy.elapsed_ms}ms",
                {
                    "strategy_name": strategy.strategy_name,
                    "strategy_id":   strategy.strategy_id,
                    "ucb_score":     strategy.ucb_score,
                    "avg_score":     strategy.average_score,
                    "usage_count":   strategy.usage_count,
                },
            ))
            log.info("[LoopEngine] Strategy selected: %s (ucb=%.3f)", strategy.strategy_name, strategy.ucb_score)

            # ── Stage 1: Planner (+ Execution Library search + strategy injection) ─
            log.info("[LoopEngine] === Stage 1: Planner ===")
            loop_events.append(_stage_event("Loop Planner", "Searching execution library then planning…"))

            plan = await self._planner.plan(
                query=query, task_type=task_type, domain=domain,
                context_summary=context_summary, complexity=complexity,
                strategy=strategy,
            )

            planner_label = (
                f"Loop Planner ✓ (Reused Strategy)" if plan.reused_from_library
                else f"Loop Planner ✓ (Fresh Strategy)"
            )
            loop_events.append(_stage_event(
                planner_label,
                (f"Reused (sim={plan.library_similarity:.0%}) | " if plan.reused_from_library else "")
                + f"Goal: {plan.goal[:60]} | {plan.elapsed_ms}ms",
                {"goal": plan.goal, "subtasks": plan.subtasks,
                 "reused": plan.reused_from_library, "strategy": plan.strategy_name},
            ))

            # ── Stage 2: Executor — wraps existing pipeline ───────────────────
            log.info("[LoopEngine] === Stage 2: Executor (existing pipeline) ===")
            loop_events.append(_stage_event("Loop Executor", "Running existing inference pipeline…"))
            exec_result = await self._executor.execute(generator)
            loop_events.extend(exec_result.events)

            if not exec_result.final_answer:
                return LoopResult(
                    final_answer="", was_improved=False, plan_goal=plan.goal,
                    verifier_score=None, loop_events=loop_events,
                    error="Empty answer from executor",
                    total_elapsed_ms=int((time.monotonic() - t0) * 1000),
                    strategy_name=strategy.strategy_name, strategy_id=strategy.strategy_id,
                    strategy_avg_score=strategy.average_score, strategy_ucb_score=strategy.ucb_score,
                )

            loop_events.append(_stage_event(
                "Loop Executor ✓",
                f"Answer generated ({len(exec_result.final_answer)} chars) in {exec_result.elapsed_ms}ms",
            ))
            current_answer = exec_result.final_answer

            # ── Stage 3: Verifier ─────────────────────────────────────────────
            log.info("[LoopEngine] === Stage 3: Verifier ===")
            loop_events.append(_stage_event("Loop Verifier", "Evaluating answer quality…"))
            verification = await self._verifier.verify(query, plan, current_answer)
            loop_events.append(_stage_event(
                "Loop Verifier ✓",
                f"Score={verification.score:.2f} needs_improvement={verification.needs_improvement} in {verification.elapsed_ms}ms",
                {"score": verification.score, "hallucination_risk": verification.hallucination_risk,
                 "reasoning_quality": verification.reasoning_quality,
                 "needs_improvement": verification.needs_improvement},
            ))

            # ── Stage 4: Critic ───────────────────────────────────────────────
            log.info("[LoopEngine] === Stage 4: Critic ===")
            loop_events.append(_stage_event("Loop Critic", "Identifying answer weaknesses…"))
            critique = await self._critic.critique(query, current_answer, verification, plan)
            loop_events.append(_stage_event(
                "Loop Critic ✓",
                f"{len(critique.weak_sections)} weak section(s) in {critique.elapsed_ms}ms",
                {"weak_sections": len(critique.weak_sections), "overall_summary": critique.overall_summary[:80]},
            ))

            # ── Stage 5: Improver (only if needed) ────────────────────────────
            was_improved = False
            if verification.needs_improvement and self._cfg["maximum_iterations"] >= 1:
                log.info("[LoopEngine] === Stage 5: Improver ===")
                loop_events.append(_stage_event(
                    "Loop Improver",
                    f"Score {verification.score:.2f} < {self._cfg['verification_threshold']:.2f} — patching…",
                ))
                improvement = await self._improver.improve(
                    query, current_answer, verification, critique, plan
                )
                was_improved = improvement.was_improved
                current_answer = improvement.improved_answer
                loop_events.append(_stage_event(
                    "Loop Improver ✓" if was_improved else "Loop Improver — original preserved",
                    f"{'Improved' if was_improved else 'No change'} in {improvement.elapsed_ms}ms",
                    {"was_improved": was_improved},
                ))

            # ── Phase 2: Store plan in Execution Library ──────────────────────
            plan_stored = False
            if self._library is not None and not plan.reused_from_library:
                store_result = await self._library.store(
                    query=query, plan=plan,
                    verifier_score=verification.score,
                    hallucination_risk=verification.hallucination_risk,
                    task_category=task_type,
                )
                plan_stored = store_result.stored
                if plan_stored:
                    loop_events.append(_stage_event(
                        "Execution Library ✓",
                        f"Plan stored (id={store_result.entry_id}, score={verification.score:.2f})",
                        {"stored": True, "entry_id": store_result.entry_id},
                    ))
            elif self._library is not None and plan.reused_from_library and plan.library_entry_id:
                await self._library.record_usage(plan.library_entry_id, verification.score)

            # ── Phase 3: Record strategy outcome ─────────────────────────────
            total_latency = int((time.monotonic() - t0) * 1000)
            await self._strategy_selector.record_outcome(
                strategy_id=strategy.strategy_id,
                strategy_name=strategy.strategy_name,
                query=query,
                verifier_score=verification.score,
                hallucination_rate=float(verification.hallucination_risk == "High") * 0.5
                                  + float(verification.hallucination_risk == "Medium") * 0.2,
                latency_ms=total_latency,
                improvement_applied=was_improved,
            )

            if self._cfg["strategies_enabled"]:
                loop_events.append(_stage_event(
                    f"📈 Strategy: {strategy.strategy_name} · score recorded",
                    f"Outcome recorded: quality={verification.score:.2f}",
                    {"strategy_name": strategy.strategy_name, "verifier_score": verification.score},
                ))

            log.info("[LoopEngine] === Complete in %dms (strategy=%s, improved=%s, plan_stored=%s) ===",
                     total_latency, strategy.strategy_name, was_improved, plan_stored)

            return LoopResult(
                final_answer=current_answer,
                was_improved=was_improved,
                plan_goal=plan.goal,
                verifier_score=verification.score,
                loop_events=loop_events,
                total_elapsed_ms=total_latency,
                plan_reused=plan.reused_from_library,
                plan_similarity=plan.library_similarity,
                plan_stored=plan_stored,
                strategy_name=strategy.strategy_name,
                strategy_id=strategy.strategy_id,
                strategy_avg_score=strategy.average_score,
                strategy_ucb_score=strategy.ucb_score,
            )

        except Exception as exc:
            log.exception("[LoopEngine] Unhandled error: %s", exc)
            return LoopResult(
                final_answer="", was_improved=False,
                plan_goal="", verifier_score=None,
                loop_events=loop_events, error=str(exc),
                total_elapsed_ms=int((time.monotonic() - t0) * 1000),
            )
