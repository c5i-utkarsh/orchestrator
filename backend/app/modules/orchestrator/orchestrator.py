"""
Orchestrator Core — SLM-First Execution Architecture.

The domain SLM is the single planning engine after corpus ingestion.
The model capability catalog is a validation/fallback layer only.

Query flow:
  1. Task classification → intent (DOMAIN | CAPABILITY | HYBRID)
  1b. Complexity classification → SIMPLE | MEDIUM | COMPLEX
  2. Coverage check → resolve domain SLM from registry
  3. SLM Planning → domain SLM generates ExecutionBlueprint:
       • Skipped entirely for SIMPLE queries (direct execution)
       • Single-task blueprint for MEDIUM queries
       • Up to 4 subtasks for COMPLEX queries
  4. Catalog Validation → validates SLM model choices
  5. Blueprint Execution with per-complexity token budgets
  6. SLM Synthesis
  7. Hallucination evaluation
  8. Bandit update

Planner rules:
  - Never invent implementation language, deployment, scaling, security, or error handling
    unless the user explicitly asked for them.
  - Planner output should be ≤ 20% longer than the original query.
  - Planner may only clarify, structure, and decompose — never expand intent.

SLM builds NEVER run inline. They are Celery-only tasks triggered via POST /slm/build.
"""
import asyncio
import json
import re
import time
import uuid
from typing import AsyncGenerator

from app.adapters.registry import AdapterRegistry
from app.modules.task_classifier import TaskClassifier, TaskIntent
from app.modules.slm_factory.coverage_checker import CoverageChecker, CoverageAction
from app.modules.slm_factory.slm_registry import SLMRegistry
from app.modules.slm_factory.bandit import get_bandit, save_bandit
from app.modules.model_capability_catalog import ModelCapabilityCatalog
from app.modules.token_efficiency.compressor import get_compressor
from app.modules.evaluation.hallucination_detector import HallucinationDetector
from app.modules.orchestrator.orchestrator_output import (
    OrchestratorOutput, OrchestratorStep, StepExplanation,
    SubTaskResult, ModelRecommendationCard,
    ExecutionBlueprint, BlueprintSubtask,
)
from app.config import get_settings

settings = get_settings()


# ── Query Complexity ──────────────────────────────────────────────────────────

class QueryComplexity(str):
    SIMPLE  = "SIMPLE"    # direct answer, no planning
    MEDIUM  = "MEDIUM"    # single-task planning
    COMPLEX = "COMPLEX"   # multi-step, max 4 subtasks


# Token budgets per complexity level
TOKEN_BUDGET = {
    QueryComplexity.SIMPLE:  700,
    QueryComplexity.MEDIUM:  1200,
    QueryComplexity.COMPLEX: 800,   # per subtask
}

_COMPLEX_PATTERNS = [
    "build", "implement", "create a system", "design a", "architect", "engineer",
    "develop", "end-to-end", "workflow", "pipeline", "agent", "full stack",
    "step by step", "plan", "strategy", "multi", "integrate", "deploy",
    "application", "software", "platform", "infrastructure",
]
_MEDIUM_PATTERNS = [
    "analyze", "analyse", "compare", "recommend", "evaluate", "assess", "review",
    "report", "synthesis", "synthesize", "multi-document", "pros and cons",
    "trade-off", "business case", "impact", "risk",
]


def classify_complexity(query: str, task_type: str) -> str:
    """Classify a query as SIMPLE / MEDIUM / COMPLEX without any LLM calls."""
    q = query.lower()
    word_count = len(query.split())

    # Task-type signals
    if task_type in {"code_generation", "ui_building"}:
        return QueryComplexity.COMPLEX
    if task_type in {"data_analysis", "financial", "time_series"}:
        return QueryComplexity.MEDIUM

    # Keyword signals
    if any(p in q for p in _COMPLEX_PATTERNS):
        return QueryComplexity.COMPLEX
    if any(p in q for p in _MEDIUM_PATTERNS):
        return QueryComplexity.MEDIUM

    # Short queries are almost always Simple
    if word_count <= 15:
        return QueryComplexity.SIMPLE
    if word_count >= 50:
        return QueryComplexity.COMPLEX

    return QueryComplexity.SIMPLE


def _conf(value: float | None, default: float = 0.5) -> float:
    """Clamp a confidence value to [0.0, 1.0], replacing nan/None with default."""
    import math
    if value is None or math.isnan(value) or math.isinf(value):
        return default
    return max(0.0, min(1.0, float(value)))


