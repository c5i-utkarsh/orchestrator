"""
Coverage Checker — multi-signal SLM matching with 3-gate evaluation.

Gate 1 — Composite score (replaces cosine-only):
    0.40 × cosine_similarity(query_emb, domain_emb)
    0.20 × token_overlap(query_tokens, coverage_topics)
    0.15 × (1 - hallucination_rate)          ← from DB history
    0.15 × task_completion_rate              ← from DB history
    0.10 × recency_score(last_used_at)       ← freshness of model

Gate 2 — Sub-task confidence (replaces unreliable self-reporting):
    0.60 × max cosine_sim(sub_task_emb, topic_emb)   ← objective embedding similarity
    0.40 × SLM self-reported my_confidence            ← kept as weak signal

Gate 3 — Decision: ROUTE_MIXED | EXTEND_EXISTING | BUILD_NEW
"""
import json
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
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
    composite_score: float = 0.0
    coverage_topics: list[str] = field(default_factory=list)
    avg_confidence: float | None = None
    max_confidence: float | None = None
    estimated_build_minutes: int = 74
    reason: str = ""


# ── Scoring helpers ───────────────────────────────────────────────────────────

def _token_overlap(query: str, topics: list[str]) -> float:
    """Normalised token overlap: |query_tokens ∩ topic_tokens| / |topic_tokens|."""
    if not topics:
        return 0.0
    q_tokens = set(query.lower().replace("_", " ").split())
    t_tokens: set[str] = set()
    for t in topics:
        t_tokens.update(t.lower().replace("_", " ").split())
    if not t_tokens:
        return 0.0
    return min(len(q_tokens & t_tokens) / len(t_tokens), 1.0)


def _recency_score(last_used_at) -> float:
    """1.0 for use within the last hour; decays linearly to 0.3 over 30 days."""
    if last_used_at is None:
        return 0.3
    if isinstance(last_used_at, str):
        try:
            last_used_at = datetime.fromisoformat(last_used_at)
        except ValueError:
            return 0.3
    now = datetime.now(timezone.utc)
    if last_used_at.tzinfo is None:
        last_used_at = last_used_at.replace(tzinfo=timezone.utc)
    age_days = (now - last_used_at).total_seconds() / 86400
    return max(0.3, 1.0 - age_days / 30)


