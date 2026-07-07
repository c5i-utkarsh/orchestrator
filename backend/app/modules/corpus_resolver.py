"""
Shared corpus directory resolver.

Every route that needs to locate a job's corpus on disk should use
``resolve_corpus_dir(job_id, db)`` from this module.  Previously each route
had its own copy of the resolution logic — 8 slightly-different implementations
across data.py, quality.py, repair.py, eda.py, wiki.py, links.py, slm.py, and
orchestrator.py.  Divergences between them caused some routes to return zeros
(relative paths that don't exist from the server's CWD) while others worked
correctly.

Resolution strategy (in priority order):
  1. corpus_path column   — written by ingest_task at pipeline completion
  2. Derived from graph_path — parent of canonical_graph.json
  3. metadata.corpus_dir  — written at upload time
  4. Convention fallback  — corpus_store/{job_id}  (absolute)

Raises HTTPException(404) when nothing resolves.
"""
import json
import logging
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def resolve_corpus_dir(job_id: str, db: AsyncSession) -> str:
    """Return the absolute path to the corpus directory for *job_id*.

    Parameters
    ----------
    job_id : str
        The ingest job UUID.
    db : AsyncSession
        An active async SQLAlchemy session (from ``Depends(get_db)``).

    Returns
    -------
    str
        Absolute path to the corpus directory that exists on disk.

    Raises
    ------
    HTTPException(404)
        When the job is not found or no directory can be located.
    """
    row = (await db.execute(
        text("SELECT graph_path, corpus_path, metadata FROM ingest_jobs WHERE job_id = :id"),
        {"id": job_id},
    )).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    # ── Strategy 1: corpus_path column ────────────────────────────────────────
    # Written by ingest_task at pipeline completion since the ingest fix.
    corpus_path = row.get("corpus_path")
    if corpus_path:
        try:
            if Path(corpus_path).is_dir():
                return corpus_path
        except (PermissionError, OSError):
            logger.debug("corpus_path %s not accessible (PermissionError)", corpus_path)

    # ── Strategy 2: derive from graph_path ────────────────────────────────────
    graph_path = row.get("graph_path")
    if graph_path:
        try:
            gp = Path(graph_path)
            # canonical_graph.json lives directly inside the corpus dir
            candidate = gp.parent if gp.name == "canonical_graph.json" else gp.parent.parent
            if candidate.is_dir():
                return str(candidate)
        except (PermissionError, OSError):
            logger.debug("graph_path %s not accessible (PermissionError)", graph_path)

    # ── Strategy 3: metadata.corpus_dir ───────────────────────────────────────
    meta = row.get("metadata") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}
    corpus_dir = (meta or {}).get("corpus_dir", "")
    if corpus_dir:
        try:
            if Path(corpus_dir).is_dir():
                return corpus_dir
        except (PermissionError, OSError):
            pass

    # ── Strategy 4: conventional absolute path ────────────────────────────────
    from app.config import get_settings
    candidate = Path(get_settings().corpus_store_path) / job_id
    try:
        if candidate.exists():
            return str(candidate)
    except (PermissionError, OSError):
        pass

    raise HTTPException(
        status_code=404,
        detail=f"Corpus directory not found for job {job_id}. "
               "The pipeline may still be running or the files may have been removed.",
    )
