"""
Celery task: build a domain SLM from scratch.
"""
import asyncio
import logging
from pathlib import Path

from app.tasks import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="run_slm_build", bind=True, max_retries=1)
def run_slm_build(
    self,
    domain_label: str,
    coverage_topics: list,
    corpus_hash: str,
    trigger_query: str,
    slm_config: dict | None = None,
    qa_pairs_path: str | None = None,
):
    asyncio.run(_build(domain_label, coverage_topics, corpus_hash, trigger_query, slm_config or {}, qa_pairs_path, task_id=self.request.id))


async def _load_wiki_articles(corpus_hash: str, db_factory, corpus_store_path: str) -> list[dict]:
    """Load wiki articles from wiki_pages/*.json for the given corpus."""
    import json as _json
    from sqlalchemy import text as _text

    SKIP_TYPES = {t.lower() for t in {
        "CARDINAL", "ORDINAL", "QUANTITY", "DATE", "MONEY", "PERCENT", "value", "TIME"
    }}
    # Cap at 400 articles to keep distillation under ~45 minutes.
    # Prefer entity-type diversity: collect up to 40 per type so the teacher
    # sees a representative cross-section of the corpus.
    MAX_ARTICLES = 400
    MAX_PER_TYPE = 40
    articles: list[dict] = []

    try:
        async with db_factory() as lookup_db:
            row = (await lookup_db.execute(
                _text("SELECT corpus_path, graph_path, metadata FROM ingest_jobs WHERE job_id = :id"),
                {"id": corpus_hash},
            )).mappings().first()

        corpus_dir = ""
        if row:
            corpus_dir = row.get("corpus_path") or ""
            if not corpus_dir and row.get("graph_path"):
                gp = Path(row["graph_path"])
                corpus_dir = str(gp.parent if gp.name == "canonical_graph.json" else gp.parent.parent)
            if not corpus_dir:
                meta = row.get("metadata") or {}
                if isinstance(meta, str):
                    meta = _json.loads(meta)
                corpus_dir = (meta or {}).get("corpus_dir", "")

        # Standard fallback: corpus_store/{corpus_hash}
        if not corpus_dir or not Path(corpus_dir).is_dir():
            candidate = Path(corpus_store_path) / corpus_hash
            if candidate.exists():
                corpus_dir = str(candidate)

        if not corpus_dir or not Path(corpus_dir).is_dir():
            logger.warning("SLM build: corpus_dir not found for corpus_hash=%s", corpus_hash)
            return articles

        wiki_dir = Path(corpus_dir) / "wiki_pages"
        if not wiki_dir.exists():
            logger.warning("SLM build: wiki_pages dir not found at %s", wiki_dir)
            return articles

        for jf in sorted(wiki_dir.glob("*.json")):
            if jf.name == "index.json":
                continue
            try:
                page = _json.loads(jf.read_text(encoding="utf-8"))
                entity_type = page.get("entity_type", "")
                if entity_type.lower() in SKIP_TYPES:
                    continue
                title = page.get("title") or page.get("canonical_id", "")
                if not title or title.replace(".", "").replace(",", "").replace(" ", "").isdigit():
                    continue
                summary = page.get("summary", "")
                key_facts = page.get("key_facts", [])
                related = page.get("related_entities", [])

                content_parts = [summary] if summary else []
                for fact in key_facts[:15]:
                    stmt = fact.get("statement", "")
                    if stmt:
                        content_parts.append(f"• {stmt}")
                if related:
                    rel_labels = [r.get("label") or r.get("canonical_id", "") for r in related[:8] if r.get("label") or r.get("canonical_id")]
                    if rel_labels:
                        content_parts.append(f"Related entities: {', '.join(rel_labels)}")

                content = "\n".join(content_parts)
                if len(content.strip()) < 30:
                    continue

                articles.append({"title": title, "content": content, "_type": entity_type})
            except Exception:
                continue

        # Enforce diversity cap: keep up to MAX_PER_TYPE per entity type,
        # then trim to MAX_ARTICLES total.
        from collections import defaultdict as _dd
        type_counts: dict = _dd(int)
        capped: list[dict] = []
        for art in articles:
            et = art.pop("_type", "")
            if type_counts[et] < MAX_PER_TYPE:
                capped.append(art)
                type_counts[et] += 1
            if len(capped) >= MAX_ARTICLES:
                break
        articles = capped

    except Exception as exc:
        logger.warning("SLM build: failed to load wiki articles: %s", exc)

    logger.info("SLM build: loaded %d wiki articles from %s", len(articles), corpus_hash[:8])
    return articles


