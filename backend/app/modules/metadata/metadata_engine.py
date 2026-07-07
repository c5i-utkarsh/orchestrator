"""
Layer 5 · Metadata Intelligence Engine.

WHY IT EXISTS
    Raw extracted text + naive chunks carry no context about *what kind* of document
    this is, what language it is in, how it is structured, or how trustworthy its
    provenance is. Without that context every downstream layer treats a scanned-OCR
    invoice the same as a clean policy PDF, which inflates hallucination risk.

WHAT IT PRODUCES
    A per-file metadata record (`{file_id}_metadata.json`) capturing:
      - structural metadata  : doc type, section/heading structure, table presence
      - statistical metadata : token/length stats, chunk distribution
      - linguistic metadata  : detected language + confidence
      - provenance metadata  : source fingerprint, adapter, extraction reliability hint

WHY ITS ORDERING MATTERS
    It runs AFTER chunking (it needs the segmented structure) but BEFORE entity
    extraction, EDA, validation and ontology — every one of those layers consumes
    this context to behave document-aware rather than blind.

DOWNSTREAM DEPENDENCY IT ENABLES
    - Entity extraction can weight structured vs. prose regions.
    - EDA reports document composition.
    - ML Validation uses extraction_reliability_hint as a trust prior.
    - Ontology governance scopes vocabulary by detected doc type / language.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from typing import Any, Dict, List


def _detect_language(text: str) -> Dict[str, Any]:
    """Reuse the same langdetect path as data_curation.quality_scorer."""
    sample = (text or "")[:1000]
    if not sample.strip():
        return {"language": "unknown", "confidence": 0.0}
    try:
        from langdetect import detect_langs  # type: ignore
        ranked = detect_langs(sample)
        if ranked:
            top = ranked[0]
            return {"language": str(top.lang), "confidence": round(float(top.prob), 4)}
    except Exception:
        pass
    return {"language": "unknown", "confidence": 0.0}


def _infer_doc_type(ext: str, corpus: Dict[str, Any]) -> str:
    """Heuristic document-type inference from extension + extracted shape."""
    ext = (ext or "").lower().lstrip(".")
    table_rows = corpus.get("table_rows") or []
    text_blocks = corpus.get("text_blocks") or []
    if ext in {"csv", "xlsx", "xls"} or (table_rows and not text_blocks):
        return "tabular"
    if ext in {"json", "jsonl"}:
        return "structured"
    if ext == "pdf":
        return "document_pdf"
    if ext == "docx":
        return "document_word"
    if ext in {"txt", "md"}:
        return "freetext"
    return "unknown"


_HEADING_RE = re.compile(r"^(#{1,6}\s+.+|[A-Z][A-Z0-9 \-]{4,}|\d+(\.\d+)*\s+[A-Z].+)$")


def _structure_profile(text: str, text_blocks: List[Any]) -> Dict[str, Any]:
    """Detect heading/section structure to gauge how organised the source is."""
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    headings = [ln for ln in lines if len(ln) < 120 and _HEADING_RE.match(ln)]
    return {
        "line_count": len(lines),
        "heading_count": len(headings),
        "sample_headings": headings[:10],
        "block_count": len(text_blocks or []),
        "is_structured": len(headings) >= 3,
    }


def _extraction_reliability_hint(text: str, doc_type: str) -> float:
    """
    Cheap proxy for how clean the extraction is (0-1). High special-char ratio or
    near-empty text signals OCR/parsing damage and lowers the trust prior fed to
    Layer 9 (ML Validation).
    """
    if not text:
        return 0.0
    special = len(re.findall(r"[^\w\s.,!?;:()\-'\"]", text))
    special_ratio = special / max(len(text), 1)
    base = 1.0 - min(1.0, special_ratio / 0.25)
    if doc_type in {"tabular", "structured"}:
        base = max(base, 0.6)  # structured sources parse reliably
    return round(max(0.0, min(1.0, base)), 4)


def extract_metadata(
    file_id: str,
    ext: str,
    corpus: Dict[str, Any],
    chunks: List[Dict[str, Any]],
    corpus_dir: str = "corpus_store",
) -> Dict[str, Any]:
    """Build and persist the metadata-intelligence record for one source file."""
    text = corpus.get("plain_text", "") or ""
    words = text.split()
    word_counts = [int(c.get("word_count", 0) or 0) for c in (chunks or [])]
    fingerprint = hashlib.sha1(text.encode("utf-8", "ignore")).hexdigest()[:16]

    doc_type = _infer_doc_type(ext, corpus)
    metadata = {
        "file_id": file_id,
        "ext": (ext or "").lower().lstrip("."),
        "doc_type": doc_type,
        "source_type": corpus.get("source_type", "unknown"),
        "adapter": corpus.get("adapter", "raw"),
        "source_fingerprint": fingerprint,
        "language": _detect_language(text),
        "structure": _structure_profile(text, corpus.get("text_blocks") or []),
        "statistics": {
            "char_count": len(text),
            "word_count": len(words),
            "chunk_count": len(chunks or []),
            "avg_chunk_words": round(sum(word_counts) / max(1, len(word_counts)), 2),
            "table_row_count": len(corpus.get("table_rows") or []),
        },
        "extraction_reliability_hint": _extraction_reliability_hint(text, doc_type),
        "raw_metadata": corpus.get("metadata", {}) or {},
    }

    try:
        processed_dir = os.path.join(corpus_dir, "processed")
        os.makedirs(processed_dir, exist_ok=True)
        with open(os.path.join(processed_dir, f"{file_id}_metadata.json"), "w", encoding="utf-8") as f:
            json.dump(metadata, f)
    except Exception:
        pass

    return metadata
