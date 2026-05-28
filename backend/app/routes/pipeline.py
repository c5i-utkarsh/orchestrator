"""
Pipeline control-plane routes.
GET   /api/v1/pipeline/{job_id}/state           — full node topology with per-node status
PATCH /api/v1/pipeline/{job_id}/config          — write thresholds to Redis pipeline_config:{job_id}
POST  /api/v1/pipeline/{job_id}/approve/{step}  — set Redis gate:{job_id}:{step}=approved
POST  /api/v1/pipeline/{job_id}/pause           — set Redis pipeline_pause:{job_id}=1
POST  /api/v1/pipeline/{job_id}/resume          — delete that key
GET   /api/v1/pipeline/{job_id}/entities/preview — top-20 entities from graph
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/pipeline", tags=["pipeline"])

# ── Redis helpers ─────────────────────────────────────────────────────────────

def _get_redis():
    import redis as _redis
    from app.config import get_settings
    s = get_settings()
    return _redis.from_url(s.redis_url, decode_responses=True)


# ── Models ────────────────────────────────────────────────────────────────────

class PipelineConfigPatch(BaseModel):
    quality_threshold: float | None = None
    dedup_sensitivity: int | None = None
    selected_model: str | None = None
    gates_enabled: bool | None = None


# ── Node topology helper ──────────────────────────────────────────────────────

_STEP_STATUS_MAP = {
    "ingesting":        {"import": "running"},
    "deduplicating":    {"import": "done",    "clean":   "running"},
    "quality_scoring":  {"import": "done",    "clean":   "done",    "quality": "running"},
    "graph_building":   {"import": "done",    "clean":   "done",    "quality": "done",    "graph": "running"},
    "graph_done":       {"import": "done",    "clean":   "done",    "quality": "done",    "graph": "done"},
    "failed":           {},
}

def _build_topology(db_status: str) -> list[dict]:
    status_map = _STEP_STATUS_MAP.get(db_status, {})
    nodes = [
        {"id": "import",  "label": "Import Data",       "icon": "📥"},
        {"id": "clean",   "label": "Clean & Organize",   "icon": "🧹"},
        {"id": "quality", "label": "Readiness Check",    "icon": "📊"},
        {"id": "graph",   "label": "Knowledge Graph",    "icon": "🕸️"},
        {"id": "ai",      "label": "Select AI Models",   "icon": "🤖"},
        {"id": "answer",  "label": "Generate Answer",    "icon": "✨"},
    ]
    for node in nodes:
        node["status"] = status_map.get(node["id"], "pending")
    return nodes


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{job_id}/state")
async def get_state(job_id: str):
    """Return full pipeline topology with per-node statuses."""
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
    from sqlalchemy.pool import NullPool
    from sqlalchemy import text as sql_text
    from app.config import get_settings
    import json

    s = get_settings()
    engine = create_async_engine(s.database_url, echo=False, poolclass=NullPool)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with factory() as db:
        row = await db.execute(
            sql_text("SELECT status, progress FROM ingest_jobs WHERE job_id = :id"),
            {"id": job_id},
        )
        result = row.fetchone()

    await engine.dispose()

    if not result:
        raise HTTPException(status_code=404, detail="Job not found")

    db_status, progress_json = result
    progress = json.loads(progress_json) if progress_json else {}

    # Check Redis for gate states
    try:
        r = _get_redis()
        gate_states = {}
        for step in ["import", "clean", "quality", "graph", "model"]:
            val = r.get(f"gate:{job_id}:{step}")
            gate_states[step] = val or "pending"
        paused = r.exists(f"pipeline_pause:{job_id}") == 1
    except Exception:
        gate_states = {}
        paused = False

    topology = _build_topology(db_status)

    return {
        "job_id": job_id,
        "db_status": db_status,
        "overall_pct": progress.get("overall_pct", 0),
        "eta_seconds": progress.get("eta_seconds"),
        "nodes": topology,
        "gate_states": gate_states,
        "paused": paused,
    }


@router.patch("/{job_id}/config")
async def patch_config(job_id: str, body: PipelineConfigPatch):
    """Write pipeline config overrides to Redis (picked up by ingest task on next gate)."""
    try:
        r = _get_redis()
        import json
        existing_raw = r.get(f"pipeline_config:{job_id}")
        existing = json.loads(existing_raw) if existing_raw else {}
        patch = body.model_dump(exclude_none=True)
        existing.update(patch)
        r.set(f"pipeline_config:{job_id}", json.dumps(existing), ex=86400)
        return {"status": "ok", "config": existing}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{job_id}/approve/{step}")
async def approve_gate(job_id: str, step: str):
    """Signal that the user has approved the gate for a given pipeline step."""
    valid = {"import", "clean", "quality", "graph", "model"}
    if step not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid step. Must be one of: {valid}")
    try:
        r = _get_redis()
        r.set(f"gate:{job_id}:{step}", "approved", ex=3600)
        return {"status": "approved", "job_id": job_id, "step": step}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{job_id}/pause")
async def pause_pipeline(job_id: str):
    """Pause the pipeline — ingest task will stop at next checkpoint."""
    try:
        r = _get_redis()
        r.set(f"pipeline_pause:{job_id}", "1", ex=3600)
        return {"status": "paused", "job_id": job_id}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{job_id}/resume")
async def resume_pipeline(job_id: str):
    """Resume a paused pipeline."""
    try:
        r = _get_redis()
        r.delete(f"pipeline_pause:{job_id}")
        return {"status": "resumed", "job_id": job_id}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{job_id}/entities/preview")
async def entities_preview(job_id: str, limit: int = 20):
    """Return top entities from the knowledge graph for the given job."""
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
    from sqlalchemy.pool import NullPool
    from sqlalchemy import text as sql_text
    from app.config import get_settings
    import json

    s = get_settings()
    engine = create_async_engine(s.database_url, echo=False, poolclass=NullPool)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with factory() as db:
        row = await db.execute(
            sql_text("SELECT graph_path FROM ingest_jobs WHERE job_id = :id"),
            {"id": job_id},
        )
        result = row.fetchone()

    await engine.dispose()

    if not result or not result[0]:
        raise HTTPException(status_code=404, detail="Graph not available yet")

    import os
    graph_path = result[0]
    if not os.path.exists(graph_path):
        raise HTTPException(status_code=404, detail="Graph file not found")

    try:
        with open(graph_path) as f:
            graph = json.load(f)
        nodes = graph.get("nodes", [])
        # Sort by degree/weight if available
        nodes_sorted = sorted(nodes, key=lambda n: n.get("weight", 0), reverse=True)
        top = [n.get("label", n.get("id", "")) for n in nodes_sorted[:limit]]
        return {"job_id": job_id, "entities": top, "total": len(nodes)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