async def _build(domain_label: str, coverage_topics: list, corpus_hash: str, trigger_query: str, slm_config: dict, qa_pairs_path: str | None = None, task_id: str | None = None):
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy.pool import NullPool
    from app.config import get_settings
    from app.adapters.registry import get_adapter_registry
    from app.modules.slm_factory.slm_registry import SLMRegistry
    from app.modules.slm_factory.slm_store import SLMStore

    settings = get_settings()
    _task_engine = create_async_engine(
        settings.database_url,
        echo=False,
        poolclass=NullPool,
    )
    async_session_factory = async_sessionmaker(
        _task_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    # ── B1 FIX: Ensure corpus_hash is always a valid job_id ───────────────────
    # If the frontend sent an empty corpus_hash, look up the most recent completed
    # ingest job for this domain so that training_corpus_hash is always set in the
    # registry.  This makes deduplication (find_by_corpus_hash) work correctly.
    if not corpus_hash or corpus_hash.startswith("sha256:"):
        try:
            from sqlalchemy import text as _text
            async with async_session_factory() as _lookup_db:
                _row = (await _lookup_db.execute(
                    _text("""
                        SELECT job_id FROM ingest_jobs
                        WHERE domain_label = :domain AND status = 'graph_done'
                        ORDER BY created_at DESC LIMIT 1
                    """),
                    {"domain": domain_label},
                )).fetchone()
                if _row:
                    corpus_hash = str(_row[0])
                    logger.info(
                        "SLM build: corpus_hash was empty/fake — resolved to %s via domain '%s'",
                        corpus_hash[:8], domain_label,
                    )
                else:
                    logger.warning(
                        "SLM build: no completed ingest job found for domain '%s'; corpus_hash stays empty",
                        domain_label,
                    )
        except Exception as _exc:
            logger.warning("SLM build: corpus_hash lookup failed: %s", _exc)

    from app.modules.slm_factory.slm_builder import SLMBuilder

    registry = get_adapter_registry()

    # Load wiki articles from the corpus so teacher distillation has grounded content
    wiki_articles = await _load_wiki_articles(corpus_hash, async_session_factory, settings.corpus_store_path)

    # Generate real domain embedding from nomic-embed-text (768 dims) via Ollama.
    # nomic-embed-text always returns 768-dim vectors; the DB column is VECTOR(768).
    # settings.embedding_dim=1536 is for future models — normalise to 768 here.
    EMBED_DIM = 768
    embed = [0.0] * EMBED_DIM
    try:
        import aiohttp as _aiohttp
        async with _aiohttp.ClientSession() as _sess:
            async with _sess.post(
                f"{settings.ollama_base_url}/api/embeddings",
                json={"model": "nomic-embed-text", "prompt": f"{domain_label} {trigger_query}"},
                timeout=_aiohttp.ClientTimeout(total=15),
            ) as _resp:
                if _resp.status == 200:
                    _data = await _resp.json()
                    raw_embed = _data.get("embedding", [])
                    if raw_embed:
                        embed = raw_embed[:EMBED_DIM]
                        if len(embed) < EMBED_DIM:
                            embed = embed + [0.0] * (EMBED_DIM - len(embed))
                        logger.info("SLM build: got real %d-dim embedding from nomic-embed-text", len(embed))
    except Exception as exc:
        logger.warning("SLM build: nomic-embed-text failed (%s), using zero vector", exc)

    import time as _time
    _build_started_at = _time.time()

    # ── Derive coverage_topics from wiki article titles if passed-in topics are NER types ──
    # NER type names (organization, person, product, etc.) produce zero token-overlap in the
    # coverage checker, so every query triggers BUILD_NEW. Use wiki article titles instead.
    _NER_TYPES = {
        "cardinal", "ordinal", "quantity", "date", "money", "percent", "value", "time",
        "organization", "org", "person", "per", "gpe", "loc", "fac", "norp", "event",
        "product", "work_of_art", "law", "language", "group", "location",
    }
    _passed_topics_lower = {t.lower() for t in coverage_topics}
    _is_all_ner_types = bool(_passed_topics_lower) and _passed_topics_lower.issubset(_NER_TYPES)

    if not coverage_topics or _is_all_ner_types:
        # Build coverage_topics from wiki article titles (meaningful domain terms)
        coverage_topics = [
            a.get("title", "")
            for a in wiki_articles
            if a.get("title") and len(a.get("title", "")) > 2
        ][:30]
        logger.info("SLM build: derived %d coverage_topics from wiki titles (NER types replaced)", len(coverage_topics))

    async with async_session_factory() as db:
        slm_registry = SLMRegistry(db)
        slm_store = SLMStore(settings.slm_store_path)
        builder = SLMBuilder(slm_registry, registry, slm_store, settings.slm_store_path)

        async for event in builder.build(
            domain_label=domain_label,
            qa_pairs_path=qa_pairs_path,
            wiki_articles=wiki_articles,
            domain_embedding=embed,
            coverage_topics=coverage_topics,
            corpus_hash=corpus_hash,
            trigger_query=trigger_query,
            slm_config=slm_config,
        ):
            if event.get("type") in ("step", "progress", "done", "warning", "error"):
                logger.info("SLM build [%s] %s: %s", domain_label, event.get("type"), event.get("label") or event.get("message") or "")
                # Write rich progress to Redis so the status endpoint can surface it
                try:
                    import redis as _redis, json as _json
                    _r = _redis.Redis()
                    _elapsed = round((_time.time() - _build_started_at) * 1000)  # ms
                    # Compute ETA: if distillation is in progress, estimate remaining time
                    _article = event.get("article")
                    _articles_total = len(wiki_articles) if wiki_articles else None
                    _eta_ms = None
                    if _article and _articles_total and _article > 0 and _elapsed > 0:
                        _ms_per_article = _elapsed / _article
                        _remaining_articles = _articles_total - _article
                        _eta_ms = round(_ms_per_article * _remaining_articles)
                    _progress = {
                        "phase": event.get("label") or event.get("message") or event.get("type") or "",
                        "step_num": event.get("step"),
                        "total_steps": event.get("total"),
                        "article": _article,
                        "articles_total": _articles_total,
                        "pairs_so_far": event.get("pairs_so_far"),
                        "pairs_written": event.get("pairs_written"),
                        "type": event.get("type"),
                        "elapsed_ms": _elapsed,
                        "eta_ms": _eta_ms,
                        "teacher_model": event.get("teacher_model"),
                        "student_model": event.get("student_name") or slm_config.get("student_model"),
                        "domain_label": domain_label,
                        "articles_total_loaded": len(wiki_articles),
                        # Build phase description for UI
                        "phase_label": (
                            f"Distilling article {_article}/{_articles_total}" if _article and _articles_total
                            else event.get("label") or event.get("message") or ""
                        ),
                    }
                    _key = f"slm_build_progress:{task_id}" if task_id else f"slm_build_progress:{domain_label}"
                    _r.setex(_key, 600, _json.dumps(_progress))
                    # When build completes, invalidate cached suggestions so next load regenerates
                    if event.get("type") == "done":
                        for _ck in _r.keys(f"suggestions:{domain_label}:*"):
                            _r.delete(_ck)
                        logger.info("SLM build [%s] suggestions cache cleared", domain_label)
                    # Release the distributed build lock so new builds can be triggered
                    _lock_key = f"slm_build_lock:{corpus_hash or domain_label}"
                    try:
                        _r.delete(_lock_key)
                        logger.info("SLM build [%s] distributed lock released", domain_label)
                    except Exception:
                        pass
                except Exception:
                    pass

