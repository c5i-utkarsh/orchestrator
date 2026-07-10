"""
Data ingestion API routes.
POST /api/v1/data/ingest — accept files + optional DB credentials, start Celery job
GET  /api/v1/data/status/{job_id} — check job progress (JSON poll)
GET  /api/v1/data/progress/{job_id} — SSE stream of live progress events
"""
import uuid
import json
import re
import hashlib
import asyncio
from pathlib import Path
from datetime import datetime, timezone

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.db.database import get_db
from app.config import get_settings

settings = get_settings()
router = APIRouter(prefix="/data", tags=["data"])


def _file_hash(file_names: list[str]) -> str:
    """Deterministic 16-hex-char fingerprint of a sorted file-name set.

    Used for exact deduplication: two uploads with identical file names
    (regardless of upload order) produce the same hash and reuse the same
    ingest job rather than creating a duplicate corpus.
    """
    names = sorted(n.strip() for n in file_names if n.strip())
    return hashlib.sha256("\n".join(names).encode()).hexdigest()[:16]


# ── Project name helpers ─────────────────────────────────────────────────────

def _auto_project_name(domain_label: str, file_names: list[str]) -> str:
    """Generate a meaningful project name from domain label + uploaded file names."""
    domain_title = " ".join(
        w.capitalize() for w in domain_label.replace("-", " ").replace("_", " ").split()
        if w
    )

    if not file_names:
        return f"{domain_title} Knowledge Base"

    # Extract meaningful words from file stems
    stems = []
    for fname in file_names[:4]:
        stem = Path(fname).stem.replace("_", " ").replace("-", " ")
        # Remove version/date noise tokens
        stem = re.sub(r"\b(?:v\d+|final|draft|copy|backup|\d{6,})\b", "", stem, flags=re.I)
        words = [w.capitalize() for w in stem.split() if len(w) > 2 and not w.isdigit()]
        if words:
            stems.append(" ".join(words[:3]))

    # Look for year / quarter qualifier in ANY file name (check before stem logic)
    for fname in file_names:
        m = re.search(r"(20\d{2}|[Qq][1-4]|FY\d{2,4})", fname, re.I)
        if m:
            return f"{domain_title} {m.group(1).upper()} Corpus"

    # Single file: use its stem
    if len(file_names) == 1 and stems:
        return f"{domain_title} – {stems[0][:40]}"

    # 2–3 files with short combined stems: list them
    if len(file_names) <= 3 and stems:
        combined = " · ".join(stems[:3])
        if len(combined) <= 50:
            return f"{domain_title} – {combined}"

    # Many files: use file count
    if stems:
        return f"{domain_title} Knowledge Base"
    return f"{domain_title} Knowledge Base"


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
    project_name: str = Form(default=""),
    business_unit: str = Form(default=""),
    description: str = Form(default=""),
    industry: str = Form(default=""),
    tags: str = Form(default=""),
    force_reingest: bool = Form(default=False),
    db: AsyncSession = Depends(get_db),
):
    # Deduplication: reuse an existing completed corpus only when BOTH
    # the domain_label AND the exact set of uploaded file names match.
    # Matching on domain alone would silently return an unrelated corpus
    # (e.g. a prior TechNova upload for a new FinanceApp upload — both
    # tagged "it-industry"). file_hash = sha256(sorted filenames)[:16].
    if not force_reingest and files:
        upload_hash = _file_hash([f.filename for f in files])
        existing = await db.execute(text("""
            SELECT job_id, file_count, entity_count, graph_path, created_at, project_name
            FROM ingest_jobs
            WHERE domain_label = :domain
              AND status = 'graph_done'
              AND file_hash = :fhash
            ORDER BY created_at DESC
            LIMIT 1
        """), {"domain": domain_label, "fhash": upload_hash})
        existing_row = existing.mappings().first()
        if existing_row:
            return {
                "job_id": existing_row["job_id"],
                "status": "graph_done",
                "file_count": existing_row["file_count"] or 0,
                "entity_count": existing_row["entity_count"] or 0,
                "project_name": existing_row["project_name"] or "",
                "reused": True,
                "message": (
                    f"Reusing existing corpus for domain '{domain_label}' with the same files "
                    f"(created {existing_row['created_at'].strftime('%Y-%m-%d %H:%M') if existing_row['created_at'] else 'N/A'}). "
                    "Pass force_reingest=true to build a new one."
                ),
            }

    job_id = str(uuid.uuid4())
    corpus_dir = Path(settings.corpus_store_path) / job_id
    corpus_dir.mkdir(parents=True, exist_ok=True)

    now_iso = datetime.now(timezone.utc).isoformat()
    saved_files = []
    file_list_entries = []
    for upload in files:
        dest = corpus_dir / upload.filename
        content = await upload.read()
        dest.write_bytes(content)
        saved_files.append(str(dest))
        file_list_entries.append({"name": upload.filename, "size": len(content), "added_at": now_iso})

    # Auto-generate project name if not provided
    final_project_name = project_name.strip() or _auto_project_name(
        domain_label, [f.filename for f in files]
    )

    db_creds = {}
    if db_type:
        db_creds = {
            "db_type": db_type, "host": host, "port": port,
            "database": database, "username": username,
            "connection_string": connection_string,
        }
        if password:
            db_creds["_has_password"] = True

    # Record job in DB (include project_name, version, file_list, file_hash)
    await db.execute(text("""
        INSERT INTO ingest_jobs (job_id, status, file_count, domain_label, project_name, version, file_list, file_hash, metadata)
        VALUES (:job_id, 'queued', :file_count, :domain_label, :project_name, 1, (:file_list)::jsonb, :file_hash, (:metadata)::jsonb)
    """), {
        "job_id": job_id,
        "file_count": len(saved_files),
        "domain_label": domain_label,
        "project_name": final_project_name,
        "file_list": json.dumps(file_list_entries),
        "file_hash": _file_hash([f.filename for f in files]) if files else None,
        "metadata": json.dumps({
            "corpus_dir": str(corpus_dir), "db_creds": db_creds,
            "session": {
                "domain_name": domain_label, "business_unit": business_unit,
                "description": description, "industry": industry,
                "tags": [t.strip() for t in tags.split(",") if t.strip()],
            },
        }),
    })
    await db.commit()

    # Dispatch Celery task
    try:
        from app.tasks.ingest_task import run_ingest_pipeline
        run_ingest_pipeline.apply_async(args=[job_id], queue="kumar1_ingest")
    except Exception as exc:
        return JSONResponse({"job_id": job_id, "status": "queued", "project_name": final_project_name, "warning": str(exc)})

    return {"job_id": job_id, "status": "queued", "file_count": len(saved_files), "project_name": final_project_name}


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


