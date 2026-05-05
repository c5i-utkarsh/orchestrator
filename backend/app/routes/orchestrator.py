"""
POST /api/v1/orchestrator/ask — SSE streaming endpoint.
Holds query open while SLM builds if needed (no fallback).
"""
import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.adapters.registry import get_adapter_registry
from app.modules.orchestrator.orchestrator import Orchestrator
from app.modules.slm_factory.slm_registry import SLMRegistry
from app.modules.slm_factory.slm_store import SLMStore
from app.config import get_settings

settings = get_settings()
router = APIRouter(prefix="/orchestrator", tags=["orchestrator"])


class AskRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=4096)
    session_id: str | None = None
    job_id: str | None = None          # if provided, load graph context from ingest job
    graph_context: str = ""
    wiki_articles: list[dict] = Field(default_factory=list)
    domain_label: str = "general"
    coverage_topics: list[str] = Field(default_factory=list)
    corpus_hash: str = ""


async def _get_embedding(text: str) -> list[float]:
    """Use nomic-embed-text via Ollama if available, else zero vector."""
    try:
        registry = get_adapter_registry()
        adapter = registry.get_adapter("ollama")
        if adapter:
            result = await adapter._client.embeddings(
                model="nomic-embed-text",
                prompt=text,
            )
            return result.get("embedding", [0.0] * settings.embedding_dim)
    except Exception:
        pass
    return [0.0] * settings.embedding_dim


@router.post("/ask")
async def ask(request: AskRequest, db: AsyncSession = Depends(get_db)):
    import json as _json
    from pathlib import Path
    from sqlalchemy import text

    registry = get_adapter_registry()
    slm_registry = SLMRegistry(db)
    slm_store = SLMStore(settings.slm_store_path)

    # Load graph context + wiki articles from ingest job if job_id provided
    graph_context = request.graph_context
    wiki_articles = request.wiki_articles
    domain_label = request.domain_label
    coverage_topics = request.coverage_topics
    corpus_hash = request.corpus_hash

    if request.job_id:
        try:
            row = (await db.execute(
                text("SELECT graph_path, corpus_path, domain_label, metadata FROM ingest_jobs WHERE job_id = :id"),
                {"id": request.job_id},
            )).mappings().first()
            if row:
                domain_label = row["domain_label"] or domain_label
                # Load graph context from graph.json
                graph_path = row["graph_path"]
                if graph_path and Path(graph_path).exists():
                    g_data = _json.loads(Path(graph_path).read_text(encoding="utf-8"))
                    nodes = g_data.get("nodes", [])
                    edges = g_data.get("edges", [])
                    graph_context = (
                        f"Knowledge Graph: {len(nodes)} entities, {len(edges)} relationships.\n"
                        + "\n".join(f"- {n.get('label', n.get('id', ''))} ({n.get('type', '')})" for n in nodes[:60])
                    )
                    coverage_topics = list({n.get("type", "") for n in nodes if n.get("type")})[:10]
                # Load wiki articles from graphify-out/wiki/
                meta = row["metadata"] or {}
                if isinstance(meta, str):
                    meta = _json.loads(meta)
                corpus_dir = meta.get("corpus_dir") or row.get("corpus_path") or ""
                if corpus_dir:
                    wiki_dir = Path(corpus_dir) / "graphify-out" / "wiki"
                    if wiki_dir.exists():
                        for md in sorted(wiki_dir.glob("*.md"))[:30]:
                            wiki_articles.append({"title": md.stem, "content": md.read_text(encoding="utf-8", errors="replace")})
        except Exception:
            pass  # non-fatal — proceed without context

    available = await registry.list_all_models()
    available_names = [m.model_id for m in available]

    orchestrator = Orchestrator(
        adapter_registry=registry,
        slm_registry=slm_registry,
        slm_store=slm_store,
        embed_fn=_get_embedding,
    )

    async def event_stream():
        async for event in orchestrator.run(
            query=request.query,
            session_id=request.session_id or str(uuid.uuid4()),
            graph_context=graph_context,
            wiki_articles=wiki_articles,
            domain_label=domain_label,
            coverage_topics=coverage_topics,
            corpus_hash=corpus_hash,
            available_models=available_names,
        ):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
