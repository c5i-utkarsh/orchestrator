"""
Model Capability Catalog — LLM selection for final answer execution.

Architecture note
-----------------
The SLM (custom-trained domain model) is used ONLY for internal orchestration:
  • Query decomposition  (lightweight, no user-visible output)
  • Answer synthesis     (merging sub-results, no tokens wasted on LLM calls)

For every task that produces user-visible output (blueprints, code, analysis,
Q&A answers) this catalog selects the best available general-purpose LLM using:

Composite score (sums to 1.0):
    0.30 × benchmark      — task-specific quality benchmark
    0.20 × availability   — is the model installed / API key present?
    0.20 × bandit_score   — learned reward history (improves with usage)
    0.15 × speed_score    — estimated tokens/sec, normalized to [0, 1]
    0.10 × ctx_fit        — penalises if query would overflow context window
    0.05 × task_fit       — small bonus for task-specific specialists
"""
from dataclasses import dataclass, field

# speed_tps: approximate tokens/second on typical local GPU (A100/3090 class).
# Cloud models reflect observed API throughput.
MODEL_CATALOG: dict[str, list[dict]] = {
    "domain_qa": [
        # Fast, accurate local models — best for Q&A with knowledge-graph context
        {"model": "mistral:latest",        "provider": "ollama",  "benchmark": 0.820, "heval": None, "speed_tps": 45,  "task_fit": 0.0},
        {"model": "llama3.2:latest",       "provider": "ollama",  "benchmark": 0.800, "heval": None, "speed_tps": 80,  "task_fit": 0.0},
        {"model": "qwen2.5:7b",            "provider": "ollama",  "benchmark": 0.830, "heval": None, "speed_tps": 50,  "task_fit": 0.0},
        {"model": "qwen2.5:32b",           "provider": "ollama",  "benchmark": 0.870, "heval": None, "speed_tps": 12,  "task_fit": 0.0},
        {"model": "llama3.1:70b",          "provider": "ollama",  "benchmark": 0.860, "heval": None, "speed_tps": 5,   "task_fit": 0.0},
        {"model": "gemini-2.0-flash",      "provider": "openai",  "benchmark": 0.870, "heval": None, "speed_tps": 200, "task_fit": 0.0},
        {"model": "gpt-4o-mini",           "provider": "openai",  "benchmark": 0.840, "heval": None, "speed_tps": 120, "task_fit": 0.0},
        {"model": "claude-sonnet-4-5",     "provider": "openai",  "benchmark": 0.900, "heval": None, "speed_tps": 80,  "task_fit": 0.0},
    ],
    "code_generation": [
        {"model": "qwen2.5-coder:7b",      "provider": "ollama",  "benchmark": 0.820, "heval": 82.0,  "speed_tps": 50,  "task_fit": 1.0},
        {"model": "qwen2.5-coder:32b",     "provider": "ollama",  "benchmark": 0.927, "heval": 92.7,  "speed_tps": 12,  "task_fit": 1.0},
        {"model": "deepseek-coder-v2:16b", "provider": "ollama",  "benchmark": 0.880, "heval": 88.0,  "speed_tps": 25,  "task_fit": 1.0},
        {"model": "claude-opus-4-5",       "provider": "openai",  "benchmark": 0.940, "heval": 94.0,  "speed_tps": 50,  "task_fit": 1.0},
        {"model": "gemini-2.0-flash",      "provider": "openai",  "benchmark": 0.880, "heval": 88.0,  "speed_tps": 200, "task_fit": 0.5},
        {"model": "mistral:latest",        "provider": "ollama",  "benchmark": 0.750, "heval": None,  "speed_tps": 45,  "task_fit": 0.3},
    ],
    "ui_building": [
        {"model": "claude-opus-4-5",       "provider": "openai",  "benchmark": 0.900, "heval": None,  "speed_tps": 50,  "task_fit": 1.0},
        {"model": "claude-sonnet-4-5",     "provider": "openai",  "benchmark": 0.870, "heval": None,  "speed_tps": 80,  "task_fit": 0.8},
        {"model": "qwen2.5-coder:32b",     "provider": "ollama",  "benchmark": 0.830, "heval": None,  "speed_tps": 12,  "task_fit": 0.7},
        {"model": "gemini-2.0-flash",      "provider": "openai",  "benchmark": 0.840, "heval": None,  "speed_tps": 200, "task_fit": 0.5},
        {"model": "qwen2.5-coder:7b",      "provider": "ollama",  "benchmark": 0.790, "heval": None,  "speed_tps": 50,  "task_fit": 0.6},
    ],
    "time_series": [
        {"model": "chronos-t5-large",      "provider": "local",   "benchmark": 0.870, "heval": None,  "speed_tps": 60,  "task_fit": 1.0},
        {"model": "moirai-1.0-r-large",    "provider": "local",   "benchmark": 0.850, "heval": None,  "speed_tps": 55,  "task_fit": 1.0},
        {"model": "timesfm-1.0-200m",      "provider": "local",   "benchmark": 0.830, "heval": None,  "speed_tps": 80,  "task_fit": 1.0},
        {"model": "qwen2.5:32b",           "provider": "ollama",  "benchmark": 0.790, "heval": None,  "speed_tps": 12,  "task_fit": 0.3},
    ],
    "data_analysis": [
        {"model": "qwen2.5:32b",           "provider": "ollama",  "benchmark": 0.860, "heval": None,  "speed_tps": 12,  "task_fit": 0.5},
        {"model": "qwen2.5:72b",           "provider": "ollama",  "benchmark": 0.870, "heval": None,  "speed_tps": 4,   "task_fit": 0.5},
        {"model": "llama3.1:70b",          "provider": "ollama",  "benchmark": 0.840, "heval": None,  "speed_tps": 5,   "task_fit": 0.4},
        {"model": "gemini-2.0-flash",      "provider": "openai",  "benchmark": 0.870, "heval": None,  "speed_tps": 200, "task_fit": 0.5},
        {"model": "mistral:latest",        "provider": "ollama",  "benchmark": 0.790, "heval": None,  "speed_tps": 45,  "task_fit": 0.3},
    ],
    "financial": [
        {"model": "finbert-tone",          "provider": "local",   "benchmark": 0.880, "heval": None,  "speed_tps": 60,  "task_fit": 1.0},
        {"model": "gpt-4o",               "provider": "openai",  "benchmark": 0.890, "heval": None,  "speed_tps": 60,  "task_fit": 0.6},
        {"model": "llama3.1:70b",          "provider": "ollama",  "benchmark": 0.830, "heval": None,  "speed_tps": 5,   "task_fit": 0.3},
        {"model": "mistral:latest",        "provider": "ollama",  "benchmark": 0.780, "heval": None,  "speed_tps": 45,  "task_fit": 0.3},
    ],
    "geospatial": [
        {"model": "granite-geospatial-1b", "provider": "local",   "benchmark": 0.870, "heval": None,  "speed_tps": 90,  "task_fit": 1.0},
        {"model": "llama3.1:70b",          "provider": "ollama",  "benchmark": 0.790, "heval": None,  "speed_tps": 5,   "task_fit": 0.2},
        {"model": "qwen2.5:32b",           "provider": "ollama",  "benchmark": 0.800, "heval": None,  "speed_tps": 12,  "task_fit": 0.2},
    ],
    "general_reasoning": [
        {"model": "mistral:latest",        "provider": "ollama",  "benchmark": 0.810, "heval": None,  "speed_tps": 45,  "task_fit": 0.0},
        {"model": "llama3.2:latest",       "provider": "ollama",  "benchmark": 0.790, "heval": None,  "speed_tps": 80,  "task_fit": 0.0},
        {"model": "qwen2.5:7b",            "provider": "ollama",  "benchmark": 0.820, "heval": None,  "speed_tps": 50,  "task_fit": 0.0},
        {"model": "llama3.1:70b",          "provider": "ollama",  "benchmark": 0.860, "heval": None,  "speed_tps": 5,   "task_fit": 0.0},
        {"model": "qwen2.5:72b",           "provider": "ollama",  "benchmark": 0.850, "heval": None,  "speed_tps": 4,   "task_fit": 0.0},
        {"model": "gpt-4o-mini",           "provider": "openai",  "benchmark": 0.840, "heval": None,  "speed_tps": 120, "task_fit": 0.0},
        {"model": "gemini-2.0-flash",      "provider": "openai",  "benchmark": 0.850, "heval": None,  "speed_tps": 200, "task_fit": 0.0},
    ],
}

