"""Pipeline entry point — orchestrates all stages."""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path

from .logging_config import configure_logging
from .loader import load_corpus
from .text_utils import normalize
from .language import detect_and_filter
from .dedup import deduplicate
from .quality import score_quality
from .contamination import score_relevance
from .chunker import chunk_documents
from .curator import write_curated, write_rejected
from .graph_builder import build_graph
from .report import build_report
from .models import Document, PipelineResult

logger = logging.getLogger(__name__)


def run(config_path: str = "config.json") -> PipelineResult:
    """Execute the full data readiness pipeline.

    Args:
        config_path: Path to the JSON configuration file.

    Returns:
        PipelineResult with aggregated statistics.
    """
    cfg = _load_config(config_path)

    configure_logging(
        level=cfg["logging"]["level"],
        log_file=cfg["logging"]["log_file"],
    )

    logger.info("=== Data Readiness Pipeline starting ===")
    t0 = time.perf_counter()

    # ── Stage 1: Load ──────────────────────────────────────────────────────────
    docs = load_corpus(
        input_dir=cfg["input_dir"],
        supported_extensions=cfg["supported_extensions"],
        enable_pdf=cfg.get("enable_pdf", False),
    )
    logger.info("Stage 1 complete — loaded %d documents", len(docs))

    # ── Stage 2: Normalise ─────────────────────────────────────────────────────
    for doc in docs:
        if doc.accepted and doc.raw_text:
            object.__setattr__(doc, "clean_text", normalize(doc.raw_text))
    logger.info("Stage 2 complete — text normalised")

    # ── Stage 3: Language detection ────────────────────────────────────────────
    lang_cfg = cfg.get("language", {})
    if lang_cfg.get("enabled", True):
        detect_and_filter(
            docs,
            allowed=lang_cfg.get("allowed", ["en"]),
            min_confidence=lang_cfg.get("min_confidence", 0.8),
        )
    logger.info("Stage 3 complete — language detection done")

    # ── Stage 4: Deduplication ─────────────────────────────────────────────────
    dedup_cfg = cfg["dedup"]
    deduplicate(
        docs,
        exact=dedup_cfg["exact"],
        near_duplicate=dedup_cfg["near_duplicate"],
        method=dedup_cfg.get("method", "minhash"),
        similarity_threshold=dedup_cfg["similarity_threshold"],
        minhash_num_perm=dedup_cfg.get("minhash_num_perm", 128),
    )
    logger.info("Stage 4 complete — deduplication done")

    # ── Stage 5: Quality scoring ───────────────────────────────────────────────
    q = cfg["quality"]
    score_quality(
        docs,
        min_token_count=q["min_token_count"],
        max_token_count=q["max_token_count"],
        min_avg_word_length=q["min_avg_word_length"],
        max_symbol_ratio=q["max_symbol_ratio"],
        min_alpha_ratio=q["min_alpha_ratio"],
    )
    logger.info("Stage 5 complete — quality scoring done")

    # ── Stage 6: Relevance scoring ─────────────────────────────────────────────
    c = cfg["contamination"]
    score_relevance(
        docs,
        seed_terms=c["seed_terms"],
        min_relevance_score=c["min_relevance_score"],
    )
    logger.info("Stage 6 complete — relevance scoring done")

    # ── Stage 7: Chunking ──────────────────────────────────────────────────────
    chunk_cfg = cfg.get("chunking", {})
    if chunk_cfg.get("enabled", True):
        chunk_documents(
            docs,
            chunk_size=chunk_cfg.get("chunk_size", 150),
            overlap=chunk_cfg.get("overlap", 20),
        )
    logger.info("Stage 7 complete — chunking done")

    # ── Stage 8: Write outputs ─────────────────────────────────────────────────
    write_curated(docs, cfg["curated_dir"])
    write_rejected(docs, cfg["rejected_dir"])
    logger.info("Stage 8 complete — curated and rejected corpora written")

    # ── Stage 9: Graph building ────────────────────────────────────────────────
    g = cfg["graph"]
    graph = build_graph(
        docs,
        output_dir=cfg["graph_dir"],
        top_n_keywords=g["top_n_keywords"],
        min_edge_weight=g["min_edge_weight"],
        use_spacy_entities=g["use_spacy_entities"],
        spacy_model=g["spacy_model"],
        use_bigrams=g.get("use_bigrams", True),
        community_detection=g.get("community_detection", True),
        pagerank_alpha=g.get("pagerank_alpha", 0.85),
    )
    logger.info("Stage 9 complete — graph built")

    # ── Stage 10: Reports ──────────────────────────────────────────────────────
    duration = time.perf_counter() - t0
    result = build_report(
        docs,
        graph,
        duration,
        report_path=cfg["report_path"],
        html_report_path=cfg.get("html_report_path", "output/report.html"),
    )

    logger.info(
        "=== Pipeline finished in %.2fs — accepted=%d rejected=%d ===",
        duration,
        result.total_accepted,
        result.total_rejected,
    )
    return result


def _load_config(path: str) -> dict:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Config file not found: {p.resolve()}")
    with p.open(encoding="utf-8") as f:
        return json.load(f)