@router.get("/corpora")
async def list_corpora(db: AsyncSession = Depends(get_db)):
    """List all completed corpora — all versions across all domains.

    Returns every graph_done job so the frontend can show version history
    and let the user select any specific version of a project.
    The frontend deduplicates by project_name/domain_label if it wants a
    compact view; this endpoint returns the full picture.
    """
    result = await db.execute(text("""
        SELECT job_id, domain_label, project_name, file_count, entity_count,
               community_count, graph_path, metadata, version, file_list, created_at
        FROM ingest_jobs
        WHERE status = 'graph_done'
        ORDER BY created_at DESC
    """))
    rows = result.mappings().all()
    out = []
    for r in rows:
        meta = r["metadata"] or {}
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except Exception:
                meta = {}
        out.append({
            "job_id": r["job_id"],
            "domain_label": r["domain_label"],
            "project_name": r["project_name"] or "",
            "file_count": r["file_count"] or 0,
            "entity_count": r["entity_count"] or 0,
            "community_count": r["community_count"] or 0,
            "version": r["version"] or 1,
            "file_list": r["file_list"] or [],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        })
    return out


class RenameRequest(BaseModel):
    project_name: str


@router.patch("/{job_id}/rename")
async def rename_project(job_id: str, body: RenameRequest, db: AsyncSession = Depends(get_db)):
    """Rename a project (updates project_name for the given job)."""
    name = body.project_name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="project_name must not be empty")
    result = await db.execute(
        text("UPDATE ingest_jobs SET project_name = :name WHERE job_id = :id RETURNING job_id"),
        {"name": name, "id": job_id},
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Job not found")
    await db.commit()
    return {"job_id": job_id, "project_name": name}


@router.post("/ingest-update/{job_id}")
async def ingest_update(
    job_id: str,
    files: list[UploadFile] = File(default=[]),
    db: AsyncSession = Depends(get_db),
):
    """
    Add new files to an existing project and re-run the full pipeline.
    - Copies only new files (skips duplicates by filename)
    - Preserves job_id → query_history and benchmarking history intact
    - Increments version counter
    - Re-runs the 14-layer pipeline on the combined file set
    """
    # Load existing job
    row = (await db.execute(
        text("SELECT job_id, domain_label, project_name, corpus_path, metadata, file_count, version, file_list, status FROM ingest_jobs WHERE job_id = :id"),
        {"id": job_id},
    )).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")

    # Resolve corpus_dir
    corpus_dir = row.get("corpus_path") or ""
    if not corpus_dir:
        meta = row.get("metadata") or {}
        if isinstance(meta, str):
            try: meta = json.loads(meta)
            except: meta = {}
        corpus_dir = (meta or {}).get("corpus_dir", "") or str(Path(settings.corpus_store_path) / job_id)
    corpus_dir_path = Path(corpus_dir)
    corpus_dir_path.mkdir(parents=True, exist_ok=True)

    # Determine existing file names (for dedup)
    existing_file_list: list[dict] = row.get("file_list") or []
    if isinstance(existing_file_list, str):
        try: existing_file_list = json.loads(existing_file_list)
        except: existing_file_list = []
    existing_names = {entry["name"] for entry in existing_file_list if isinstance(entry, dict)}

    # Also scan corpus_dir for any files not recorded in file_list
    skip_suffixes = {".json", ".faiss", ".pkl", ".bin", ".idx", ""}
    for fp in corpus_dir_path.iterdir():
        if fp.is_file() and fp.suffix.lower() not in skip_suffixes:
            existing_names.add(fp.name)

    now_iso = datetime.now(timezone.utc).isoformat()
    added_files = []
    skipped_files = []
    new_file_entries = list(existing_file_list)  # preserve old entries

    for upload in files:
        if upload.filename in existing_names:
            skipped_files.append(upload.filename)
            continue
        dest = corpus_dir_path / upload.filename
        content = await upload.read()
        dest.write_bytes(content)
        added_files.append(upload.filename)
        existing_names.add(upload.filename)
        new_file_entries.append({"name": upload.filename, "size": len(content), "added_at": now_iso})

    if not added_files:
        return {
            "job_id": job_id,
            "added_files": [],
            "skipped_files": skipped_files,
            "message": "No new files added — all uploads already exist in this project.",
            "project_name": row.get("project_name") or "",
        }

    new_version = (row.get("version") or 1) + 1
    new_file_count = len([f for f in corpus_dir_path.iterdir()
                          if f.is_file() and f.suffix.lower() not in skip_suffixes])

    await db.execute(text("""
        UPDATE ingest_jobs
        SET status = 'queued',
            version = :version,
            file_count = :file_count,
            file_list = (:file_list)::jsonb,
            error_message = NULL,
            error = NULL,
            progress = '{}'::jsonb
        WHERE job_id = :id
    """), {
        "id": job_id,
        "version": new_version,
        "file_count": new_file_count,
        "file_list": json.dumps(new_file_entries),
    })
    await db.commit()

    # Re-run the full pipeline on the same job_id (all files including new ones)
    try:
        from app.tasks.ingest_task import run_ingest_pipeline
        run_ingest_pipeline.apply_async(args=[job_id], queue="kumar1_ingest")
    except Exception as exc:
        return JSONResponse({
            "job_id": job_id, "added_files": added_files, "skipped_files": skipped_files,
            "new_version": new_version, "warning": str(exc),
        })

    return {
        "job_id": job_id,
        "status": "queued",
        "project_name": row.get("project_name") or "",
        "domain_label": row.get("domain_label") or "",
        "added_files": added_files,
        "skipped_files": skipped_files,
        "new_file_count": new_file_count,
        "new_version": new_version,
    }


@router.get("/wiki/{job_id}")
async def get_wiki(job_id: str, q: str = "", db: AsyncSession = Depends(get_db)):
    """
    Return parsed wiki articles for a job's knowledge graph.
    Reads from wiki_pages/*.json (WikiBuilder output) with fallback to
    graphify-out/wiki/*.md for backward compatibility.
    """
    row = (await db.execute(
        text("SELECT graph_path, corpus_path, metadata, status FROM ingest_jobs WHERE job_id = :id"),
        {"id": job_id},
    )).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Job not found")

    # Resolve corpus_dir using same logic as _resolve_corpus_dir
    corpus_dir = _derive_corpus_dir(row, job_id)

    articles = []
    if corpus_dir:
        # ── Primary: wiki_pages/*.json (WikiBuilder output) ──────────────────
        wiki_json_dir = Path(corpus_dir) / "wiki_pages"
        wiki_md_dir = Path(corpus_dir) / "graphify-out" / "wiki"

        # Skip numeric/noise entity types that have no analytical value
        SKIP_TYPES = {"CARDINAL", "ORDINAL", "QUANTITY", "DATE", "MONEY", "PERCENT", "value", "TIME"}

        if wiki_json_dir.exists():
            for jf in sorted(wiki_json_dir.glob("*.json")):
                if jf.name == "index.json":
                    continue
                try:
                    page = json.loads(jf.read_text(encoding="utf-8"))
                    entity_type = page.get("entity_type", "")
                    if entity_type in SKIP_TYPES:
                        continue
                    title = page.get("title") or page.get("canonical_id", "")
                    if not title or title.replace(".", "").replace(",", "").replace(" ", "").isdigit():
                        continue
                    summary = page.get("summary", "")
                    key_facts = page.get("key_facts", [])
                    related = page.get("related_entities", [])

                    content_parts = [summary] if summary else []
                    for fact in key_facts[:12]:
                        stmt = fact.get("statement", "")
                        if stmt:
                            content_parts.append(f"• {stmt}")
                    if related:
                        rel_labels = [r.get("label") or r.get("canonical_id", "") for r in related[:6] if r.get("label") or r.get("canonical_id")]
                        if rel_labels:
                            content_parts.append(f"Related: {', '.join(rel_labels)}")

                    content = "\n".join(content_parts)
                    if len(content.strip()) < 20:
                        continue

                    if q:
                        if q.lower() not in (title + " " + content).lower():
                            continue

                    articles.append({
                        "community_id": 0,
                        "title": title,
                        "content": content,
                        "entity_type": entity_type,
                        "aliases": page.get("aliases", []),
                        "sources": page.get("sources", [])[:3],
                        "status": row.get("status"),
                    })
                except Exception:
                    continue

        elif wiki_md_dir.exists():
            # ── Fallback: graphify-out/wiki/*.md ──────────────────────────────
            import re as _re
            _TYPE_LABELS = {
                "Organizations": "ORG", "Countries & Cities": "GPE",
                "Locations": "LOC", "Products & Goods": "PRODUCT",
                "People": "PERSON", "Events": "EVENT",
                "Facilities": "FAC", "Groups & Nationalities": "NORP",
                "Regulations & Laws": "LAW", "Other Entities": "ENTITY",
            }
            for md_file in sorted(wiki_md_dir.glob("*.md")):
                raw = md_file.read_text(encoding="utf-8", errors="replace")
                title_match = _re.search(r"^# (.+)$", raw, _re.MULTILINE)
                title = title_match.group(1).strip() if title_match else md_file.stem
                sections: dict = {}
                for sm in _re.finditer(r"\*\*([^*]+):\*\*\s*(.+)", raw):
                    label = sm.group(1).strip()
                    entities = [e.strip() for e in sm.group(2).split(",") if e.strip()]
                    if label == "Disruption signals":
                        sections["disruptions"] = entities
                    elif label in _TYPE_LABELS:
                        sections[_TYPE_LABELS[label]] = entities
                passages = [p.strip() for p in _re.findall(r"^>\s*(.+)$", raw, _re.MULTILINE) if len(p.strip()) > 20][:6]
                entity_count = sum(len(v) for k, v in sections.items() if k != "disruptions")
                if q:
                    all_text = title + " " + " ".join(passages) + " " + " ".join(e for vals in sections.values() for e in (vals if isinstance(vals, list) else []))
                    if q.lower() not in all_text.lower():
                        continue
                num_match = _re.search(r"\d+", md_file.stem)
                articles.append({
                    "community_id": int(num_match.group()) if num_match else 0,
                    "title": title,
                    "content": "\n".join(passages),
                    "sections": sections,
                    "entity_count": entity_count,
                    "status": row.get("status"),
                })

    return {
        "job_id": job_id,
        "pipeline_status": row.get("status"),
        "article_count": len(articles),
        "articles": articles,
    }


def _derive_corpus_dir(row: dict, job_id: str) -> str:
    """Synchronous helper: derive corpus_dir from a DB row without raising."""
    corpus_path = row.get("corpus_path")
    if corpus_path and Path(corpus_path).is_dir():
        return corpus_path
    graph_path = row.get("graph_path")
    if graph_path:
        gp = Path(graph_path)
        return str(gp.parent if gp.name == "canonical_graph.json" else gp.parent.parent)
    meta = row.get("metadata") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}
    corpus_dir = (meta or {}).get("corpus_dir", "")
    if corpus_dir and Path(corpus_dir).is_dir():
        return corpus_dir
    # Standard convention fallback
    from app.config import get_settings as _gs
    candidate = Path(_gs().corpus_store_path) / job_id
    return str(candidate) if candidate.exists() else ""


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
                "pipeline_steps": progress,
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


