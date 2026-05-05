import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np


@dataclass
class ResolvedEntity:
    node_id: str
    label: str
    sources: list[str]          # ["corpus", "db"] — which sources contributed
    db_table: str | None
    corpus_doc_ids: list[str]
    confidence: float
    match_type: str             # "EXTRACTED" | "INFERRED" | "AMBIGUOUS"


class EntityResolver:
    """
    Bridges DB row stubs ↔ corpus mentions using embedding-based
    cross-source resolution. Threshold 0.72 for MATCH.
    """

    MATCH_THRESHOLD = 0.72

    def __init__(self, embedding_fn):
        """embedding_fn: async callable (text) -> list[float]"""
        self._embed = embedding_fn

    async def resolve(
        self,
        db_entities: list[dict],      # {id, text, table}
        corpus_entities: list[dict],  # {id, text, doc_id}
    ) -> list[ResolvedEntity]:
        if not db_entities or not corpus_entities:
            return []

        # Embed all entities
        db_texts = [e["text"] for e in db_entities]
        corpus_texts = [e["text"] for e in corpus_entities]

        db_embeddings = np.array([await self._embed(t) for t in db_texts])
        corpus_embeddings = np.array([await self._embed(t) for t in corpus_texts])

        # Normalize
        db_norms = np.linalg.norm(db_embeddings, axis=1, keepdims=True) + 1e-9
        corpus_norms = np.linalg.norm(corpus_embeddings, axis=1, keepdims=True) + 1e-9
        db_emb_norm = db_embeddings / db_norms
        corpus_emb_norm = corpus_embeddings / corpus_norms

        # Cosine similarity matrix: (n_db, n_corpus)
        sim_matrix = db_emb_norm @ corpus_emb_norm.T

        resolved = []
        matched_corpus = set()

        for db_idx, db_ent in enumerate(db_entities):
            similarities = sim_matrix[db_idx]
            best_corpus_idx = int(np.argmax(similarities))
            best_sim = float(similarities[best_corpus_idx])

            if best_sim >= self.MATCH_THRESHOLD:
                corpus_ent = corpus_entities[best_corpus_idx]
                match_type = "EXTRACTED" if best_sim >= 0.88 else "INFERRED"
                resolved.append(ResolvedEntity(
                    node_id=f"resolved_{db_ent['id']}",
                    label=db_ent.get("label", db_ent["text"][:50]),
                    sources=["db", "corpus"],
                    db_table=db_ent.get("table"),
                    corpus_doc_ids=[corpus_ent["doc_id"]],
                    confidence=best_sim,
                    match_type=match_type,
                ))
                matched_corpus.add(best_corpus_idx)
            else:
                # DB entity with no corpus match — keep as DB-only
                resolved.append(ResolvedEntity(
                    node_id=f"db_{db_ent['id']}",
                    label=db_ent.get("label", db_ent["text"][:50]),
                    sources=["db"],
                    db_table=db_ent.get("table"),
                    corpus_doc_ids=[],
                    confidence=best_sim,
                    match_type="AMBIGUOUS" if best_sim >= 0.50 else "EXTRACTED",
                ))

        return resolved
