"""Paragraph-level document chunker for search and retrieval."""

from __future__ import annotations

import logging

from .models import Document
from .text_utils import tokenize

logger = logging.getLogger(__name__)


def chunk_documents(
    docs: list[Document],
    chunk_size: int = 150,
    overlap: int = 20,
) -> list[Document]:
    """Split each accepted document's clean_text into overlapping token chunks.

    Chunks are stored in doc.chunks and used downstream by the search module.

    Args:
        docs: All pipeline documents.
        chunk_size: Target number of tokens per chunk.
        overlap: Number of tokens to repeat at the start of each new chunk.

    Returns:
        Same list with chunks populated on accepted documents.
    """
    for doc in docs:
        if not doc.accepted or not doc.clean_text:
            continue
        chunks = _split(doc.clean_text, chunk_size, overlap)
        object.__setattr__(doc, "chunks", chunks)

    total_chunks = sum(len(d.chunks) for d in docs if d.accepted)
    logger.info("Chunking complete — %d total chunks across %d accepted docs",
                total_chunks, sum(1 for d in docs if d.accepted))
    return docs


def _split(text: str, chunk_size: int, overlap: int) -> list[str]:
    """Split text into overlapping token windows, reconstruct as strings."""
    tokens = tokenize(text)
    if len(tokens) <= chunk_size:
        return [text]

    chunks: list[str] = []
    step = max(1, chunk_size - overlap)
    for start in range(0, len(tokens), step):
        window = tokens[start: start + chunk_size]
        if len(window) < 10:  # skip tiny tail chunks
            break
        chunks.append(" ".join(window))
    return chunks