# ══════════════════════════════════════════════════════════════════════════════
# Scrape endpoint (Phase 3)
# ══════════════════════════════════════════════════════════════════════════════

class ScrapeRequest(BaseModel):
    url: str
    domain_label: str = "general"
    job_id: str | None = None   # attach to existing corpus job, or omit to create new
    force: bool = False         # skip SHA-256 duplicate check


@router.post("/scrape")
async def scrape_url(req: ScrapeRequest, db: AsyncSession = Depends(get_db)):
    """
    Fetch a URL, extract clean text, save as .txt under the corpus dir,
    then enqueue the full ingest pipeline (or re-embed only if graph exists).
    """
    import hashlib
    import httpx
    from urllib.parse import urlparse

    # ── Fetch page ───────────────────────────────────────────────────────────
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, verify=False) as client:
            resp = await client.get(req.url, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
            raw_html = resp.text
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to fetch URL: {exc}")

    # ── Extract clean text ───────────────────────────────────────────────────
    page_text = _extract_text_from_html(raw_html, req.url)
    if not page_text.strip():
        raise HTTPException(status_code=422, detail="No readable text found at URL")

    # ── SHA-256 duplicate check ──────────────────────────────────────────────
    checksum = hashlib.sha256(page_text.encode("utf-8", errors="ignore")).hexdigest()
    if not req.force:
        dup = await db.execute(text("""
            SELECT job_id FROM ingest_jobs
            WHERE metadata->>'content_checksum' = :cs
            LIMIT 1
        """), {"cs": checksum})
        if dup.mappings().first():
            raise HTTPException(status_code=409,
                detail="Duplicate content (same SHA-256 already ingested). Pass force=true to re-ingest.")

    # ── Resolve / create corpus dir ──────────────────────────────────────────
    if req.job_id:
        row = (await db.execute(
            text("SELECT metadata FROM ingest_jobs WHERE job_id = :id"), {"id": req.job_id}
        )).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="job_id not found")
        meta = row["metadata"] or {}
        if isinstance(meta, str):
            import json as _j; meta = _j.loads(meta)
        corpus_dir = Path(meta.get("corpus_dir") or (Path(settings.corpus_store_path) / req.job_id))
        corpus_dir.mkdir(parents=True, exist_ok=True)
        job_id = req.job_id
    else:
        job_id = str(uuid.uuid4())
        corpus_dir = Path(settings.corpus_store_path) / job_id
        corpus_dir.mkdir(parents=True, exist_ok=True)

    # ── Save text file ───────────────────────────────────────────────────────
    safe_name = urlparse(req.url).netloc.replace(".", "_") + f"_{job_id[:8]}.txt"
    (corpus_dir / safe_name).write_text(page_text, encoding="utf-8")

    # ── Upsert DB job record ─────────────────────────────────────────────────
    meta_payload = json.dumps({
        "corpus_dir": str(corpus_dir),
        "source_url": req.url,
        "content_checksum": checksum,
        "db_creds": {},
    })
    if not req.job_id:
        await db.execute(text("""
            INSERT INTO ingest_jobs (job_id, status, file_count, domain_label, metadata)
            VALUES (:job_id, 'queued', 1, :domain, (:meta)::jsonb)
        """), {"job_id": job_id, "domain": req.domain_label, "meta": meta_payload})
    else:
        await db.execute(text("""
            UPDATE ingest_jobs
            SET status='queued', metadata=metadata || (:meta)::jsonb
            WHERE job_id=:job_id
        """), {"job_id": job_id, "meta": meta_payload})
    await db.commit()

    # ── Dispatch Celery task ─────────────────────────────────────────────────
    try:
        from app.tasks.ingest_task import run_ingest_pipeline
        run_ingest_pipeline.apply_async(args=[job_id], queue="kumar1_ingest")
    except Exception as exc:
        return JSONResponse({"job_id": job_id, "status": "queued", "warning": str(exc)})

    return {"job_id": job_id, "status": "queued", "source_url": req.url, "file": safe_name}


