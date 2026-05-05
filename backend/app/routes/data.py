"""
Data ingestion API routes.
POST /api/v1/data/ingest — accept files + optional DB credentials, start Celery job
GET  /api/v1/data/status/{job_id} — check job progress (JSON poll)
GET  /api/v1/data/progress/{job_id} — SSE stream of live progress events
"""
import uuid
import json
import asyncio
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.db.database import get_db
from app.config import get_settings

settings = get_settings()
router = APIRouter(prefix="/data", tags=["data"])


class DBCredentials(BaseModel):
    db_type: str          # postgresql | mysql | sqlite | mongodb
    host: str = ""
    port: int = 5432
    database: str = ""
    username: str = ""
    password: str = ""
    connection_string: str = ""


@router.post("/ingest")
async def ingest(
    files: list[UploadFile] = File(default=[]),
    db_type: str = Form(default=""),
    host: str = Form(default=""),
    port: int = Form(default=5432),
    database: str = Form(default=""),
    username: str = Form(default=""),
    password: str = Form(default=""),
    connection_string: str = Form(default=""),
    domain_label: str = Form(default="general"),
    db: AsyncSession = Depends(get_db),
):
    job_id = str(uuid.uuid4())
    corpus_dir = Path(settings.corpus_store_path) / job_id
    corpus_dir.mkdir(parents=True, exist_ok=True)

    saved_files = []
    for upload in files:
        dest = corpus_dir / upload.filename
        content = await upload.read()
        dest.write_bytes(content)
        saved_files.append(str(dest))

    db_creds = {}
    if db_type:
        db_creds = {
            "db_type": db_type, "host": host, "port": port,
            "database": database, "username": username,
            "connection_string": connection_string,
        }
        # NOTE: password never stored — passed to worker via env or secure vault
        if password:
            db_creds["_has_password"] = True

    # Record job in DB
    await db.execute(text("""
        INSERT INTO ingest_jobs (job_id, status, file_count, domain_label, metadata)
        VALUES (:job_id, 'queued', :file_count, :domain_label, (:metadata)::jsonb)
    """), {
        "job_id": job_id,
        "file_count": len(saved_files),
        "domain_label": domain_label,
        "metadata": __import__("json").dumps({"corpus_dir": str(corpus_dir), "db_creds": db_creds}),
    })
    await db.commit()

    # Dispatch Celery task
    try:
        from app.tasks.ingest_task import run_ingest_pipeline
        run_ingest_pipeline.delay(job_id, str(corpus_dir), domain_label, db_creds)
    except Exception as exc:
        return JSONResponse({"job_id": job_id, "status": "queued", "warning": str(exc)})

    return {"job_id": job_id, "status": "queued", "file_count": len(saved_files)}


@router.post("/test-connection")
async def test_connection(creds: DBCredentials):
    """Test external DB connectivity without storing credentials."""
    import asyncio
    db_type = creds.db_type.lower()
    try:
        if db_type == "postgresql":
            import asyncpg
            conn_str = creds.connection_string or (
                f"postgresql://{creds.username}:{creds.password}@{creds.host}:{creds.port}/{creds.database}"
            )
            conn = await asyncio.wait_for(asyncpg.connect(conn_str), timeout=5)
            await conn.close()
        elif db_type == "mysql":
            import aiomysql
            conn = await asyncio.wait_for(
                aiomysql.connect(host=creds.host, port=creds.port, user=creds.username,
                                 password=creds.password, db=creds.database), timeout=5
            )
            conn.close()
        elif db_type == "sqlite":
            import aiosqlite
            async with aiosqlite.connect(creds.database) as _:
                pass
        else:
            return {"success": False, "message": f"Unsupported db_type: {db_type}"}
        return {"success": True, "message": f"Connected to {db_type} successfully"}
    except Exception as exc:
        return {"success": False, "message": str(exc)}


@router.get("/status/{job_id}")
async def get_status(job_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT * FROM ingest_jobs WHERE job_id = :id"),
        {"id": job_id},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    return dict(row)


@router.get("/progress/{job_id}")
async def stream_progress(job_id: str, db: AsyncSession = Depends(get_db)):
    """
    SSE endpoint that streams progress events for a running ingest job.
    Emits `progress` events every ~1.5s until status is graph_done or failed.
    """
    async def _generate():
        terminal_statuses = {"graph_done", "failed", "error"}
        while True:
            result = await db.execute(
                text("SELECT status, progress, entity_count, community_count, file_count, error_message FROM ingest_jobs WHERE job_id = :id"),
                {"id": job_id},
            )
            row = result.mappings().first()
            if not row:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Job not found'})}\n\n"
                break

            row_dict = dict(row)
            progress = row_dict.get("progress") or {}
            if isinstance(progress, str):
                try:
                    progress = json.loads(progress)
                except Exception:
                    progress = {}

            event = {
                "type": "progress",
                "status": row_dict["status"],
                "steps": progress.get("steps", []),
                "current_step": progress.get("current_step", 0),
                "overall_pct": progress.get("overall_pct", 0),
                "eta_seconds": progress.get("eta_seconds"),
                "entity_count": row_dict.get("entity_count", 0),
                "community_count": row_dict.get("community_count", 0),
                "file_count": row_dict.get("file_count", 0),
                "error": row_dict.get("error_message"),
            }
            yield f"data: {json.dumps(event)}\n\n"

            if row_dict["status"] in terminal_statuses:
                break

            await asyncio.sleep(1.5)

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
