"""
Coverage Checker — 3-gate evaluation system.

Gate 1: pgvector cosine similarity search against SLM registry.
Gate 2: Evaluate SLM confidence scores from routing plan.
Gate 3: Determine action: ROUTE_MIXED | EXTEND_EXISTING | BUILD_NEW
"""
from dataclasses import dataclass
from enum import Enum

from app.config import get_settings
from app.modules.slm_factory.slm_registry import SLMRegistry

settings = get_settings()


class CoverageAction(str, Enum):
    ROUTE_MIXED      = "ROUTE_MIXED"       # existing SLM handles query
    EXTEND_EXISTING  = "EXTEND_EXISTING"   # adjacent domain, extend SLM
    BUILD_NEW        = "BUILD_NEW"         # no match, build from scratch


@dataclass
class CoverageResult:
    action: CoverageAction
    model_id: str | None
    similarity: float
    avg_confidence: float | None = None
    max_confidence: float | None = None
    estimated_build_minutes: int = 74
    reason: str = ""


class CoverageChecker:
    def __init__(self, registry: SLMRegistry, embed_fn):
        self._registry = registry
        self._embed = embed_fn  # async callable: str -> list[float]

    async def check(self, query: str) -> CoverageResult:
        """Gate 1: Embedding cosine search."""
        query_embedding = await self._embed(query)
        best_match = await self._registry.find_best_match(query_embedding)

        if not best_match:
            return CoverageResult(
                action=CoverageAction.BUILD_NEW,
                model_id=None,
                similarity=0.0,
                reason="No SLMs in registry yet",
            )

        similarity = float(best_match.get("similarity", 0.0))

        if similarity < settings.slm_partial_threshold:
            return CoverageResult(
                action=CoverageAction.BUILD_NEW,
                model_id=None,
                similarity=similarity,
                reason=f"Best match similarity {similarity:.3f} below threshold {settings.slm_partial_threshold}",
            )

        # Use ollama_model_name as the usable model ID (not the registry ID)
        ollama_name = best_match.get("ollama_model_name") or best_match["model_id"]
        return CoverageResult(
            action=CoverageAction.ROUTE_MIXED,   # tentative — Gate 2 may change this
            model_id=ollama_name,
            similarity=similarity,
            reason=f"Matched {best_match['model_id']} → {ollama_name} (similarity: {similarity:.3f})",
        )

    def evaluate_routing_plan(
        self, routing_plan: dict, initial_result: CoverageResult
    ) -> CoverageResult:
        """Gate 2 + 3: Evaluate SLM's own confidence scores from routing plan."""
        sub_tasks = routing_plan.get("sub_tasks", [])
        if not sub_tasks:
            return initial_result

        confidences = [t.get("my_confidence", 0.5) for t in sub_tasks]
        avg_conf = sum(confidences) / len(confidences)
        max_conf = max(confidences)

        initial_result.avg_confidence = avg_conf
        initial_result.max_confidence = max_conf

        # Gate 3 decision matrix
        if max_conf >= 0.70:
            initial_result.action = CoverageAction.ROUTE_MIXED
            initial_result.reason += f" | Confident (max: {max_conf:.2f})"

        elif avg_conf < settings.slm_confidence_threshold:
            if initial_result.similarity < settings.slm_match_threshold:
                # Partial match + low confidence → extend existing
                initial_result.action = CoverageAction.EXTEND_EXISTING
                initial_result.reason += f" | Low confidence (avg: {avg_conf:.2f}), partial match → extend"
            else:
                # High embedding similarity but zero domain confidence → false positive
                initial_result.action = CoverageAction.BUILD_NEW
                initial_result.reason += f" | Low confidence (avg: {avg_conf:.2f}), false positive match → build new"

        return initial_result

    async def quick_scan(self, query_embedding: list[float]) -> float:
        """Fast scan without full evaluation — returns best similarity score."""
        best_match = await self._registry.find_best_match(query_embedding)
        return float(best_match.get("similarity", 0.0)) if best_match else 0.0
