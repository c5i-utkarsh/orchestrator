"""
Layer 10 · Ontology & Semantic Governance Layer.

WHY IT EXISTS
    A trustworthy enterprise graph needs a governed vocabulary: a controlled set of
    entity types and *allowed* relation types with constraints. Without governance the
    graph accretes synonymous/ad-hoc relations ("works_for" vs "employed_by" vs
    "staff_of"), which breaks consistency, querying and GraphRAG. This layer enforces
    the ontology and lets it *evolve* deliberately rather than silently.

WHAT IT PRODUCES
    - A persisted, accumulating corpus ontology (`ontology.json`): entity types,
      allowed relation types (seeded from confidence_scoring.RELATION_PRIOR + domain),
      and proposed-but-not-yet-admitted types with provenance counts.
    - Governed relationships, each tagged `ontology_status = conformant | proposed`.
    - A conformance report.

WHY ITS ORDERING MATTERS
    It runs AFTER ML Validation (only trusted candidates are worth governing) and BEFORE
    canonicalization + graph construction, so the graph is built against an agreed
    schema. Governing after graph build would mean retro-fixing an already-polluted graph.

DOWNSTREAM DEPENDENCY IT ENABLES
    - Graph Construction (Layer 12) inserts only ontology-aware edges.
    - Graph Validation (Layer 13) checks relation-type conformance against this ontology.
    - Ontology evolution: new relation types accumulate provenance and can be promoted.
"""
from __future__ import annotations

import json
import os
from collections import Counter
from typing import Any, Dict, List

from app.modules.kg.confidence_scoring import RELATION_PRIOR

# Domain-specific entity-type seeds keep the ontology scoped per workspace domain.
_DOMAIN_ENTITY_SEEDS: Dict[str, List[str]] = {
    "finance": ["ORG", "MONEY", "PERCENT", "DATE", "PERSON"],
    "healthcare": ["ORG", "PERSON", "CONDITION", "DRUG", "DATE"],
    "legal": ["ORG", "PERSON", "LAW", "DATE", "GPE"],
    "manufacturing": ["ORG", "PRODUCT", "FACILITY", "DATE", "QUANTITY"],
    "general": ["ORG", "PERSON", "GPE", "DATE", "PRODUCT", "ENTITY"],
}
# How many independent mentions a proposed relation needs before it's promotable.
_PROMOTION_THRESHOLD = 3


def _ontology_path(corpus_dir: str) -> str:
    return os.path.join(corpus_dir, "ontology.json")


def _load_ontology(corpus_dir: str, domain_label: str) -> Dict[str, Any]:
    path = _ontology_path(corpus_dir)
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    seeds = _DOMAIN_ENTITY_SEEDS.get((domain_label or "general").lower(), _DOMAIN_ENTITY_SEEDS["general"])
    return {
        "domain_label": domain_label,
        "entity_types": sorted(set(seeds)),
        "allowed_relations": sorted(RELATION_PRIOR.keys()),
        "proposed_relations": {},   # relation -> provenance count
        "proposed_entity_types": {},
    }


def govern(
    domain_label: str,
    entities: List[Dict[str, Any]],
    relationships: List[Dict[str, Any]],
    semantic_profile: Dict[str, Any] | None = None,
    corpus_dir: str = "corpus_store",
) -> Dict[str, Any]:
    """
    Validate entity/relation types against the corpus ontology, accumulate proposals for
    unseen types, persist the evolved ontology, and tag relationships with conformance.
    Returns {"governed_relationships", "ontology", "report"}.
    """
    ontology = _load_ontology(corpus_dir, domain_label)
    allowed_rel = set(ontology.get("allowed_relations", []))
    allowed_ent = set(ontology.get("entity_types", []))
    proposed_rel = Counter(ontology.get("proposed_relations", {}))
    proposed_ent = Counter(ontology.get("proposed_entity_types", {}))

    # Entity-type governance
    for e in entities:
        label = str(e.get("label") or e.get("ner_label") or "ENTITY").upper()
        if label not in allowed_ent:
            proposed_ent[label] += 1

    # Relation-type governance + conformance tagging
    governed: List[Dict[str, Any]] = []
    conformant = 0
    for r in relationships:
        relation = str(r.get("relation") or "related_to").strip().lower()
        if relation in allowed_rel:
            status = "conformant"
            conformant += 1
        else:
            status = "proposed"
            proposed_rel[relation] += 1
        governed.append({**r, "ontology_status": status})

    # Ontology evolution: promote sufficiently-attested proposals into the allowed set.
    promoted_rel = [rel for rel, n in proposed_rel.items() if n >= _PROMOTION_THRESHOLD]
    for rel in promoted_rel:
        allowed_rel.add(rel)
        del proposed_rel[rel]
    promoted_ent = [et for et, n in proposed_ent.items() if n >= _PROMOTION_THRESHOLD]
    for et in promoted_ent:
        allowed_ent.add(et)
        del proposed_ent[et]

    ontology.update({
        "domain_label": domain_label,
        "entity_types": sorted(allowed_ent),
        "allowed_relations": sorted(allowed_rel),
        "proposed_relations": dict(proposed_rel),
        "proposed_entity_types": dict(proposed_ent),
    })
    try:
        os.makedirs(corpus_dir, exist_ok=True)
        with open(_ontology_path(corpus_dir), "w", encoding="utf-8") as f:
            json.dump(ontology, f)
    except Exception:
        pass

    report = {
        "domain_label": domain_label,
        "relationships_in": len(relationships),
        "conformant": conformant,
        "proposed": len(relationships) - conformant,
        "newly_promoted_relations": promoted_rel,
        "newly_promoted_entity_types": promoted_ent,
        "open_relation_proposals": dict(proposed_rel),
        "allowed_relation_count": len(allowed_rel),
    }
    return {"governed_relationships": governed, "ontology": ontology, "report": report}
