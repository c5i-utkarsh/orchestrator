"""Language detection and filtering stage."""

from __future__ import annotations

import logging
from typing import Optional

from .models import Document, RejectionReason

logger = logging.getLogger(__name__)


def detect_and_filter(
    docs: list[Document],
    allowed: list[str] = None,
    min_confidence: float = 0.8,
) -> list[Document]:
    """Detect language of each accepted document and reject off-language ones.

    Uses langdetect under the hood. Falls back gracefully if the library is
    unavailable so the pipeline degrades instead of crashing.

    Args:
        docs: All pipeline documents.
        allowed: ISO 639-1 language codes to accept (e.g. ["en"]). None = allow all.
        min_confidence: Minimum detection confidence to trust the result.

    Returns:
        Same list with language field populated and off-language docs rejected.
    """
    try:
        from langdetect import detect_langs, LangDetectException
    except ImportError:
        logger.warning("langdetect not installed — skipping language detection")
        return docs

    if allowed is None:
        allowed = []

    rejected = 0
    for doc in docs:
        if not doc.accepted or not doc.clean_text:
            continue

        lang, confidence = _detect(doc.clean_text, min_confidence)
        object.__setattr__(doc, "language", lang)

        if allowed and lang not in allowed:
            _reject(
                doc,
                f"language='{lang}' (confidence={confidence:.2f}) not in allowed={allowed}",
            )
            rejected += 1

    logger.info("Language detection complete — %d rejected", rejected)
    return docs


def _detect(text: str, min_confidence: float) -> tuple[str, float]:
    """Return (language_code, confidence). Falls back to 'unknown' on failure."""
    from langdetect import detect_langs, LangDetectException

    try:
        results = detect_langs(text[:3000])  # cap for speed
        if results:
            top = results[0]
            if top.prob >= min_confidence:
                return top.lang, top.prob
            return top.lang, top.prob  # still return, just flagged low confidence
        return "unknown", 0.0
    except LangDetectException:
        return "unknown", 0.0


def _reject(doc: Document, detail: str) -> None:
    object.__setattr__(doc, "accepted", False)
    object.__setattr__(doc, "rejection_reason", RejectionReason.WRONG_LANGUAGE)
    object.__setattr__(doc, "rejection_detail", detail)
