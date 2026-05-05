"""
Difficulty Scorer for curriculum design.

Signals:
  - Type-token ratio (lexical diversity)
  - Average sentence length
  - Domain term density (TF-IDF based)
  - Text length rank
"""
import re
import math
from dataclasses import dataclass


@dataclass
class DifficultyScore:
    doc_id: str
    score: float        # 1-5 scale
    ttr: float
    avg_sentence_len: float
    domain_term_density: float
    length_rank: float


class DifficultyScorer:
    def score_batch(
        self,
        documents: list[dict],
        domain_terms: list[str] | None = None,
    ) -> list[DifficultyScore]:
        lengths = [len(d.get("text", "").split()) for d in documents]
        sorted_lengths = sorted(lengths)

        scores = []
        for i, doc in enumerate(documents):
            rank = sorted_lengths.index(lengths[i]) / max(len(sorted_lengths) - 1, 1)
            score = self._score_one(doc, rank, domain_terms or [])
            scores.append(score)
        return scores

    def _score_one(
        self,
        doc: dict,
        length_rank: float,
        domain_terms: list[str],
    ) -> DifficultyScore:
        text = doc.get("text", "")
        doc_id = doc.get("id", "")

        words = re.findall(r"\b\w+\b", text.lower())
        unique_words = set(words)
        ttr = len(unique_words) / max(len(words), 1)

        sentences = re.split(r"[.!?]+", text)
        sentences = [s.strip() for s in sentences if s.strip()]
        avg_sent_len = sum(len(s.split()) for s in sentences) / max(len(sentences), 1)

        if domain_terms:
            term_hits = sum(1 for t in domain_terms if t.lower() in text.lower())
            domain_density = min(term_hits / max(len(words) / 100, 1), 1.0)
        else:
            domain_density = 0.5

        # Combine signals into 1-5 scale
        raw = (
            ttr * 0.25 +
            min(avg_sent_len / 30, 1.0) * 0.30 +
            domain_density * 0.25 +
            length_rank * 0.20
        )
        score = 1 + raw * 4  # 1-5

        return DifficultyScore(
            doc_id=doc_id,
            score=round(score, 2),
            ttr=round(ttr, 3),
            avg_sentence_len=round(avg_sent_len, 1),
            domain_term_density=round(domain_density, 3),
            length_rank=round(length_rank, 3),
        )
