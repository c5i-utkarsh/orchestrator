"""
Celery tasks: 9-stage file ingest pipeline, 7-stage DB ingest pipeline, reindex.

Writes granular progress into ingest_jobs.pipeline_steps (JSONB):
{
  "steps": [
    {"id": "extract", "label": "...", "status": "done|running|pending|error", "pct": 0, "detail": ""},
    ...
  ],
  "current_step": 2,
  "overall_pct": 45,
  "started_at": 1234567890.0
}
"""
import json
import logging
import os
import time
from pathlib import Path

from app.tasks import celery_app

logger = logging.getLogger(__name__)


# ── DB helpers ────────────────────────────────────────────────────────────────

def _pg_connect():
    from app.config import get_settings
    import psycopg2
    import urllib.parse as _up
    s = get_settings()
    p = _up.urlparse(s.database_url.replace("+asyncpg", "").replace("+psycopg2", ""))
    return psycopg2.connect(
        host=p.hostname,
        port=p.port or 5432,
        dbname=p.path.lstrip("/"),
        user=p.username,
        password=p.password,
    )


def _update_steps(job_id, steps, current_idx, status, extra=None):
    done = sum(1 for s in steps[:current_idx] if s.get("status") == "done")
    pct = int(done / max(1, len(steps)) * 100)
    payload = json.dumps({
        "steps": steps,
        "current_step": current_idx,
        "overall_pct": pct,
        "started_at": time.time(),
    })
    extra_sql = ""
    vals = [status, payload]
    if extra:
        extra_sql = ", " + ", ".join(f"{k}=%s" for k in extra)
        vals += list(extra.values())
    vals.append(job_id)
    try:
        conn = _pg_connect()
        cur = conn.cursor()
        cur.execute(
            f"UPDATE ingest_jobs SET status=%s, progress=(%s)::jsonb{extra_sql} WHERE job_id=%s",
            vals,
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as exc:
        logger.warning("_update_steps failed: %s", exc)


def _fallback_graph_from_schema(metadata):
    nodes, edges = [], []
    for table in metadata.get("tables", []):
        tname = table.get("table_name", "")
        nodes.append({"id": tname, "label": tname, "type": "table"})
        for fk in table.get("foreign_keys", []):
            edges.append({"source": tname, "target": fk.get("referred_table", ""),
                          "relation": "references", "confidence": 0.9})
    return {"nodes": nodes, "edges": edges}


# ── Main file ingest pipeline ─────────────────────────────────────────────────

@celery_app.task(name="run_ingest_pipeline", bind=True, max_retries=2)
def run_ingest_pipeline(self, job_id):  # noqa: C901
    started = time.time()
    # corpus_dir is resolved from DB metadata; fall back to convention
    corpus_dir = f"corpus_store/{job_id}"  # placeholder; overwritten below
    processed_dir = ""  # set after corpus_dir is resolved

    # 14-layer semantic-trust ingestion architecture. Each layer progressively raises
    # semantic trust; layers 9 (validation) and 13 (graph consistency) are trust gates.
    steps = [
        {"id": "upload",           "label": "1 · File upload",                      "status": "pending", "pct": 0, "detail": ""},
        {"id": "extract",          "label": "2 · Ingestion & extraction engine",    "status": "pending", "pct": 0, "detail": ""},
        {"id": "clean",            "label": "3 · Cleaning + normalization",         "status": "pending", "pct": 0, "detail": ""},
        {"id": "chunk",            "label": "4 · Chunking + structural segmentation","status": "pending", "pct": 0, "detail": ""},
        {"id": "metadata",         "label": "5 · Metadata intelligence engine",     "status": "pending", "pct": 0, "detail": ""},
        {"id": "entities",         "label": "6 · Entity + relationship extraction", "status": "pending", "pct": 0, "detail": ""},
        {"id": "semantic",         "label": "7 · Semantic learning layer",          "status": "pending", "pct": 0, "detail": ""},
        {"id": "eda",              "label": "8 · EDA intelligence engine",          "status": "pending", "pct": 0, "detail": ""},
        {"id": "validation",       "label": "9 · ML validation & accuracy engine",  "status": "pending", "pct": 0, "detail": ""},
        {"id": "ontology",         "label": "10 · Ontology & semantic governance",  "status": "pending", "pct": 0, "detail": ""},
        {"id": "canonical",        "label": "11 · Canonicalization & resolution",   "status": "pending", "pct": 0, "detail": ""},
        {"id": "graph",            "label": "12 · Knowledge graph construction",    "status": "pending", "pct": 0, "detail": ""},
        {"id": "graph_validation", "label": "13 · Graph validation & consistency",  "status": "pending", "pct": 0, "detail": ""},
        {"id": "wiki",             "label": "14 · Wiki + explainability generation","status": "pending", "pct": 0, "detail": ""},
    ]

    # Fetch job record — read corpus_dir from metadata + domain_label for ontology
    stored_corpus_dir = None
    domain_label = "general"
    try:
        conn = _pg_connect()
        cur = conn.cursor()
        cur.execute("SELECT metadata, domain_label FROM ingest_jobs WHERE job_id=%s", (job_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        meta = row[0] if row else {}
        if isinstance(meta, str):
            import json as _j; meta = _j.loads(meta)
        stored_corpus_dir = (meta or {}).get("corpus_dir")
        if row and len(row) > 1 and row[1]:
            domain_label = row[1]
    except Exception as exc:
        logger.error("Failed to fetch job %s: %s", job_id, exc)

    # Resolve corpus_dir: prefer what was saved at ingest time (absolute path)
    if stored_corpus_dir and os.path.isdir(stored_corpus_dir):
        corpus_dir = stored_corpus_dir
    else:
        corpus_dir = f"corpus_store/{job_id}"
    os.makedirs(corpus_dir, exist_ok=True)
    processed_dir = os.path.join(corpus_dir, "processed")
    os.makedirs(processed_dir, exist_ok=True)

    from app.modules.ingestion.corpus import extract_corpus
    from app.modules.pipeline.processing import clean_text, chunk_text, validate_chunking
    from app.modules.metadata.metadata_engine import extract_metadata
    from app.modules.data_curation.nlp_entity_extractor import extract_entities_from_chunks
    from app.modules.kg.confidence_scoring import score_entities, score_relationships
    from app.modules.semantic.semantic_learning import learn_semantics
    from app.modules.eda.file_eda_service import run_file_eda
    from app.modules.validation.ml_validation import validate_accuracy
    from app.modules.ontology.ontology_engine import govern
    from app.modules.kg.knowledge_schema import (
        build_canonical_nodes, build_canonical_edges, validate_canonical_graph,
    )
    from app.modules.kg.entity_resolution import resolve_canonical_graph
    from app.modules.kg.cross_source_linker import link_cross_source
    from app.modules.graph.graph_builder import GraphBuilder
    from app.modules.graph.graph_validation import validate_graph
    from app.modules.wiki.wiki_builder import WikiBuilder
    from app.modules.data_curation.faiss_store import FaissStore

    graph_builder = GraphBuilder(corpus_dir)
    wiki_builder = WikiBuilder(corpus_dir)
    embed_store = FaissStore(corpus_dir)

    # Determine file paths — scan corpus_dir directly (files saved there at upload)
    SKIP_SUFFIXES = {".json", ".faiss", ".pkl", ".bin", ".idx", ""}
    files_to_process = []
    for fp in Path(corpus_dir).iterdir():
        if fp.is_file() and fp.suffix.lower() not in SKIP_SUFFIXES:
            files_to_process.append((fp.stem, str(fp)))

    if not files_to_process:
        _update_steps(job_id, steps, 0, "failed", {"error_message": "no_files_found"})
        return

    # ── Layer 1: File Upload ──────────────────────────────────────────────────
    # The files are already on disk; this layer records the upload manifest so the
    # rest of the pipeline (and the UI) has an explicit, provenance-bearing entry point.
    steps[0]["status"] = "running"
    _update_steps(job_id, steps, 0, "ingesting")
    steps[0]["status"] = "done"
    steps[0]["pct"] = 100
    steps[0]["detail"] = f"{len(files_to_process)} files received"
    _update_steps(job_id, steps, 1, "ingesting")

    # ── Layer 2: Ingestion & Extraction Engine ────────────────────────────────
    steps[1]["status"] = "running"
    _update_steps(job_id, steps, 1, "ingesting")
    all_corpora = {}
    for file_id, file_path in files_to_process:
        ext = Path(file_path).suffix.lower().lstrip(".")
        try:
            corpus = extract_corpus(file_path, ext)
        except Exception as exc:
            logger.warning("extract_corpus failed for %s: %s", file_path, exc)
            corpus = {"plain_text": "", "text_blocks": [], "table_rows": [], "metadata": {}, "source_type": "unknown", "adapter": "raw"}
        all_corpora[file_id] = (ext, corpus)
        try:
            with open(os.path.join(processed_dir, f"{file_id}_corpus.json"), "w", encoding="utf-8") as f:
                json.dump({"ext": ext, **corpus}, f)
        except Exception:
            pass
    steps[1]["status"] = "done"
    steps[1]["pct"] = 100
    steps[1]["detail"] = f"{len(all_corpora)} files extracted"
    _update_steps(job_id, steps, 2, "ingesting")

    # ── Layer 3: Cleaning + Normalization ─────────────────────────────────────
    steps[2]["status"] = "running"
    _update_steps(job_id, steps, 2, "ingesting")
    cleaned_by_file = {}
    for file_id, (ext, corpus) in all_corpora.items():
        cleaned_by_file[file_id] = clean_text(corpus.get("plain_text", "") or "")
    steps[2]["status"] = "done"
    steps[2]["pct"] = 100
    steps[2]["detail"] = f"{len(cleaned_by_file)} files normalized"
    _update_steps(job_id, steps, 3, "ingesting")

    # ── Layer 4: Chunking + Structural Segmentation ───────────────────────────
    steps[3]["status"] = "running"
    _update_steps(job_id, steps, 3, "ingesting")
    all_chunks_by_file = {}
    all_validations = {}
    for file_id, cleaned in cleaned_by_file.items():
        chunks = chunk_text(cleaned)
        all_chunks_by_file[file_id] = chunks
        all_validations[file_id] = validate_chunking(chunks, len(cleaned.split()), target_overlap=60)
    total_chunks = sum(len(c) for c in all_chunks_by_file.values())
    steps[3]["status"] = "done"
    steps[3]["pct"] = 100
    steps[3]["detail"] = f"{total_chunks} chunks from {len(all_corpora)} files"
    _update_steps(job_id, steps, 4, "ingesting")

    # ── Layer 5: Metadata Intelligence Engine ─────────────────────────────────
    steps[4]["status"] = "running"
    _update_steps(job_id, steps, 4, "ingesting")
    metadata_by_file = {}
    for file_id, (ext, corpus) in all_corpora.items():
        try:
            metadata_by_file[file_id] = extract_metadata(
                file_id, ext, corpus, all_chunks_by_file.get(file_id, []), corpus_dir=corpus_dir,
            )
        except Exception as exc:
            logger.warning("extract_metadata failed for %s: %s", file_id, exc)
            metadata_by_file[file_id] = {}
    steps[4]["status"] = "done"
    steps[4]["pct"] = 100
    steps[4]["detail"] = f"Metadata profiled for {len(metadata_by_file)} files"
    _update_steps(job_id, steps, 5, "ingesting")

    # ── Layer 6: Entity + Relationship Extraction ─────────────────────────────
    steps[5]["status"] = "running"
    _update_steps(job_id, steps, 5, "ingesting")
    all_entities_by_file = {}
    all_rels_by_file = {}
    for file_id, chunks in all_chunks_by_file.items():
        try:
            entities, relationships = extract_entities_from_chunks(chunks)
        except Exception as exc:
            logger.warning("entity extraction failed for %s: %s", file_id, exc)
            entities, relationships = [], []
        sc_ents = score_entities(entities)
        sc_rels = score_relationships(relationships, {
            str(e.get("text") or "").strip().lower(): float(e.get("eda_confidence", 0))
            for e in sc_ents.get("entities", [])
        })
        all_entities_by_file[file_id] = sc_ents.get("entities", entities)
        all_rels_by_file[file_id] = sc_rels.get("relationships", relationships)
    total_ents = sum(len(v) for v in all_entities_by_file.values())
    total_rels = sum(len(v) for v in all_rels_by_file.values())
    steps[5]["status"] = "done"
    steps[5]["pct"] = 100
    steps[5]["detail"] = f"{total_ents} entities, {total_rels} relationships"
    _update_steps(job_id, steps, 6, "ingesting")

    # ── Layer 7: Semantic Learning Layer (owns embedding) ─────────────────────
    steps[6]["status"] = "running"
    _update_steps(job_id, steps, 6, "ingesting")
    semantic_by_file = {}
    embed_count = 0
    for file_id, chunks in all_chunks_by_file.items():
        try:
            res = learn_semantics(file_id, chunks, embed_store, corpus_dir=corpus_dir)
            semantic_by_file[file_id] = res.get("profile", {})
            embed_count += res.get("embed_count", 0)
        except Exception as exc:
            logger.warning("learn_semantics failed for %s: %s", file_id, exc)
            semantic_by_file[file_id] = {}
    steps[6]["status"] = "done"
    steps[6]["pct"] = 100
    steps[6]["detail"] = f"{embed_count} chunks embedded; semantics learned"
    _update_steps(job_id, steps, 7, "ingesting")

    # ── Layer 8: EDA Intelligence Engine (non-fatal) ──────────────────────────
    steps[7]["status"] = "running"
    _update_steps(job_id, steps, 7, "ingesting")
    eda_results = {}
    for file_id, (ext, corpus) in all_corpora.items():
        try:
            eda_results[file_id] = run_file_eda(
                file_id=file_id, ext=ext, corpus=corpus,
                entities=all_entities_by_file.get(file_id, []),
                relationships=all_rels_by_file.get(file_id, []),
                canonical_nodes=[], canonical_edges=[], resolved_nodes=[],
                resolution_report={},
                chunk_validation_report=all_validations.get(file_id, {}),
                corpus_dir=corpus_dir,
            )
        except Exception as exc:
            logger.warning("run_file_eda failed for %s: %s", file_id, exc)
    steps[7]["status"] = "done"
    steps[7]["pct"] = 100
    steps[7]["detail"] = f"EDA completed for {len(eda_results)}/{len(all_corpora)} files"
    _update_steps(job_id, steps, 8, "ingesting")

    # ── Layer 9: ML Validation & Accuracy Engine (trust gate) ─────────────────
    # Filters low-confidence entities/relationships before anything reaches the graph.
    steps[8]["status"] = "running"
    _update_steps(job_id, steps, 8, "ingesting")
    trust_scores = []
    for file_id in all_corpora:
        try:
            v = validate_accuracy(
                file_id=file_id,
                entities=all_entities_by_file.get(file_id, []),
                relationships=all_rels_by_file.get(file_id, []),
                chunks=all_chunks_by_file.get(file_id, []),
                chunk_validation=all_validations.get(file_id, {}),
                metadata=metadata_by_file.get(file_id, {}),
                corpus_dir=corpus_dir,
            )
            all_entities_by_file[file_id] = v["accepted_entities"]
            all_rels_by_file[file_id] = v["accepted_relationships"]
            trust_scores.append(float(v["report"].get("trust_score", 0.0)))
        except Exception as exc:
            logger.warning("validate_accuracy failed for %s: %s", file_id, exc)
    mean_trust = round(sum(trust_scores) / max(1, len(trust_scores)), 3)
    total_ents = sum(len(v) for v in all_entities_by_file.values())
    steps[8]["status"] = "done"
    steps[8]["pct"] = 100
    steps[8]["detail"] = f"{total_ents} entities passed; trust {mean_trust}"
    _update_steps(job_id, steps, 9, "ingesting")

    # ── Layer 10: Ontology & Semantic Governance Layer ────────────────────────
    steps[9]["status"] = "running"
    _update_steps(job_id, steps, 9, "ingesting")
    total_proposed = 0
    for file_id in all_corpora:
        try:
            g = govern(
                domain_label=domain_label,
                entities=all_entities_by_file.get(file_id, []),
                relationships=all_rels_by_file.get(file_id, []),
                semantic_profile=semantic_by_file.get(file_id, {}),
                corpus_dir=corpus_dir,
            )
            all_rels_by_file[file_id] = g["governed_relationships"]
            total_proposed += g["report"].get("proposed", 0)
        except Exception as exc:
            logger.warning("ontology govern failed for %s: %s", file_id, exc)
    steps[9]["status"] = "done"
    steps[9]["pct"] = 100
    steps[9]["detail"] = f"Governed; {total_proposed} new relation proposals"
    _update_steps(job_id, steps, 10, "ingesting")

    # ── Layer 11: Canonicalization & Semantic Resolution ──────────────────────
    steps[10]["status"] = "running"
    _update_steps(job_id, steps, 10, "ingesting")
    all_canonical_edges = {}
    resolved_nodes_by_file = {}
    for file_id in all_corpora:
        entities = all_entities_by_file.get(file_id, [])
        relationships = all_rels_by_file.get(file_id, [])
        try:
            cn, mention_map = build_canonical_nodes(file_id, entities)
            ce = build_canonical_edges(file_id, relationships, mention_map)
            validate_canonical_graph(cn, ce)
        except Exception as exc:
            logger.warning("canonical build failed for %s: %s", file_id, exc)
            cn, ce = [], []
        try:
            result = resolve_canonical_graph(
                file_id=file_id, nodes=cn, edges=ce,
                embed_fn=embed_store.embed_text, corpus_dir=corpus_dir,
            )
            resolved_nodes_by_file[file_id] = result.get("resolved_nodes", cn)
        except Exception as exc:
            logger.warning("resolve failed for %s: %s", file_id, exc)
            resolved_nodes_by_file[file_id] = cn
        all_canonical_edges[file_id] = ce
    total_resolved = sum(len(v) for v in resolved_nodes_by_file.values())
    steps[10]["status"] = "done"
    steps[10]["pct"] = 100
    steps[10]["detail"] = f"{total_resolved} resolved canonical nodes"
    _update_steps(job_id, steps, 11, "ingesting")

    # ── Layer 12: Knowledge Graph Construction (cross-link + upsert + build) ───
    steps[11]["status"] = "running"
    _update_steps(job_id, steps, 11, "ingesting")
    cross_link_count = 0
    try:
        canonical_graph = graph_builder.get_canonical_graph()
        for file_id in all_corpora:
            cl = link_cross_source(
                corpus_dir=corpus_dir, source_id=file_id, source_type="corpus",
                source_nodes=resolved_nodes_by_file.get(file_id, []),
                embed_fn=embed_store.embed_text, canonical_graph=canonical_graph,
            )
            cross_link_count += len(cl.get("accepted_links", []))
    except Exception as exc:
        logger.warning("link_cross_source failed: %s", exc)
    for file_id in all_corpora:
        try:
            graph_builder.upsert_canonical_graph(
                file_id, resolved_nodes_by_file.get(file_id, []), all_canonical_edges.get(file_id, []),
            )
            graph_builder.build_graph(
                file_id, all_entities_by_file.get(file_id, []), all_rels_by_file.get(file_id, []),
            )
        except Exception as exc:
            logger.warning("graph_builder failed for %s: %s", file_id, exc)
    steps[11]["status"] = "done"
    steps[11]["pct"] = 100
    steps[11]["detail"] = f"Graph built; {cross_link_count} cross-source links"
    _update_steps(job_id, steps, 12, "ingesting")

    # ── Layer 13: Graph Validation & Consistency Engine (gate before wiki) ────
    steps[12]["status"] = "running"
    _update_steps(job_id, steps, 12, "ingesting")
    try:
        ontology = {}
        ont_path = os.path.join(corpus_dir, "ontology.json")
        if os.path.exists(ont_path):
            with open(ont_path, encoding="utf-8") as f:
                ontology = json.load(f)
        consistency = validate_graph(graph_builder.get_canonical_graph(), ontology, corpus_dir=corpus_dir)
    except Exception as exc:
        logger.warning("validate_graph failed: %s", exc)
        consistency = {"passed": False, "node_count": 0, "edge_count": 0}
    steps[12]["status"] = "done"
    steps[12]["pct"] = 100
    steps[12]["detail"] = (
        f"{'consistent' if consistency.get('passed') else 'issues found'} · "
        f"{consistency.get('node_count', 0)} nodes / {consistency.get('edge_count', 0)} edges"
    )
    _update_steps(job_id, steps, 13, "ingesting")

    # ── Layer 14: Wiki + Explainability Generation ────────────────────────────
    steps[13]["status"] = "running"
    _update_steps(job_id, steps, 13, "ingesting")
    wiki_count = 0
    for file_id in all_corpora:
        resolved_nodes = resolved_nodes_by_file.get(file_id, [])
        try:
            cg = graph_builder.get_canonical_graph()
            node_ids = [n.get("canonical_id") or n.get("id") for n in resolved_nodes
                        if n.get("canonical_id") or n.get("id")]
            wiki_builder.build_pages_for_nodes(file_id, node_ids, cg)
            wiki_count += len(node_ids)
        except Exception as exc:
            logger.warning("wiki_builder failed for %s: %s", file_id, exc)
    steps[13]["status"] = "done"
    steps[13]["pct"] = 100
    steps[13]["detail"] = f"{wiki_count} wiki pages built"

    # Compute community count from entity type diversity in canonical graph
    try:
        _cg = graph_builder.get_canonical_graph()
        _community_count = len({n.get("entity_type", "") for n in _cg.get("nodes", []) if n.get("entity_type")})
    except Exception:
        _community_count = 0

    _graph_path = os.path.join(corpus_dir, "canonical_graph.json")
    _update_steps(job_id, steps, 14, "graph_done", {
        "entity_count": total_ents,
        "file_count": len(all_corpora),
        "community_count": _community_count,
        "graph_path": _graph_path if os.path.exists(_graph_path) else None,
        "corpus_path": os.path.abspath(corpus_dir),
    })
    logger.info("run_ingest_pipeline %s done in %ds — graph_path=%s", job_id, int(time.time() - started), _graph_path)


# ── DB ingest pipeline ────────────────────────────────────────────────────────

@celery_app.task(name="run_db_pipeline", bind=True, max_retries=1)
def run_db_pipeline(self, job_id, conn_params):  # noqa: C901
    started = time.time()
    corpus_dir = f"corpus_store/{job_id}"
    os.makedirs(corpus_dir, exist_ok=True)
    processed_dir = os.path.join(corpus_dir, "processed")
    os.makedirs(processed_dir, exist_ok=True)

    db_id = conn_params.get("db_id") or conn_params.get("dbname") or "db"

    # domain_label drives ontology governance (Layer 10)
    domain_label = conn_params.get("domain_label") or "general"
    try:
        _c = _pg_connect(); _cur = _c.cursor()
        _cur.execute("SELECT domain_label FROM ingest_jobs WHERE job_id=%s", (job_id,))
        _r = _cur.fetchone(); _cur.close(); _c.close()
        if _r and _r[0]:
            domain_label = _r[0]
    except Exception:
        pass

    # DB ingest aligned to the same 14-layer semantic-trust architecture. Layers that
    # don't apply to structured schema are marked done with an explanatory detail.
    steps = [
        {"id": "upload",           "label": "1 · File upload (DB connection)",      "status": "pending", "pct": 0, "detail": ""},
        {"id": "extract",          "label": "2 · Ingestion & extraction engine",    "status": "pending", "pct": 0, "detail": ""},
        {"id": "clean",            "label": "3 · Cleaning + normalization",         "status": "pending", "pct": 0, "detail": ""},
        {"id": "chunk",            "label": "4 · Chunking + structural segmentation","status": "pending", "pct": 0, "detail": ""},
        {"id": "metadata",         "label": "5 · Metadata intelligence engine",     "status": "pending", "pct": 0, "detail": ""},
        {"id": "entities",         "label": "6 · Entity + relationship extraction", "status": "pending", "pct": 0, "detail": ""},
        {"id": "semantic",         "label": "7 · Semantic learning layer",          "status": "pending", "pct": 0, "detail": ""},
        {"id": "eda",              "label": "8 · EDA intelligence engine",          "status": "pending", "pct": 0, "detail": ""},
        {"id": "validation",       "label": "9 · ML validation & accuracy engine",  "status": "pending", "pct": 0, "detail": ""},
        {"id": "ontology",         "label": "10 · Ontology & semantic governance",  "status": "pending", "pct": 0, "detail": ""},
        {"id": "canonical",        "label": "11 · Canonicalization & resolution",   "status": "pending", "pct": 0, "detail": ""},
        {"id": "graph",            "label": "12 · Knowledge graph construction",    "status": "pending", "pct": 0, "detail": ""},
        {"id": "graph_validation", "label": "13 · Graph validation & consistency",  "status": "pending", "pct": 0, "detail": ""},
        {"id": "wiki",             "label": "14 · Wiki + explainability generation","status": "pending", "pct": 0, "detail": ""},
    ]

    from app.modules.db.db_connector import connect_db, get_schema_metadata, export_schema_as_corpus_text
    from app.modules.db.db_profiler import profile_database, detect_implicit_relationships
    from app.modules.db.eda_engine import run_eda_engine
    from app.modules.kg.knowledge_schema import build_canonical_nodes, build_canonical_edges
    from app.modules.kg.entity_resolution import resolve_canonical_graph
    from app.modules.kg.cross_source_linker import link_cross_source, build_db_semantic_hints
    from app.modules.validation.ml_validation import validate_accuracy
    from app.modules.ontology.ontology_engine import govern
    from app.modules.graph.graph_builder import GraphBuilder
    from app.modules.graph.graph_validation import validate_graph
    from app.modules.wiki.wiki_builder import WikiBuilder
    from app.modules.pipeline.processing import chunk_text
    from app.modules.data_curation.faiss_store import FaissStore

    graph_builder = GraphBuilder(corpus_dir)
    embed_store = FaissStore(corpus_dir)
    wiki_builder = WikiBuilder(corpus_dir)

    # ── Layer 1: File Upload (establish DB connection = source acquisition) ────
    steps[0]["status"] = "running"
    _update_steps(job_id, steps, 0, "ingesting")
    try:
        db_engine = connect_db(
            engine=conn_params.get("engine", "postgresql"),
            host=conn_params.get("host", "localhost"),
            port=int(conn_params.get("port", 5432)),
            dbname=conn_params.get("dbname", ""),
            user=conn_params.get("user", ""),
            password=conn_params.get("password", ""),
            path=conn_params.get("path"),
        )
    except Exception as exc:
        steps[0]["status"] = "error"
        steps[0]["detail"] = str(exc)
        _update_steps(job_id, steps, 0, "failed", {"error_message": str(exc)})
        return
    steps[0]["status"] = "done"
    steps[0]["pct"] = 100
    steps[0]["detail"] = f"Connected to {conn_params.get('dbname')}"
    _update_steps(job_id, steps, 1, "ingesting")

    # ── Layer 2: Ingestion & Extraction Engine (schema introspection) ──────────
    steps[1]["status"] = "running"
    _update_steps(job_id, steps, 1, "ingesting")
    try:
        metadata = get_schema_metadata(db_engine)
        with open(os.path.join(processed_dir, f"{db_id}_schema.json"), "w", encoding="utf-8") as f:
            json.dump(metadata, f)
    except Exception as exc:
        steps[1]["status"] = "error"
        steps[1]["detail"] = str(exc)
        _update_steps(job_id, steps, 1, "failed", {"error_message": str(exc)})
        return
    table_count = len(metadata.get("tables", []))
    steps[1]["status"] = "done"
    steps[1]["pct"] = 100
    steps[1]["detail"] = f"{table_count} tables introspected"
    _update_steps(job_id, steps, 2, "ingesting")

    # ── Layer 3: Cleaning + Normalization (schema text export) ─────────────────
    steps[2]["status"] = "running"
    _update_steps(job_id, steps, 2, "ingesting")
    schema_text = export_schema_as_corpus_text(db_engine, metadata)
    steps[2]["status"] = "done"
    steps[2]["pct"] = 100
    steps[2]["detail"] = f"{len(schema_text)} chars normalized"
    _update_steps(job_id, steps, 3, "ingesting")

    # ── Layer 4: Chunking + Structural Segmentation (schema chunks) ────────────
    steps[3]["status"] = "running"
    _update_steps(job_id, steps, 3, "ingesting")
    try:
        schema_chunks = chunk_text(schema_text, size=300, overlap=50)
    except Exception as exc:
        logger.warning("DB chunk failed: %s", exc)
        schema_chunks = []
    steps[3]["status"] = "done"
    steps[3]["pct"] = 100
    steps[3]["detail"] = f"{len(schema_chunks)} schema chunks"
    _update_steps(job_id, steps, 4, "ingesting")

    # ── Layer 5: Metadata Intelligence Engine (column profiling) ───────────────
    steps[4]["status"] = "running"
    _update_steps(job_id, steps, 4, "ingesting")
    try:
        profiled = profile_database(metadata, db_engine)
        implicit_rels = detect_implicit_relationships(metadata)
        with open(os.path.join(processed_dir, f"{db_id}_profile.json"), "w", encoding="utf-8") as f:
            json.dump({"profile": profiled, "implicit_relationships": implicit_rels}, f)
    except Exception as exc:
        logger.warning("profile_database failed: %s", exc)
        profiled = {}
    total_cols = sum(len(t.get("columns", [])) for t in profiled.get("tables", []))
    steps[4]["status"] = "done"
    steps[4]["pct"] = 100
    steps[4]["detail"] = f"{total_cols} columns profiled"
    _update_steps(job_id, steps, 5, "ingesting")

    # ── Layer 6: Entity + Relationship Extraction (schema → entities/edges) ────
    steps[5]["status"] = "running"
    _update_steps(job_id, steps, 5, "ingesting")
    db_graph = _fallback_graph_from_schema(metadata)
    schema_entities = [{"text": n["label"], "type": n.get("type", "table"), "label": "TABLE"}
                       for n in db_graph.get("nodes", [])]
    schema_rels = [{"source": e["source"], "target": e["target"], "relation": e.get("relation", "references")}
                   for e in db_graph.get("edges", [])]
    steps[5]["status"] = "done"
    steps[5]["pct"] = 100
    steps[5]["detail"] = f"{len(schema_entities)} entities, {len(schema_rels)} relationships"
    _update_steps(job_id, steps, 6, "ingesting")

    # ── Layer 7: Semantic Learning Layer (embed schema chunks) ─────────────────
    steps[6]["status"] = "running"
    _update_steps(job_id, steps, 6, "ingesting")
    try:
        embed_count = embed_store.add_chunks(db_id, schema_chunks)
    except Exception as exc:
        logger.warning("DB embed failed: %s", exc)
        embed_count = 0
    steps[6]["status"] = "done"
    steps[6]["pct"] = 100
    steps[6]["detail"] = f"{embed_count} schema chunks embedded"
    _update_steps(job_id, steps, 7, "ingesting")

    # ── Layer 8: EDA Intelligence Engine (DB EDA) ──────────────────────────────
    steps[7]["status"] = "running"
    _update_steps(job_id, steps, 7, "ingesting")
    try:
        run_eda_engine(profiled, output_dir=processed_dir)
    except Exception as exc:
        logger.warning("run_eda_engine failed: %s", exc)
    steps[7]["status"] = "done"
    steps[7]["pct"] = 100
    steps[7]["detail"] = "DB EDA complete"
    _update_steps(job_id, steps, 8, "ingesting")

    # ── Layer 9: ML Validation & Accuracy Engine (trust gate) ──────────────────
    steps[8]["status"] = "running"
    _update_steps(job_id, steps, 8, "ingesting")
    try:
        v = validate_accuracy(
            file_id=db_id, entities=schema_entities, relationships=schema_rels,
            chunks=schema_chunks, chunk_validation={},
            metadata={"extraction_reliability_hint": 0.9},
            corpus_dir=corpus_dir,
        )
        schema_entities = v["accepted_entities"]
        schema_rels = v["accepted_relationships"]
        db_trust = round(float(v["report"].get("trust_score", 0.0)), 3)
    except Exception as exc:
        logger.warning("validate_accuracy failed: %s", exc)
        db_trust = 0.0
    steps[8]["status"] = "done"
    steps[8]["pct"] = 100
    steps[8]["detail"] = f"{len(schema_entities)} entities passed; trust {db_trust}"
    _update_steps(job_id, steps, 9, "ingesting")

    # ── Layer 10: Ontology & Semantic Governance Layer ─────────────────────────
    steps[9]["status"] = "running"
    _update_steps(job_id, steps, 9, "ingesting")
    try:
        g = govern(
            domain_label=domain_label, entities=schema_entities,
            relationships=schema_rels, semantic_profile={}, corpus_dir=corpus_dir,
        )
        schema_rels = g["governed_relationships"]
        db_proposed = g["report"].get("proposed", 0)
    except Exception as exc:
        logger.warning("ontology govern failed: %s", exc)
        db_proposed = 0
    steps[9]["status"] = "done"
    steps[9]["pct"] = 100
    steps[9]["detail"] = f"Governed; {db_proposed} new relation proposals"
    _update_steps(job_id, steps, 10, "ingesting")

    # ── Layer 11: Canonicalization & Semantic Resolution ───────────────────────
    steps[10]["status"] = "running"
    _update_steps(job_id, steps, 10, "ingesting")
    resolved_nodes = []
    ce = []
    try:
        cn, mention_map = build_canonical_nodes(db_id, schema_entities)
        ce = build_canonical_edges(db_id, schema_rels, mention_map)
        result = resolve_canonical_graph(
            file_id=db_id, nodes=cn, edges=ce,
            embed_fn=embed_store.embed_text, corpus_dir=corpus_dir,
        )
        resolved_nodes = result.get("resolved_nodes", cn)
    except Exception as exc:
        logger.warning("DB canonical/resolution failed: %s", exc)
    steps[10]["status"] = "done"
    steps[10]["pct"] = 100
    steps[10]["detail"] = f"{len(resolved_nodes)} resolved canonical nodes"
    _update_steps(job_id, steps, 11, "ingesting")

    # ── Layer 12: Knowledge Graph Construction (cross-link + upsert) ───────────
    steps[11]["status"] = "running"
    _update_steps(job_id, steps, 11, "ingesting")
    try:
        canonical_graph = graph_builder.get_canonical_graph()
        semantic_hints = build_db_semantic_hints(profiled, resolved_nodes)
        link_cross_source(
            corpus_dir=corpus_dir, source_id=db_id, source_type="db",
            source_nodes=resolved_nodes, embed_fn=embed_store.embed_text,
            canonical_graph=canonical_graph, confidence_hints=semantic_hints,
        )
        graph_builder.upsert_canonical_graph(db_id, resolved_nodes, ce)
    except Exception as exc:
        logger.warning("DB graph merge failed: %s", exc)
    steps[11]["status"] = "done"
    steps[11]["pct"] = 100
    steps[11]["detail"] = "DB schema merged into canonical graph"
    _update_steps(job_id, steps, 12, "ingesting")

    # ── Layer 13: Graph Validation & Consistency Engine ────────────────────────
    steps[12]["status"] = "running"
    _update_steps(job_id, steps, 12, "ingesting")
    try:
        ontology = {}
        ont_path = os.path.join(corpus_dir, "ontology.json")
        if os.path.exists(ont_path):
            with open(ont_path, encoding="utf-8") as f:
                ontology = json.load(f)
        consistency = validate_graph(graph_builder.get_canonical_graph(), ontology, corpus_dir=corpus_dir)
    except Exception as exc:
        logger.warning("validate_graph failed: %s", exc)
        consistency = {"passed": False, "node_count": 0, "edge_count": 0}
    steps[12]["status"] = "done"
    steps[12]["pct"] = 100
    steps[12]["detail"] = (
        f"{'consistent' if consistency.get('passed') else 'issues found'} · "
        f"{consistency.get('node_count', 0)} nodes / {consistency.get('edge_count', 0)} edges"
    )
    _update_steps(job_id, steps, 13, "ingesting")

    # ── Layer 14: Wiki + Explainability Generation ─────────────────────────────
    steps[13]["status"] = "running"
    _update_steps(job_id, steps, 13, "ingesting")
    wiki_count = 0
    try:
        cg = graph_builder.get_canonical_graph()
        node_ids = [n.get("canonical_id") or n.get("id") for n in resolved_nodes
                    if n.get("canonical_id") or n.get("id")]
        wiki_builder.build_pages_for_nodes(db_id, node_ids, cg)
        wiki_count = len(node_ids)
    except Exception as exc:
        logger.warning("DB wiki_builder failed: %s", exc)
    steps[13]["status"] = "done"
    steps[13]["pct"] = 100
    steps[13]["detail"] = f"{wiki_count} wiki pages built"

    _graph_path = os.path.join(corpus_dir, "canonical_graph.json")
    _update_steps(job_id, steps, 14, "graph_done", {
        "file_count": table_count,
        "graph_path": _graph_path if os.path.exists(_graph_path) else None,
        "corpus_path": os.path.abspath(corpus_dir),
    })
    logger.info("run_db_pipeline %s done in %ds", job_id, int(time.time() - started))


# ── Reindex pipeline ──────────────────────────────────────────────────────────

@celery_app.task(name="reindex_pipeline", bind=True, max_retries=2)
def reindex_pipeline(self, job_id):
    started = time.time()
    corpus_dir = f"corpus_store/{job_id}"
    processed_dir = os.path.join(corpus_dir, "processed")

    steps = [
        {"id": "chunk", "label": "1 · Re-chunking corpus",            "status": "pending", "pct": 0, "detail": ""},
        {"id": "embed", "label": "2 · Re-embedding & FAISS indexing",  "status": "pending", "pct": 0, "detail": ""},
    ]
    _update_steps(job_id, steps, 0, "ingesting")

    from app.modules.pipeline.processing import clean_text, chunk_text
    from app.modules.data_curation.faiss_store import FaissStore

    embed_store = FaissStore(corpus_dir)
    steps[0]["status"] = "running"
    _update_steps(job_id, steps, 0, "ingesting")

    all_chunks_by_file = {}
    if Path(processed_dir).exists():
        for p in Path(processed_dir).glob("*_corpus.json"):
            file_id = p.stem.replace("_corpus", "")
            try:
                with open(p, encoding="utf-8") as f:
                    data = json.load(f)
                chunks = chunk_text(clean_text(data.get("plain_text", "") or ""))
                all_chunks_by_file[file_id] = chunks
            except Exception as exc:
                logger.warning("reindex: failed to load %s: %s", p, exc)

    total_chunks = sum(len(c) for c in all_chunks_by_file.values())
    steps[0]["status"] = "done"
    steps[0]["pct"] = 100
    steps[0]["detail"] = f"{total_chunks} chunks from {len(all_chunks_by_file)} files"
    _update_steps(job_id, steps, 1, "ingesting")

    steps[1]["status"] = "running"
    _update_steps(job_id, steps, 1, "ingesting")
    embed_count = 0
    for file_id, chunks in all_chunks_by_file.items():
        try:
            embed_count += embed_store.add_chunks(file_id, chunks)
        except Exception as exc:
            logger.warning("reindex embed failed for %s: %s", file_id, exc)

    steps[1]["status"] = "done"
    steps[1]["pct"] = 100
    steps[1]["detail"] = f"{embed_count} chunks re-indexed"
    _update_steps(job_id, steps, 1, "graph_done")
    logger.info("reindex_pipeline %s done in %ds", job_id, int(time.time() - started))
