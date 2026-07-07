"""Quality scorecard routes."""
from __future__ import annotations
import json
import os
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.db.database import get_db
from app.modules.corpus_resolver import resolve_corpus_dir as _corpus_dir

router = APIRouter(prefix="/quality", tags=["quality"])


@router.get("/{job_id}/metrics")
async def quality_metrics(job_id: str, db: AsyncSession = Depends(get_db)):
    corpus_dir = await _corpus_dir(job_id, db)
    from app.modules.graph.graph_builder import GraphBuilder
    from app.modules.kg.entity_resolution import registry_metrics

    graph_builder = GraphBuilder(corpus_dir)
    graph_metrics = graph_builder.canonical_graph_metrics()
    reg_metrics = registry_metrics(corpus_dir)

    # Aggregate EDA scorecards
    processed_dir = os.path.join(corpus_dir, "processed")
    scorecards = []
    if os.path.isdir(processed_dir):
        for fname in os.listdir(processed_dir):
            if fname.endswith("_kg_scorecard.json"):
                try:
                    with open(os.path.join(processed_dir, fname), encoding="utf-8") as f:
                        scorecards.append(json.load(f))
                except Exception:
                    pass

    return {
        "job_id": job_id,
        "graph_metrics": graph_metrics,
        "registry_metrics": reg_metrics,
        "file_scorecards": scorecards,
        "file_count": len(scorecards),
    }


@router.get("/{job_id}/eda")
async def quality_eda(job_id: str, db: AsyncSession = Depends(get_db)):
    """
    Return per-file EDA summaries and metadata for all files in a corpus.
    Reads pre-computed *_eda_summary.json and *_metadata.json from processed/.
    Zero recomputation — file reads only.
    """
    corpus_dir = await _corpus_dir(job_id, db)
    processed = Path(corpus_dir) / "processed"
    files = []

    if processed.exists():
        # Collect all file_ids that have an eda_summary
        for fname in sorted(processed.iterdir()):
            if not fname.name.endswith("_eda_summary.json"):
                continue
            file_id = fname.name[: -len("_eda_summary.json")]
            try:
                summary = json.loads(fname.read_text(encoding="utf-8"))
            except Exception:
                continue
            meta_path = processed / f"{file_id}_metadata.json"
            meta = {}
            if meta_path.exists():
                try:
                    meta = json.loads(meta_path.read_text(encoding="utf-8"))
                except Exception:
                    pass
            scorecard_path = processed / f"{file_id}_kg_scorecard.json"
            scorecard = {}
            if scorecard_path.exists():
                try:
                    scorecard = json.loads(scorecard_path.read_text(encoding="utf-8"))
                except Exception:
                    pass
            files.append({"file_id": file_id, "summary": summary,
                          "metadata": meta, "scorecard": scorecard})

    return {"job_id": job_id, "files": files}


@router.get("/{job_id}/ontology")
async def quality_ontology(job_id: str, db: AsyncSession = Depends(get_db)):
    """
    Return ontology and graph-consistency artifacts.
    Reads pre-computed ontology.json and graph_consistency.json.
    Zero recomputation — file reads only.
    """
    corpus_dir = await _corpus_dir(job_id, db)
    p = Path(corpus_dir)
    ontology = None
    consistency = None
    if (p / "ontology.json").exists():
        try:
            ontology = json.loads((p / "ontology.json").read_text(encoding="utf-8"))
        except Exception:
            pass
    if (p / "graph_consistency.json").exists():
        try:
            consistency = json.loads((p / "graph_consistency.json").read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"job_id": job_id, "ontology": ontology, "graph_consistency": consistency}