# Approximate context window sizes (tokens) per model.
MODEL_CONTEXT_LENGTHS: dict[str, int] = {
    "qwen2.5-coder:32b":     32_768,
    "qwen2.5-coder:7b":      32_768,
    "qwen2.5:72b":          131_072,
    "qwen2.5:32b":           32_768,
    "qwen2.5:7b":            32_768,
    "llama3.1:70b":         131_072,
    "llama3.2:latest":        8_192,
    "mistral:latest":        32_768,
    "gemma3:latest":          8_192,
    "deepseek-coder-v2:16b": 16_384,
    "claude-opus-4-5":      200_000,
    "claude-sonnet-4-5":    200_000,
    "gpt-4o":               128_000,
    "gpt-4o-mini":          128_000,
    "gemini-2.0-flash":   1_000_000,
}
DEFAULT_CONTEXT_LENGTH = 8_192

# Max tok/s used to normalise speed scores. Models above this cap at 1.0.
SPEED_NORMALIZER = 100.0


@dataclass
class ModelRecommendation:
    model_name: str
    provider: str
    benchmark_score: float
    availability_score: float
    bandit_score: float
    speed_score: float
    composite_score: float
    benchmark_source: str
    why_primary: str
    why_not_alternatives: list[str] = field(default_factory=list)
    is_primary: bool = False


