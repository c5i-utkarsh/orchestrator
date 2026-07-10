"""
Loop Engine Controller — Phase 1 + Execution Library (Phase 2).

Orchestrates: Planner → Executor → Verifier → Critic → Improver (optional) → Return.
Phase 2 addition: Execution Library search/store wrapped around Planner.

Maximum ONE improvement pass. No recursive loops. No infinite retries.
If loop_config.enabled == false, the existing pipeline runs unchanged.
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import AsyncGenerator, Any

log = logging.getLogger(__name__)

_CONFIG_PATH = Path(__file__).resolve().parent.parent.parent / "loop_config.json"


def load_loop_config() -> dict:
    """Load loop_config.json. Returns defaults if file is missing."""
    try:
        with open(_CONFIG_PATH, encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception:
        cfg = {}
    lib_cfg = cfg.get("execution_library", {})
    return {
        "enabled":                bool(cfg.get("enabled", False)),
        "verification_threshold": float(cfg.get("verification_threshold", 0.80)),
        "maximum_iterations":     int(cfg.get("maximum_iterations", 1)),
        "planner_timeout":        float(cfg.get("planner_timeout", 15)),
        "verifier_timeout":       float(cfg.get("verifier_timeout", 15)),
        "critic_timeout":         float(cfg.get("critic_timeout", 15)),
        "improver_timeout":       float(cfg.get("improver_timeout", 30)),
        "library_enabled":        bool(lib_cfg.get("enabled", True)),
        "library_similarity_threshold": float(lib_cfg.get("similarity_threshold", 0.88)),
        "library_min_store_score":      float(lib_cfg.get("min_store_score", 0.90)),
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
    # Phase 2 fields
    plan_reused: bool = False
    plan_similarity: float | None = None
    plan_stored: bool = False


class LoopEngine:
    """
    Controls the full loop pipeline.
    Each stage is independently replaceable.
    Returns modified SSE events with the (optionally improved) final answer.
    """

    def __init__(self, adapter_registry, embed_fn=None):
        from app.modules.loop_engine.planner  import LoopPlanner
        from app.modules.loop_engine.executor import LoopExecutor
        from app.modules.loop_engine.verifier import LoopVerifier
        from app.modules.loop_engine.critic   import LoopCritic
        from app.modules.loop_engine.improver import LoopImprover
        from app.modules.loop_engine.execution_library import ExecutionLibrary

        cfg = load_loop_config()
        self._cfg = cfg
        self._embed = embed_fn

        # Build execution library (Phase 2)
        _library = None
        if embed_fn is not None and cfg["library_enabled"]:
            _library = ExecutionLibrary(
                embed_fn=embed_fn,
                similarity_threshold=cfg["library_similarity_threshold"],
                min_store_score=cfg["library_min_store_score"],
                enabled=cfg["library_enabled"],
            )

        self._planner  = LoopPlanner(adapter_registry, timeout=cfg["planner_timeout"],
                                     embed_fn=embed_fn, library=_library)
        self._executor = LoopExecutor()
        self._verifier = LoopVerifier(adapter_registry, timeout=cfg["verifier_timeout"],
                                      threshold=cfg["verification_threshold"])
        self._critic   = LoopCritic(adapter_registry,  timeout=cfg["critic_timeout"])
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
            ev = {
                "type": "stage",
                "step_name": stage,
                "detail": detail,
                "loop_engine": True,
            }
            if data:
                ev["loop_data"] = data
            return ev

        try:
            # ── Stage 1: Planner (+ Execution Library search) ─────────────────
            log.info("[LoopEngine] === Stage 1: Planner ===")
            loop_events.append(_stage_event("Loop Planner", "Searching execution library then planning…"))

            plan = await self._planner.plan(
                query=query, task_type=task_type,
                domain=domain, context_summary=context_summary,
                complexity=complexity,
            )

            # Build planner event detail with library provenance
            if plan.reused_from_library:
                planner_label = "Loop Planner ✓ (Reused Strategy)"
                planner_detail = (
                    f"Reused strategy from library (sim={plan.library_similarity:.0%}) | "
                    f"Goal: {plan.goal[:60]} | {plan.elapsed_ms}ms"
                )
            else:
                planner_label = "Loop Planner ✓ (Fresh Strategy)"
                planner_detail = f"Fresh plan | Goal: {plan.goal[:60]} | {plan.elapsed_ms}ms"

            loop_events.append(_stage_event(
                planner_label,
                planner_detail,
                {
                    "goal": plan.goal,
                    "subtasks": plan.subtasks,
                    "elapsed_ms": plan.elapsed_ms,
                    "reused": plan.reused_from_library,
                    "similarity": plan.library_similarity,
                },
            ))
            log.info("[LoopEngine] Plan: reused=%s goal=%s", plan.reused_from_library, plan.goal[:60])

            # ── Stage 2: Executor — wraps existing pipeline ────────────────────
            log.info("[LoopEngine] === Stage 2: Executor (existing pipeline) ===")
            loop_events.append(_stage_event("Loop Executor", "Running existing inference pipeline…"))

            exec_result = await self._executor.execute(generator)
            loop_events.extend(exec_result.events)

            if not exec_result.final_answer:
                log.warning("[LoopEngine] Executor returned empty answer — aborting loop")
                return LoopResult(
                    final_answer="", was_improved=False,
                    plan_goal=plan.goal, verifier_score=None,
                    loop_events=loop_events, error="Empty answer from executor",
                    total_elapsed_ms=int((time.monotonic() - t0) * 1000),
                    plan_reused=plan.reused_from_library,
                    plan_similarity=plan.library_similarity,
                )

            loop_events.append(_stage_event(
                "Loop Executor ✓",
                f"Answer generated ({len(exec_result.final_answer)} chars) in {exec_result.elapsed_ms}ms",
            ))
            current_answer = exec_result.final_answer

            # ── Stage 3: Verifier ──────────────────────────────────────────────
            log.info("[LoopEngine] === Stage 3: Verifier ===")
            loop_events.append(_stage_event("Loop Verifier", "Evaluating answer quality…"))

            verification = await self._verifier.verify(query, plan, current_answer)
            loop_events.append(_stage_event(
                "Loop Verifier ✓",
                f"Score={verification.score:.2f} needs_improvement={verification.needs_improvement} in {verification.elapsed_ms}ms",
                {
                    "score": verification.score,
                    "hallucination_risk": verification.hallucination_risk,
                    "reasoning_quality": verification.reasoning_quality,
                    "needs_improvement": verification.needs_improvement,
                    "missing_items": verification.missing_items,
                },
            ))
            log.info("[LoopEngine] Verification score=%.2f needs_improvement=%s",
                     verification.score, verification.needs_improvement)

            # ── Stage 4: Critic ────────────────────────────────────────────────
            log.info("[LoopEngine] === Stage 4: Critic ===")
            loop_events.append(_stage_event("Loop Critic", "Identifying answer weaknesses…"))

            critique = await self._critic.critique(query, current_answer, verification, plan)
            loop_events.append(_stage_event(
                "Loop Critic ✓",
                f"{len(critique.weak_sections)} weak section(s) identified in {critique.elapsed_ms}ms",
                {
                    "weak_sections": len(critique.weak_sections),
                    "overall_summary": critique.overall_summary[:100],
                    "missing_examples": critique.missing_examples,
                },
            ))

            # ── Stage 5: Improver (only if needed) ────────────────────────────
            was_improved = False
            if verification.needs_improvement and self._cfg["maximum_iterations"] >= 1:
                log.info("[LoopEngine] === Stage 5: Improver (score < threshold) ===")
                loop_events.append(_stage_event(
                    "Loop Improver",
                    f"Score {verification.score:.2f} < {self._cfg['verification_threshold']:.2f} — patching weak sections…",
                ))
                improvement = await self._improver.improve(
                    query, current_answer, verification, critique, plan
                )
                was_improved = improvement.was_improved
                current_answer = improvement.improved_answer
                loop_events.append(_stage_event(
                    "Loop Improver ✓" if was_improved else "Loop Improver — original preserved",
                    f"{'Improved' if was_improved else 'No change'} in {improvement.elapsed_ms}ms"
                    + (f" — {improvement.error}" if improvement.error else ""),
                    {"was_improved": was_improved},
                ))
            else:
                log.info("[LoopEngine] Stage 5: Improver skipped (score=%.2f ≥ threshold)",
                         verification.score)

            # ── Phase 2: Store plan in Execution Library (if quality passes) ──
            plan_stored = False
            if self._library is not None and not plan.reused_from_library:
                store_result = await self._library.store(
                    query=query,
                    plan=plan,
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
                else:
                    log.info("[LoopEngine] Plan not stored: %s", store_result.reason)
            elif self._library is not None and plan.reused_from_library and plan.library_entry_id:
                # Update usage metrics for the reused entry
                await self._library.record_usage(plan.library_entry_id, verification.score)
                log.info("[LoopEngine] Recorded usage for library entry %s", plan.library_entry_id)

            total_elapsed = int((time.monotonic() - t0) * 1000)
            log.info("[LoopEngine] === Complete in %dms (improved=%s, reused=%s, stored=%s) ===",
                     total_elapsed, was_improved, plan.reused_from_library, plan_stored)

            return LoopResult(
                final_answer=current_answer,
                was_improved=was_improved,
                plan_goal=plan.goal,
                verifier_score=verification.score,
                loop_events=loop_events,
                total_elapsed_ms=total_elapsed,
                plan_reused=plan.reused_from_library,
                plan_similarity=plan.library_similarity,
                plan_stored=plan_stored,
            )

        except Exception as exc:
            log.exception("[LoopEngine] Unhandled error: %s", exc)
            return LoopResult(
                final_answer="", was_improved=False,
                plan_goal="", verifier_score=None,
                loop_events=loop_events, error=str(exc),
                total_elapsed_ms=int((time.monotonic() - t0) * 1000),
            )


class LoopEngine:
    """
    Controls the full loop pipeline.
    Each stage is independently replaceable.
    Returns modified SSE events with the (optionally improved) final answer.
    """

    def __init__(self, adapter_registry):
        from app.modules.loop_engine.planner  import LoopPlanner
        from app.modules.loop_engine.executor import LoopExecutor
        from app.modules.loop_engine.verifier import LoopVerifier
        from app.modules.loop_engine.critic   import LoopCritic
        from app.modules.loop_engine.improver import LoopImprover

        cfg = load_loop_config()
        self._planner  = LoopPlanner(adapter_registry,  timeout=cfg["planner_timeout"])
        self._executor = LoopExecutor()
        self._verifier = LoopVerifier(adapter_registry,  timeout=cfg["verifier_timeout"],
                                      threshold=cfg["verification_threshold"])
        self._critic   = LoopCritic(adapter_registry,   timeout=cfg["critic_timeout"])
        self._improver = LoopImprover(adapter_registry, timeout=cfg["improver_timeout"],
                                       threshold=cfg["verification_threshold"])
        self._cfg = cfg

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
            ev = {
                "type": "stage",
                "step_name": stage,
                "detail": detail,
                "loop_engine": True,
            }
            if data:
                ev["loop_data"] = data
            return ev

        try:
            # ── Stage 1: Planner ──────────────────────────────────────────────
            log.info("[LoopEngine] === Stage 1: Planner ===")
            loop_events.append(_stage_event("Loop Planner", "Analysing query and planning execution…"))

            plan = await self._planner.plan(
                query=query, task_type=task_type,
                domain=domain, context_summary=context_summary,
                complexity=complexity,
            )
            loop_events.append(_stage_event(
                "Loop Planner ✓",
                f"Goal: {plan.goal[:80]} | Complexity: {plan.complexity} | {plan.elapsed_ms}ms",
                {"goal": plan.goal, "subtasks": plan.subtasks, "elapsed_ms": plan.elapsed_ms},
            ))
            log.info("[LoopEngine] Plan: %s (error=%s)", plan.goal[:60], plan.error)

            # ── Stage 2: Executor — wraps existing pipeline ────────────────────
            log.info("[LoopEngine] === Stage 2: Executor (existing pipeline) ===")
            loop_events.append(_stage_event("Loop Executor", "Running existing inference pipeline…"))

            exec_result = await self._executor.execute(generator)
            loop_events.extend(exec_result.events)  # inject existing pipeline events

            if not exec_result.final_answer:
                log.warning("[LoopEngine] Executor returned empty answer — aborting loop")
                return LoopResult(
                    final_answer="", was_improved=False,
                    plan_goal=plan.goal, verifier_score=None,
                    loop_events=loop_events, error="Empty answer from executor",
                    total_elapsed_ms=int((time.monotonic() - t0) * 1000),
                )

            loop_events.append(_stage_event(
                "Loop Executor ✓",
                f"Answer generated ({len(exec_result.final_answer)} chars) in {exec_result.elapsed_ms}ms",
            ))
            log.info("[LoopEngine] Executor done: %d chars, slm=%s",
                     len(exec_result.final_answer), exec_result.slm_model_id)

            current_answer = exec_result.final_answer

            # ── Stage 3: Verifier ──────────────────────────────────────────────
            log.info("[LoopEngine] === Stage 3: Verifier ===")
            loop_events.append(_stage_event("Loop Verifier", "Evaluating answer quality…"))

            verification = await self._verifier.verify(query, plan, current_answer)
            loop_events.append(_stage_event(
                "Loop Verifier ✓",
                f"Score={verification.score:.2f} needs_improvement={verification.needs_improvement} in {verification.elapsed_ms}ms",
                {
                    "score": verification.score,
                    "hallucination_risk": verification.hallucination_risk,
                    "reasoning_quality": verification.reasoning_quality,
                    "needs_improvement": verification.needs_improvement,
                    "missing_items": verification.missing_items,
                },
            ))
            log.info("[LoopEngine] Verification score=%.2f needs_improvement=%s",
                     verification.score, verification.needs_improvement)

            # ── Stage 4: Critic ────────────────────────────────────────────────
            log.info("[LoopEngine] === Stage 4: Critic ===")
            loop_events.append(_stage_event("Loop Critic", "Identifying answer weaknesses…"))

            critique = await self._critic.critique(query, current_answer, verification, plan)
            loop_events.append(_stage_event(
                "Loop Critic ✓",
                f"{len(critique.weak_sections)} weak section(s) identified in {critique.elapsed_ms}ms",
                {
                    "weak_sections": len(critique.weak_sections),
                    "overall_summary": critique.overall_summary[:100],
                    "missing_examples": critique.missing_examples,
                },
            ))
            log.info("[LoopEngine] Critique: %d weak sections, summary=%s",
                     len(critique.weak_sections), critique.overall_summary[:60])

            # ── Stage 5: Improver (only if needed) ────────────────────────────
            was_improved = False
            if verification.needs_improvement and self._cfg["maximum_iterations"] >= 1:
                log.info("[LoopEngine] === Stage 5: Improver (score < threshold) ===")
                loop_events.append(_stage_event(
                    "Loop Improver",
                    f"Score {verification.score:.2f} < {self._cfg['verification_threshold']:.2f} — patching weak sections…",
                ))

                improvement = await self._improver.improve(
                    query, current_answer, verification, critique, plan
                )
                was_improved = improvement.was_improved
                current_answer = improvement.improved_answer

                loop_events.append(_stage_event(
                    "Loop Improver ✓" if was_improved else "Loop Improver — original preserved",
                    f"{'Improved' if was_improved else 'No change'} in {improvement.elapsed_ms}ms"
                    + (f" — {improvement.error}" if improvement.error else ""),
                    {"was_improved": was_improved},
                ))
                log.info("[LoopEngine] Improver: was_improved=%s, answer=%d chars",
                         was_improved, len(current_answer))
            else:
                log.info("[LoopEngine] Stage 5: Improver skipped (score=%.2f ≥ threshold=%.2f)",
                         verification.score, self._cfg["verification_threshold"])

            total_elapsed = int((time.monotonic() - t0) * 1000)
            log.info("[LoopEngine] === Complete in %dms (improved=%s) ===", total_elapsed, was_improved)

            return LoopResult(
                final_answer=current_answer,
                was_improved=was_improved,
                plan_goal=plan.goal,
                verifier_score=verification.score,
                loop_events=loop_events,
                total_elapsed_ms=total_elapsed,
            )

        except Exception as exc:
            log.exception("[LoopEngine] Unhandled error: %s", exc)
            return LoopResult(
                final_answer="",
                was_improved=False,
                plan_goal="",
                verifier_score=None,
                loop_events=loop_events,
                error=str(exc),
                total_elapsed_ms=int((time.monotonic() - t0) * 1000),
            )
