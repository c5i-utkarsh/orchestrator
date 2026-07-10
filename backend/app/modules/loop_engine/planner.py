"""
Loop Engine Planner — Phase 1 + Execution Library (Phase 2) + Strategy Injection (Phase 3).

Phase 3 addition: accepts an optional StrategyResult and injects its template
into the planner prompt to guide the structural approach.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass, field

log = logging.getLogger(__name__)

_PLANNER_PROMPT = """\
You are an execution planner for a domain AI system.

Your ONLY job is to decide HOW to answer the question — NOT to answer it.

User Query: {query}

Task Type: {task_type}
Domain: {domain}
Available Context: {context_summary}
Complexity hint: {complexity}

Produce a structured execution plan. Respond ONLY with a JSON object:
{{
  "goal": "<one sentence: what the answer must achieve>",
  "subtasks": [
    "<subtask 1 — specific, ≤20 words>",
    "<subtask 2 — optional>"
  ],
  "required_context": ["<context item 1>", "<context item 2>"],
  "expected_output": "<Report|Explanation|Code|Analysis|Summary|Comparison>",
  "complexity": "<Simple|Medium|Complex>",
  "success_criteria": "<how to know the answer is complete>"
}}

Rules:
- Do NOT generate the answer.
- Do NOT include example answers.
- Keep subtasks focused and minimal (1–3 max).
- Keep goal ≤ 25 words.
"""

_ADAPT_PROMPT = """\
You are an execution planner adapting a proven strategy to a new query.

New Query: {query}

Existing strategy (reuse its STRUCTURE, NOT its content):
  Goal template:    {stored_goal}
  Subtask pattern:  {stored_subtasks}
  Expected output:  {expected_output}
  Complexity:       {complexity}

Rewrite the goal and subtask wording to fit the new query.
Keep the same structural approach and output type.
Do NOT copy or reference the stored goal verbatim.
Do NOT generate any answers.

Respond ONLY with a JSON object:
{{
  "goal": "<adapted goal for the new query, ≤25 words>",
  "subtasks": ["<adapted subtask 1>", "<adapted subtask 2 — optional>"],
  "success_criteria": "<adapted criteria>"
}}
"""


@dataclass
class PlanResult:
    goal: str
    subtasks: list[str]
    required_context: list[str]
    expected_output: str
    complexity: str
    success_criteria: str
    raw: dict = field(default_factory=dict)
    error: str | None = None
    elapsed_ms: int = 0
    # Phase 2 fields — None when library is disabled or not used
    reused_from_library: bool = False
    library_similarity: float | None = None
    library_entry_id: int | None = None
    # Phase 3 fields
    strategy_name: str = "Research"
    strategy_id: int | None = None


# ── Strategy injection suffix ─────────────────────────────────────────────────
_STRATEGY_SUFFIX = """
PLANNING STRATEGY: {strategy_name}
Structural approach: {planning_style}
Required output sections: {expected_output_structure}
Quality criteria: {verifier_expectations}

