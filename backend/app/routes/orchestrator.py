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


class ModelWeights(BaseModel):
    """User-configurable composite scoring weights. Must sum to 1.0 (enforced by normalisation)."""
    benchmark: float = Field(0.30, ge=0.0, le=1.0)
    availability: float = Field(0.20, ge=0.0, le=1.0)
    bandit: float = Field(0.20, ge=0.0, le=1.0)
    speed: float = Field(0.15, ge=0.0, le=1.0)
    ctx_fit: float = Field(0.10, ge=0.0, le=1.0)
    task_fit: float = Field(0.05, ge=0.0, le=1.0)

    def normalised(self) -> "ModelWeights":
        """Return a copy with weights re-normalised to sum to 1.0."""
        total = self.benchmark + self.availability + self.bandit + self.speed + self.ctx_fit + self.task_fit
        if total <= 0:
            return ModelWeights()
        f = 1.0 / total
        return ModelWeights(
            benchmark=self.benchmark * f,
            availability=self.availability * f,
            bandit=self.bandit * f,
            speed=self.speed * f,
            ctx_fit=self.ctx_fit * f,
            task_fit=self.task_fit * f,
        )


class AskRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=4096)
    session_id: str | None = None
    job_id: str | None = None          # if provided, load graph context from ingest job
    graph_context: str = ""
    wiki_articles: list[dict] = Field(default_factory=list)
    domain_label: str = "general"
    coverage_topics: list[str] = Field(default_factory=list)
    corpus_hash: str = ""
    system_prompt: str = ""           # optional user-defined persona / constraints
    model_overrides: dict | None = None  # optional {task_type: model_name} overrides from SLM Studio
    scoring_weights: ModelWeights = Field(default_factory=ModelWeights)  # user-tunable LLM scoring


async def _get_embedding(text: str) -> list[float]:
    """Use nomic-embed-text via Ollama if available, else zero vector."""
    try:
        registry = get_adapter_registry()
        adapter = registry.get_ollama()
        if adapter:
            r = await adapter._client.post(
                "/api/embeddings",
                json={"model": "nomic-embed-text", "prompt": text},
            )
            r.raise_for_status()
            return r.json().get("embedding", [0.0] * settings.embedding_dim)
    except Exception:
        pass
    return [0.0] * settings.embedding_dim


