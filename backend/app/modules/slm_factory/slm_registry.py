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
        embedding_str = "[" + ",".join(str(v) for v in record.domain_embedding) + "]"
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

    async def find_best_match(self, query_embedding: list[float]) -> dict | None:
        """Find the SLM with highest cosine similarity to the query embedding."""
        embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"
        result = await self._db.execute(text("""
            SELECT model_id, domain_label, coverage_topics, ollama_model_name,
                   task_completion_rate, hallucination_rate,
                   1 - (domain_embedding <=> (:emb)::vector) AS similarity
            FROM slm_registry
            ORDER BY domain_embedding <=> (:emb)::vector
            LIMIT 3
        """), {"emb": embedding_str})
        rows = result.mappings().all()
        if not rows:
            return None
        best = dict(rows[0])
        best["top_matches"] = [dict(r) for r in rows]
        return best

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