Apply this planning strategy to structure your execution plan above.
"""


class LoopPlanner:
    """
    Decides HOW to answer the query — never generates the answer itself.
    Phase 2: searches Execution Library before generating a fresh plan.
    """

    def __init__(self, adapter_registry, timeout: float = 15.0,
                 embed_fn=None, library=None):
        self._registry = adapter_registry
        self._timeout  = timeout
        self._embed    = embed_fn    # async (str) -> list[float] — optional
        self._library  = library     # ExecutionLibrary instance — optional

    async def plan(
        self,
        query: str,
        task_type: str = "domain_qa",
        domain: str = "general",
        context_summary: str = "",
        complexity: str = "Medium",
        strategy=None,   # StrategyResult | None — injected by LoopEngine Phase 3
    ) -> PlanResult:
        t0 = time.monotonic()
        log.info("[Planner] Starting plan for query (%.60s…)", query)

        # ── Phase 2: Search Execution Library first ───────────────────────────
        if self._library is not None and self._embed is not None:
            try:
                search_result = await self._library.search(query)
                if search_result.found:
                    log.info("[Planner] Library hit (similarity=%.3f, entry=%s) — adapting plan",
                             search_result.similarity, search_result.entry_id)
                    adapted = await self._adapt_plan(
                        query=query, stored_result=search_result, t0=t0, strategy=strategy,
                    )
                    return adapted
                else:
                    log.info("[Planner] No library match (best=%.3f) — generating fresh plan",
                             search_result.similarity)
            except Exception as exc:
                log.warning("[Planner] Library search failed (%s) — generating fresh plan", exc)

        # ── Fresh plan generation ─────────────────────────────────────────────
        return await self._generate_fresh(
            query=query, task_type=task_type, domain=domain,
            context_summary=context_summary, complexity=complexity,
            t0=t0, strategy=strategy,
        )

    async def _adapt_plan(self, query: str, stored_result, t0: float, strategy=None) -> PlanResult:
        """Adapt a stored plan structure to the current query — keep structure, reword goal."""
        s_name = strategy.strategy_name if strategy else "Research"
        s_id   = strategy.strategy_id   if strategy else None
        try:
            judge_info = await self._registry.get_best_local_model()
            model = judge_info.model_id if judge_info else None

            if not model:
                # Fall back to stored plan wording directly (no LLM call)
                elapsed = int((time.monotonic() - t0) * 1000)
                return PlanResult(
                    goal=stored_result.planner_goal,
                    subtasks=stored_result.planner_subtasks,
                    required_context=[],
                    expected_output=stored_result.expected_output,
                    complexity=stored_result.complexity,
                    success_criteria=stored_result.success_criteria,
                    reused_from_library=True,
                    library_similarity=stored_result.similarity,
                    library_entry_id=stored_result.entry_id,
                    strategy_name=s_name, strategy_id=s_id,
                    elapsed_ms=elapsed,
                )

            prompt = _ADAPT_PROMPT.format(
                query=query[:400],
                stored_goal=stored_result.planner_goal[:150],
                stored_subtasks="; ".join(stored_result.planner_subtasks[:3]),
                expected_output=stored_result.expected_output,
                complexity=stored_result.complexity,
            )

            try:
                raw = await asyncio.wait_for(
                    self._registry.generate(model, prompt, temperature=0.1),
                    timeout=self._timeout,
                )
            except asyncio.TimeoutError:
                log.warning("[Planner] Adaptation timed out — using stored wording directly")
                raw = None

            elapsed = int((time.monotonic() - t0) * 1000)

            if raw:
                m = re.search(r"\{.*\}", raw, re.DOTALL)
                if m:
                    data = json.loads(m.group())
                    log.info("[Planner] Adapted plan in %dms (library sim=%.3f, strategy=%s)",
                             elapsed, stored_result.similarity, s_name)
                    return PlanResult(
                        goal=str(data.get("goal", stored_result.planner_goal))[:200],
                        subtasks=list(data.get("subtasks", stored_result.planner_subtasks))[:3],
                        required_context=[],
                        expected_output=stored_result.expected_output,
                        complexity=stored_result.complexity,
                        success_criteria=str(data.get("success_criteria", stored_result.success_criteria)),
                        raw=data,
                        reused_from_library=True,
                        library_similarity=stored_result.similarity,
                        library_entry_id=stored_result.entry_id,
                        strategy_name=s_name, strategy_id=s_id,
                        elapsed_ms=elapsed,
                    )

            # Adaptation parse failed — use stored wording
            return PlanResult(
                goal=stored_result.planner_goal,
                subtasks=stored_result.planner_subtasks,
                required_context=[],
                expected_output=stored_result.expected_output,
                complexity=stored_result.complexity,
                success_criteria=stored_result.success_criteria,
                reused_from_library=True,
                library_similarity=stored_result.similarity,
                library_entry_id=stored_result.entry_id,
                strategy_name=s_name, strategy_id=s_id,
                elapsed_ms=elapsed,
            )

        except Exception as exc:
            log.warning("[Planner] Adaptation error: %s — falling through to fresh plan", exc)
            return await self._generate_fresh(
                query=query, task_type="domain_qa", domain="general",
                context_summary="", complexity=stored_result.complexity, t0=t0,
            )

    async def _generate_fresh(
        self, query: str, task_type: str, domain: str,
        context_summary: str, complexity: str, t0: float,
        strategy=None,   # StrategyResult | None
    ) -> PlanResult:
        """Generate a brand-new plan using the LLM, optionally guided by a strategy."""
        s_name = strategy.strategy_name if strategy else "Research"
        s_id   = strategy.strategy_id   if strategy else None
        try:
            judge_info = await self._registry.get_best_local_model()
            model = judge_info.model_id if judge_info else None
            if not model:
                return self._fallback(query, task_type, complexity, t0, "No model available")

            prompt = _PLANNER_PROMPT.format(
                query=query[:400],
                task_type=task_type,
                domain=domain,
                context_summary=(context_summary or "None")[:300],
                complexity=complexity,
            )

            # Inject strategy guidance if available
            if strategy and strategy.template:
                prompt += _STRATEGY_SUFFIX.format(
                    strategy_name=strategy.strategy_name,
                    planning_style=strategy.planning_style or "structured approach",
                    expected_output_structure=strategy.expected_output_structure or "clear sections",
                    verifier_expectations=strategy.verifier_expectations or "completeness and accuracy",
                )

            try:
                raw = await asyncio.wait_for(
                    self._registry.generate(model, prompt, temperature=0.0),
                    timeout=self._timeout,
                )
            except asyncio.TimeoutError:
                return self._fallback(query, task_type, complexity, t0, "Planner timed out")

            m = re.search(r"\{.*\}", raw, re.DOTALL)
            if not m:
                return self._fallback(query, task_type, complexity, t0, "No JSON in planner response")

            data = json.loads(m.group())
            elapsed = int((time.monotonic() - t0) * 1000)
            log.info("[Planner] Fresh plan ready in %dms (strategy=%s): goal=%s",
                     elapsed, s_name, data.get("goal", "")[:60])
            return PlanResult(
                goal=str(data.get("goal", query[:80])),
                subtasks=list(data.get("subtasks", [query]))[:3],
                required_context=list(data.get("required_context", []))[:5],
                expected_output=str(data.get("expected_output", "Explanation")),
                complexity=str(data.get("complexity", complexity)),
                success_criteria=str(data.get("success_criteria", "Answer addresses the query completely")),
                raw=data,
                reused_from_library=False,
                strategy_name=s_name, strategy_id=s_id,
                elapsed_ms=elapsed,
            )
        except Exception as exc:
            log.warning("[Planner] Error: %s", exc)
            return self._fallback(query, task_type, complexity, t0, str(exc))

    @staticmethod
    def _fallback(query: str, task_type: str, complexity: str, t0: float, reason: str) -> PlanResult:
        elapsed = int((time.monotonic() - t0) * 1000)
        log.warning("[Planner] Using fallback plan — %s", reason)
        return PlanResult(
            goal=f"Answer the query: {query[:80]}",
            subtasks=[query[:200]],
            required_context=[],
            expected_output="Explanation",
            complexity=complexity,
            success_criteria="Answer directly addresses the question",
            error=reason,
            elapsed_ms=elapsed,
            reused_from_library=False,
        )
