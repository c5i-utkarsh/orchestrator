"""Relevance / contamination scoring using seed-term coverage."""

from __future__ import annotations

import logging

from .models import Document, RejectionReason
from .text_utils import tokenize

logger = logging.getLogger(__name__)


def score_relevance(
    docs: list[Document],
    seed_terms: list[str],
    min_relevance_score: float = 0.05,
) -> list[Document]:
    """Score each accepted document against a list of domain seed terms.

    The relevance score is the fraction of seed terms (or their tokens) that
    appear at least once in the document's clean token set.

    Args:
        docs: Documents to evaluate.
        seed_terms: Domain-specific phrases/words that indicate relevance.
        min_relevance_score: Documents scoring below this are rejected.

    Returns:
        Same list with relevance_score populated and low-relevance docs rejected.
    """
    if not seed_terms:
        logger.warning("No seed terms configured — skipping relevance scoring")
        return docs

    # Pre-tokenise seed terms into term-token sets for fast lookup
    seed_token_sets = [set(tokenize(t)) for t in seed_terms]
    rejected = 0

    for doc in docs:
        if not doc.accepted:
            continue
        doc_tokens = set(tokenize(doc.clean_text))
        score = _compute_relevance(doc_tokens, seed_token_sets)
        object.__setattr__(doc, "relevance_score", round(score, 4))

        if score < min_relevance_score:
            _reject(doc, f"relevance_score={score:.4f} < min={min_relevance_score}")
            rejected += 1

    logger.info("Relevance scoring complete — %d rejected", rejected)
    return docs


def _compute_relevance(doc_tokens: set[str], seed_token_sets: list[set[str]]) -> float:
    """Fraction of seed terms whose tokens all appear in *doc_tokens*."""
    if not seed_token_sets:
        return 0.0
    hits = sum(1 for seed_set in seed_token_sets if seed_set.issubset(doc_tokens))
    return hits / len(seed_token_sets)


def _reject(doc: Document, detail: str) -> None:
    object.__setattr__(doc, "accepted", False)
    object.__setattr__(doc, "rejection_reason", RejectionReason.LOW_RELEVANCE)
    object.__setattr__(doc, "rejection_detail", detail)