def _cosine_sim(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    dot   = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0


# ── Checker ───────────────────────────────────────────────────────────────────

class CoverageChecker:
    def __init__(self, registry: SLMRegistry, embed_fn):
        self._registry = registry
        self._embed = embed_fn  # async callable: str -> list[float]

    async def check(
        self,
        query: str,
        query_embedding: list[float] | None = None,
        domain_label: str | None = None,
    ) -> CoverageResult:
        """Gate 1: Multi-signal composite matching.

        domain_label: when provided, the registry will prefer SLMs registered
        under that exact domain before falling back to global vector search.
        This prevents cross-domain routing (e.g. a 'technova-e2e' query routing
        to 'it_industry_v10' because their embeddings are geometrically closer).
        """
        if query_embedding is None:
            query_embedding = await self._embed(query)

        best_match = await self._registry.find_best_match(
            query_embedding,
            domain_label=domain_label or None,
        )
        if not best_match:
            return CoverageResult(
                action=CoverageAction.BUILD_NEW,
                model_id=None,
                similarity=0.0,
                reason="No SLMs in registry yet",
            )

        cosine = float(best_match.get("similarity", 0.0))
        # Guard against NaN: pgvector cosine distance returns NaN when the stored
        # embedding is a zero vector (fallback embedder produced all-zeros due to
        # SentenceTransformer SSL failure). Treat NaN as 0.0 so the composite score
        # remains a valid float and routing decisions are stable.
        import math as _math
        if _math.isnan(cosine):
            cosine = 0.0

        # Parse coverage_topics (may be a list or JSON string from DB)
        topics = best_match.get("coverage_topics") or []
        if isinstance(topics, str):
            try:
                topics = json.loads(topics)
            except Exception:
                topics = []

        # Pull historical quality signals — use safe defaults for new models
        hall_rate  = float(best_match.get("hallucination_rate")   or 0.15)
        completion = float(best_match.get("task_completion_rate") or 0.70)
        recency    = _recency_score(best_match.get("last_used_at"))
        overlap    = _token_overlap(query, topics)

        composite = min(
            0.40 * cosine
            + 0.20 * overlap
            + 0.15 * (1.0 - hall_rate)
            + 0.15 * completion
            + 0.10 * recency,
            1.0,
        )

        reason = (
            f"composite={composite:.3f} "
            f"[cos={cosine:.3f}×0.40 + overlap={overlap:.3f}×0.20 + "
            f"quality={1-hall_rate:.3f}×0.15 + completion={completion:.3f}×0.15 + "
            f"recency={recency:.3f}×0.10]"
        )

        ollama_name = best_match.get("ollama_model_name") or best_match["model_id"]

        # Minimum viable threshold — if a model exists and has ANY resemblance to the query,
        # route to it rather than declaring BUILD_NEW. The orchestrator no longer blocks queries
        # for SLM builds; BUILD_NEW is only advisory now.
        _MIN_ROUTING_THRESHOLD = 0.30

        if composite < _MIN_ROUTING_THRESHOLD:
            # No usable match at all — advise build and let orchestrator pick fallback model
            return CoverageResult(
                action=CoverageAction.BUILD_NEW,
                model_id=None,
                similarity=cosine,
                composite_score=composite,
                coverage_topics=topics,
                reason=f"Composite {composite:.3f} < min-routing threshold {_MIN_ROUTING_THRESHOLD} | {reason}",
            )

        if composite < settings.slm_partial_threshold:
            # Below full-match threshold but a relevant model exists: route to it with advisory
            return CoverageResult(
                action=CoverageAction.EXTEND_EXISTING,
                model_id=ollama_name,
                similarity=cosine,
                composite_score=composite,
                coverage_topics=topics,
                reason=f"Composite {composite:.3f} < partial threshold {settings.slm_partial_threshold} — using best match | {reason}",
            )

        return CoverageResult(
            action=CoverageAction.ROUTE_MIXED,   # tentative — Gate 2 may change this
            model_id=ollama_name,
            similarity=cosine,
            composite_score=composite,
            coverage_topics=topics,
            reason=f"Matched {best_match['model_id']} → {ollama_name} | {reason}",
        )

    async def evaluate_routing_plan(
        self,
        routing_plan: dict,
        initial_result: CoverageResult,
    ) -> CoverageResult:
        """Gate 2 + 3: Topic-embedding similarity blended with SLM self-confidence.

        Replaces pure self-reporting (unreliable when the SLM is a generic Ollama
        model rather than a trained specialist). Each sub-task fragment is embedded
        and compared against the registered coverage topics; that objective score is
        blended 60/40 with the model's self-reported confidence.
        """
        sub_tasks = routing_plan.get("sub_tasks", [])
        if not sub_tasks:
            return initial_result

        # Embed each coverage topic once and reuse across all sub-tasks
        topic_embeddings: list[list[float]] = []
        for topic in (initial_result.coverage_topics or [])[:8]:   # cap to limit calls
            try:
                topic_embeddings.append(await self._embed(topic))
            except Exception:
                pass

        confidences: list[float] = []
        for st in sub_tasks:
            fragment  = st.get("query_fragment", "")
            self_conf = float(st.get("my_confidence", 0.5))

            if fragment and topic_embeddings:
                try:
                    frag_emb = await self._embed(fragment)
                    # Max similarity of this sub-task against any known topic
                    embedding_conf = max(
                        (_cosine_sim(frag_emb, t_emb) for t_emb in topic_embeddings),
                        default=0.5,
                    )
                except Exception:
                    embedding_conf = self_conf
                # 60 % embedding-based (objective) + 40 % self-reported
                blended = 0.60 * embedding_conf + 0.40 * self_conf
            else:
                blended = self_conf

            confidences.append(blended)

        avg_conf = sum(confidences) / len(confidences)
        max_conf = max(confidences)
        initial_result.avg_confidence = avg_conf
        initial_result.max_confidence = max_conf

        # Gate 3 decision matrix (unchanged thresholds)
        if max_conf >= 0.70:
            initial_result.action = CoverageAction.ROUTE_MIXED
            initial_result.reason += f" | Confident (max: {max_conf:.2f})"
        elif avg_conf < settings.slm_confidence_threshold:
            if initial_result.similarity < settings.slm_match_threshold:
                initial_result.action = CoverageAction.EXTEND_EXISTING
                initial_result.reason += f" | Low confidence (avg: {avg_conf:.2f}), partial match → extend"
            else:
                initial_result.action = CoverageAction.BUILD_NEW
                initial_result.reason += f" | Low confidence (avg: {avg_conf:.2f}), false positive → build new"

        return initial_result

    async def quick_scan(self, query_embedding: list[float]) -> float:
        """Fast scan without full evaluation — returns best similarity score."""
        best_match = await self._registry.find_best_match(query_embedding)
        return float(best_match.get("similarity", 0.0)) if best_match else 0.0
