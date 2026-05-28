"""
Task Classifier — fires before coverage_checker on every query.

Primary path  (zero latency):  keyword matching against curated signal lists.
Fallback path (when no keywords match + embed_fn provided):
    Zero-shot embedding cosine similarity against pre-computed task-type
    centroid phrases (lazily cached per worker lifetime).

Classifies query intent into:
  DOMAIN     — answerable by domain SLM (knowledge Q&A, entity lookups)
  CAPABILITY — needs specialist model (code gen, UI building, time series, etc.)
  HYBRID     — both domain context AND specialist model needed
"""
import math
from dataclasses import dataclass
from enum import Enum


class TaskIntent(str, Enum):
    DOMAIN     = "DOMAIN"
    CAPABILITY = "CAPABILITY"
    HYBRID     = "HYBRID"


CAPABILITY_KEYWORDS: dict[str, list[str]] = {
    "code_generation": [
        "write code", "implement", "function", "class", "debug", "refactor",
        "sql query", "script", "algorithm", "unit test",
    ],
    "ui_building": [
        "user interface", "component", "react", "vue", "html", "css", "frontend",
        "design a", "build a dashboard", "page layout",
    ],
    "time_series": [
        "forecast", "time series", "predict future", "trend", "anomaly",
        "seasonality", "chronos", "arima",
    ],
    "data_analysis": [
        "analyze data", "statistics", "correlation", "distribution",
        "pandas", "plot", "chart", "aggregate",
    ],
    "financial": [
        "stock price", "portfolio", "risk", "valuation", "financial model",
        "dcf", "earnings", "revenue forecast",
    ],
    "geospatial": [
        "map", "coordinates", "geospatial", "gps", "latitude", "longitude",
        "shapefile", "topology", "polygon",
    ],
    "general_reasoning": [
        "explain", "compare", "summarize", "pros and cons", "trade-off",
        "what is the difference", "how does",
    ],
}

DOMAIN_KEYWORDS = [
    "according to", "in our data", "based on the corpus",
    "what does our", "per our records", "in this domain",
    "our company", "our project", "our system",
]

_SUPPLY_CHAIN_SIGNALS = [
    "supply chain", "procurement", "demand forecast", "inventory",
    "supplier", "tariff", "logistics", "cpg", "event trigger",
]

# Representative phrases for embedding-based fallback.
# Each string describes the semantic centre of that task type.
_TASK_PHRASES: dict[str, str] = {
    "code_generation":  "write code implement function class debug refactor script algorithm unit test",
    "ui_building":      "user interface component react vue html css frontend dashboard design layout",
    "time_series":      "forecast time series predict trend anomaly seasonality arima chronos",
    "data_analysis":    "analyze data statistics correlation distribution aggregate chart plot pandas",
    "financial":        "stock price portfolio risk valuation financial model dcf earnings revenue",
    "geospatial":       "map coordinates geospatial gps latitude longitude shapefile polygon topology",
    "general_reasoning":"explain compare summarize difference trade-off pros cons how does work",
    "domain_qa":        "according to our data documents records corpus domain knowledge what does",
}


@dataclass
class ClassificationResult:
    intent: TaskIntent
    primary_task_type: str          # e.g. "code_generation", "domain_qa"
    confidence: float
    detected_capability: str | None # capability type if CAPABILITY/HYBRID
    reasoning: str


class TaskClassifier:
    def __init__(self, embed_fn=None):
        self._embed = embed_fn
        # Centroid embeddings cached lazily — populated on first embedding fallback call
        self._centroid_cache: dict[str, list[float]] = {}

    async def classify(
        self,
        query: str,
        query_embedding: list[float] | None = None,
    ) -> ClassificationResult:
        """Classify query intent.

        Tries keyword matching first (free).  When no keywords match and an
        embed_fn + pre-computed query_embedding are available, falls back to
        zero-shot embedding similarity against task centroid phrases.
        """
        result = self._keyword_classify(query)
        if result is not None:
            return result

        # Embedding fallback
        if self._embed is not None and query_embedding is not None:
            try:
                return await self._embedding_classify(query, query_embedding)
            except Exception:
                pass

        return ClassificationResult(
            intent=TaskIntent.DOMAIN,
            primary_task_type="domain_qa",
            confidence=0.75,
            detected_capability=None,
            reasoning="No keyword match; defaulting to domain Q&A",
        )

    def _keyword_classify(self, query: str) -> ClassificationResult | None:
        """Keyword scan.  Returns None (not a default) when nothing matches,
        signalling the caller to try embedding classification."""
        q = query.lower()
        has_domain = any(kw in q for kw in DOMAIN_KEYWORDS)

        if any(sig in q for sig in _SUPPLY_CHAIN_SIGNALS):
            return ClassificationResult(
                intent=TaskIntent.DOMAIN,
                primary_task_type="general_reasoning",
                confidence=0.88,
                detected_capability=None,
                reasoning="Supply chain domain query — routing to domain Q&A + general reasoning",
            )

        capability_hits: dict[str, int] = {}
        for cap_type, keywords in CAPABILITY_KEYWORDS.items():
            hits = sum(
                1 for kw in keywords
                if f" {kw} " in f" {q} " or q.startswith(kw) or q.endswith(kw)
            )
            if hits > 0:
                capability_hits[cap_type] = hits

        if not capability_hits:
            return None   # → embedding fallback

        best_cap   = max(capability_hits, key=capability_hits.get)
        cap_score  = capability_hits[best_cap]

        if has_domain:
            return ClassificationResult(
                intent=TaskIntent.HYBRID,
                primary_task_type="hybrid",
                confidence=min(0.7 + cap_score * 0.05, 0.95),
                detected_capability=best_cap,
                reasoning=f"Domain context + {best_cap} capability required",
            )

        return ClassificationResult(
            intent=TaskIntent.CAPABILITY,
            primary_task_type=best_cap,
            confidence=min(0.65 + cap_score * 0.05, 0.95),
            detected_capability=best_cap,
            reasoning=f"Capability task detected: {best_cap} (hits: {cap_score})",
        )

    async def _embedding_classify(
        self,
        query: str,
        query_embedding: list[float],
    ) -> ClassificationResult:
        """Zero-shot task classification via cosine similarity to centroid phrases.

        Centroid embeddings are computed once per worker lifetime and cached.
        This adds one embed() call per uncached task type on first invocation only.
        """
        def _cos(a: list[float], b: list[float]) -> float:
            dot   = sum(x * y for x, y in zip(a, b))
            norm_a = math.sqrt(sum(x * x for x in a))
            norm_b = math.sqrt(sum(x * x for x in b))
            return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0

        best_task = "domain_qa"
        best_sim  = 0.0

        for task_type, phrase in _TASK_PHRASES.items():
            if task_type not in self._centroid_cache:
                self._centroid_cache[task_type] = await self._embed(phrase)
            sim = _cos(query_embedding, self._centroid_cache[task_type])
            if sim > best_sim:
                best_sim  = sim
                best_task = task_type

        intent = (
            TaskIntent.DOMAIN
            if best_task in ("domain_qa", "general_reasoning")
            else TaskIntent.CAPABILITY
        )
        return ClassificationResult(
            intent=intent,
            primary_task_type=best_task,
            confidence=round(best_sim, 3),
            detected_capability=best_task if intent == TaskIntent.CAPABILITY else None,
            reasoning=f"Embedding classification: {best_task} (similarity: {best_sim:.3f})",
        )