@router.post("/ask")
async def ask(request: AskRequest, db: AsyncSession = Depends(get_db)):
    import json as _json
    from pathlib import Path
    from sqlalchemy import text

    registry = get_adapter_registry()
    slm_store = SLMStore(settings.slm_store_path)

    # Use the request-scoped `db` ONLY for the synchronous setup queries
    # (graph/wiki loading). The streaming generator gets its OWN session because
    # FastAPI's Depends(get_db) closes the session when ask() returns — before
    # event_stream() finishes, causing "non-checked-in connection" errors and 500s.

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
                # Load graph context — check corpus_path/graph_path from DB
                graph_path = row["graph_path"]
                if graph_path and Path(graph_path).exists():
                    try:
                        g_data = _json.loads(Path(graph_path).read_text(encoding="utf-8"))
                        nodes = g_data.get("nodes", g_data.get("canonical_nodes", []))
                        edges = g_data.get("edges", g_data.get("canonical_edges", []))
                        graph_context = (
                            f"Knowledge Graph: {len(nodes)} entities, {len(edges)} relationships.\n"
                            + "\n".join(
                                f"- {n.get('label', n.get('canonical_id', n.get('id', '')))} "
                                f"({n.get('entity_type', n.get('type', ''))})"
                                for n in nodes[:60]
                            )
                        )
                        # Use entity labels (domain terms) for token-overlap coverage scoring
                        _LABEL_SKIP_TYPES = {"cardinal", "ordinal", "quantity", "date", "money", "percent", "value", "time"}
                        coverage_topics = [
                            n.get("label") or n.get("canonical_id") or ""
                            for n in nodes
                            if (n.get("label") or n.get("canonical_id"))
                            and (n.get("entity_type") or n.get("type", "")).lower() not in _LABEL_SKIP_TYPES
                        ][:20]
                    except Exception:
                        pass
                # Resolve corpus_dir: prefer corpus_path column, then metadata, then convention
                corpus_dir = row.get("corpus_path") or ""
                if not corpus_dir:
                    meta = row["metadata"] or {}
                    if isinstance(meta, str):
                        meta = _json.loads(meta)
                    corpus_dir = meta.get("corpus_dir") or ""
                # Production fallback: ingest_task may not write corpus_path back to DB.
                if not corpus_dir:
                    candidate = Path(settings.corpus_store_path) / request.job_id
                    if candidate.exists():
                        corpus_dir = str(candidate)
                # Also try to load graph from the standard location when graph_path is NULL
                if not graph_context and corpus_dir:
                    for _g_candidate in [
                        Path(corpus_dir) / "canonical_graph.json",
                        Path(corpus_dir) / "graphify-out" / "graph.json",
                    ]:
                        if _g_candidate.exists():
                            try:
                                g_data = _json.loads(_g_candidate.read_text(encoding="utf-8"))
                                nodes = g_data.get("nodes", g_data.get("canonical_nodes", []))
                                edges = g_data.get("edges", g_data.get("canonical_edges", []))
                                graph_context = (
                                    f"Knowledge Graph: {len(nodes)} entities, {len(edges)} relationships.\n"
                                    + "\n".join(
                                        f"- {n.get('label', n.get('canonical_id', n.get('id', '')))} "
                                        f"({n.get('entity_type', n.get('type', ''))})"
                                        for n in nodes[:60]
                                    )
                                )
                                # Use entity labels (domain terms) for token-overlap coverage scoring
                                _LABEL_SKIP_TYPES = {"cardinal", "ordinal", "quantity", "date", "money", "percent", "value", "time"}
                                coverage_topics = [
                                    n.get("label") or n.get("canonical_id") or ""
                                    for n in nodes
                                    if (n.get("label") or n.get("canonical_id"))
                                    and (n.get("entity_type") or n.get("type", "")).lower() not in _LABEL_SKIP_TYPES
                                ][:20]
                            except Exception:
                                pass
                            break
                if corpus_dir:
                    _SKIP_TYPES = {"CARDINAL", "ORDINAL", "QUANTITY", "DATE", "MONEY", "PERCENT", "value", "TIME"}
                    # Primary: wiki_pages/*.json (WikiBuilder output)
                    _wiki_json_dir = Path(corpus_dir) / "wiki_pages"
                    _wiki_md_dir = Path(corpus_dir) / "graphify-out" / "wiki"
                    if _wiki_json_dir.exists():
                        _count = 0
                        for _jf in sorted(_wiki_json_dir.glob("*.json")):
                            if _jf.name == "index.json":
                                continue
                            try:
                                _page = _json.loads(_jf.read_text(encoding="utf-8"))
                                if _page.get("entity_type", "") in _SKIP_TYPES:
                                    continue
                                _title = _page.get("title") or _page.get("canonical_id", "")
                                if not _title or _title.replace(".", "").replace(",", "").replace(" ", "").isdigit():
                                    continue
                                _summary = _page.get("summary", "")
                                if len(_summary.strip()) < 20:
                                    continue
                                _facts = [f.get("statement", "") for f in _page.get("key_facts", [])[:8] if f.get("statement")]
                                _content = _summary + ("\n" + "\n".join(f"• {f}" for f in _facts) if _facts else "")
                                wiki_articles.append({"title": _title, "content": _content})
                                _count += 1
                                if _count >= 40:
                                    break
                            except Exception:
                                pass
                    elif _wiki_md_dir.exists():
                        # Fallback: graphify-out/wiki/*.md
                        for md in sorted(_wiki_md_dir.glob("*.md"))[:30]:
                            wiki_articles.append({"title": md.stem, "content": md.read_text(encoding="utf-8", errors="replace")})
        except Exception:
            pass  # non-fatal — proceed without context

    available = await registry.list_all_models()
    available_names = [m.model_id for m in available]

    query_embedding = await _get_embedding(request.query)

    # Capture all request fields for the generator (avoids closing-over `request`
    # which may be GC'd by the time the stream runs).
    _query        = request.query
    _session_id   = request.session_id or str(uuid.uuid4())
    _system_prompt = request.system_prompt
    _scoring_weights = request.scoring_weights.normalised()

    async def event_stream():
        # Create a dedicated DB session for the lifetime of this SSE stream.
        # Uses NullPool (AsyncSSESessionLocal) so long-lived SSE connections
        # do not hold slots in the shared pool, preventing exhaustion under load.
        from app.db.database import AsyncSSESessionLocal
        async with AsyncSSESessionLocal() as stream_db:
            stream_slm_registry = SLMRegistry(stream_db)

            orchestrator = Orchestrator(
                adapter_registry=registry,
                slm_registry=stream_slm_registry,
                embed_fn=_get_embedding,
            )

            # ── Emit corpus loading stages ────────────────────────────────────
            # These happen synchronously before the stream starts (in ask()) but
            # we emit events so the frontend execution log stays consistent.
            _graph_entity_count = sum(1 for l in graph_context.splitlines() if l.startswith("-"))
            _graph_detail = f"{_graph_entity_count} entities loaded" if graph_context else "No graph found"
            _wiki_detail = f"{len(wiki_articles)} wiki articles loaded" if wiki_articles else "No wiki context found"
            _ev_graph = json.dumps({"type": "step", "step": 0, "step_name": "Loading Knowledge Graph",
                                    "data": {"step_number": 0, "step_name": "Loading Knowledge Graph",
                                             "duration_ms": 0, "detail": _graph_detail}})
            _ev_wiki = json.dumps({"type": "step", "step": 0, "step_name": "Retrieving Wiki Context",
                                   "data": {"step_number": 0, "step_name": "Retrieving Wiki Context",
                                            "duration_ms": 0, "detail": _wiki_detail}})
            yield f"data: {_ev_graph}\n\n"
            yield f"data: {_ev_wiki}\n\n"

            # ── Pre-stream: emit model_context ───────────────────────────────
            import numpy as np
            from app.modules.slm_factory.bandit import get_bandit
            embedding_available = any(v != 0.0 for v in query_embedding)
            if not embedding_available:
                _warn = json.dumps({
                    "type": "warning",
                    "code": "embedding_unavailable",
                    "message": (
                        "Semantic similarity unavailable — results ranked by keyword match only. "
                        "Install nomic-embed-text via: ollama pull nomic-embed-text"
                    ),
                })
                yield f"data: {_warn}\n\n"
            bandit = get_bandit()
            arm_context = []
            for m in available:
                arm = bandit._arms.get(m.model_id)
                if arm:
                    try:
                        A_inv = np.linalg.inv(arm["A"])
                        theta = A_inv @ arm["b"]
                        obs = max(0, round(float(np.mean(np.diag(arm["A"]))) - 10.0))
                        explore = float(np.sqrt(float(np.mean(np.diag(A_inv)))))
                        est_reward = round(float(np.mean(theta)), 4)
                        state = "Exploring" if obs < 20 else "Learning" if obs < 50 else "Confident"
                        arm_context.append({
                            "model_id": m.model_id,
                            "provider": m.provider,
                            "observations": obs,
                            "explore_width": round(explore, 5),
                            "estimated_reward": est_reward,
                            "state": state,
                        })
                    except Exception:
                        pass
            _ctx = json.dumps({
                "type": "model_context",
                "data": {
                    "embedding_available": embedding_available,
                    "arms": arm_context,
                    "available_model_count": len(available),
                },
            })
            yield f"data: {_ctx}\n\n"

            _query_start_ms = __import__("time").monotonic()
            _output_data: dict = {}

            async for event in orchestrator.run(
                query=_query,
                session_id=_session_id,
                graph_context=graph_context,
                wiki_articles=wiki_articles,
                domain_label=domain_label,
                coverage_topics=coverage_topics,
                corpus_hash=corpus_hash,
                available_models=available_names,
                system_prompt=_system_prompt,
                scoring_weights=_scoring_weights,
            ):
                # ── Persist to query_history on output event ─────────────────
                # Written HERE (before yielding) because the client disconnects
                # immediately after receiving the output event, which would cancel
                # the generator before any post-loop code runs.
                if event.get("type") == "output":
                    _output_data = event.get("data") or {}
                    try:
                        _latency_ms = int((__import__("time").monotonic() - _query_start_ms) * 1000)
                        from sqlalchemy import text as _t
                        _summary       = (_output_data.get("final_answer") or "")[:500]
                        _slm_used      = _output_data.get("slm_model_id") or ""
                        _hall_rate     = float(_output_data.get("hallucination_rate") or 0.0)
                        _completion    = 0.9 if _summary else 0.0
                        _coverage_act  = _output_data.get("coverage_action") or ""

                        # ── query_history INSERT ──────────────────────────────
                        await stream_db.execute(_t("""
                            INSERT INTO query_history
                                (session_id, query, task_category, task_type,
                                 slm_used, response_summary, hallucination_rate,
                                 task_completion_rate, latency_ms, coverage_action,
                                 created_at)
                            VALUES
                                (:session_id, :query, :task_category, :task_type,
                                 :slm_used, :response_summary, :hallucination_rate,
                                 :task_completion_rate, :latency_ms, :coverage_action,
                                 now())
                        """), {
                            "session_id":           _session_id,
                            "query":                _query,
                            "task_category":        _output_data.get("intent", ""),
                            "task_type":            _output_data.get("primary_task_type", ""),
                            "slm_used":             _slm_used,
                            "response_summary":     _summary,
                            "hallucination_rate":   _hall_rate,
                            "task_completion_rate": _completion,
                            "latency_ms":           _latency_ms,
                            "coverage_action":      _coverage_act,
                        })

                        # ── slm_registry: update quality signals after each query ──
                        # Increments query_count, refreshes last_used_at, and
                        # updates task_completion_rate / hallucination_rate as an
                        # exponential moving average (α=0.1) so the coverage
                        # checker composite score improves with real usage data.
                        # Explicit CAST avoids asyncpg async type-inference (f405).
                        if _slm_used:
                            await stream_db.execute(_t("""
                                UPDATE slm_registry SET
                                    last_used_at         = now(),
                                    query_count          = COALESCE(query_count, 0) + 1,
                                    task_completion_rate = CASE
                                        WHEN task_completion_rate IS NULL
                                        THEN CAST(:c AS double precision)
                                        ELSE task_completion_rate * 0.9 + CAST(:c AS double precision) * 0.1
                                    END,
                                    hallucination_rate   = CASE
                                        WHEN hallucination_rate IS NULL
                                        THEN CAST(:h AS double precision)
                                        ELSE hallucination_rate * 0.9 + CAST(:h AS double precision) * 0.1
                                    END
                                WHERE ollama_model_name = :slm_ollama
                                   OR model_id         = :slm_model
                            """), {
                                "slm_ollama": _slm_used,
                                "slm_model":  _slm_used,
                                "c": _completion,
                                "h": _hall_rate,
                            })

                        await stream_db.commit()
                    except Exception as _hist_exc:
                        import logging as _log
                        _log.getLogger(__name__).warning("query_history/registry write failed: %s", _hist_exc)
                yield f"data: {json.dumps(event)}\n\n"
            # stream_db session closes cleanly here via `async with`

    async def safe_event_stream():
        """Wraps event_stream() to catch unhandled exceptions and emit a clean error event."""
        try:
            async for chunk in event_stream():
                yield chunk
        except Exception as exc:
            import traceback
            _err = json.dumps({
                "type": "error",
                "code": "stream_error",
                "message": f"Query failed: {type(exc).__name__}: {exc}",
                "detail": traceback.format_exc()[-500:],
            })
            yield f"data: {_err}\n\n"

    return StreamingResponse(
        safe_event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
