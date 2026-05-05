"""
Model Capability Catalog — static benchmark scores + availability scoring.

Recommend() scores: 0.45 × benchmark + 0.30 × availability + 0.25 × bandit_score
"""
from dataclasses import dataclass, field

MODEL_CATALOG: dict[str, list[dict]] = {
    "code_generation": [
        {"model": "qwen2.5-coder:32b",     "provider": "ollama",  "benchmark": 0.927, "heval": 92.7},
        {"model": "deepseek-coder-v2:16b", "provider": "ollama",  "benchmark": 0.880, "heval": 88.0},
        {"model": "claude-opus-4-5",        "provider": "openai",  "benchmark": 0.940, "heval": 94.0},
        {"model": "gemini-2.0-flash",      "provider": "openai",  "benchmark": 0.880, "heval": 88.0},
        {"model": "qwen2.5-coder:7b",      "provider": "ollama",  "benchmark": 0.820, "heval": 82.0},
    ],
    "ui_building": [
        {"model": "claude-opus-4-5",        "provider": "openai",  "benchmark": 0.900, "heval": None},
        {"model": "claude-sonnet-4-5",      "provider": "openai",  "benchmark": 0.870, "heval": None},
        {"model": "qwen2.5-coder:32b",     "provider": "ollama",  "benchmark": 0.830, "heval": None},
    ],
    "time_series": [
        {"model": "chronos-t5-large",      "provider": "local",   "benchmark": 0.870, "heval": None},
        {"model": "moirai-1.0-r-large",    "provider": "local",   "benchmark": 0.850, "heval": None},
        {"model": "timesfm-1.0-200m",      "provider": "local",   "benchmark": 0.830, "heval": None},
    ],
    "data_analysis": [
        {"model": "qwen2.5:72b",           "provider": "ollama",  "benchmark": 0.860, "heval": None},
        {"model": "llama3.1:70b",          "provider": "ollama",  "benchmark": 0.840, "heval": None},
        {"model": "gemini-2.0-flash",      "provider": "openai",  "benchmark": 0.870, "heval": None},
    ],
    "financial": [
        {"model": "finbert-tone",          "provider": "local",   "benchmark": 0.880, "heval": None},
        {"model": "llama3.1:70b",          "provider": "ollama",  "benchmark": 0.830, "heval": None},
        {"model": "gpt-4o",               "provider": "openai",  "benchmark": 0.890, "heval": None},
    ],
    "geospatial": [
        {"model": "granite-geospatial-1b", "provider": "local",   "benchmark": 0.870, "heval": None},
        {"model": "llama3.1:70b",          "provider": "ollama",  "benchmark": 0.790, "heval": None},
    ],
    "general_reasoning": [
        {"model": "llama3.1:70b",          "provider": "ollama",  "benchmark": 0.860, "heval": None},
        {"model": "qwen2.5:72b",           "provider": "ollama",  "benchmark": 0.850, "heval": None},
        {"model": "gpt-4o-mini",          "provider": "openai",  "benchmark": 0.840, "heval": None},
        {"model": "gemini-2.0-flash",      "provider": "openai",  "benchmark": 0.850, "heval": None},
    ],
    "domain_qa": [],   # filled dynamically from SLM registry
}


@dataclass
class ModelRecommendation:
    model_name: str
    provider: str
    benchmark_score: float
    availability_score: float
    bandit_score: float
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
        slm_model_id: str | None = None,
    ) -> list[ModelRecommendation]:
        candidates = list(self.get_candidates(task_type))

        # Always include the domain SLM as a candidate (it can handle any task as fallback)
        if slm_model_id:
            if not any(c["model"] == slm_model_id for c in candidates):
                candidates.append({
                    "model": slm_model_id,
                    "provider": "ollama",
                    "benchmark": 0.75,  # conservative general benchmark
                    "heval": None,
                })

        if not candidates:
            return []

        available_set = set(available_models or [])
        results = []

        for cand in candidates:
            # Availability: only score available models highly.
            # Cloud models score 0.0 if not in available_set (no API key configured).
            if cand["provider"] == "ollama":
                avail = 1.0 if cand["model"] in available_set else 0.2
            elif cand["provider"] == "openai":
                # available_set contains cloud models only when the adapter has a valid key
                avail = 0.9 if cand["model"] in available_set else 0.0
            else:
                # local specialist models (chronos, finbert, etc.)
                avail = 1.0 if cand["model"] in available_set else 0.1

            # Bandit score
            bandit_score = 0.5
            if self._bandit and query_embedding:
                scores = self._bandit.score(
                    [cand["model"]], query_embedding, task_type, token_count, 0
                )
                bandit_score = min(max(scores.get(cand["model"], 0.5), 0), 1.0)

            composite = (
                0.45 * cand["benchmark"] +
                0.30 * avail +
                0.25 * bandit_score
            )

            results.append(ModelRecommendation(
                model_name=cand["model"],
                provider=cand["provider"],
                benchmark_score=cand["benchmark"],
                availability_score=avail,
                bandit_score=bandit_score,
                composite_score=round(composite, 3),
                benchmark_source=f"HumanEval {cand['heval']}%" if cand.get("heval") else "internal",
                why_primary="",
            ))

        results.sort(key=lambda r: r.composite_score, reverse=True)

        if results:
            top = results[0]
            top.is_primary = True
            top.why_primary = (
                f"Highest composite score ({top.composite_score:.3f}) = "
                f"benchmark {top.benchmark_score:.2%} × 0.45 + "
                f"availability {top.availability_score:.2%} × 0.30 + "
                f"bandit {top.bandit_score:.2%} × 0.25"
            )
            for alt in results[1:]:
                alt.why_not_alternatives.append(
                    f"Lower composite ({alt.composite_score:.3f} vs {top.composite_score:.3f})"
                )

        return results
