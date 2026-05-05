"""
Contamination checker: 13-gram overlap against common NLP eval sets.
Flags documents that might contaminate model evaluation.
"""
import re
from dataclasses import dataclass
from pathlib import Path


# A small sample of known eval set 13-grams for demonstration.
# In production, load from downloaded eval datasets.
EVAL_NGRAMS: set[str] = set()


@dataclass
class ContaminationResult:
    doc_id: str
    is_contaminated: bool
    overlap_count: int
    matched_ngrams: list[str]


def _get_ngrams(text: str, n: int = 13) -> set[str]:
    words = re.sub(r"[^\w\s]", "", text.lower()).split()
    return {
        " ".join(words[i: i + n])
        for i in range(len(words) - n + 1)
    }


class ContaminationChecker:
    def __init__(self, ngram_size: int = 13):
        self.ngram_size = ngram_size
        self._eval_ngrams = EVAL_NGRAMS  # extend with downloaded eval sets

    def load_eval_sets(self, eval_texts: list[str]):
        """Load evaluation set texts to build the n-gram index."""
        for text in eval_texts:
            self._eval_ngrams.update(_get_ngrams(text, self.ngram_size))

    def check(self, doc: dict) -> ContaminationResult:
        text = doc.get("text", "")
        doc_ngrams = _get_ngrams(text, self.ngram_size)
        matches = list(doc_ngrams & self._eval_ngrams)
        return ContaminationResult(
            doc_id=doc.get("id", ""),
            is_contaminated=len(matches) >= 3,
            overlap_count=len(matches),
            matched_ngrams=matches[:5],
        )

    def check_batch(self, documents: list[dict]) -> list[ContaminationResult]:
        return [self.check(doc) for doc in documents]
