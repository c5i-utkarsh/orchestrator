"""
Celery task: run the full ingest → graph → distill pipeline for a job.
Writes granular progress into ingest_jobs.progress (JSONB) so the UI
can poll /api/v1/data/status/{job_id} and show per-step progress + ETA.

Progress schema written to DB:
{
  "steps": [
    {"id": "parse",   "label": "Parsing & normalizing files",  "status": "done|running|pending|error", "pct": 100, "detail": "..."},
    {"id": "dedup",   "label": "Deduplication (MinHash LSH)",  ...},
    {"id": "quality", "label": "Quality scoring & filtering",  ...},
    {"id": "graph",   "label": "Building knowledge graph",     ...},
    {"id": "done",    "label": "Pipeline complete",            ...}
  ],
  "current_step": 2,
  "overall_pct": 45,
  "eta_seconds": 120,
  "started_at": 1234567890.0
}
"""
import json
import time
import asyncio
from pathlib import Path

from app.tasks import celery_app

# Approximate time weights per step (used for ETA estimation)
_STEP_WEIGHTS = {"parse": 0.20, "dedup": 0.15, "quality": 0.10, "graph": 0.55}


@celery_app.task(name="run_ingest_pipeline", bind=True, max_retries=2)
def run_ingest_pipeline(
    self,
    job_id: str,
    corpus_dir: str,
    domain_label: str,
    db_creds: dict,
):
    asyncio.run(_ingest(job_id, corpus_dir, domain_label, db_creds))


async def _update_progress(db, text_fn, job_id: str, steps: list, current_idx: int,
                           started_at: float, status: str, extra: dict | None = None):
    """Write progress JSON and status to DB atomically."""
    from sqlalchemy import text
    done_weight = sum(
        _STEP_WEIGHTS.get(s["id"], 0)
        for s in steps[:current_idx]
    )
    current_weight = _STEP_WEIGHTS.get(steps[current_idx]["id"] if current_idx < len(steps) else "", 0)
    step_pct = steps[current_idx].get("pct", 0) / 100.0 if current_idx < len(steps) else 1.0
    overall_pct = int((done_weight + current_weight * step_pct) * 100)

    elapsed = time.time() - started_at
    eta_seconds = None
    if overall_pct > 5:
        total_estimated = elapsed / (overall_pct / 100)
        eta_seconds = max(0, int(total_estimated - elapsed))

    progress = {
        "steps": steps,
        "current_step": current_idx,
        "overall_pct": overall_pct,
        "eta_seconds": eta_seconds,
        "started_at": started_at,
    }

    params = {
        "id": job_id,
        "status": status,
        "progress": json.dumps(progress),
    }
    if extra:
        params.update(extra)

    set_extra = ""
    if extra:
        set_extra = ", " + ", ".join(f"{k}=:{k}" for k in extra)

    await db.execute(
        text(f"UPDATE ingest_jobs SET status=:status, progress=(:progress)::jsonb{set_extra} WHERE job_id=:id"),
        params,
    )
    await db.commit()