class ModelCapabilityCatalog:
    def __init__(self, adapter_registry=None, bandit=None):
        self._adapter = adapter_registry
        self._bandit = bandit

    def get_candidates(self, task_type: str) -> list[dict]:
        return MODEL_CATALOG.get(task_type, MODEL_CATALOG.get("general_reasoning", []))

    async def recommend(
        self,
        task_type: str,
        query_embedding: list[float] | None = None,
        available_models: list[str] | None = None,
        token_count: int = 0,
        slm_model_id: str | None = None,  # kept for API compat; NOT added to candidates
        scoring_weights=None,             # ModelWeights | None — user-configured priorities
    ) -> list[ModelRecommendation]:
        """
        Select the best general-purpose LLM for executing a user-visible task.

        scoring_weights (optional) overrides the default composite formula weights so
        users can prioritise speed, quality, or availability as they see fit.
        The SLM (slm_model_id) is intentionally excluded from candidates here.
        """
        # Resolve weights — use user values if provided, else defaults
        w_benchmark    = getattr(scoring_weights, "benchmark",    0.30)
        w_availability = getattr(scoring_weights, "availability", 0.20)
        w_bandit       = getattr(scoring_weights, "bandit",       0.20)
        w_speed        = getattr(scoring_weights, "speed",        0.15)
        w_ctx_fit      = getattr(scoring_weights, "ctx_fit",      0.10)
        w_task_fit     = getattr(scoring_weights, "task_fit",     0.05)
        candidates = list(self.get_candidates(task_type))
        if not candidates:
            return []

        available_set = set(available_models or [])
        results = []

        for cand in candidates:
            # ── Availability ────────────────────────────────────────────
            if cand["provider"] == "ollama":
                avail = 1.0 if cand["model"] in available_set else 0.2
            elif cand["provider"] == "openai":
                avail = 0.9 if cand["model"] in available_set else 0.0
            else:
                avail = 1.0 if cand["model"] in available_set else 0.1

            # ── Bandit score ─────────────────────────────────────────────
            bandit_score = cand["benchmark"] * 0.8 + 0.1
            if self._bandit and query_embedding:
                if hasattr(self._bandit, "warm_start_arm"):
                    self._bandit.warm_start_arm(cand["model"], cand["benchmark"])
                scores = self._bandit.score(
                    [cand["model"]], query_embedding, task_type, token_count, 0
                )
                bandit_score = min(max(scores.get(cand["model"], bandit_score), 0), 1.0)

            # ── Context-length fit ───────────────────────────────────────
            model_ctx  = MODEL_CONTEXT_LENGTHS.get(cand["model"], DEFAULT_CONTEXT_LENGTH)
            safe_limit = model_ctx * 0.75
            ctx_fit = (
                1.0 if token_count <= safe_limit
                else max(0.0, 1.0 - (token_count - safe_limit) / (model_ctx * 0.25))
            )

            # ── Speed score (tokens/sec, normalized) ────────────────────
            speed_score = min(cand.get("speed_tps", 20) / SPEED_NORMALIZER, 1.0)

            # ── Task specialty bonus ─────────────────────────────────────
            task_fit = cand.get("task_fit", 0.0)

            composite = (
                w_benchmark    * cand["benchmark"] +
                w_availability * avail +
                w_bandit       * bandit_score +
                w_speed        * speed_score +
                w_ctx_fit      * ctx_fit +
                w_task_fit     * task_fit
            )

            results.append(ModelRecommendation(
                model_name=cand["model"],
                provider=cand["provider"],
                benchmark_score=cand["benchmark"],
                availability_score=avail,
                bandit_score=bandit_score,
                speed_score=round(speed_score, 3),
                composite_score=round(composite, 3),
                benchmark_source=f"HumanEval {cand['heval']}%" if cand.get("heval") else "internal",
                why_primary="",
            ))

        results.sort(key=lambda r: r.composite_score, reverse=True)

        if results:
            top = results[0]
            top.is_primary = True
            tps = top.model_name and next(
                (c.get("speed_tps", 0) for c in candidates if c["model"] == top.model_name), 0
            )
            top.why_primary = (
                f"Highest composite score ({top.composite_score:.3f}): "
                f"quality {top.benchmark_score:.0%} (w={w_benchmark:.0%}) · "
                f"availability {top.availability_score:.0%} (w={w_availability:.0%}) · "
                f"bandit {top.bandit_score:.2f} (w={w_bandit:.0%}) · "
                f"speed ~{tps} tok/s (w={w_speed:.0%}) · "
                f"ctx_fit {ctx_fit:.2f} (w={w_ctx_fit:.0%})"
            )
            for alt in results[1:]:
                alt.why_not_alternatives.append(
                    f"Lower composite ({alt.composite_score:.3f} vs {top.composite_score:.3f})"
                )

        return results

    def validate_and_resolve(
        self,
        model_name: str,
        task_type: str,
        available_names: list[str],
    ) -> tuple[str, bool]:
        """
        Validate that model_name is available; return a fallback if not.

        Returns:
            (resolved_model, was_substituted)

        Used by the SLM-first architecture where the catalog's only role is
        confirming availability and substituting unavailable models.
        Catalog never selects models for planning — that is the SLM's job.
        """
        available_set = set(available_names)
        if model_name and model_name in available_set:
            return model_name, False

        # Find best available candidate for this task type
        candidates = self.get_candidates(task_type)
        for cand in candidates:
            if cand["model"] in available_set:
                return cand["model"], True

        # Last resort: return the first available model regardless of task type
        if available_names:
            return available_names[0], True

        return model_name, False
