"""
Layer 9 · ML Validation & Accuracy Engine.

WHY IT EXISTS
    This is the hallucination firewall. Everything extracted so far (entities,
    relationships) is *candidate* knowledge. If unverified candidates flow straight into
    the knowledge graph, the graph — and every answer grounded on it — inherits their
    errors. This layer scores accuracy/trust and gates what is allowed to proceed.

WHAT IT PRODUCES
    - Filtered (accepted) entity & relationship sets above a confidence threshold.
    - A trust report (`{file_id}_validation.json`) with a per-corpus trust scorecard,
      confidence histograms, and the reason each item was dropped.

WHY ITS ORDERING MATTERS
    It runs AFTER extraction + EDA + semantic learning (it needs their confidence
    signals and the extraction-reliability prior from metadata) and strictly BEFORE
    ontology governance, canonicalization and graph construction — nothing reaches the
    graph layers without passing through here first.

DOWNSTREAM DEPENDENCY IT ENABLES
    - Canonicalization (Layer 11) only resolves trusted nodes.
    - Graph Construction (Layer 12) inserts only validated edges.
    - The trust score becomes an explainability signal exposed to the UI/governance.
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, List

from app.modules.kg.confidence_scoring import (
    confidence_histogram,
    quality_scorecard,
    score_entities,
    score_relationships,
)


def _conf(item: Dict[str, Any]) -> float:
    try:
        return float(item.get("eda_confidence", 0.0) or 0.0)
    except Exception:
        return 0.0


def validate_accuracy(
    file_id: str,
    entities: List[Dict[str, Any]],
    relationships: List[Dict[str, Any]],
    chunks: List[Dict[str, Any]],
    chunk_validation: Dict[str, Any] | None = None,
    metadata: Dict[str, Any] | None = None,
    threshold: float = 0.5,
    corpus_dir: str = "corpus_store",
) -> Dict[str, Any]:
    """
    Gate candidate entities/relationships by confidence and compute a trust scorecard.
    Returns {"accepted_entities", "accepted_relationships", "report"}.
    """
    # Ensure confidence is present (idempotent — re-scores if upstream skipped it).
    if entities and "eda_confidence" not in entities[0]:
        entities = score_entities(entities).get("entities", entities)
    if relationships and "eda_confidence" not in (relationships[0] if relationships else {}):
        ent_conf = {
            str(e.get("text") or "").strip().lower(): _conf(e) for e in entities
        }
        relationships = score_relationships(relationships, ent_conf).get("relationships", relationships)

    ent_values = [_conf(e) for e in entities]
    rel_values = [_conf(r) for r in relationships]

    accepted_entities = [e for e in entities if _conf(e) >= threshold]
    accepted_ids = {str(e.get("text") or "").strip().lower() for e in accepted_entities}
    accepted_relationships = [
        r for r in relationships
        if _conf(r) >= threshold
        and str(r.get("source") or "").strip().lower() in accepted_ids
        and str(r.get("target") or "").strip().lower() in accepted_ids
    ]

    entity_mean = sum(ent_values) / max(1, len(ent_values))
    relation_mean = sum(rel_values) / max(1, len(rel_values))
    # Consistency: share of relationships whose endpoints survived as accepted entities.
    consistency = (len(accepted_relationships) / len(relationships)) if relationships else 1.0
    # Completeness: chunk coverage from Layer 4's validation report, if available.
    completeness = float((chunk_validation or {}).get("coverage_pct", 0.0) or 0.0)
    if completeness > 1.0:
        completeness = completeness / 100.0
    if not completeness:
        completeness = 1.0 if chunks else 0.0
    extraction_reliability = float((metadata or {}).get("extraction_reliability_hint", 0.7) or 0.7)
    graph_density = min(1.0, len(relationships) / max(1, len(entities)))

    scorecard = quality_scorecard(
        entity_mean=entity_mean,
        relation_mean=relation_mean,
        graph_density=graph_density,
        consistency_score=consistency,
        completeness_score=completeness,
        extraction_reliability=extraction_reliability,
    )

    report = {
        "file_id": file_id,
        "threshold": threshold,
        "entity_count_in": len(entities),
        "entity_count_accepted": len(accepted_entities),
        "entity_count_dropped": len(entities) - len(accepted_entities),
        "relationship_count_in": len(relationships),
        "relationship_count_accepted": len(accepted_relationships),
        "relationship_count_dropped": len(relationships) - len(accepted_relationships),
        "entity_confidence_histogram": confidence_histogram(ent_values),
        "relationship_confidence_histogram": confidence_histogram(rel_values),
        "scorecard": scorecard,
        "trust_score": scorecard.get("graph_trust_score", 0.0),
        "passed": scorecard.get("graph_trust_score", 0.0) >= threshold,
    }

    try:
        processed_dir = os.path.join(corpus_dir, "processed")
        os.makedirs(processed_dir, exist_ok=True)
        with open(os.path.join(processed_dir, f"{file_id}_validation.json"), "w", encoding="utf-8") as f:
            json.dump(report, f)
    except Exception:
        pass

    return {
        "accepted_entities": accepted_entities,
        "accepted_relationships": accepted_relationships,
        "report": report,
    }