def _extract_text_from_html(html: str, url: str = "") -> str:
    """Extract readable text from HTML. Uses readability-lxml if available, else BeautifulSoup."""
    try:
        from readability import Document
        doc = Document(html)
        clean_html = doc.summary()
        try:
            from bs4 import BeautifulSoup
            return BeautifulSoup(clean_html, "html.parser").get_text(separator=" ", strip=True)
        except ImportError:
            import re
            return re.sub(r"<[^>]+>", " ", clean_html)
    except ImportError:
        pass
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()
        return soup.get_text(separator=" ", strip=True)
    except ImportError:
        import re
        return re.sub(r"<[^>]+>", " ", html)


# ══════════════════════════════════════════════════════════════════════════════
# Graph query API (Phase 4)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/graph/{job_id}")
async def get_graph(job_id: str, db: AsyncSession = Depends(get_db)):
    """Return full knowledge graph (nodes + edges) for a corpus job.
    Reads from canonical_graph.json (pipeline output) with fallback to
    graphify-out/graph.json for backward compatibility.
    """
    corpus_dir = await _resolve_corpus_dir(job_id, db)

    # Try canonical_graph.json first (pipeline output), then graphify-out
    for graph_file in [
        Path(corpus_dir) / "canonical_graph.json",
        Path(corpus_dir) / "graphify-out" / "graph.json",
    ]:
        if graph_file.exists():
            break
    else:
        raise HTTPException(status_code=404, detail="Graph not yet built for this job")

    data = json.loads(graph_file.read_text(encoding="utf-8"))
    raw_nodes = data.get("nodes", data.get("canonical_nodes", []))
    raw_edges = data.get("edges", data.get("canonical_edges", []))

    # Normalize node format: canonical_graph uses canonical_id/entity_type, graphify uses id/type
    nodes = []
    for n in raw_nodes:
        node_id = n.get("canonical_id") or n.get("id", "")
        nodes.append({
            "id": node_id,
            "label": n.get("label", node_id),
            "type": n.get("entity_type") or n.get("ner_label") or n.get("type", "ENTITY"),
            "count": n.get("count", 1),
            "community": n.get("community"),
            "confidence": n.get("confidence"),
            "aliases": n.get("aliases", []),
        })

    # Normalize edge format: canonical uses source_canonical_id/target_canonical_id
    edges = []
    for e in raw_edges:
        edges.append({
            "source": e.get("source_canonical_id") or e.get("source", ""),
            "target": e.get("target_canonical_id") or e.get("target", ""),
            "relation": e.get("relation", "related_to"),
            "weight": e.get("confidence"),
        })

    return {
        "job_id": job_id,
        "node_count": len(nodes),
        "edge_count": len(edges),
        "nodes": nodes,
        "edges": edges,
    }