# ── Prompts ───────────────────────────────────────────────────────────────────

BLUEPRINT_PROMPT = """\
You are the planning engine for the "{domain_label}" domain.

Query complexity: {complexity}
Max subtasks allowed: {max_subtasks}
Target token budget per subtask: {token_budget} tokens

Domain knowledge graph summary:
{graph_summary}

Available execution models (choose ONLY from this list):
{available_models}

User query: {query}

CRITICAL PLANNER RULES — you MUST follow these:
1. DO NOT invent requirements. Only use what the user explicitly asked for.
2. DO NOT add: production deployment, scalability, security, error handling, architecture diagrams — unless the user asked.
3. DO NOT rewrite or expand the user's intent. You may only clarify, structure, and decompose.
4. Each subtask description must be concise (≤ 40 words). Target the original query intent directly.
5. Maximum {max_subtasks} subtask(s) for this query complexity.
6. If complexity is SIMPLE or MEDIUM, produce exactly 1 subtask.
7. Planner output must stay ≤ 20% longer than the original query.

Generate a complete execution blueprint. Respond ONLY with a JSON object — no markdown fences, no text outside the JSON.

{{
  "overall_reasoning": "<1 sentence: why this decomposition for this specific query>",
  "expected_output_format": "<narrative_report|structured_analysis|code|data_table|conversational>",
  "is_followup": <true|false>,
  "subtasks": [
    {{
      "id": 1,
      "task_description": "<specific sub-question or action to perform>",
      "task_type": "<domain_qa|code_generation|data_analysis|time_series|general_reasoning|ui_building|financial|geospatial>",
      "recommended_model": "<exact model name from the available list above>",
      "recommended_model_reason": "<why this model fits this subtask>",
      "expected_output": "<what this subtask will produce>",
      "depends_on": [],
      "my_confidence": 0.9
    }}
  ],
  "execution_order": [1]
}}

Planning rules:
- ONLY decompose if the query genuinely requires multiple distinct steps (complexity=COMPLEX).
- For SIMPLE and MEDIUM: produce exactly 1 subtask that directly addresses the user's query.
- Domain knowledge questions (entity lookups, corpus Q&A, relationships): assign to "{domain_slm}" when it appears in the available list
- Code generation or scripting tasks: prefer qwen2.5-coder or deepseek-coder from the available list
- Complex reasoning, analysis, or synthesis tasks: prefer larger models (32b, 70b) if available
- Set is_followup=true ONLY if the query clearly references a prior turn ("it", "that result", "the previous", "as mentioned", "elaborate on that", "what about", "and also")
- If is_followup=true, produce exactly one subtask with task_type "domain_qa" assigned to "{domain_slm}"
- Never fabricate requirements not present in the original query.
"""

SYNTHESIS_PROMPT = """\
You are the synthesis engine for the "{domain_label}" domain.

Original query: {query}

Execution results from assigned models:
{sub_results}

Knowledge graph and wiki context:
{graph_context}

Produce the final answer in "{expected_output_format}" format. Your response must:
1. Directly and completely address the original query
2. Integrate all execution results into a coherent, well-structured response
3. Include a brief reasoning trail: explain how each result contributes to the conclusion
4. Cite specific entities as [entity_label] where a fact is derived from the corpus
5. Flag any areas of uncertainty or where the data is insufficient

Provide only the final answer — no meta-commentary about what you are doing.
"""

FOLLOWUP_SYNTHESIS_PROMPT = """\
You are the domain expert for "{domain_label}".

Knowledge graph context:
{graph_context}

Wiki knowledge:
{wiki_context}

Follow-up question: {query}

Answer this follow-up directly and concisely using your domain knowledge above. Begin with a brief reasoning sentence, then provide the answer.
"""

_VALID_OUTPUT_FORMATS = frozenset({
    "narrative_report", "structured_analysis", "code",
    "data_table", "conversational",
})
_VALID_TASK_TYPES = frozenset({
    "domain_qa", "code_generation", "data_analysis", "time_series",
    "general_reasoning", "ui_building", "financial", "geospatial",
})


