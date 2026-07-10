"""
SLM registry management routes.
GET  /api/v1/slm/registry — list all registered SLMs
POST /api/v1/slm/build — trigger manual SLM build
POST /api/v1/slm/approve-install — approve Ollama deployment after review
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.modules.slm_factory.slm_registry import SLMRegistry
from app.adapters.registry import get_adapter_registry
from app.config import get_settings

settings = get_settings()
router = APIRouter(prefix="/slm", tags=["slm"])


class BuildRequest(BaseModel):
    domain_label: str
    coverage_topics: list[str] = Field(default_factory=list)
    corpus_hash: str = ""
    trigger_query: str = ""
    quick_rebuild: bool = False            # reuse existing QA pairs, skip teacher synthesis
    # SLM Studio configurable fields
    teacher_model: str | None = None       # override default teacher (e.g. "mistral:latest")
    advisor_model: str | None = None       # optional advisor for critique pass
    student_model: str | None = None       # override auto-selection (e.g. "SmolLM2-1.7B")
    qa_pairs_target: int | None = None     # target Q&A pairs (3000–15000)
    lora_r: int | None = None              # LoRA rank (4–64)
    lora_alpha: int | None = None          # LoRA alpha
    num_epochs: int | None = None          # training epochs (1–10)
    learning_rate: float | None = None     # e.g. 2e-4
    curriculum_stages: int | None = None   # multi-stage curriculum steps (1–5)


class ApproveInstallRequest(BaseModel):
    model_id: str
    display_name: str | None = None       # optional friendly label


class SetDisplayNameRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=200)


@router.patch("/registry/{model_id}/display-name")
async def set_display_name(
    model_id: str,
    request: SetDisplayNameRequest,
    db: AsyncSession = Depends(get_db),
):
    """Set or update the user-friendly display name for an SLM."""
    from sqlalchemy import text
    result = await db.execute(
        text("UPDATE slm_registry SET display_name = :dn WHERE model_id = :mid RETURNING model_id"),
        {"dn": request.display_name, "mid": model_id},
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail=f"SLM {model_id} not found")
    await db.commit()
    return {"model_id": model_id, "display_name": request.display_name}


@router.get("/registry")
async def list_registry(db: AsyncSession = Depends(get_db)):
    registry = SLMRegistry(db)
    records = await registry.list_all()
    return {"slms": records, "count": len(records)}


@router.post("/build")
async def trigger_build(request: BuildRequest, db: AsyncSession = Depends(get_db)):
    """Queue an SLM build via Celery. Skips if same corpus already built (dedup).

    Uses a Redis distributed lock on corpus_hash to prevent duplicate builds
    from concurrent requests (race condition: two simultaneous POSTs would both
    pass the 'exists' check before either task is queued).
    """
    try:
        registry = SLMRegistry(db)

        # ── Deduplication: skip full build if SLM already exists for this corpus ──
        if request.corpus_hash and not request.quick_rebuild:
            existing = await registry.find_by_corpus_hash(request.corpus_hash)
            if existing:
                return {
                    "status": "exists",
                    "model_id": existing["model_id"],
                    "ollama_model_name": existing.get("ollama_model_name"),
                    "model_path": existing.get("model_path"),
                    "task_id": None,
                }

        # ── Distributed lock: prevent two concurrent builds for the same corpus ──
        _lock_key = f"slm_build_lock:{request.corpus_hash or request.domain_label}"
        _lock_acquired = False
        try:
            import redis as _redis
            _rc = _redis.Redis()
            # NX=only-if-not-exists, EX=expire after 30min (safety release)
            _lock_acquired = bool(_rc.set(_lock_key, "1", nx=True, ex=1800))
            if not _lock_acquired:
                # Another request is already building — return the in-progress status
                return {
                    "status": "building",
                    "task_id": None,
                    "message": "Build already in progress for this corpus",
                }
        except Exception:
            pass  # Redis unavailable — proceed without lock (degrad gracefully)

        # ── Quick rebuild: locate cached QA pairs from prior build ────
        qa_pairs_path: str | None = None
        if request.quick_rebuild and request.corpus_hash:
            prior = await registry.find_by_corpus_hash(request.corpus_hash)
            if prior and prior.get("model_path"):
                from pathlib import Path as _Path
                candidate = _Path(prior["model_path"]) / "train.jsonl"
                if candidate.exists():
                    qa_pairs_path = str(candidate)

        from app.tasks.slm_build_task import run_slm_build
        slm_config = {
            "teacher_model":     request.teacher_model,
            "advisor_model":     request.advisor_model,
            "student_model":     request.student_model,
            "qa_pairs_target":   request.qa_pairs_target,
            "lora_r":            request.lora_r,
            "lora_alpha":        request.lora_alpha,
            "num_epochs":        request.num_epochs,
            "learning_rate":     request.learning_rate,
            "curriculum_stages": request.curriculum_stages,
        }
        job = run_slm_build.apply_async(args=[
            request.domain_label,
            request.coverage_topics,
            request.corpus_hash,
            request.trigger_query,
            slm_config,
            qa_pairs_path,
        ], queue="kumar1_ingest")
        return {
            "task_id": job.id,
            "status": "queued",
            "quick_rebuild": request.quick_rebuild,
            "qa_pairs_reused": qa_pairs_path is not None,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))



@router.get("/for-corpus")
async def slm_for_corpus(job_id: str, db: AsyncSession = Depends(get_db)):
    """Return the most recent SLM built for a corpus (by job_id), or not-found."""
    registry = SLMRegistry(db)
    record = await registry.find_by_corpus_hash(job_id)
    if record:
        return {
            "exists": True,
            "model_id": record["model_id"],
            "domain_label": record["domain_label"],
            "ollama_model_name": record.get("ollama_model_name"),
            "model_path": record.get("model_path"),
            "val_loss": record.get("val_loss"),
        }
    return {"exists": False}


@router.post("/approve-install")
async def approve_install(request: ApproveInstallRequest, db: AsyncSession = Depends(get_db)):
    """
    After user reviews the SLM, approve deployment to Ollama.
    Triggers `ollama create` with the stored Modelfile.
    """
    registry = SLMRegistry(db)
    record = await registry.get(request.model_id)
    if not record:
        raise HTTPException(status_code=404, detail="SLM not found")

    adapter_registry = get_adapter_registry()
    adapter = adapter_registry.get_ollama()
    if not await adapter.is_available():
        raise HTTPException(status_code=503, detail="Ollama not available")

    from pathlib import Path
    from app.modules.slm_factory.slm_store import SLMStore
    store = SLMStore(settings.slm_store_path)
    modelfile_path = Path(store.model_dir(request.model_id)) / "Modelfile"

    if not modelfile_path.exists():
        raise HTTPException(status_code=404, detail="Modelfile not found")

    try:
        await adapter.create_model(request.model_id, str(modelfile_path))
        # Persist display_name if provided at approval time
        if request.display_name:
            from sqlalchemy import text as _t
            await db.execute(
                _t("UPDATE slm_registry SET display_name = :dn WHERE model_id = :mid"),
                {"dn": request.display_name, "mid": request.model_id},
            )
            await db.commit()
        return {"status": "deployed", "model_id": request.model_id, "ollama_name": request.model_id}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/status")
async def slm_status(
    domain_label: str,
    task_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Return build status for the most recent SLM in a domain."""
    registry = SLMRegistry(db)
    records = await registry.list_all()
    domain_records = [r for r in records if r.get("domain_label") == domain_label]
    if domain_records:
        latest = sorted(domain_records, key=lambda r: str(r.get("created_at") or ""), reverse=True)[0]
        return {"status": "done", "model_id": latest.get("model_id"), "domain_label": domain_label}
    # Check Celery task state if task_id supplied
    if task_id:
        try:
            from app.tasks import celery_app
            result = celery_app.AsyncResult(task_id)
            if result.state == "FAILURE":
                return {"status": "failed", "model_id": None, "domain_label": domain_label}
            if result.state in ("PENDING", "STARTED", "RETRY"):
                # Try to fetch granular progress from Redis
                progress = None
                try:
                    import redis as _r, json as _j
                    _rc = _r.Redis()
                    raw = _rc.get(f"slm_build_progress:{task_id}") or _rc.get(f"slm_build_progress:{domain_label}")
                    if raw:
                        progress = _j.loads(raw)
                except Exception:
                    pass
                return {"status": "building", "model_id": None, "domain_label": domain_label, "progress": progress}
        except Exception:
            pass
    return {"status": "none", "model_id": None, "domain_label": domain_label}