@router.get("/graph/{job_id}/merged")
async def get_graph_merged(job_id: str, db: AsyncSession = Depends(get_db)):
    """Return a merged per-file knowledge graph for visualization.

    Reads all *_graph.json files from corpus_store/{job_id}/graphs/ and
    merges them into one graph for display.  This is READ-ONLY — it reads
    existing pipeline output files; it never regenerates anything.

    Node IDs are normalised to the node label (lower-cased) so that the
    same entity appearing in multiple files becomes one node.  Edges keep
    their source file as metadata so the UI can colour-code by provenance.
    """
    corpus_dir = await _resolve_corpus_dir(job_id, db)
    graphs_dir = Path(corpus_dir) / "graphs"

    if not graphs_dir.exists():
        # Fallback: return the canonical graph (may have 0 edges)
        return await get_graph(job_id, db)

    merged_nodes: dict[str, dict] = {}   # label_key → node dict
    merged_edges: list[dict] = []
    # Map per-file local node id → merged node key
    local_to_merged: dict[str, dict[str, str]] = {}  # file → {local_id: merged_key}

    for graph_file in sorted(graphs_dir.glob("*_graph.json")):
        file_id = graph_file.name.replace("_graph.json", "")
        try:
            raw = json.loads(graph_file.read_text(encoding="utf-8"))
        except Exception:
            continue

        raw_nodes = raw.get("nodes", [])
        raw_edges = raw.get("edges", [])
        file_map: dict[str, str] = {}

        for n in raw_nodes:
            label = n.get("label", n.get("id", ""))
            if not label:
                continue
            key = label.lower().strip()
            if key not in merged_nodes:
                merged_nodes[key] = {
                    "id": key,
                    "label": label,
                    "type": n.get("entity_type") or n.get("type", "ENTITY"),
                    "count": 0,
                    "files": [],
                    "confidence": n.get("confidence"),
                }
            merged_nodes[key]["count"] += n.get("count", 1)
            if file_id not in merged_nodes[key]["files"]:
                merged_nodes[key]["files"].append(file_id)
            file_map[n.get("id", "")] = key

        local_to_merged[file_id] = file_map

        for e in raw_edges:
            src_key = file_map.get(e.get("source", ""))
            tgt_key = file_map.get(e.get("target", ""))
            if src_key and tgt_key and src_key != tgt_key:
                merged_edges.append({
                    "source": src_key,
                    "target": tgt_key,
                    "relation": e.get("relation", "related_to"),
                    "weight": e.get("confidence"),
                    "file": file_id,
                })

    nodes_list = list(merged_nodes.values())
    # De-duplicate edges (same src+tgt+relation from different files → keep highest confidence)
    seen_edges: dict[str, dict] = {}
    for e in merged_edges:
        k = f"{e['source']}|{e['target']}|{e['relation']}"
        if k not in seen_edges or (e["weight"] or 0) > (seen_edges[k]["weight"] or 0):
            seen_edges[k] = e
    edges_list = list(seen_edges.values())

    return {
        "job_id": job_id,
        "node_count": len(nodes_list),
        "edge_count": len(edges_list),
        "nodes": nodes_list,
        "edges": edges_list,
        "source": "merged_per_file_graphs",
    }