async def _ingest(job_id: str, corpus_dir: str, domain_label: str, db_creds: dict):
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy.pool import NullPool
    from sqlalchemy import text
    from app.config import get_settings

    # Create a fresh engine with NullPool for this task.
    # Each Celery task runs inside asyncio.run() which creates a NEW event loop.
    # Reusing a pooled engine from a previous event loop causes asyncpg to raise
    # "Future attached to a different loop". NullPool creates fresh connections
    # every time and never caches them, so the loop mismatch can never occur.
    _settings = get_settings()
    _task_engine = create_async_engine(
        _settings.database_url,
        echo=False,
        poolclass=NullPool,
    )
    async_session_factory = async_sessionmaker(
        _task_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    from app.modules.data_curation.ingester import Ingester
    from app.modules.data_curation.graphify_engine.graphify_runner import GraphifyRunner
    from app.modules.data_curation.deduplicator import Deduplicator
    from app.modules.data_curation.quality_scorer import QualityScorer

    started_at = time.time()
    steps = [
        {"id": "parse",   "label": "1 · Parsing & normalizing files",     "status": "pending", "pct": 0, "detail": ""},
        {"id": "dedup",   "label": "2 · Deduplication (MinHash LSH)",      "status": "pending", "pct": 0, "detail": ""},
        {"id": "quality", "label": "3 · Quality scoring & filtering",      "status": "pending", "pct": 0, "detail": ""},
        {"id": "graph",   "label": "4 · Building knowledge graph",         "status": "pending", "pct": 0, "detail": ""},
        {"id": "done",    "label": "5 · Pipeline complete",                "status": "pending", "pct": 0, "detail": ""},
    ]

    async with async_session_factory() as db:

        # ── Step 1: Parse files ─────────────────────────────────────────────
        steps[0]["status"] = "running"
        steps[0]["pct"] = 0
        await _update_progress(db, text, job_id, steps, 0, started_at, "ingesting")

        ingester = Ingester()
        try:
            docs = await ingester.ingest_directory(corpus_dir)
        except Exception as exc:
            steps[0]["status"] = "error"
            steps[0]["detail"] = str(exc)
            await _update_progress(db, text, job_id, steps, 0, started_at, "failed",
                                   {"error_message": str(exc)})
            return

        steps[0]["status"] = "done"
        steps[0]["pct"] = 100
        steps[0]["detail"] = f"{len(docs)} documents parsed"
        await _update_progress(db, text, job_id, steps, 1, started_at, "ingesting",
                               {"file_count": len(docs)})

        # ── Step 2: Deduplication ───────────────────────────────────────────
        steps[1]["status"] = "running"
        steps[1]["pct"] = 10
        await _update_progress(db, text, job_id, steps, 1, started_at, "deduplicating")

        deduper = Deduplicator()
        doc_dicts = [{"id": d.id, "text": d.text} for d in docs]
        kept_docs, dedup_result = deduper.deduplicate(doc_dicts)

        steps[1]["status"] = "done"
        steps[1]["pct"] = 100
        steps[1]["detail"] = (
            f"{dedup_result.kept_count}/{dedup_result.original_count} kept "
            f"({dedup_result.removed_count} duplicates removed)"
        )
        await _update_progress(db, text, job_id, steps, 2, started_at, "quality_scoring")

        # ── Step 3: Quality filter ──────────────────────────────────────────
        steps[2]["status"] = "running"
        steps[2]["pct"] = 10
        await _update_progress(db, text, job_id, steps, 2, started_at, "quality_scoring")

        scorer = QualityScorer()
        quality_scores = scorer.score_batch(kept_docs)
        passed_ids = {s.doc_id for s in quality_scores if s.passed}
        final_doc_dicts = [d for d in kept_docs if d["id"] in passed_ids]
        final_docs = [d for d in docs if d.id in passed_ids]

        # Save canonical corpus JSONL
        ingester.save_to_corpus_dir(final_docs, corpus_dir)

        steps[2]["status"] = "done"
        steps[2]["pct"] = 100
        steps[2]["detail"] = (
            f"{len(final_docs)} docs passed quality filter "
            f"(removed {len(kept_docs) - len(final_docs)} low-quality)"
        )
        await _update_progress(db, text, job_id, steps, 3, started_at, "graph_building",
                               {"file_count": len(final_docs)})

        # ── Step 4: Build knowledge graph ───────────────────────────────────
        steps[3]["status"] = "running"
        steps[3]["pct"] = 5
        steps[3]["detail"] = "Extracting entities & relationships…"
        await _update_progress(db, text, job_id, steps, 3, started_at, "graph_building")

        graphify = GraphifyRunner(corpus_dir)
        try:
            stats = await graphify.run(progress_callback=_make_graph_progress_cb(
                db, text, job_id, steps, 3, started_at
            ))
            graph_path = str(graphify.graph_json_path)
        except Exception as exc:
            steps[3]["status"] = "error"
            steps[3]["detail"] = str(exc)
            await _update_progress(db, text, job_id, steps, 3, started_at, "failed",
                                   {"error_message": str(exc)})
            return

        steps[3]["status"] = "done"
        steps[3]["pct"] = 100
        steps[3]["detail"] = (
            f"{stats.get('entity_count', 0)} entities, "
            f"{stats.get('edge_count', 0)} edges, "
            f"{stats.get('community_count', 0)} communities"
        )

        # ── Step 5: Done ────────────────────────────────────────────────────
        steps[4]["status"] = "done"
        steps[4]["pct"] = 100
        steps[4]["detail"] = f"Completed in {int(time.time() - started_at)}s"

        await _update_progress(db, text, job_id, steps, 4, started_at, "graph_done", {
            "entity_count": stats.get("entity_count", 0),
            "community_count": stats.get("community_count", 0),
            "graph_path": graph_path,
        })


def _make_graph_progress_cb(db, text_fn, job_id, steps, step_idx, started_at):
    """Return an async callback that graphify can call to report sub-progress."""
    async def cb(pct: int, detail: str = ""):
        steps[step_idx]["pct"] = pct
        steps[step_idx]["detail"] = detail
        await _update_progress(db, text_fn, job_id, steps, step_idx, started_at, "graph_building")
    return cb