@router.get("/suggestions")
async def slm_suggestions(
    domain_label: str,
    job_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Return 10 rich suggestion objects for the domain, powered by SLM or fallback templates.
    Each suggestion: {"label": str, "desc": str, "prompt": str}
    Suggestions are grounded in the actual uploaded corpus via canonical graph + ontology.
    Results are cached in Redis for 2 hours to avoid repeated Ollama calls.
    """
    import json as _json

    # ── Redis cache check ──────────────────────────────────────────────────────
    _cache_key = f"suggestions:{domain_label}:{job_id or 'nodomain'}"
    try:
        import redis as _redis
        _rc = _redis.Redis()
        _cached = _rc.get(_cache_key)
        if _cached:
            return _json.loads(_cached)
    except Exception:
        _rc = None

    # ── Build rich corpus context from canonical graph + ontology + files ──────
    corpus_context = ""
    if job_id:
        try:
            from sqlalchemy import text as _t
            from pathlib import Path as _P

            row = (await db.execute(
                _t("SELECT graph_path, corpus_path, metadata FROM ingest_jobs WHERE job_id = :id"),
                {"id": job_id},
            )).mappings().first()

            corpus_dir = ""
            if row:
                corpus_dir = row.get("corpus_path") or ""
                if not corpus_dir and row.get("graph_path"):
                    gp = _P(row["graph_path"])
                    corpus_dir = str(gp.parent if gp.name == "canonical_graph.json" else gp.parent.parent)
                if not corpus_dir and row.get("metadata"):
                    meta = row["metadata"]
                    if isinstance(meta, str):
                        meta = _json.loads(meta)
                    corpus_dir = (meta or {}).get("corpus_dir") or ""
                if not corpus_dir:
                    from app.config import get_settings as _gs2
                    _cand = _P(_gs2().corpus_store_path) / job_id
                    if _cand.exists():
                        corpus_dir = str(_cand)

            if corpus_dir:
                context_parts: list[str] = []

                # 1. Ontology: entity types present in this corpus
                ont_path = _P(corpus_dir) / "ontology.json"
                if ont_path.exists():
                    try:
                        ont = _json.loads(ont_path.read_text(encoding="utf-8"))
                        types = [t for t in (ont.get("entity_types") or [])
                                 if t.upper() not in {"CARDINAL","ORDINAL","QUANTITY","DATE","MONEY","PERCENT","TIME","VALUE"}]
                        if types:
                            context_parts.append(f"Domain entity types: {', '.join(types[:8])}")
                    except Exception:
                        pass

                # 2. Canonical graph: top business entities (ORG, PERSON, PRODUCT, GPE, EVENT)
                PRIORITY_TYPES = {
                    "organization","org","person","product","gpe","event",
                    "law","group","norp","facility","fac","location","loc",
                }
                SKIP_PATTERNS = {"=", "_", "#", "@"}
                cg_path = _P(corpus_dir) / "canonical_graph.json"
                if cg_path.exists():
                    try:
                        g = _json.loads(cg_path.read_text(encoding="utf-8"))
                        nodes = g.get("nodes", g.get("canonical_nodes", []))
                        good = [
                            n for n in nodes
                            if n.get("entity_type", "").lower() in PRIORITY_TYPES
                            and n.get("label")
                            and len(n.get("label", "")) > 2
                            and not any(c in n.get("label", "") for c in SKIP_PATTERNS)
                            and not n.get("label", "").replace(".", "").replace(",", "").replace(" ", "").isdigit()
                        ]
                        good.sort(key=lambda n: n.get("confidence", 0), reverse=True)
                        top_entities = [n["label"] for n in good[:10]]
                        if top_entities:
                            context_parts.append(f"Key entities: {', '.join(top_entities)}")
                    except Exception:
                        pass

                # 3. Source document names (from corpus_dir files)
                SKIP_EXTS = {".json", ".faiss", ".pkl", ".bin", ".idx", ".csv_bad"}
                try:
                    source_files = sorted([
                        fp.stem.replace("_", " ").replace("-", " ").title()
                        for fp in _P(corpus_dir).iterdir()
                        if fp.is_file()
                        and fp.suffix.lower() not in SKIP_EXTS
                        and len(fp.stem) > 2
                    ])[:5]
                    if source_files:
                        context_parts.append(f"Uploaded documents: {', '.join(source_files)}")
                except Exception:
                    pass

                # 4. QA pair samples from train.jsonl (if SLM was built)
                try:
                    from app.config import get_settings as _gs3
                    _st = _gs3()
                    _slm_dir = _P(_st.slm_store_path)
                    if _slm_dir.exists():
                        for _mdir in sorted(_slm_dir.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
                            _tjsonl = _mdir / "train.jsonl"
                            if _tjsonl.exists():
                                _meta_f = _mdir / "metadata.json"
                                if _meta_f.exists():
                                    _m = _json.loads(_meta_f.read_text())
                                    if _m.get("domain_label") == domain_label:
                                        _pairs: list[str] = []
                                        with open(_tjsonl, encoding="utf-8") as _f:
                                            for _line in _f:
                                                _line = _line.strip()
                                                if _line and len(_pairs) < 3:
                                                    _obj = _json.loads(_line)
                                                    _msgs = _obj.get("messages", [])
                                                    _q = next((x["content"] for x in _msgs if x.get("role") == "user"), "")
                                                    if _q and len(_q) > 10:
                                                        _pairs.append(_q[:80])
                                        if _pairs:
                                            context_parts.append(f"Sample questions from corpus: {'; '.join(_pairs)}")
                                        break
                except Exception:
                    pass

                corpus_context = ". ".join(context_parts)
        except Exception:
            pass

    # ── Try SLM (trained Ollama model for this domain) ─────────────────────────
    # The domain SLM generates prompt suggestions that are optimised for the
    # SLM-first execution architecture — each suggestion becomes a direct
    # input to the blueprint planning step, minimising frontier model usage.
    registry = SLMRegistry(db)
    records = await registry.list_all()
    domain_records = [r for r in records if r.get("domain_label") == domain_label]
    if domain_records:
        latest = sorted(domain_records, key=lambda r: str(r.get("created_at") or ""), reverse=True)[0]
        ollama_model = latest.get("ollama_model_name")
        if ollama_model:
            try:
                adapter_registry = get_adapter_registry()
                ollama = adapter_registry.get_ollama()
                if await ollama.is_available():
                    context_line = f" {corpus_context}." if corpus_context else ""
                    prompt = (
                        f'You are an expert analyst and planning engine for the "{domain_label}" domain.{context_line} '
                        f'Generate exactly 10 specific, actionable analysis prompts a user can send to the domain AI. '
                        "Each prompt must be self-contained, grounded in the corpus described above, and optimised to "
                        "produce a high-quality response when processed as an execution blueprint by a domain SLM. "
                        "Return ONLY a valid JSON array of exactly 10 objects with keys: "
                        '"label" (5-7 word title specific to this corpus), '
                        '"desc" (one sentence: what insight this analysis unlocks from THIS data), '
                        '"prompt" (2-3 sentence, fully self-contained query ready to send as-is — no placeholders). '
                        'No markdown, no explanation, no text outside the JSON array.'
                    )
                    raw = await ollama.generate(ollama_model, prompt, stream=False, max_tokens=1024)
                    start = raw.find("[")
                    end = raw.rfind("]") + 1
                    if start != -1 and end > start:
                        parsed = _json.loads(raw[start:end])
                        if isinstance(parsed, list) and len(parsed) >= 3:
                            suggestions = []
                            for item in parsed[:10]:
                                if isinstance(item, dict) and item.get("label") and item.get("prompt"):
                                    suggestions.append({
                                        "label":  str(item["label"])[:80],
                                        "desc":   str(item.get("desc", ""))[:200],
                                        "prompt": str(item["prompt"])[:600],
                                    })
                                elif isinstance(item, str) and item.strip():
                                    words = item.strip().split()
                                    suggestions.append({
                                        "label":  " ".join(words[:6]),
                                        "desc":   item[:200],
                                        "prompt": item,
                                    })
                            if len(suggestions) >= 3:
                                result = {"suggestions": suggestions, "source": "slm", "model_id": ollama_model}
                                try:
                                    if _rc:
                                        _rc.setex(_cache_key, 7200, _json.dumps(result))
                                except Exception:
                                    pass
                                return result
            except Exception:
                pass

    # ── Fallback: domain-aware templates with corpus context ──────────────────
    d = domain_label.replace("-", " ").replace("_", " ")
    ctx = f" ({corpus_context})" if corpus_context else ""
    fallback = [
        {"label": f"Key trends in {d[:20]}",         "desc": f"Discover dominant patterns and trends across the {d} dataset.",                          "prompt": f"Analyze the key trends and patterns in the {d} data. Identify what is increasing, decreasing, or changing over time. Explain the significance of each trend and what it means for decision-making."},
        {"label": "Anomaly & outlier detection",      "desc": f"Flag unusual values and statistical outliers that warrant attention in {d}.",             "prompt": f"Scan the {d} dataset for anomalies, outliers, and unexpected values. For each anomaly found, explain what it is, why it is unusual, and what action should be taken."},
        {"label": "Top performance drivers",          "desc": f"Identify which factors most strongly influence performance in {d}.",                       "prompt": f"Identify the top 5 performance drivers in the {d} data{ctx}. For each driver, quantify its impact and explain how it can be optimized or leveraged for better outcomes."},
        {"label": "Risk factor analysis",             "desc": f"Surface hidden risks and vulnerabilities present in the {d} corpus.",                      "prompt": f"Analyze the {d} corpus{ctx} and identify the main risk factors. For each risk, assess its likelihood, potential impact, and recommend a mitigation strategy."},
        {"label": "Build predictive dashboard",       "desc": f"Create an AI-powered dashboard that forecasts future {d} outcomes.",                       "prompt": f"Design and describe an AI-powered analytics dashboard for {d}{ctx}. Specify the key KPIs to track, the predictive models to use, and how the dashboard should alert users to emerging trends or risks."},
        {"label": "Actionable insight summary",       "desc": f"Condense the most valuable findings from the {d} corpus into executive-ready insights.",   "prompt": f"Summarize the most important actionable insights from the {d} data{ctx}. Present each insight with supporting evidence, business implication, and a recommended next step. Format for an executive audience."},
        {"label": "Process improvement roadmap",      "desc": f"Design a step-by-step improvement plan based on {d} findings.",                            "prompt": f"Based on the {d} data{ctx}, design a practical process improvement roadmap. Identify the 3-5 highest-impact improvement opportunities, prioritize them, and outline concrete implementation steps for each."},
        {"label": "Comparative benchmarking",         "desc": f"Compare performance segments, time periods, or categories within {d}.",                    "prompt": f"Perform a comparative analysis of the {d} dataset{ctx}. Identify the best and worst performing segments, compare them across key metrics, and explain what separates top performers from the rest."},
        {"label": "Compliance & gap audit",           "desc": f"Check {d} data against policies, standards, or regulatory requirements.",                  "prompt": f"Audit the {d} corpus{ctx} against relevant policies, standards, or compliance requirements. Identify gaps, non-conformances, and areas of risk. Provide a prioritized remediation plan."},
        {"label": "Strategic recommendation report",  "desc": f"Generate a board-level strategic report grounded in the {d} evidence.",                    "prompt": f"Generate a strategic recommendation report from the {d} data{ctx}. Include an executive summary, 3-5 key findings with evidence, strategic implications, and a prioritized list of recommended actions for leadership."},
    ]
    result = {"suggestions": fallback, "source": "fallback"}
    try:
        if _rc and corpus_context:
            # Cache fallback for 30 min (shorter than slm since it's less personalised)
            _rc.setex(_cache_key, 1800, _json.dumps(result))
    except Exception:
        pass
    return result


@router.delete("/suggestions/cache")
async def clear_suggestions_cache(domain_label: str | None = None, job_id: str | None = None):
    """Clear cached suggestions so they regenerate on next request.
    Call this after a new corpus is ingested or a new SLM is built.
    """
    try:
        import redis as _redis
        r = _redis.Redis()
        if domain_label or job_id:
            pattern = f"suggestions:{domain_label or '*'}:{job_id or '*'}"
            keys = r.keys(pattern)
        else:
            keys = r.keys("suggestions:*")
        if keys:
            r.delete(*keys)
        return {"cleared": len(keys)}
    except Exception as exc:
        return {"cleared": 0, "error": str(exc)}


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    """Aggregate stats used by dashboard."""
    registry = SLMRegistry(db)
    records = await registry.list_all()
    total_queries = sum(getattr(r, "query_count", 0) for r in records)
    return {
        "active_slms": len(records),
        "tokens_saved": total_queries * 120,  # rough estimate
        "files_ingested": 0,
        "cost_saved": round(total_queries * 0.002, 2),
    }


@router.get("/learning-progress")
async def learning_progress(db: AsyncSession = Depends(get_db)):
    """Return per-model bandit learning progress for dashboard visualization."""
    import json
    from pathlib import Path

    registry = SLMRegistry(db)
    records = await registry.list_all()

    result = []
    bandit_path = Path(settings.slm_store_path) / "bandit_state.json"
    bandit_data: dict = {}
    if bandit_path.exists():
        try:
            bandit_data = json.loads(bandit_path.read_text())
        except Exception:
            pass

    for r in records:
        # list_all() returns list[dict] — use .get(), not getattr()
        model_id = r.get("model_id") or "unknown"
        query_count = r.get("query_count") or 0
        hallucination_rate = r.get("hallucination_rate") or 0.0
        val_loss = r.get("val_loss")
        task_completion_rate = r.get("task_completion_rate") or 0.85

        # Bandit convergence check: if arm exists in bandit state
        arm = bandit_data.get(model_id, {})
        converged = False
        if arm and query_count > 20:
            # Heuristic: b-vector norm growth rate slows at convergence
            converged = query_count > 50

        accuracy = round((1.0 - hallucination_rate) * 100, 1)
        reward = round(0.50 * task_completion_rate + 0.35 * (1.0 - hallucination_rate) + 0.15 * 0.9, 3)

        result.append({
            "model_id": model_id,
            "query_count": query_count,
            "accuracy_pct": accuracy,
            "val_loss": val_loss,
            "task_completion_rate": task_completion_rate,
            "hallucination_rate": hallucination_rate,
            "reward": reward,
            "converged": converged,
        })

    # Overall summary
    total_queries = sum(r["query_count"] for r in result)
    avg_accuracy = round(sum(r["accuracy_pct"] for r in result) / max(len(result), 1), 1)
    any_converged = any(r["converged"] for r in result)

    return {
        "models": result,
        "summary": {
            "total_queries": total_queries,
            "avg_accuracy_pct": avg_accuracy,
            "any_converged": any_converged,
            "active_models": len(result),
        },
    }


@router.get("/workers/health")
async def workers_health():
    """Return Celery worker health: active workers, queue depths, and task states.

    Used to surface worker status in the dashboard and alert if workers are down.
    Polling this endpoint every 30s gives early warning of Celery failures.
    """
    import redis as _redis, json as _json
    try:
        r = _redis.Redis()
        r.ping()
        redis_ok = True
    except Exception as exc:
        return {"status": "degraded", "error": f"Redis unavailable: {exc}",
                "workers": [], "queue_depth": None}

    # Queue depths (tasks waiting to be picked up)
    try:
        queue_depth = r.llen("kumar1_ingest")
    except Exception:
        queue_depth = None

    # Active/reserved tasks via Celery inspect (non-blocking, 2s timeout)
    workers = []
    try:
        from app.tasks import celery_app
        inspect = celery_app.control.inspect(timeout=2.0, destination=None)
        active   = inspect.active()  or {}
        reserved = inspect.reserved() or {}
        ping     = inspect.ping()    or {}
        for worker_name in set(list(active.keys()) + list(ping.keys())):
            workers.append({
                "name":        worker_name,
                "online":      worker_name in ping,
                "active_tasks":   len(active.get(worker_name, [])),
                "reserved_tasks": len(reserved.get(worker_name, [])),
            })
    except Exception as exc:
        workers = [{"error": str(exc)}]

    # Last SLM build progress from Redis
    build_progress = {}
    try:
        for key in r.keys("slm_build_progress:*"):
            raw = r.get(key)
            if raw:
                build_progress[key.decode()] = _json.loads(raw)
    except Exception:
        pass

    our_workers = [w for w in workers if "kumar1" in w.get("name", "")]
    status = "ok" if any(w.get("online") for w in our_workers) else "no_workers"

    return {
        "status": status,
        "redis_ok": redis_ok,
        "queue_depth": queue_depth,
        "workers": our_workers or workers,
        "active_builds": build_progress,
    }