async def get_entities(
    job_id: str,
    type: str = "",
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    """
    Return entity nodes for a corpus job.
    Optional ?type= filters by entity type (organization, person, location, …).
    Combines graphify community nodes + NLP extractor results.
    """
    corpus_dir = await _resolve_corpus_dir(job_id, db)
    result: list[dict] = []

    # ── Canonical graph nodes (primary, pipeline output) ──────────────────────
    for graph_file in [
        Path(corpus_dir) / "canonical_graph.json",
        Path(corpus_dir) / "graphify-out" / "graph.json",
    ]:
        if graph_file.exists():
            data = json.loads(graph_file.read_text(encoding="utf-8"))
            raw_nodes = data.get("nodes", data.get("canonical_nodes", []))
            for node in raw_nodes:
                node_type = node.get("entity_type") or node.get("ner_label") or node.get("type", "ENTITY")
                if type and node_type.lower() != type.lower():
                    continue
                result.append({
                    "text": node.get("label") or node.get("canonical_id") or node.get("id"),
                    "label": node_type.upper(),
                    "type": node_type,
                    "count": node.get("count", 1),
                    "community": node.get("community"),
                    "source": "graph",
                })
            break

    # ── NLP extractor entities ────────────────────────────────────────────────
    nlp_file = Path(corpus_dir) / "nlp_entities.json"
    if nlp_file.exists():
        try:
            nlp_data = json.loads(nlp_file.read_text(encoding="utf-8"))
            seen = {r["text"] for r in result}
            for doc_result in nlp_data:
                for ent in doc_result.get("entities", []):
                    if type and ent.get("type", "").lower() != type.lower():
                        continue
                    if ent["text"] not in seen:
                        seen.add(ent["text"])
                        result.append({**ent, "count": 1, "community": None, "source": "nlp"})
        except Exception:
            pass

    result.sort(key=lambda x: x.get("count", 1), reverse=True)
    return {
        "job_id": job_id,
        "total": len(result),
        "entities": result[:limit],
    }


@router.get("/search/{job_id}")
async def search_corpus(
    job_id: str,
    q: str,
    k: int = 5,
    db: AsyncSession = Depends(get_db),
):
    """
    Semantic chunk search over a corpus's FAISS index.
    Returns top-k matching passages with relevance scores.
    """
    if not q.strip():
        raise HTTPException(status_code=422, detail="Query string ?q= is required")
    corpus_dir = await _resolve_corpus_dir(job_id, db)
    try:
        from app.modules.data_curation.faiss_store import FaissStore
        store = FaissStore(corpus_dir)
        if not store.is_built:
            return {"job_id": job_id, "query": q, "results": [],
                    "message": "FAISS index not yet built for this job"}
        results = store.search(q, k=min(k, 20))
        return {"job_id": job_id, "query": q, "result_count": len(results), "results": results}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Search failed: {exc}")


# ══════════════════════════════════════════════════════════════════════════════
# Retry / Repair endpoints (Phase 5)
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/retry/{job_id}")
async def retry_job(job_id: str, db: AsyncSession = Depends(get_db)):
    """
    If the graph is already built: re-run embed-only (FAISS indexing).
    Otherwise: re-run the full pipeline from source files.
    """
    corpus_dir, domain_label, graph_exists = await _job_meta(job_id, db)
    await db.execute(
        text("UPDATE ingest_jobs SET status='queued', error_message=NULL WHERE job_id=:id"),
        {"id": job_id},
    )
    await db.commit()

    try:
        if graph_exists:
            from app.tasks.ingest_task import reindex_pipeline
            reindex_pipeline.delay(job_id, corpus_dir)
            return {"job_id": job_id, "mode": "reindex_only", "status": "queued"}
        else:
            from app.tasks.ingest_task import run_ingest_pipeline
            run_ingest_pipeline.apply_async(args=[job_id], queue="kumar1_ingest")
            return {"job_id": job_id, "mode": "full_pipeline", "status": "queued"}
    except Exception as exc:
        return JSONResponse({"job_id": job_id, "status": "queued", "warning": str(exc)})


@router.post("/repair/{job_id}")
async def repair_job(job_id: str, db: AsyncSession = Depends(get_db)):
    """Always re-run the full pipeline from source files, regardless of current state."""
    corpus_dir, domain_label, _ = await _job_meta(job_id, db)
    await db.execute(
        text("UPDATE ingest_jobs SET status='queued', error_message=NULL WHERE job_id=:id"),
        {"id": job_id},
    )
    await db.commit()
    try:
        from app.tasks.ingest_task import run_ingest_pipeline
        run_ingest_pipeline.apply_async(args=[job_id], queue="kumar1_ingest")
    except Exception as exc:
        return JSONResponse({"job_id": job_id, "status": "queued", "warning": str(exc)})
    return {"job_id": job_id, "mode": "full_pipeline", "status": "queued"}


@router.delete("/project/{job_id}")
async def delete_project(job_id: str, db: AsyncSession = Depends(get_db)):
    """
    Permanently delete a project and ALL its artifacts:
    documents, knowledge graph, entities, relationships, wiki articles,
    vector embeddings, slm_registry entries, GGUF files in slm_store,
    Ollama models, query_history, and bandit_scores.
    Irreversible.
    """
    import shutil, httpx

    row = (await db.execute(
        text("SELECT job_id FROM ingest_jobs WHERE job_id = :id"),
        {"id": job_id},
    )).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")

    cleanup_errors: list[str] = []

    # 1. Find all SLMs for this corpus BEFORE deleting registry rows
    slm_rows = (await db.execute(
        text("SELECT model_id, ollama_model_name, model_path FROM slm_registry WHERE training_corpus_hash LIKE :p OR training_corpus_hash = :id"),
        {"p": f"{job_id}%", "id": job_id},
    )).mappings().all()
    slm_model_ids = [r["model_id"] for r in slm_rows]

    # 2. Delete corpus directory (documents, graph, wiki, embeddings, faiss, etc.)
    try:
        corpus_dir_str = await _resolve_corpus_dir(job_id, db)
        corpus_dir = Path(corpus_dir_str)
        if corpus_dir.exists():
            shutil.rmtree(str(corpus_dir), ignore_errors=True)
    except Exception:
        pass  # non-fatal if dir not found

    # 3. Delete GGUF/slm_store directories for each SLM
    settings = get_settings()
    slm_store_base = Path(settings.slm_store_path)
    for slm in slm_rows:
        model_id = slm["model_id"]
        model_dir = slm_store_base / model_id
        if model_dir.exists():
            try:
                shutil.rmtree(str(model_dir), ignore_errors=True)
            except Exception as exc:
                cleanup_errors.append(f"slm_store/{model_id}: {exc}")
        # Also try model_path if it differs
        if slm.get("model_path"):
            mp = Path(slm["model_path"])
            if mp.exists() and mp != model_dir:
                try:
                    shutil.rmtree(str(mp), ignore_errors=True)
                except Exception:
                    pass

    # 4. Remove models from Ollama
    for slm in slm_rows:
        name = slm.get("ollama_model_name")
        if not name:
            continue
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.request("DELETE", "http://localhost:11434/api/delete", json={"name": name})
        except Exception as exc:
            cleanup_errors.append(f"ollama_rm/{name}: {exc}")

    # 5. Remove query_history rows for this project
    if slm_model_ids:
        # Delete by slm_used matching any of the deleted SLM model_ids
        placeholders = ",".join(f":mid{i}" for i in range(len(slm_model_ids)))
        params = {f"mid{i}": v for i, v in enumerate(slm_model_ids)}
        try:
            await db.execute(text(f"DELETE FROM query_history WHERE slm_used IN ({placeholders})"), params)
        except Exception:
            pass
    # Also delete any query_history where job_id column matches (if column exists)
    try:
        await db.execute(text("DELETE FROM query_history WHERE job_id = :id"), {"id": job_id})
    except Exception:
        pass

    # 6. Remove bandit_scores for deleted SLMs
    if slm_model_ids:
        try:
            placeholders = ",".join(f":mid{i}" for i in range(len(slm_model_ids)))
            params = {f"mid{i}": v for i, v in enumerate(slm_model_ids)}
            await db.execute(text(f"DELETE FROM bandit_scores WHERE model_id IN ({placeholders})"), params)
        except Exception:
            pass

    # 7. Remove slm_registry rows
    await db.execute(
        text("DELETE FROM slm_registry WHERE training_corpus_hash LIKE :p OR training_corpus_hash = :id"),
        {"p": f"{job_id}%", "id": job_id},
    )
    # 8. Remove ingest_jobs row
    await db.execute(text("DELETE FROM ingest_jobs WHERE job_id = :id"), {"id": job_id})
    await db.commit()
    return {"job_id": job_id, "deleted": True, "slms_removed": slm_model_ids, "cleanup_errors": cleanup_errors}


@router.delete("/project/{job_id}/file/{file_name:path}")
async def delete_project_file(job_id: str, file_name: str, db: AsyncSession = Depends(get_db)):
    """
    Remove a single file from a project.
    Deletes the physical file and updates the file_list in ingest_jobs.
    Does NOT re-run the pipeline — caller should regenerate knowledge.
    """
    row = (await db.execute(
        text("SELECT file_list FROM ingest_jobs WHERE job_id = :id"),
        {"id": job_id},
    )).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        corpus_dir = Path(await _resolve_corpus_dir(job_id, db))
    except Exception:
        raise HTTPException(status_code=404, detail="Corpus directory not found")

    # Delete physical file
    deleted_physical = False
    for candidate in [corpus_dir / file_name, corpus_dir / Path(file_name).name]:
        if candidate.is_file():
            try:
                candidate.unlink()
                deleted_physical = True
            except Exception:
                pass
            break

    # Update file_list in DB
    file_list: list[dict] = row.get("file_list") or []
    if isinstance(file_list, str):
        try:
            file_list = json.loads(file_list)
        except Exception:
            file_list = []
    file_list = [f for f in file_list if isinstance(f, dict) and f.get("name") != file_name]

    await db.execute(
        text("UPDATE ingest_jobs SET file_list = (:fl)::jsonb, file_count = :fc WHERE job_id = :id"),
        {"fl": json.dumps(file_list), "fc": len(file_list), "id": job_id},
    )
    await db.commit()
    return {"job_id": job_id, "file_name": file_name, "deleted_physical": deleted_physical,
            "remaining_files": len(file_list), "regeneration_required": True}


# ── Shared helpers ─────────────────────────────────────────────────────────────

async def _resolve_corpus_dir(job_id: str, db: AsyncSession) -> str:
    row = (await db.execute(
        text("SELECT graph_path, corpus_path, metadata FROM ingest_jobs WHERE job_id = :id"),
        {"id": job_id},
    )).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")

    # 1. Prefer corpus_path column (written by ingest_task since the fix)
    corpus_path = row.get("corpus_path")
    if corpus_path and Path(corpus_path).is_dir():
        return corpus_path

    # 2. Derive from graph_path
    graph_path = row.get("graph_path")
    if graph_path:
        try:
            gp = Path(graph_path)
            if gp.name == "canonical_graph.json":
                candidate = gp.parent
            else:
                candidate = gp.parent.parent
            if candidate.is_dir():
                return str(candidate)
        except (PermissionError, OSError):
            pass  # cross-user path — fall through to other strategies

    # 3. metadata.corpus_dir (written at upload time)
    meta = row.get("metadata") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}
    corpus_dir = meta.get("corpus_dir", "")
    if corpus_dir and Path(corpus_dir).is_dir():
        return corpus_dir

    # 4. Standard convention: corpus_store/{job_id}
    from app.config import get_settings as _gs
    _settings = _gs()
    candidate = Path(_settings.corpus_store_path) / job_id
    if candidate.exists():
        return str(candidate)

    raise HTTPException(status_code=404, detail="Corpus directory not found for this job")


