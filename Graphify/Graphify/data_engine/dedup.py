"""Exact and near-duplicate detection — Jaro-Winkler or MinHash LSH."""

from __future__ import annotations

import logging
from typing import Sequence

from .models import Document, RejectionReason

logger = logging.getLogger(__name__)


def deduplicate(
    docs: list[Document],
    *,
    exact: bool = True,
    near_duplicate: bool = True,
    method: str = "minhash",
    similarity_threshold: float = 0.85,
    minhash_num_perm: int = 128,
) -> list[Document]:
    """Mark duplicate documents in-place and return the modified list.

    Exact dedup uses SHA-256 content hash.
    Near-dup uses MinHash LSH (fast, scales to 100k+ docs) or Jaro-Winkler
    as fallback when datasketch is not installed.

    Args:
        docs: Documents with content_hash and clean_text populated.
        exact: Enable SHA-256 exact deduplication.
        near_duplicate: Enable near-duplicate detection.
        method: "minhash" (preferred) or "jaro" (fallback).
        similarity_threshold: Similarity above which a doc is a near-dup.
        minhash_num_perm: Number of permutations for MinHash (higher = more accurate).

    Returns:
        Same list with rejection fields populated on duplicates.
    """
    active = [d for d in docs if d.accepted]

    if exact:
        active = _exact_dedup(active)

    if near_duplicate and active:
        if method == "minhash" and _minhash_available():
            active = _minhash_dedup(active, similarity_threshold, minhash_num_perm)
        else:
            if method == "minhash":
                logger.warning("datasketch not installed — falling back to Jaro-Winkler near-dup")
            active = _jaro_dedup(active, similarity_threshold)

    logger.info(
        "Dedup complete — kept %d / rejected %d",
        sum(1 for d in docs if d.accepted),
        sum(1 for d in docs if not d.accepted),
    )
    return docs


# ── Exact ──────────────────────────────────────────────────────────────────────

def _exact_dedup(docs: list[Document]) -> list[Document]:
    seen: dict[str, str] = {}
    surviving: list[Document] = []
    for doc in docs:
        if doc.content_hash in seen:
            _reject(doc, RejectionReason.DUPLICATE, f"Exact duplicate of {seen[doc.content_hash]}")
        else:
            seen[doc.content_hash] = doc.doc_id
            surviving.append(doc)
    logger.debug("Exact dedup: %d removed", len(docs) - len(surviving))
    return surviving


# ── MinHash LSH ────────────────────────────────────────────────────────────────

def _minhash_available() -> bool:
    try:
        import datasketch  # noqa: F401
        return True
    except ImportError:
        return False


def _minhash_dedup(
    docs: list[Document],
    threshold: float,
    num_perm: int,
) -> list[Document]:
    from datasketch import MinHash, MinHashLSH

    lsh = MinHashLSH(threshold=threshold, num_perm=num_perm)
    surviving: list[Document] = []

    for doc in docs:
        mh = _build_minhash(doc.clean_text, num_perm)
        candidates = lsh.query(mh)
        if candidates:
            _reject(
                doc,
                RejectionReason.NEAR_DUPLICATE,
                f"Near-duplicate of {candidates[0]} (MinHash LSH, threshold={threshold})",
            )
        else:
            lsh.insert(doc.doc_id, mh)
            surviving.append(doc)

    logger.debug("MinHash near-dup: %d removed", len(docs) - len(surviving))
    return surviving


def _build_minhash(text: str, num_perm: int):
    from datasketch import MinHash
    mh = MinHash(num_perm=num_perm)
    for word in text.lower().split():
        mh.update(word.encode("utf-8"))
    return mh


# ── Jaro-Winkler fallback ──────────────────────────────────────────────────────

def _jaro_dedup(docs: list[Document], threshold: float) -> list[Document]:
    from rapidfuzz.distance import JaroWinkler
    surviving: list[Document] = []
    for doc in docs:
        is_dup = False
        for anchor in surviving:
            sim = JaroWinkler.normalized_similarity(doc.clean_text[:2000], anchor.clean_text[:2000])
            if sim >= threshold:
                _reject(
                    doc,
                    RejectionReason.NEAR_DUPLICATE,
                    f"Near-duplicate of {anchor.doc_id} (Jaro-Winkler sim={sim:.3f})",
                )
                is_dup = True
                break
        if not is_dup:
            surviving.append(doc)
    logger.debug("Jaro-Winkler near-dup: %d removed", len(docs) - len(surviving))
    return surviving


def _reject(doc: Document, reason: RejectionReason, detail: str) -> None:
    object.__setattr__(doc, "accepted", False)
    object.__setattr__(doc, "rejection_reason", reason)
    object.__setattr__(doc, "rejection_detail", detail)
