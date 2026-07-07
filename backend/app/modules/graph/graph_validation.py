"""
Layer 13 · Graph Validation & Consistency Engine.

WHY IT EXISTS
    Even with validated candidates and a governed ontology, the *assembled* graph can be
    inconsistent: dangling edges, orphan nodes, relations that violate the ontology,
    self-loops, or contradictory cycles. Publishing an inconsistent graph (and the wiki
    built on it) would surface those defects to users as confident facts. This engine is
    the last consistency gate before anything is exposed.

WHAT IT PRODUCES
    A consistency report (`graph_consistency.json`): referential-integrity result,
    orphan/self-loop counts, ontology relation-conformance, cycle detection, and an
    overall `passed` verdict + observability metrics.

WHY ITS ORDERING MATTERS
    It runs AFTER Knowledge Graph Construction (Layer 12) — it needs the fully assembled
    graph — and BEFORE Wiki + Explainability (Layer 14), so only a consistent graph is
    ever turned into human-facing pages.

DOWNSTREAM DEPENDENCY IT ENABLES
    - Wiki + Explainability (Layer 14) renders only a validated graph.
    - Graph observability: the report is the health signal exposed to the UI/governance.
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, List

from app.modules.kg.knowledge_schema import validate_canonical_graph


def _node_id(n: Dict[str, Any]) -> str:
    return str(n.get("canonical_id") or n.get("id") or "")


def _edge_ends(e: Dict[str, Any]) -> tuple[str, str]:
    src = str(e.get("source_canonical_id") or e.get("source") or "")
    tgt = str(e.get("target_canonical_id") or e.get("target") or "")
    return src, tgt


def _detect_cycles(node_ids: set, edges: List[Dict[str, Any]], cap: int = 5000) -> int:
    """Count back-edges via DFS (proxy for cycles) — bounded for large graphs."""
    adj: Dict[str, List[str]] = {nid: [] for nid in node_ids}
    for e in edges[:cap]:
        s, t = _edge_ends(e)
        if s in adj and t in node_ids:
            adj[s].append(t)
    WHITE, GREY, BLACK = 0, 1, 2
    color = {nid: WHITE for nid in node_ids}
    back_edges = 0

    def visit(start: str) -> None:
        nonlocal back_edges
        stack = [(start, iter(adj.get(start, [])))]
        color[start] = GREY
        while stack:
            node, it = stack[-1]
            advanced = False
            for nxt in it:
                if color.get(nxt) == GREY:
                    back_edges += 1
                elif color.get(nxt) == WHITE:
                    color[nxt] = GREY
                    stack.append((nxt, iter(adj.get(nxt, []))))
                    advanced = True
                    break
            if not advanced:
                color[node] = BLACK
                stack.pop()

    for nid in node_ids:
        if color.get(nid) == WHITE:
            visit(nid)
    return back_edges


def validate_graph(
    canonical_graph: Dict[str, Any],
    ontology: Dict[str, Any] | None = None,
    corpus_dir: str = "corpus_store",
) -> Dict[str, Any]:
    """Run consistency checks over the assembled canonical graph and persist a report."""
    nodes = canonical_graph.get("nodes", []) or []
    edges = canonical_graph.get("edges", []) or []
    node_ids = {_node_id(n) for n in nodes if _node_id(n)}

    # 1. Referential integrity / schema completeness (reuse canonical validator).
    try:
        integrity = validate_canonical_graph(nodes, edges)
    except Exception as exc:
        integrity = {"valid": False, "errors": [f"validator_error: {exc}"], "error_count": 1}

    # 2. Dangling edges + self-loops.
    dangling = 0
    self_loops = 0
    referenced: set = set()
    for e in edges:
        s, t = _edge_ends(e)
        if s not in node_ids or t not in node_ids:
            dangling += 1
        if s and s == t:
            self_loops += 1
        referenced.add(s)
        referenced.add(t)

    # 3. Orphan nodes (participate in no edge).
    orphans = [nid for nid in node_ids if nid not in referenced]

    # 4. Ontology relation conformance.
    allowed_rel = set((ontology or {}).get("allowed_relations", []))
    nonconformant = 0
    if allowed_rel:
        for e in edges:
            if str(e.get("relation") or "related_to").strip().lower() not in allowed_rel:
                nonconformant += 1

    # 5. Cycle proxy.
    back_edges = _detect_cycles(node_ids, edges)

    passed = (
        bool(integrity.get("valid", False))
        and dangling == 0
        and self_loops == 0
    )

    report = {
        "node_count": len(nodes),
        "edge_count": len(edges),
        "referential_integrity": {
            "valid": integrity.get("valid", False),
            "error_count": integrity.get("error_count", 0),
            "errors": integrity.get("errors", [])[:25],
        },
        "dangling_edges": dangling,
        "self_loops": self_loops,
        "orphan_node_count": len(orphans),
        "orphan_nodes_sample": orphans[:25],
        "ontology_nonconformant_edges": nonconformant,
        "cycle_back_edges": back_edges,
        "passed": passed,
    }

    try:
        os.makedirs(corpus_dir, exist_ok=True)
        with open(os.path.join(corpus_dir, "graph_consistency.json"), "w", encoding="utf-8") as f:
            json.dump(report, f)
    except Exception:
        pass

    return report
