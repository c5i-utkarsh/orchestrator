"""TF-IDF search over the curated corpus for Q&A retrieval."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

from .models import Document

logger = logging.getLogger(__name__)


@dataclass
class SearchResult:
    doc_id: str
    source_path: str
    chunk: str
    score: float
    chunk_index: int


class CorpusSearchEngine:
    """TF-IDF search engine built from accepted, chunked documents.

    Usage:
        engine = CorpusSearchEngine.build(docs)
        results = engine.search("what is a knowledge graph?", top_k=5)
    """

    def __init__(
        self,
        vectorizer: TfidfVectorizer,
        matrix,
        index: list[tuple[str, str, str, int]],  # (doc_id, source, chunk_text, chunk_idx)
    ) -> None:
        self._vectorizer = vectorizer
        self._matrix = matrix
        self._index = index

    @classmethod
    def build(cls, docs: list[Document]) -> "CorpusSearchEngine":
        """Build the TF-IDF index from accepted documents.

        Args:
            docs: All pipeline documents (only accepted, chunked ones are indexed).

        Returns:
            Initialised CorpusSearchEngine ready for queries.
        """
        entries: list[tuple[str, str, str, int]] = []
        texts: list[str] = []

        for doc in docs:
            if not doc.accepted:
                continue
            chunks = doc.chunks if doc.chunks else [doc.clean_text]
            for idx, chunk in enumerate(chunks):
                entries.append((doc.doc_id, doc.source_path, chunk, idx))
                texts.append(chunk)

        if not texts:
            raise ValueError("No accepted documents to index — run the pipeline first.")

        vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            max_features=10_000,
            sublinear_tf=True,
            stop_words="english",
        )
        matrix = vectorizer.fit_transform(texts)
        logger.info("Search index built — %d chunks from %d documents", len(texts),
                    sum(1 for d in docs if d.accepted))
        return cls(vectorizer, matrix, entries)

    def search(self, query: str, top_k: int = 5, min_score: float = 0.05) -> list[SearchResult]:
        """Find the most relevant chunks for a natural-language query.

        Args:
            query: Free-text question or keyword query.
            top_k: Maximum number of results to return.
            min_score: Minimum cosine similarity to include a result.

        Returns:
            List of SearchResult objects sorted by descending relevance score.
        """
        if not query.strip():
            return []

        q_vec = self._vectorizer.transform([query])
        scores = cosine_similarity(q_vec, self._matrix).flatten()
        top_indices = np.argsort(scores)[::-1][:top_k]

        results: list[SearchResult] = []
        for idx in top_indices:
            score = float(scores[idx])
            if score < min_score:
                break
            doc_id, source, chunk, chunk_idx = self._index[idx]
            results.append(SearchResult(
                doc_id=doc_id,
                source_path=source,
                chunk=chunk,
                score=round(score, 4),
                chunk_index=chunk_idx,
            ))
        return results