def _parse_blueprint(raw: str, domain_slm: str | None, query: str,
                     fallback_task_type: str) -> ExecutionBlueprint:
    """
    Parse the SLM's blueprint JSON.  Returns a single-subtask fallback on any
    error so the pipeline always has something to execute.
    """
    raw = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`")
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if m:
        try:
            bp_data = json.loads(m.group())
            subtasks_raw = bp_data.get("subtasks", [])
            subtasks: list[BlueprintSubtask] = []
            for s in subtasks_raw:
                if not isinstance(s, dict) or not s.get("task_description"):
                    continue
                task_type_raw = str(s.get("task_type", "domain_qa"))
                st = BlueprintSubtask(
                    id=int(s.get("id", len(subtasks) + 1)),
                    task_description=str(s["task_description"])[:500],
                    task_type=task_type_raw if task_type_raw in _VALID_TASK_TYPES else "domain_qa",
                    recommended_model=str(s.get("recommended_model", domain_slm or ""))[:100],
                    recommended_model_reason=str(s.get("recommended_model_reason", ""))[:300],
                    expected_output=str(s.get("expected_output", ""))[:300],
                    depends_on=[
                        int(x) for x in s.get("depends_on", [])
                        if str(x).lstrip("-").isdigit()
                    ],
                    my_confidence=_conf(s.get("my_confidence", 0.7)),
                )
                subtasks.append(st)

            if not subtasks:
                raise ValueError("empty subtasks")

            raw_order = bp_data.get("execution_order", [])
            execution_order = (
                [int(x) for x in raw_order if str(x).lstrip("-").isdigit()]
                or [s.id for s in subtasks]
            )

            fmt = str(bp_data.get("expected_output_format", "narrative_report"))
            if fmt not in _VALID_OUTPUT_FORMATS:
                fmt = "narrative_report"

            return ExecutionBlueprint(
                overall_reasoning=str(bp_data.get("overall_reasoning", ""))[:600],
                expected_output_format=fmt,
                is_followup=bool(bp_data.get("is_followup", False)),
                subtasks=subtasks,
                execution_order=execution_order,
                planning_model=domain_slm or "",
            )
        except Exception:
            pass

    # ── Fallback: single-subtask blueprint ───────────────────────────────────
    ft = fallback_task_type if fallback_task_type in _VALID_TASK_TYPES else "domain_qa"
    return ExecutionBlueprint(
        overall_reasoning="Single-task execution (blueprint parse failed — fallback mode)",
        expected_output_format="narrative_report",
        is_followup=False,
        subtasks=[BlueprintSubtask(
            id=1,
            task_description=query,
            task_type=ft,
            recommended_model=domain_slm or "",
            recommended_model_reason="Domain SLM fallback",
            expected_output="Complete answer to the user query",
        )],
        execution_order=[1],
        planning_model=domain_slm or "",
    )


class Orchestrator:
    def __init__(
        self,
        adapter_registry: AdapterRegistry,
        slm_registry: SLMRegistry,
        slm_store=None,     # kept for API compatibility
        embed_fn=None,      # async (str) -> list[float]
        redis_client=None,
    ):
        self._adapters = adapter_registry
        self._slm_registry = slm_registry
        self._embed = embed_fn
        self._classifier = TaskClassifier(embed_fn=embed_fn)
        self._coverage = CoverageChecker(slm_registry, embed_fn)
        # Catalog is validation/fallback only — never drives planning
        self._catalog = ModelCapabilityCatalog(adapter_registry, get_bandit())
        self._compressor = get_compressor()
        self._detector = HallucinationDetector(adapter_registry)

    async def run(
        self,
        query: str,
        session_id: str | None = None,
        graph_context: str = "",
        wiki_articles: list[dict] | None = None,
        domain_label: str = "general",
        coverage_topics: list[str] | None = None,
        corpus_hash: str = "",
        available_models: list[str] | None = None,
        system_prompt: str = "",
        scoring_weights=None,
        job_id: str | None = None,   # project-exact routing: prefer SLM trained on this job
    ) -> AsyncGenerator[dict, None]:
        """
        SLM-first orchestration pipeline. Yields SSE-compatible events.
        Last event has type="output" containing OrchestratorOutput.
        """
        session_id = session_id or str(uuid.uuid4())
        output = OrchestratorOutput(
            session_id=session_id,
            query=query,
            intent="",
            primary_task_type="",
            coverage_action="",
        )
        steps: list[OrchestratorStep] = []
        wiki_articles = wiki_articles or []

        sys_prefix = f"[System] {system_prompt.strip()}\n\n" if system_prompt.strip() else ""

        # Pre-compute embedding once — reused by classifier, coverage checker, bandit
        query_embedding = await self._embed(query)

        # ── Step 1: Task Classification ───────────────────────────────────────
        t0 = time.monotonic()
        classification = await self._classifier.classify(query, query_embedding)
        output.intent = classification.intent.value
        output.primary_task_type = classification.primary_task_type

        steps.append(OrchestratorStep(
            step_number=1,
            step_name="Understanding Query",
            duration_ms=int((time.monotonic() - t0) * 1000),
            explanation=StepExplanation(
                what="Classified the query intent",
                why="Determines whether to route to domain SLM, capability model, or both",
                what_we_found=classification.reasoning,
                decision_made=f"Intent: {classification.intent.value} | Task: {classification.primary_task_type}",
                confidence=_conf(classification.confidence),
                caveats=[],
                graph_entity_ids=[],
            ),
        ))
        yield {"type": "step", "step": 1, "step_name": "Understanding Query", "data": steps[-1].model_dump()}

        # ── Step 1b: Query Complexity Classification ───────────────────────────
        complexity = classify_complexity(query, classification.primary_task_type)
        max_subtasks = {"SIMPLE": 1, "MEDIUM": 1, "COMPLEX": 4}.get(complexity, 1)
        token_budget = TOKEN_BUDGET.get(complexity, 1200)
        yield {
            "type": "stage",
            "step_name": "Query Complexity",
            "detail": (
                f"{complexity} — "
                + {
                    "SIMPLE":  "Direct execution (planner skipped)",
                    "MEDIUM":  "Single-task execution",
                    "COMPLEX": f"Multi-step planning (max {max_subtasks} subtasks)",
                }.get(complexity, "")
                + f" | Token budget: {token_budget}"
            ),
        }

        # ── Step 2: Coverage Check ─────────────────────────────────────────────
        t0 = time.monotonic()
        coverage = await self._coverage.check(
            query,
            query_embedding,
            domain_label=domain_label if domain_label and domain_label != "general" else None,
            job_id=job_id or corpus_hash or None,
        )
        output.coverage_action = coverage.action.value

        # Validate matched model is actually available
        if coverage.model_id:
            adapter = await self._adapters.get_adapter_for_model(coverage.model_id)
            if adapter is None:
                _fallback = await self._adapters.get_best_local_model()
                coverage.model_id = _fallback.model_id if _fallback else None
                coverage.reason += f" | model unavailable, using {coverage.model_id}"
        output.slm_model_id = coverage.model_id

        # Build a human-readable status for the timeline
        _all_projects = not (job_id or corpus_hash) and (not domain_label or domain_label == "general")
        if _all_projects:
            _routing_mode = "All Projects (automatic routing)"
        elif job_id or corpus_hash:
            _routing_mode = f"Project-exact routing (job_id={str(job_id or corpus_hash)[:8]}…)"
        else:
            _routing_mode = f"Domain routing ({domain_label})"

        _slm_status = (
            f"Selected: {coverage.model_id}" if coverage.model_id
            else "No qualifying SLM found — using general model"
        )
        steps.append(OrchestratorStep(
            step_number=2,
            step_name="Loading Domain SLM",
            duration_ms=int((time.monotonic() - t0) * 1000),
            explanation=StepExplanation(
                what=f"Routing mode: {_routing_mode}",
                why="Domain SLM drives planning and synthesis; general models execute specialist tasks",
                what_we_found=coverage.reason,
                decision_made=_slm_status,
                confidence=_conf(coverage.composite_score if coverage.composite_score else coverage.similarity),
                caveats=[],
                graph_entity_ids=[],
            ),
        ))
        yield {"type": "step", "step": 2, "step_name": "Loading Domain SLM", "data": steps[-1].model_dump()}

        # ── No-SLM fallback ────────────────────────────────────────────────────
        if coverage.action == CoverageAction.BUILD_NEW:
            _fb = await self._adapters.get_best_local_model()
            if _fb:
                coverage.model_id = _fb.model_id
                output.slm_model_id = _fb.model_id
            yield {
                "type": "stage",
                "step_name": "Domain Model Selected",
                "detail": f"No domain SLM for '{domain_label}' — using {coverage.model_id or 'best available'}",
            }
        elif coverage.action == CoverageAction.EXTEND_EXISTING:
            yield {
                "type": "stage",
                "step_name": "Domain Model Selected",
                "detail": f"{coverage.model_id} ready (partial match, score {coverage.composite_score:.2f})",
            }

        domain_slm = output.slm_model_id   # planning + synthesis model

        # ── Compress context once ──────────────────────────────────────────────
        compressed_context = graph_context
        if graph_context and len(graph_context) > 2000:
            compressed_context = self._compressor.compress(graph_context, query)
            output.tokens_saved_by_compression = max(
                0, len(graph_context.split()) - len(compressed_context.split())
            )

        # ── Step 3: SLM Planning ───────────────────────────────────────────────
        # SIMPLE → skip planner entirely (direct execution, no blueprint overhead)
        # MEDIUM → planner produces exactly 1 subtask
        # COMPLEX → planner produces up to 4 subtasks
        t0 = time.monotonic()
        blueprint: ExecutionBlueprint

        # Build a direct-execution blueprint for SIMPLE queries (no LLM call)
        if complexity == QueryComplexity.SIMPLE or not domain_slm:
            blueprint = ExecutionBlueprint(
                overall_reasoning=f"Direct execution ({complexity.lower()} query — planner skipped)",
                expected_output_format="conversational" if complexity == QueryComplexity.SIMPLE else "narrative_report",
                is_followup=False,
                subtasks=[BlueprintSubtask(
                    id=1,
                    task_description=query,   # preserve original query verbatim
                    task_type=classification.primary_task_type
                              if classification.primary_task_type in _VALID_TASK_TYPES else "domain_qa",
                    recommended_model=domain_slm or "",
                    recommended_model_reason="Direct execution — no planner overhead",
                    expected_output="Complete answer to the user query",
                )],
                execution_order=[1],
                planning_model=domain_slm or "",
            )

        elif domain_slm:
            # Build a compact graph summary for the prompt (entity names only)
            graph_lines = [l.strip() for l in graph_context.splitlines() if l.strip().startswith("- ")]
            graph_summary = "\n".join(graph_lines[:20]) or "(no graph context loaded)"

            # Build available models list; mark domain SLM prominently
            avail_list: list[str] = []
            if domain_slm:
                avail_list.append(f"{domain_slm} [domain SLM — use for domain_qa]")
            avail_list.extend(
                m for m in (available_models or [])[:15] if m != domain_slm
            )
            available_models_str = "\n".join(f"  • {m}" for m in avail_list)

            bp_prompt = sys_prefix + BLUEPRINT_PROMPT.format(
                domain_label=domain_label,
                domain_slm=domain_slm,
                graph_summary=graph_summary,
                available_models=available_models_str,
                query=query,
                complexity=complexity,
                max_subtasks=max_subtasks,
                token_budget=token_budget,
            )
            # Planner timeout scales with complexity
            planner_timeout = {
                QueryComplexity.SIMPLE: 20.0,
                QueryComplexity.MEDIUM: 25.0,
                QueryComplexity.COMPLEX: 35.0,
            }.get(complexity, 30.0)
            try:
                raw_bp = await asyncio.wait_for(
                    self._adapters.generate(domain_slm, bp_prompt, temperature=0.05),
                    timeout=planner_timeout,
                )
            except (asyncio.TimeoutError, Exception):
                raw_bp = ""

            blueprint = _parse_blueprint(
                raw_bp, domain_slm, query, classification.primary_task_type
            )
            # Enforce subtask cap — never allow planner to produce more than max_subtasks
            if len(blueprint.subtasks) > max_subtasks:
                blueprint.subtasks = blueprint.subtasks[:max_subtasks]
                blueprint.execution_order = [s.id for s in blueprint.subtasks]

        else:
            # No SLM available — trivial single-task blueprint
            blueprint = ExecutionBlueprint(
                overall_reasoning="No domain SLM available — direct execution with best local model",
                expected_output_format="narrative_report",
                is_followup=False,
                subtasks=[BlueprintSubtask(
                    id=1,
                    task_description=query,
                    task_type=classification.primary_task_type
                              if classification.primary_task_type in _VALID_TASK_TYPES
                              else "domain_qa",
                    recommended_model="",
                    recommended_model_reason="Best available fallback",
                    expected_output="Complete answer to the user query",
                )],
                execution_order=[1],
                planning_model="",
            )

        output.execution_blueprint = blueprint
        _planner_mode = (
            f"Skipped (SIMPLE — direct execution)"
            if complexity == QueryComplexity.SIMPLE else
            f"Single-step execution" if complexity == QueryComplexity.MEDIUM else
            f"{len(blueprint.subtasks)}-step plan"
        )
        _bp_detail = (
            f"{'Follow-up fast path' if blueprint.is_followup else _planner_mode} | "
            f"Format: {blueprint.expected_output_format} | "
            f"Token budget: {token_budget}/{'subtask' if complexity == QueryComplexity.COMPLEX else 'response'}"
        )

        steps.append(OrchestratorStep(
            step_number=3,
            step_name="SLM Planning",
            duration_ms=int((time.monotonic() - t0) * 1000),
            explanation=StepExplanation(
                what=f"Planner mode: {_planner_mode}",
                why="Planning overhead is proportional to query complexity — simple queries execute directly",
                what_we_found=blueprint.overall_reasoning or "Blueprint generated",
                decision_made=_bp_detail,
                confidence=_conf(
                    sum(s.my_confidence for s in blueprint.subtasks) / max(len(blueprint.subtasks), 1)
                ),
                caveats=(
                    ["is_followup=true: fast-path synthesis, subtask execution skipped"]
                    if blueprint.is_followup else
                    [f"Subtask cap enforced: limited to {max_subtasks} subtask(s) for {complexity} complexity"]
                    if len(blueprint.subtasks) == max_subtasks and complexity != QueryComplexity.COMPLEX else []
                ),
                graph_entity_ids=[],
            ),
        ))
        yield {"type": "step", "step": 3, "step_name": "SLM Planning", "data": steps[-1].model_dump()}

        # ── Step 4: Catalog Validation ─────────────────────────────────────────
        # Catalog role: validate the SLM's model choices against actual availability.
        # Substitute unavailable models with best available alternative for that task type.
        # Catalog NEVER selects models — only resolves availability conflicts.
        t0 = time.monotonic()
        available_set = set(available_models or [])
        all_recs: list[ModelRecommendationCard] = []
        substitutions: list[str] = []

        for subtask in blueprint.subtasks:
            rec_model = subtask.recommended_model
            task_type = subtask.task_type

            if rec_model and rec_model in available_set:
                subtask.resolved_model = rec_model
                avail = True
            else:
                # Unavailable → catalog finds best available alternative
                fallback_recs = await self._catalog.recommend(
                    task_type=task_type,
                    query_embedding=query_embedding,
                    available_models=available_models or [],
                    token_count=len(query.split()),
                    scoring_weights=scoring_weights,
                )
                resolved = next(
                    (r.model_name for r in fallback_recs if r.availability_score >= 0.9),
                    None,
                )
                if not resolved:
                    _best = await self._adapters.get_best_local_model()
                    resolved = _best.model_id if _best else (domain_slm or rec_model)
                subtask.resolved_model = resolved or rec_model
                avail = False
                if rec_model and rec_model != subtask.resolved_model:
                    substitutions.append(f"{rec_model} → {subtask.resolved_model}")
                    subtask.recommended_model_reason = (
                        (subtask.recommended_model_reason + f" [substituted: {rec_model} unavailable]").strip()
                    )

            all_recs.append(ModelRecommendationCard(
                model_name=subtask.resolved_model,
                provider="ollama" if subtask.resolved_model in available_set else "unknown",
                task_type=task_type,
                benchmark_score=0.0,
                composite_score=_conf(subtask.my_confidence),
                speed_score=0.0,
                why_primary=subtask.recommended_model_reason or f"SLM-selected for {task_type}",
                is_primary=True,
                is_available_locally=avail,
            ))

        output.model_recommendations = all_recs
        _val_detail = (
            f"All {len(blueprint.subtasks)} model choice(s) confirmed available"
            if not substitutions
            else f"{len(substitutions)} substitution(s): {'; '.join(substitutions)}"
        )

        steps.append(OrchestratorStep(
            step_number=4,
            step_name="Validating Model Availability",
            duration_ms=int((time.monotonic() - t0) * 1000),
            explanation=StepExplanation(
                what="Validated SLM-recommended models against available model list",
                why="Catalog is fallback only — resolves availability conflicts without overriding SLM planning",
                what_we_found=_val_detail,
                decision_made=f"Resolved {len(blueprint.subtasks)} model assignment(s)",
                confidence=1.0 if not substitutions else 0.7,
                caveats=[f"Substituted: {s}" for s in substitutions],
                graph_entity_ids=[],
            ),
        ))
        yield {"type": "step", "step": 4, "step_name": "Validating Model Availability", "data": steps[-1].model_dump()}

        # ── Step 5: Blueprint Execution ────────────────────────────────────────
        t0 = time.monotonic()
        sub_results: list[SubTaskResult] = []

        if blueprint.is_followup:
            # Fast path: domain SLM answers directly from context
            yield {
                "type": "stage",
                "step_name": "Follow-up Detected",
                "detail": "Answering directly from domain context — planning pipeline skipped",
            }
            wiki_text = "\n\n".join(
                f"### {a.get('title', '')}\n{a.get('content', '')[:400]}"
                for a in wiki_articles[:10]
            )[:2000]
            followup_prompt = sys_prefix + FOLLOWUP_SYNTHESIS_PROMPT.format(
                domain_label=domain_label,
                graph_context=compressed_context[:1500],
                wiki_context=wiki_text or "(no wiki context)",
                query=query,
            )
            exec_model = domain_slm
            if not exec_model:
                _best = await self._adapters.get_best_local_model()
                exec_model = _best.model_id if _best else None

            followup_response = ""
            if exec_model:
                try:
                    followup_response = await asyncio.wait_for(
                        self._adapters.generate(exec_model, followup_prompt, temperature=0.15),
                        timeout=55.0,
                    )
                except asyncio.TimeoutError:
                    followup_response = followup_response.rstrip() + "\n\n[Response truncated — time budget exceeded.]" if followup_response.strip() else "[Follow-up response timed out — try again.]"
                except Exception as exc:
                    followup_response = f"[Error: {exc}]"

            sub_results = [SubTaskResult(
                task_type="domain_qa",
                query_fragment=query,
                assigned_model=exec_model or "unknown",
                response=followup_response,
                confidence=0.85,
            )]
            output.sub_task_results = sub_results
            output.final_answer = followup_response

        else:
            # Standard path: execute each blueprint subtask in declared order
            executed: dict[int, SubTaskResult] = {}

            # Build ordered list; append any subtasks missing from execution_order
            seen_ids: set[int] = set()
            ordered_subtasks: list[BlueprintSubtask] = []
            for st_id in blueprint.execution_order:
                st = next((s for s in blueprint.subtasks if s.id == st_id), None)
                if st and st.id not in seen_ids:
                    ordered_subtasks.append(st)
                    seen_ids.add(st.id)
            for st in blueprint.subtasks:
                if st.id not in seen_ids:
                    ordered_subtasks.append(st)

            for subtask in ordered_subtasks:
                exec_model = subtask.resolved_model or domain_slm
                if not exec_model:
                    _best = await self._adapters.get_best_local_model()
                    exec_model = _best.model_id if _best else None
                if not exec_model:
                    continue

                # Build context: graph + dependency outputs
                ctx_parts: list[str] = []
                if compressed_context:
                    ctx_parts.append(f"Knowledge Graph Context:\n{compressed_context}")
                if subtask.depends_on:
                    dep_text = "\n".join(
                        f"[Subtask {d} result]: {executed[d].response[:600]}"
                        for d in subtask.depends_on if d in executed
                    )
                    if dep_text:
                        ctx_parts.append(f"Prior subtask results:\n{dep_text}")
                context_prefix = sys_prefix + ("\n\n".join(ctx_parts) + "\n\n" if ctx_parts else "")

                # Per-complexity execution timeout
                exec_timeout = {
                    QueryComplexity.SIMPLE: 45.0,
                    QueryComplexity.MEDIUM: 60.0,
                    QueryComplexity.COMPLEX: 60.0,
                }.get(complexity, 60.0)

                response = ""
                _truncated = False
                try:
                    response = await asyncio.wait_for(
                        self._adapters.generate(
                            exec_model,
                            f"{context_prefix}Task: {subtask.task_description}",
                            temperature=0.2,
                        ),
                        timeout=exec_timeout,
                    )
                except asyncio.TimeoutError:
                    # Return any partial output that was accumulated before the timeout
                    if response and len(response.strip()) > 20:
                        _truncated = True
                        response = response.rstrip() + "\n\n[Response truncated — generation exceeded time budget.]"
                    else:
                        response = "[Response timed out — the model took too long. Try a simpler query.]"
                except Exception as exc:
                    _fb = await self._adapters.get_best_local_model()
                    fallback_model = _fb.model_id if _fb else None
                    if fallback_model and fallback_model != exec_model:
                        try:
                            response = await asyncio.wait_for(
                                self._adapters.generate(
                                    fallback_model,
                                    f"{context_prefix}Task: {subtask.task_description}",
                                    temperature=0.2,
                                ),
                                timeout=exec_timeout,
                            )
                            exec_model = fallback_model
                        except Exception as exc2:
                            response = f"[Error: {exc2}]"
                    else:
                        response = f"[Error: {exc}]"

                result = SubTaskResult(
                    task_type=subtask.task_type,
                    query_fragment=subtask.task_description,
                    assigned_model=exec_model,
                    response=response,
                    confidence=_conf(subtask.my_confidence),
                )
                sub_results.append(result)
                executed[subtask.id] = result

            output.sub_task_results = sub_results

        steps.append(OrchestratorStep(
            step_number=5,
            step_name="Generating Response",
            duration_ms=int((time.monotonic() - t0) * 1000),
            explanation=StepExplanation(
                what=f"Executed {len(sub_results)} subtask(s) | Complexity: {complexity} | Budget: {token_budget} tokens",
                why="SLM-chosen models provide domain-appropriate responses with minimal token waste",
                what_we_found=f"Completed {len(sub_results)} subtask(s)",
                decision_made="Follow-up fast path" if blueprint.is_followup else f"{complexity} execution complete",
                confidence=_conf(
                    sum(r.confidence for r in sub_results) / max(len(sub_results), 1)
                ),
                caveats=[],
                graph_entity_ids=[],
            ),
        ))
        yield {"type": "step", "step": 5, "step_name": "Generating Response", "data": steps[-1].model_dump()}

        # ── Step 6: SLM Synthesis ──────────────────────────────────────────────
        # Domain SLM produces the final answer with reasoning trail.
        # For follow-up queries the final_answer is already set — skip synthesis.
        if not blueprint.is_followup:
            t0 = time.monotonic()
            sub_results_text = "\n\n".join(
                f"[Subtask {i + 1}: {r.task_type}] {r.query_fragment}\n→ {r.response}"
                for i, r in enumerate(sub_results)
            )
            synth_model = domain_slm
            if not synth_model:
                _best_synth = await self._adapters.get_best_local_model()
                synth_model = _best_synth.model_id if _best_synth else None

            final_answer = ""
            if synth_model and sub_results_text:
                wiki_text = "\n\n".join(
                    f"### {a.get('title', '')}\n{a.get('content', '')[:300]}"
                    for a in wiki_articles[:8]
                )[:1500]
                graph_and_wiki = compressed_context[:1200]
                if wiki_text:
                    graph_and_wiki += f"\n\nWiki context:\n{wiki_text}"

                synth_prompt = sys_prefix + SYNTHESIS_PROMPT.format(
                    domain_label=domain_label,
                    query=query,
                    sub_results=sub_results_text[:3500],
                    graph_context=graph_and_wiki[:2500],
                    expected_output_format=blueprint.expected_output_format,
                )
                try:
                    final_answer = await asyncio.wait_for(
                        self._adapters.generate(synth_model, synth_prompt, temperature=0.15),
                        timeout=60.0,
                    )
                except asyncio.TimeoutError:
                    # Use sub-results as the answer — better than blank
                    final_answer = sub_results_text + "\n\n[Synthesis timed out — raw execution results above.]"
                except Exception:
                    final_answer = sub_results_text
            elif sub_results_text:
                final_answer = sub_results_text

            output.final_answer = final_answer

            steps.append(OrchestratorStep(
                step_number=6,
                step_name="Synthesizing Answer",
                duration_ms=int((time.monotonic() - t0) * 1000),
                explanation=StepExplanation(
                    what="Domain SLM integrated subtask results and produced the final answer with reasoning trail",
                    why="Domain SLM synthesis minimises tokens vs. frontier models while maintaining domain accuracy",
                    what_we_found=(
                        f"Synthesised {len(sub_results)} result(s) with "
                        f"wiki context ({len(wiki_articles)} articles)"
                    ),
                    decision_made="Final answer ready",
                    confidence=0.85,
                    caveats=[],
                    graph_entity_ids=[],
                ),
            ))
            yield {"type": "step", "step": 6, "step_name": "Synthesizing Answer", "data": steps[-1].model_dump()}

        # ── Step 7: Hallucination Check ────────────────────────────────────────
        if output.final_answer and graph_context:
            yield {"type": "step", "step": 7, "step_name": "Validating Response", "data": {
                "step_number": 7, "step_name": "Validating Response", "duration_ms": 0,
            }}
            hall_result = await self._detector.detect(output.final_answer, graph_context[:2000])
            output.hallucination_rate = hall_result.hallucination_rate
            for sr in sub_results:
                sr.hallucination_verdict = hall_result.verdict

        # ── Bandit Update ──────────────────────────────────────────────────────
        if output.slm_model_id and query_embedding:
            bandit = get_bandit()
            reward = bandit.compute_reward(
                task_completion=0.9 if output.final_answer else 0.0,
                hallucination_rate=output.hallucination_rate,
                user_acceptance=0.7,
            )
            context_vec = bandit._build_feature_vector(
                query_embedding, classification.primary_task_type, len(query.split()), 5
            )
            bandit.update(output.slm_model_id, context_vec.tolist(), reward)
            save_bandit()

        output.steps = steps
        yield {"type": "output", "data": output.model_dump()}