async def _job_meta(job_id: str, db: AsyncSession) -> tuple[str, str, bool]:
    """Return (corpus_dir, domain_label, graph_exists) for a job."""
    row = (await db.execute(
        text("SELECT graph_path, metadata, domain_label, status FROM ingest_jobs WHERE job_id = :id"),
        {"id": job_id},
    )).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    corpus_dir = await _resolve_corpus_dir(job_id, db)
    graph_exists = bool(row.get("graph_path")) or any([
        (Path(corpus_dir) / "canonical_graph.json").exists(),
        (Path(corpus_dir) / "graphify-out" / "graph.json").exists(),
    ])
    return corpus_dir, row.get("domain_label", "general"), graph_exists



@router.get("/wiki/{job_id}/stats")
async def get_wiki_stats(job_id: str, db: AsyncSession = Depends(get_db)):
    """
    Return token counts from the nanoGPT-format train.bin / val.bin files
    that WikiSerializer writes during ingest.
    Also returns article count and whether schema-enriched articles are present.
    """
    row = (await db.execute(
        text("SELECT graph_path, metadata, status FROM ingest_jobs WHERE job_id = :id"),
        {"id": job_id},
    )).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Job not found")

    corpus_dir = _derive_corpus_dir(row, job_id)

    # wiki_pages/*.json (current pipeline output)
    wiki_json_dir = Path(corpus_dir) / "wiki_pages" if corpus_dir else None
    # graphify-out/wiki/*.md (legacy path)
    wiki_md_dir = Path(corpus_dir) / "graphify-out" / "wiki" if corpus_dir else None

    train_tokens = 0
    val_tokens = 0
    total_articles = 0
    schema_articles = 0

    # Count wiki articles from whichever path exists
    if wiki_json_dir and wiki_json_dir.exists():
        all_pages = [f for f in wiki_json_dir.glob("*.json") if f.name != "index.json"]
        total_articles = len(all_pages)
    elif wiki_md_dir and wiki_md_dir.exists():
        all_md = list(wiki_md_dir.glob("*.md"))
        total_articles = len(all_md)
        schema_articles = len([f for f in all_md if f.name.startswith("schema_")])

    out_dir = Path(corpus_dir) / "graphify-out" if corpus_dir else None
    if out_dir and out_dir.exists():
        train_bin = out_dir / "train.bin"
        val_bin = out_dir / "val.bin"
        # uint16 = 2 bytes per token
        if train_bin.exists():
            train_tokens = train_bin.stat().st_size // 2
        if val_bin.exists():
            val_tokens = val_bin.stat().st_size // 2

    return {
        "job_id": job_id,
        "pipeline_status": row.get("status"),
        "train_tokens": train_tokens,
        "val_tokens": val_tokens,
        "total_tokens": train_tokens + val_tokens,
        "vocab_size": 100277,  # cl100k_base actual n_vocab
        "total_articles": total_articles,
        "schema_articles": schema_articles,
        "graphify_articles": total_articles - schema_articles,
    }


