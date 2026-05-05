import json
import hashlib
from pathlib import Path
from dataclasses import dataclass

from datasketch import MinHash, MinHashLSH

from app.config import get_settings

settings = get_settings()


@dataclass
class DedupResult:
    original_count: int
    kept_count: int
    removed_count: int
    removal_rate: float
    cluster_map: dict[str, list[str]]  # doc_id -> list of near-duplicate ids


class Deduplicator:
    """
    MinHash LSH deduplication.
    threshold=0.8, num_perm=128, word 3-gram shingles.
    Post-filters with exact Jaccard for precision.
    """

    def __init__(
        self,
        threshold: float = 0.8,
        num_perm: int = 128,
        ngram_size: int = 3,
    ):
        self.threshold = threshold
        self.num_perm = num_perm
        self.ngram_size = ngram_size

    def _shingles(self, text: str) -> set[str]:
        words = text.lower().split()
        if len(words) < self.ngram_size:
            return set(words)
        return {
            " ".join(words[i: i + self.ngram_size])
            for i in range(len(words) - self.ngram_size + 1)
        }

    def _make_minhash(self, text: str) -> MinHash:
        m = MinHash(num_perm=self.num_perm)
        for shingle in self._shingles(text):
            m.update(shingle.encode("utf8"))
        return m

    def _exact_jaccard(self, a: set, b: set) -> float:
        if not a or not b:
            return 0.0
        return len(a & b) / len(a | b)

    def deduplicate(self, documents: list[dict]) -> tuple[list[dict], DedupResult]:
        """
        documents: list of {"id": str, "text": str, ...}
        Returns: (kept_documents, DedupResult)
        """
        if not documents:
            return [], DedupResult(0, 0, 0, 0.0, {})

        lsh = MinHashLSH(threshold=self.threshold, num_perm=self.num_perm)
        minhashes = {}
        shingle_sets = {}

        # Build index
        for doc in documents:
            doc_id = doc["id"]
            text = doc.get("text", "")
            m = self._make_minhash(text)
            shingle_sets[doc_id] = self._shingles(text)
            minhashes[doc_id] = m
            try:
                lsh.insert(doc_id, m)
            except ValueError:
                pass  # duplicate key — skip

        # Find clusters
        cluster_map: dict[str, list[str]] = {}
        removed: set[str] = set()

        for doc in documents:
            doc_id = doc["id"]
            if doc_id in removed:
                continue
            candidates = lsh.query(minhashes[doc_id])
            near_dups = []
            for cand_id in candidates:
                if cand_id == doc_id or cand_id in removed:
                    continue
                # Post-filter with exact Jaccard
                j = self._exact_jaccard(shingle_sets[doc_id], shingle_sets[cand_id])
                if j >= self.threshold:
                    near_dups.append(cand_id)
                    removed.add(cand_id)

            if near_dups:
                cluster_map[doc_id] = near_dups

        kept = [d for d in documents if d["id"] not in removed]
        n_orig = len(documents)
        n_kept = len(kept)

        return kept, DedupResult(
            original_count=n_orig,
            kept_count=n_kept,
            removed_count=n_orig - n_kept,
            removal_rate=round((n_orig - n_kept) / max(n_orig, 1), 3),
            cluster_map=cluster_map,
        )
