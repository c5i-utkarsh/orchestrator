"""Per-file ingestion pipeline with SSE-compatible progress events."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Generator

from .loader import _load_single
from .text_utils import normalize
from .language import detect_and_filter
from .dedup import deduplicate
from .quality import score_quality
from .contamination import score_relevance
from .chunker import chunk_documents
from .graph_builder import build_graph
from .curator import write_curated, write_rejected
from .models import Document

logger = logging.getLogger(__name__)

Event = dict


def ingest_and_stream(paths: list[Path], config: dict) -> Generator[Event, None, None]:
    """Process files one-by-one through the pipeline, yielding SSE events.

    Per-file events have type "file_stage".
    Global pipeline events have type "pipeline_stage".
    Final event has type "complete".
    Error event has type "error".
    """
    docs: list[Document] = []
    lang_cfg   = config.get("language", {})
    q_cfg      = config["quality"]
    c_cfg      = config["contamination"]
    chunk_cfg  = config.get("chunking", {})

    # ── Per-file stages ─────────────────────────────────────────────────────────
    for path in paths:
        name = path.name

        # Stage: Load
        doc = _load_single(path)
        docs.append(doc)

        if not doc.accepted:
            yield {"type": "file_stage", "file": name, "stage": "load_error",
                   "status": "error", "detail": doc.rejection_detail or "load failed"}
            continue

        # Stage: Normalize → Cleaned
        if doc.raw_text:
            object.__setattr__(doc, "clean_text", normalize(doc.raw_text))
        yield {"type": "file_stage", "file": name, "stage": "cleaned", "status": "done"}

        # Stage: Language detection (inline, before quality)
        if lang_cfg.get("enabled", True):
            detect_and_filter(
                [doc],
                allowed=lang_cfg.get("allowed", ["en"]),
                min_confidence=lang_cfg.get("min_confidence", 0.8),
            )

        # Stage: Quality + Relevance → Labelled
        score_quality(
            [doc],
            min_token_count=q_cfg["min_token_count"],
            max_token_count=q_cfg["max_token_count"],
            min_avg_word_length=q_cfg["min_avg_word_length"],
            max_symbol_ratio=q_cfg["max_symbol_ratio"],
            min_alpha_ratio=q_cfg["min_alpha_ratio"],
        )
        score_relevance(
            [doc],
            seed_terms=c_cfg["seed_terms"],
            min_relevance_score=c_cfg["min_relevance_score"],
        )

        if not doc.accepted:
            reason = doc.rejection_reason.value if doc.rejection_reason else "rejected"
            yield {"type": "file_stage", "file": name, "stage": "labelled",
                   "status": "rejected", "reason": reason}
            continue

        quality_score = round(doc.quality.score, 3) if doc.quality else None
        yield {"type": "file_stage", "file": name, "stage": "labelled",
               "status": "done", "quality": quality_score}

        # Stage: Chunking → Entities mapped
        if chunk_cfg.get("enabled", True):
            chunk_documents(
                [doc],
                chunk_size=chunk_cfg.get("chunk_size", 150),
                overlap=chunk_cfg.get("overlap", 20),
            )
        yield {"type": "file_stage", "file": name, "stage": "entities_mapped",
               "status": "done", "chunks": len(doc.chunks)}

    # ── Global stages ────────────────────────────────────────────────────────────
    yield {"type": "pipeline_stage", "stage": "dedup",
           "message": f"Deduplicating {len(docs)} documents…"}
    d_cfg = config["dedup"]
    deduplicate(
        docs,
        exact=d_cfg["exact"],
        near_duplicate=d_cfg["near_duplicate"],
        method=d_cfg.get("method", "minhash"),
        similarity_threshold=d_cfg["similarity_threshold"],
        minhash_num_perm=d_cfg.get("minhash_num_perm", 128),
    )

    yield {"type": "pipeline_stage", "stage": "writing", "message": "Writing curated outputs…"}
    write_curated(docs, config["curated_dir"])
    write_rejected(docs, config["rejected_dir"])

    yield {"type": "pipeline_stage", "stage": "graph", "message": "Building knowledge graph…"}
    g_cfg = config["graph"]
    try:
        graph = build_graph(
            docs,
            output_dir=config["graph_dir"],
            top_n_keywords=g_cfg["top_n_keywords"],
            min_edge_weight=g_cfg["min_edge_weight"],
            use_spacy_entities=g_cfg["use_spacy_entities"],
            spacy_model=g_cfg["spacy_model"],
            use_bigrams=g_cfg.get("use_bigrams", True),
            community_detection=g_cfg.get("community_detection", True),
            pagerank_alpha=g_cfg.get("pagerank_alpha", 0.85),
        )
    except Exception as exc:
        yield {"type": "error", "message": f"Graph build failed: {exc}"}
        return

    yield {"type": "pipeline_stage", "stage": "visualize", "message": "Generating graph visualization…"}
    try:
        from visualize_graph import visualize
        visualize()
    except Exception:
        pass  # non-fatal

    # Broadcast graphrag_ready to all accepted files
    accepted_names = [Path(d.source_path).name for d in docs if d.accepted]
    yield {"type": "graphrag_ready", "files": accepted_names}

    accepted = sum(1 for d in docs if d.accepted)
    rejected = sum(1 for d in docs if not d.accepted)
    yield {
        "type": "complete",
        "stats": {
            "total":       len(docs),
            "accepted":    accepted,
            "rejected":    rejected,
            "graph_nodes": graph.number_of_nodes(),
            "graph_edges": graph.number_of_edges(),
        },
    }