@router.post("/sample-corpus")
async def load_sample_corpus(
    domain_label: str = "nanogpt_ml",
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch Karpathy's nanoGPT + minGPT files from GitHub (MIT licensed)
    and run them through the ingest pipeline as a starter demo corpus.
    Returns job_id so the client can track progress normally.
    """
    import aiohttp
    import tempfile
    import os

    SAMPLE_FILES = [
        {
            "url": "https://raw.githubusercontent.com/karpathy/nanoGPT/master/model.py",
            "filename": "nanogpt_model.py",
        },
        {
            "url": "https://raw.githubusercontent.com/karpathy/nanoGPT/master/train.py",
            "filename": "nanogpt_train.py",
        },
        {
            "url": "https://raw.githubusercontent.com/karpathy/minGPT/master/README.md",
            "filename": "minGPT_README.md",
        },
        {
            "url": "https://raw.githubusercontent.com/karpathy/minGPT/master/mingpt/model.py",
            "filename": "minGPT_model.py",
        },
    ]

    job_id = str(uuid.uuid4())
    corpus_dir = str(Path(settings.corpus_store_path) / job_id)
    Path(corpus_dir).mkdir(parents=True, exist_ok=True)

    # Download files
    downloaded = []
    try:
        async with aiohttp.ClientSession() as session:
            for item in SAMPLE_FILES:
                try:
                    async with session.get(item["url"], timeout=aiohttp.ClientTimeout(total=15)) as resp:
                        if resp.status == 200:
                            content = await resp.text()
                            file_path = Path(corpus_dir) / item["filename"]
                            file_path.write_text(content, encoding="utf-8")
                            downloaded.append(item["filename"])
                except Exception:
                    pass  # skip individual file failures
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch sample files: {e}")

    if not downloaded:
        raise HTTPException(status_code=502, detail="Could not download any sample files from GitHub")

    # Insert ingest job record
    await db.execute(
        text("""
            INSERT INTO ingest_jobs
                (job_id, domain_label, status, file_count, progress, metadata, created_at)
            VALUES
                (:job_id, :domain_label, 'queued', :file_count, '{}', :meta, NOW())
        """),
        {
            "job_id": job_id,
            "domain_label": domain_label,
            "file_count": len(downloaded),
            "meta": json.dumps({"corpus_dir": corpus_dir, "sample": True, "files": downloaded}),
        },
    )
    await db.commit()

    # Launch Celery ingest task
    from app.tasks.ingest_task import run_ingest_pipeline
    run_ingest_pipeline.apply_async(args=[job_id], queue="kumar1_ingest")

    return {
        "job_id": job_id,
        "domain_label": domain_label,
        "files_downloaded": downloaded,
        "status": "queued",
    }


# ── Canonical graph endpoint ──────────────────────────────────────────────────

@router.get("/graph/{job_id}/canonical")
async def get_canonical_graph(
    job_id: str,
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(
        text("SELECT job_id FROM ingest_jobs WHERE job_id=:id"),
        {"id": job_id},
    )).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="job not found")

    corpus_dir = f"corpus_store/{job_id}"
    from app.modules.graph.graph_builder import GraphBuilder
    gb = GraphBuilder(corpus_dir)
    canonical = gb.get_canonical_graph()
    return {"job_id": job_id, "canonical_graph": canonical}


@router.get("/ingestion-report/{job_id}")
async def ingestion_report(
    job_id: str,
    db: AsyncSession = Depends(get_db),
):
    import json as _json
    import os as _os
    row = (await db.execute(
        text("SELECT status, progress, entity_count, file_count FROM ingest_jobs WHERE job_id=:id"),
        {"id": job_id},
    )).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="job not found")

    # Use absolute corpus_dir (same resolution as _resolve_corpus_dir)
    try:
        corpus_dir = await _resolve_corpus_dir(job_id, db)
    except HTTPException:
        corpus_dir = str(Path(settings.corpus_store_path) / job_id)

    processed_dir = _os.path.join(corpus_dir, "processed")

    scorecard_files = []
    if _os.path.isdir(processed_dir):
        for fname in _os.listdir(processed_dir):
            if fname.endswith("_kg_scorecard.json"):
                try:
                    with open(_os.path.join(processed_dir, fname), encoding="utf-8") as f:
                        scorecard_files.append({
                            "file_id": fname.replace("_kg_scorecard.json", ""),
                            "scorecard": _json.load(f),
                        })
                except Exception:
                    pass

    from app.modules.kg.entity_resolution import registry_metrics
    reg_metrics = registry_metrics(corpus_dir)

    return {
        "job_id": job_id,
        "status": row[0],
        "pipeline_steps": row[1],
        "entity_count": row[2],
        "file_count": row[3],
        "file_scorecards": scorecard_files,
        "registry_metrics": reg_metrics,
    }


# ── Storage Manager ───────────────────────────────────────────────────────────

@router.get("/storage")
async def storage_overview(db: AsyncSession = Depends(get_db)):
    """Return per-project disk usage: corpus size, GGUF size, Ollama model info."""
    import os as _os

    def _dir_size_bytes(path: str) -> int:
        """Recursive directory size in bytes (safe — returns 0 if missing)."""
        total = 0
        try:
            for dirpath, _, filenames in _os.walk(path):
                for fname in filenames:
                    try:
                        total += _os.path.getsize(_os.path.join(dirpath, fname))
                    except OSError:
                        pass
        except Exception:
            pass
        return total

    # Load all projects
    jobs_result = await db.execute(text("""
        SELECT job_id, project_name, domain_label, file_list, created_at, corpus_path
        FROM ingest_jobs
        ORDER BY created_at DESC
    """))
    jobs = jobs_result.mappings().all()

    # Load all SLMs
    slms_result = await db.execute(text("""
        SELECT model_id, domain_label, training_corpus_hash, ollama_model_name,
               display_name, model_path, created_at, last_used_at
        FROM slm_registry
        ORDER BY created_at DESC
    """))
    slms = slms_result.mappings().all()

    # Build a map: job_id → list of SLMs
    slm_map: dict[str, list[dict]] = {}
    for s in slms:
        key = str(s.get("training_corpus_hash") or "")
        if key not in slm_map:
            slm_map[key] = []
        slm_map[key].append(dict(s))

    slm_store_base = Path(settings.slm_store_path)
    projects = []
    total_corpus_bytes = 0
    total_slm_bytes = 0

    for job in jobs:
        job_id = str(job["job_id"])

        # Corpus size
        corpus_path = str(job.get("corpus_path") or "")
        if not corpus_path:
            try:
                corpus_path = await _resolve_corpus_dir(job_id, db)
            except Exception:
                corpus_path = ""
        corpus_bytes = _dir_size_bytes(corpus_path) if corpus_path else 0
        total_corpus_bytes += corpus_bytes

        # SLMs for this job
        project_slms = slm_map.get(job_id, [])
        slm_details = []
        slm_bytes = 0
        for slm in project_slms:
            mid = str(slm.get("model_id") or "")
            model_dir = slm_store_base / mid
            size = _dir_size_bytes(str(model_dir))
            slm_bytes += size
            slm_details.append({
                "model_id": mid,
                "display_name": slm.get("display_name"),
                "ollama_model_name": slm.get("ollama_model_name"),
                "size_bytes": size,
                "created_at": str(slm.get("created_at") or ""),
                "last_used_at": str(slm.get("last_used_at") or ""),
            })
        total_slm_bytes += slm_bytes

        file_list = job.get("file_list") or []
        if isinstance(file_list, str):
            try:
                import json as _json
                file_list = _json.loads(file_list)
            except Exception:
                file_list = []

        projects.append({
            "job_id": job_id,
            "project_name": job.get("project_name") or job.get("domain_label") or job_id,
            "domain_label": job.get("domain_label") or "",
            "file_count": len(file_list) if isinstance(file_list, list) else 0,
            "corpus_size_bytes": corpus_bytes,
            "slm_size_bytes": slm_bytes,
            "total_size_bytes": corpus_bytes + slm_bytes,
            "slms": slm_details,
            "created_at": str(job.get("created_at") or ""),
        })

    return {
        "projects": projects,
        "totals": {
            "corpus_bytes": total_corpus_bytes,
            "slm_bytes": total_slm_bytes,
            "total_bytes": total_corpus_bytes + total_slm_bytes,
        },
    }
