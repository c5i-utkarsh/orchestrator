"""Heuristic quality scoring for documents."""

from __future__ import annotations

import logging

from .models import Document, QualityScore, RejectionReason
from .text_utils import tokenize

logger = logging.getLogger(__name__)


def score_quality(
    docs: list[Document],
    *,
    min_token_count: int = 20,
    max_token_count: int = 50_000,
    min_avg_word_length: float = 3.0,
    max_symbol_ratio: float = 0.3,
    min_alpha_ratio: float = 0.5,
) -> list[Document]:
    """Compute and attach a QualityScore to each accepted document.

    Rejects documents whose scores fall outside configured thresholds.

    Args:
        docs: Documents to score (only accepted ones are processed).
        min_token_count: Lower bound on token count.
        max_token_count: Upper bound on token count.
        min_avg_word_length: Minimum mean character length per word.
        max_symbol_ratio: Maximum fraction of non-alphanumeric characters.
        min_alpha_ratio: Minimum fraction of alphabetic characters.

    Returns:
        Same list with quality fields populated.
    """
    rejected = 0
    for doc in docs:
        if not doc.accepted:
            continue
        qs = _compute(doc.clean_text)
        object.__setattr__(doc, "quality", qs)
        reason = _gate(qs, min_token_count, max_token_count, min_avg_word_length, max_symbol_ratio, min_alpha_ratio)
        if reason:
            _reject(doc, reason)
            rejected += 1

    logger.info("Quality scoring complete — %d rejected", rejected)
    return docs


def _compute(text: str) -> QualityScore:
    tokens = tokenize(text)
    total_chars = len(text)

    token_count = len(tokens)
    avg_word_length = (sum(len(t) for t in tokens) / token_count) if token_count else 0.0
    symbol_ratio = (sum(1 for c in text if not c.isalnum() and not c.isspace()) / total_chars) if total_chars else 0.0
    alpha_ratio = (sum(1 for c in text if c.isalpha()) / total_chars) if total_chars else 0.0

    # Composite: weighted average of sub-scores (all 0-1 after clamping)
    tok_score = min(token_count / 100, 1.0)
    alpha_score = min(alpha_ratio / 0.5, 1.0)
    sym_penalty = max(0.0, 1.0 - symbol_ratio / 0.3)
    score = round((tok_score + alpha_score + sym_penalty) / 3, 4)

    return QualityScore(
        token_count=token_count,
        avg_word_length=round(avg_word_length, 3),
        symbol_ratio=round(symbol_ratio, 4),
        alpha_ratio=round(alpha_ratio, 4),
        score=score,
    )


def _gate(
    qs: QualityScore,
    min_tok: int,
    max_tok: int,
    min_avg: float,
    max_sym: float,
    min_alpha: float,
) -> str | None:
    """Return a human-readable reason string if the document fails a gate, else None."""
    if qs.token_count < min_tok:
        return f"token_count={qs.token_count} < min={min_tok}"
    if qs.token_count > max_tok:
        return f"token_count={qs.token_count} > max={max_tok}"
    if qs.avg_word_length < min_avg:
        return f"avg_word_length={qs.avg_word_length} < min={min_avg}"
    if qs.symbol_ratio > max_sym:
        return f"symbol_ratio={qs.symbol_ratio} > max={max_sym}"
    if qs.alpha_ratio < min_alpha:
        return f"alpha_ratio={qs.alpha_ratio} < min={min_alpha}"
    return None


def _reject(doc: Document, detail: str) -> None:
    object.__setattr__(doc, "accepted", False)
    object.__setattr__(doc, "rejection_reason", RejectionReason.LOW_QUALITY)
    object.__setattr__(doc, "rejection_detail", detail)
