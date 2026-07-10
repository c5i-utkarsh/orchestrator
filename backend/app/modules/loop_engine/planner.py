"""
Loop Engine Planner — Phase 1 + Execution Library integration (Phase 2).

Receives: query, task classification, coverage result, project context.
Returns: structured JSON execution plan (no generation — plan only).

Phase 2 addition:
  - Before generating a fresh plan, search the Execution Library for a similar
    stored strategy (if library is enabled and embed_fn is provided).
  - If a match is found above similarity_threshold, adapt it to the current query
    by regenerating only the goal/wording — keeping the structural strategy.
  - PlanResult now carries `reused_from_library` and `library_similarity` fields.
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
                        query=query,
                        stored_result=search_result,
                        t0=t0,
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
            context_summary=context_summary, complexity=complexity, t0=t0,
        )

    async def _adapt_plan(self, query: str, stored_result, t0: float) -> PlanResult:
        """Adapt a stored plan structure to the current query — keep structure, reword goal."""
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
                    log.info("[Planner] Adapted plan in %dms (library sim=%.3f)",
                             elapsed, stored_result.similarity)
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
    ) -> PlanResult:
        """Generate a brand-new plan using the LLM."""
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
            log.info("[Planner] Fresh plan ready in %dms: goal=%s", elapsed, data.get("goal", "")[:60])
            return PlanResult(
                goal=str(data.get("goal", query[:80])),
                subtasks=list(data.get("subtasks", [query]))[:3],
                required_context=list(data.get("required_context", []))[:5],
                expected_output=str(data.get("expected_output", "Explanation")),
                complexity=str(data.get("complexity", complexity)),
                success_criteria=str(data.get("success_criteria", "Answer addresses the query completely")),
                raw=data,
                reused_from_library=False,
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
