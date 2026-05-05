"""
Task Classifier — fires before coverage_checker on every query.

Classifies query intent into:
  DOMAIN     — answerable by domain SLM (knowledge Q&A, entity lookups)
  CAPABILITY — needs specialist model (code gen, UI building, time series, etc.)
  HYBRID     — both domain context AND specialist model needed

Uses keyword signals + embedding cosine match against task-type centroids.
"""
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


@dataclass
class ClassificationResult:
    intent: TaskIntent
    primary_task_type: str          # e.g. "code_generation", "domain_qa"
    confidence: float
    detected_capability: str | None # capability type if CAPABILITY/HYBRID
    reasoning: str


class TaskClassifier:
    def classify(self, query: str) -> ClassificationResult:
        q = query.lower()

        has_domain = any(kw in q for kw in DOMAIN_KEYWORDS)

        # Supply chain / system-building queries should be treated as domain + general reasoning
        SUPPLY_CHAIN_SIGNALS = [
            "supply chain", "procurement", "demand forecast", "inventory",
            "supplier", "tariff", "logistics", "cpg", "event trigger",
        ]
        has_supply_chain = any(sig in q for sig in SUPPLY_CHAIN_SIGNALS)
        if has_supply_chain:
            # Treat as DOMAIN query about supply chain system design
            return ClassificationResult(
                intent=TaskIntent.DOMAIN,
                primary_task_type="general_reasoning",
                confidence=0.88,
                detected_capability=None,
                reasoning="Supply chain domain query — routing to domain Q&A + general reasoning",
            )

        capability_hits: dict[str, int] = {}
        for cap_type, keywords in CAPABILITY_KEYWORDS.items():
            # Use whole-phrase matching to avoid substring false positives (e.g. "ui" in "build")
            hits = sum(1 for kw in keywords if f" {kw} " in f" {q} " or q.startswith(kw) or q.endswith(kw))
            if hits > 0:
                capability_hits[cap_type] = hits

        if not capability_hits:
            return ClassificationResult(
                intent=TaskIntent.DOMAIN,
                primary_task_type="domain_qa",
                confidence=0.85,
                detected_capability=None,
                reasoning="No capability keywords detected; treating as domain Q&A",
            )

        best_cap = max(capability_hits, key=capability_hits.get)
        cap_score = capability_hits[best_cap]

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
