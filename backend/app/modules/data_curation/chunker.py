"""
Text chunker — ported from AI_Orchestrator/backend/processing.py.
Splits cleaned plain text into overlapping word-windows with validation.
"""
import re
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)


def clean_text(text: str) -> str:
    """Normalize whitespace and strip control characters."""
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" {2,}", " ", text)
    text = re.sub(r"[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]", "", text)
    return text.strip()


def chunk_text(text: str, size: int = 400, overlap: int = 60) -> List[Dict]:
    """
    Split *text* into overlapping word-window chunks.

    Returns a list of dicts:
        {"idx": int, "text": str}
    """
    words = text.split()
    chunks: List[Dict] = []
    start = 0
    idx = 0
    while start < len(words):
        end = min(start + size, len(words))
        chunks.append({"idx": idx, "text": " ".join(words[start:end])})
        start += size - overlap
        idx += 1
    return chunks


def validate_chunking(original_text: str, chunks: List[Dict]) -> Dict:
    """
    Basic sanity checks on a chunked result.
    Returns a report dict that can be stored in the pipeline progress JSON.
    """
    if not chunks:
        return {"ok": False, "reason": "no chunks produced"}

    total_chunk_words = sum(len(c["text"].split()) for c in chunks)
    original_words = len(original_text.split())
    coverage = total_chunk_words / max(original_words, 1)

    return {
        "ok": True,
        "chunk_count": len(chunks),
        "original_words": original_words,
        "total_chunk_words": total_chunk_words,
        "coverage_ratio": round(coverage, 3),
        "avg_chunk_words": round(total_chunk_words / len(chunks), 1),
    }
