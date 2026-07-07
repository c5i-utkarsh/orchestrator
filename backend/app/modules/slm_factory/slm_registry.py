"""
SLM Registry — PostgreSQL + pgvector table operations.
Stores all built domain SLMs with their embedding centroids for cosine search.
"""
import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import numpy as np
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings

settings = get_settings()


@dataclass
class SLMRecord:
    model_id: str
    domain_label: str
    domain_embedding: list[float]
    coverage_topics: list[str]
    training_corpus_hash: str
    base_model: str
    adapter_type: str
    val_loss: float | None = None
    hallucination_rate: float | None = None
    task_completion_rate: float | None = None
    model_path: str = ""
    ollama_model_name: str | None = None
    vram_required_gb: float | None = None
    build_trigger_query: str | None = None
    build_trigger_scores: dict = field(default_factory=dict)
    query_count: int = 0
    retrain_needed: bool = False
    parent_model_id: str | None = None
    created_at: datetime | None = None


class SLMRegistry:
    def __init__(self, db: AsyncSession):
        self._db = db

    async def register(self, record: SLMRecord) -> None:
        # Normalise embedding to exactly 768 dimensions (the DB column size).
        # Fallback embedders may produce 0-dim or 1536-dim vectors.
        TARGET_DIM = 768
        raw_emb = list(record.domain_embedding) if record.domain_embedding else []
        if len(raw_emb) > TARGET_DIM:
            raw_emb = raw_emb[:TARGET_DIM]          # truncate
        elif len(raw_emb) < TARGET_DIM:
            raw_emb = raw_emb + [0.0] * (TARGET_DIM - len(raw_emb))  # pad
        embedding_str = "[" + ",".join(str(v) for v in raw_emb) + "]"
        await self._db.execute(text("""
            INSERT INTO slm_registry (
                model_id, domain_label, domain_embedding, coverage_topics,
                training_corpus_hash, base_model, adapter_type, val_loss,
                hallucination_rate, task_completion_rate, model_path,
                ollama_model_name, vram_required_gb, build_trigger_query,
                build_trigger_scores, query_count, retrain_needed, parent_model_id
            ) VALUES (
                :model_id, :domain_label, (:domain_embedding)::vector, :coverage_topics,
                :training_corpus_hash, :base_model, :adapter_type, :val_loss,
                :hallucination_rate, :task_completion_rate, :model_path,
                :ollama_model_name, :vram_required_gb, :build_trigger_query,
                (:build_trigger_scores)::jsonb, :query_count, :retrain_needed, :parent_model_id
            )
            ON CONFLICT (model_id) DO UPDATE SET
                domain_embedding = EXCLUDED.domain_embedding,
                coverage_topics = EXCLUDED.coverage_topics,
                training_corpus_hash = EXCLUDED.training_corpus_hash,
                val_loss = EXCLUDED.val_loss,
                hallucination_rate = EXCLUDED.hallucination_rate,
                task_completion_rate = EXCLUDED.task_completion_rate,
                model_path = EXCLUDED.model_path,
                ollama_model_name = EXCLUDED.ollama_model_name,
                retrain_needed = EXCLUDED.retrain_needed
        """), {
            "model_id": record.model_id,
            "domain_label": record.domain_label,
            "domain_embedding": embedding_str,
            "coverage_topics": record.coverage_topics,
            "training_corpus_hash": record.training_corpus_hash,
            "base_model": record.base_model,
            "adapter_type": record.adapter_type,
            "val_loss": record.val_loss,
            "hallucination_rate": record.hallucination_rate,
            "task_completion_rate": record.task_completion_rate,
            "model_path": record.model_path,
            "ollama_model_name": record.ollama_model_name,
            "vram_required_gb": record.vram_required_gb,
            "build_trigger_query": record.build_trigger_query,
            "build_trigger_scores": json.dumps(record.build_trigger_scores),
            "query_count": record.query_count,
            "retrain_needed": record.retrain_needed,
            "parent_model_id": record.parent_model_id,
        })
        await self._db.commit()

    async def find_best_match(
        self,
        query_embedding: list[float],
        domain_label: str | None = None,
    ) -> dict | None:
        """Find the SLM with highest cosine similarity to the query embedding.

        Domain isolation strategy:
        1. If *domain_label* is provided, first search within that domain.
           A same-domain SLM with composite ≥ MIN_DOMAIN_SIMILARITY wins over
           any cross-domain SLM regardless of vector distance.
        2. If no same-domain SLM is found (or domain_label is None), fall back
           to the global best-vector-match across all registered SLMs.
        This prevents a query about 'technova-e2e' from routing to
        'it_industry_v10' simply because their embeddings happen to be closer.
        """
        MIN_DOMAIN_SIMILARITY = 0.25  # low bar — any domain match preferred
        embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"
        import math as _math

        def _normalise(row: dict) -> dict:
            sim = row.get("similarity")
            if sim is None or (isinstance(sim, float) and (_math.isnan(sim) or sim == 0.0)):
                row["similarity"] = 1.0
            return row

        try:
            # ── Step 1: same-domain search (when domain_label provided) ──────
            if domain_label:
                result = await self._db.execute(text("""
                    SELECT model_id, domain_label, coverage_topics, ollama_model_name,
                           task_completion_rate, hallucination_rate, last_used_at,
                           1 - (domain_embedding <=> (:emb)::vector) AS similarity
                    FROM slm_registry
                    WHERE domain_embedding IS NOT NULL
                      AND domain_label = :domain
                    ORDER BY domain_embedding <=> (:emb)::vector
                    LIMIT 1
                """), {"emb": embedding_str, "domain": domain_label})
                same_domain_rows = result.mappings().all()
                if same_domain_rows:
                    best = _normalise(dict(same_domain_rows[0]))
                    if float(best.get("similarity", 0)) >= MIN_DOMAIN_SIMILARITY:
                        best["top_matches"] = [best]
                        return best

            # ── Step 2: global best-vector-match ──────────────────────────────
            result = await self._db.execute(text("""
                SELECT model_id, domain_label, coverage_topics, ollama_model_name,
                       task_completion_rate, hallucination_rate, last_used_at,
                       1 - (domain_embedding <=> (:emb)::vector) AS similarity
                FROM slm_registry
                WHERE domain_embedding IS NOT NULL
                ORDER BY domain_embedding <=> (:emb)::vector
                LIMIT 3
            """), {"emb": embedding_str})
            rows = result.mappings().all()
            if not rows:
                return None
            best = _normalise(dict(rows[0]))
            best["top_matches"] = [dict(r) for r in rows]
            return best

        except Exception as exc:
            # Dimension mismatch (stored embeddings use a different model/size).
            # Clear the stale embeddings so they don't keep blocking, then fall
            # back to recency-based selection.
            if "different vector dimensions" in str(exc) or "DataError" in type(exc).__name__:
                try:
                    await self._db.execute(text(
                        "UPDATE slm_registry SET domain_embedding = NULL"
                    ))
                    await self._db.commit()
                except Exception:
                    pass
            # Fall back: return the most recently used SLM without vector search
            try:
                domain_filter = "AND domain_label = :domain" if domain_label else ""
                params: dict = {}
                if domain_label:
                    params["domain"] = domain_label
                fb = await self._db.execute(text(f"""
                    SELECT model_id, domain_label, coverage_topics, ollama_model_name,
                           task_completion_rate, hallucination_rate, last_used_at
                    FROM slm_registry
                    {domain_filter}
                    ORDER BY last_used_at DESC NULLS LAST
                    LIMIT 3
                """), params)
                rows = fb.mappings().all()
                if not rows:
                    return None
                best = dict(rows[0])
                best["similarity"] = 0.5  # neutral score so pipeline continues
                best["top_matches"] = [dict(r) for r in rows]
                return best
            except Exception:
                return None


    async def find_by_corpus_hash(self, corpus_hash: str) -> dict | None:
        """Return the most recent SLM built for this corpus, or None."""
        if not corpus_hash:
            return None
        result = await self._db.execute(text("""
            SELECT model_id, domain_label, coverage_topics, base_model,
                   ollama_model_name, model_path, val_loss, hallucination_rate,
                   task_completion_rate, training_corpus_hash, created_at
            FROM slm_registry
            WHERE training_corpus_hash = :hash
            ORDER BY created_at DESC
            LIMIT 1
        """), {"hash": corpus_hash})
        row = result.mappings().first()
        return dict(row) if row else None

    async def list_all(self) -> list[dict]:
        result = await self._db.execute(text("""
            SELECT model_id, domain_label, coverage_topics, base_model,
                   adapter_type, val_loss, hallucination_rate, task_completion_rate,
                   ollama_model_name, vram_required_gb, query_count, retrain_needed,
                   created_at, last_used_at
            FROM slm_registry
            ORDER BY created_at DESC
        """))
        return [dict(r) for r in result.mappings().all()]

    async def get(self, model_id: str) -> dict | None:
        result = await self._db.execute(
            text("SELECT * FROM slm_registry WHERE model_id = :id"),
            {"id": model_id}
        )
        row = result.mappings().first()
        return dict(row) if row else None

    async def increment_query_count(self, model_id: str) -> None:
        await self._db.execute(text("""
            UPDATE slm_registry
            SET query_count = query_count + 1, last_used_at = NOW()
            WHERE model_id = :id
        """), {"id": model_id})
        await self._db.commit()

    async def flag_retrain(self, model_id: str) -> None:
        await self._db.execute(text("""
            UPDATE slm_registry SET retrain_needed = TRUE WHERE model_id = :id
        """), {"id": model_id})
        await self._db.commit()
