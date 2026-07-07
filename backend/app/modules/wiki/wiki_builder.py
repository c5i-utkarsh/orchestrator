import json
import os
import re
import time
from typing import Dict, List, Optional, Set


# Entity types that produce meaningless wiki pages (dates, numbers, raw cell values).
# These NER categories carry no explanatory value and generate garbage QA pairs
# during SLM distillation.
_EXCLUDED_ENTITY_TYPES: Set[str] = {
    "cardinal", "ordinal", "quantity", "date", "money", "percent",
    "value", "time", "duration",
    # spaCy label names (upper-case) are normalised to lower-case above,
    # but include them here as a belt-and-suspenders guard.
    "CARDINAL", "ORDINAL", "QUANTITY", "DATE", "MONEY", "PERCENT",
    "VALUE", "TIME",
}

# Regex patterns that indicate a label is a raw value, not a meaningful entity.
_ARTIFACT_PATTERNS = [
    re.compile(r"^\d{4}-\d{2}-\d{2}"),                   # ISO date: 2024-01-15
    re.compile(r"^date=", re.I),                           # date=2024-01-08
    re.compile(r"^[A-Za-z][A-Za-z0-9_%]+=[-\d.]", re.I), # COLUMN_NAME=value (any case, digits in name, optional %)
    re.compile(r"^[-\d.,]+[%]?$"),                         # pure numeric / percentage: 42, -3.14, 15.2%
    re.compile(r"^[\d,.\s%$€£]+$"),                        # currency/percent value
    re.compile(r"^\d{1,2}/\d{1,2}/\d{2,4}$"),            # date: 01/15/2024
    re.compile(r"^Q[1-4]\s+\d{4}$", re.I),               # Q1 2024
    re.compile(r"^[#@\-_=.]+$"),                           # noise characters only
    re.compile(r"^[A-Z]{2,10}_[A-Z_0-9]+="),             # ALL_CAPS_COLUMN=value (CSV headers)
]


def _is_skippable_entity(node: Dict) -> bool:
    """Return True if this canonical node should NOT get a wiki page.

    Skips:
    - Excluded NER types (dates, numbers, percentages, cardinals, etc.)
    - Labels that are raw data values (dates, numbers, key=value pairs)
    - Labels shorter than 3 meaningful characters
    - Labels that are purely numeric or whitespace
    - Labels containing COLUMN=value patterns anywhere in the string
    """
    entity_type = (node.get("entity_type") or node.get("type") or "").lower()
    if entity_type in _EXCLUDED_ENTITY_TYPES:
        return True

    label = (node.get("label") or node.get("canonical_id") or "").strip()

    # Too short to be a meaningful entity
    if len(label) < 3:
        return True

    # Purely numeric (with optional commas, dots, spaces)
    stripped = label.replace(",", "").replace(".", "").replace(" ", "")
    if stripped.isdigit():
        return True

    # Matches a known artifact pattern (start-anchored)
    for pattern in _ARTIFACT_PATTERNS:
        if pattern.match(label):
            return True

    # Contains a COLUMN=value pattern anywhere in the string
    # Catches cases like "; ACTV_SELL_QTY_WK=12225" that don't start with a letter
    if re.search(r"[A-Za-z][A-Za-z0-9_]+=[-\d.]", label):
        return True

    return False


class WikiBuilder:
    def __init__(self, corpus_dir: str):
        self.corpus_dir = corpus_dir
        self._wiki_dir = os.path.join(corpus_dir, "wiki_pages")
        self._wiki_index_path = os.path.join(self._wiki_dir, "index.json")
        os.makedirs(self._wiki_dir, exist_ok=True)

    def _page_path(self, canonical_id: str) -> str:
        safe = canonical_id.replace("/", "_").replace("\\", "_")
        return os.path.join(self._wiki_dir, f"{safe}.json")

    def _load_index(self) -> Dict:
        if not os.path.exists(self._wiki_index_path):
            return {"pages": [], "updated_at": None}
        try:
            with open(self._wiki_index_path) as f:
                data = json.load(f)
            if not isinstance(data, dict):
                return {"pages": [], "updated_at": None}
            data.setdefault("pages", [])
            data.setdefault("updated_at", None)
            return data
        except Exception:
            return {"pages": [], "updated_at": None}

    def _save_index(self, index_data: Dict):
        index_data["updated_at"] = time.time()
        with open(self._wiki_index_path, "w") as f:
            json.dump(index_data, f)

    @staticmethod
    def _collect_sources(node: Dict, edges: List[Dict]) -> List[Dict]:
        seen = set()
        sources: List[Dict] = []

        for prov in node.get("provenance", []):
            key = (prov.get("file_id"), prov.get("chunk_idx"))
            if key in seen:
                continue
            seen.add(key)
            sources.append({
                "file_id": prov.get("file_id"),
                "chunk_idx": prov.get("chunk_idx"),
                "excerpt": prov.get("chunk_preview", ""),
                "kind": "node",
            })

        for edge in edges:
            for prov in edge.get("provenance", []):
                key = (prov.get("file_id"), prov.get("chunk_idx"))
                if key in seen:
                    continue
                seen.add(key)
                sources.append({
                    "file_id": prov.get("file_id"),
                    "chunk_idx": prov.get("chunk_idx"),
                    "excerpt": prov.get("context") or prov.get("chunk_preview", ""),
                    "kind": "edge",
                })

        return sources[:100]

    @staticmethod
    def _timeline(edges: List[Dict]) -> List[Dict]:
        timeline = []
        for edge in edges:
            if edge.get("relation") != "occurred_at":
                continue
            timeline.append({
                "event": edge.get("source_label") or edge.get("source_canonical_id"),
                "time": edge.get("target_label") or edge.get("target_canonical_id"),
                "confidence": edge.get("confidence", 0.0),
                "citations": [
                    {
                        "file_id": p.get("file_id"),
                        "chunk_idx": p.get("chunk_idx"),
                        "excerpt": p.get("context") or p.get("chunk_preview", ""),
                    }
                    for p in edge.get("provenance", [])
                ],
            })
        return timeline[:25]

    @staticmethod
    def _summary(label: str, entity_type: str, edges: List[Dict]) -> str:
        """Build a human-readable summary sentence for this entity.

        Uses actual relationship data when available so distillation prompts
        receive substantive content rather than generic type-tracker sentences.
        """
        if not edges:
            return f"{label} ({entity_type}) — no relationships recorded in the knowledge graph."

        # Collect distinct relation verbs and their targets for a richer sentence
        rel_phrases: List[str] = []
        for edge in edges[:8]:
            relation = edge.get("relation", "")
            src_label = edge.get("source_label", "")
            tgt_label = edge.get("target_label", "")
            if not relation:
                continue
            if src_label and src_label.lower() != label.lower() and tgt_label:
                rel_phrases.append(f"{src_label} {relation.replace('_', ' ')} {tgt_label}")
            elif tgt_label and tgt_label.lower() != label.lower() and src_label:
                rel_phrases.append(f"{src_label} {relation.replace('_', ' ')} {tgt_label}")

        if rel_phrases:
            facts_str = "; ".join(rel_phrases[:4])
            return f"{label} is a {entity_type} in this corpus. Key relationships: {facts_str}."

        rel_types = sorted({e.get("relation", "related_to") for e in edges if e.get("relation")})
        if rel_types:
            return (
                f"{label} is a {entity_type} in this corpus with "
                f"{len(edges)} relationship(s): {', '.join(rel_types[:5])}."
            )
        return f"{label} is a {entity_type} referenced in the knowledge graph."

    def _facts(self, canonical_id: str, edges: List[Dict], node_lookup: Dict[str, Dict]) -> List[Dict]:
        facts: List[Dict] = []
        for edge in edges[:60]:
            source_id = edge.get("source_canonical_id")
            target_id = edge.get("target_canonical_id")
            relation = edge.get("relation", "related_to")

            source_label = node_lookup.get(source_id, {}).get("label", source_id)
            target_label = node_lookup.get(target_id, {}).get("label", target_id)

            if source_id == canonical_id:
                claim = f"{source_label} {relation} {target_label}."
            elif target_id == canonical_id:
                claim = f"{source_label} {relation} {target_label}."
            else:
                continue

            facts.append({
                "claim": claim,
                "relation": relation,
                "source_canonical_id": source_id,
                "target_canonical_id": target_id,
                "confidence": edge.get("confidence", 0.0),
                "citations": [
                    {
                        "file_id": p.get("file_id"),
                        "chunk_idx": p.get("chunk_idx"),
                        "excerpt": p.get("context") or p.get("chunk_preview", ""),
                    }
                    for p in edge.get("provenance", [])
                ],
            })
        return facts[:40]

    def build_pages_for_nodes(self, file_id: str, canonical_node_ids: List[str], canonical_graph: Dict) -> Dict:
        node_lookup = {
            n.get("canonical_id"): n
            for n in canonical_graph.get("nodes", [])
            if n.get("canonical_id")
        }
        edges = canonical_graph.get("edges", [])

        target_ids: Set[str] = {
            cid for cid in canonical_node_ids
            if cid in node_lookup and not _is_skippable_entity(node_lookup[cid])
        }
        if not target_ids:
            return {
                "pages_created": 0,
                "pages_updated": 0,
                "total_target_nodes": 0,
                "updated_page_ids": [],
            }

        index_data = self._load_index()
        index_map = {p.get("canonical_id"): p for p in index_data.get("pages", []) if p.get("canonical_id")}

        pages_created = 0
        pages_updated = 0
        updated_page_ids: List[str] = []

        for canonical_id in sorted(target_ids):
            node = node_lookup[canonical_id]
            local_edges = [
                e for e in edges
                if e.get("source_canonical_id") == canonical_id or e.get("target_canonical_id") == canonical_id
            ]

            facts = self._facts(canonical_id, local_edges, node_lookup)
            related_entities = []
            related_ids = set()
            for edge in local_edges:
                sid = edge.get("source_canonical_id")
                tid = edge.get("target_canonical_id")
                neighbor = tid if sid == canonical_id else sid
                if not neighbor or neighbor == canonical_id or neighbor in related_ids:
                    continue
                related_ids.add(neighbor)
                related_entities.append({
                    "canonical_id": neighbor,
                    "label": node_lookup.get(neighbor, {}).get("label", neighbor),
                    "relation": edge.get("relation", "related_to"),
                })

            page = {
                "canonical_id": canonical_id,
                "title": node.get("label", canonical_id),
                "entity_type": node.get("entity_type", "entity"),
                "aliases": node.get("aliases", []),
                "summary": self._summary(node.get("label", canonical_id), node.get("entity_type", "entity"), local_edges),
                "key_facts": facts,
                "timeline": self._timeline(local_edges),
                "related_entities": related_entities[:30],
                "sources": self._collect_sources(node, local_edges),
                "source_files": sorted(set(node.get("source_files", []))),
                "updated_by_file_id": file_id,
                "generated_at": time.time(),
                "version": int(index_map.get(canonical_id, {}).get("version", 0)) + 1,
                "citation_coverage": {
                    "facts_with_citations": sum(1 for f in facts if f.get("citations")),
                    "total_facts": len(facts),
                },
            }

            with open(self._page_path(canonical_id), "w") as f:
                json.dump(page, f)

            updated_page_ids.append(canonical_id)
            if canonical_id in index_map:
                pages_updated += 1
            else:
                pages_created += 1

            index_map[canonical_id] = {
                "canonical_id": canonical_id,
                "title": page["title"],
                "entity_type": page["entity_type"],
                "source_files": page["source_files"],
                "version": page["version"],
                "generated_at": page["generated_at"],
            }

        index_data["pages"] = sorted(index_map.values(), key=lambda p: p.get("generated_at", 0), reverse=True)
        self._save_index(index_data)

        return {
            "pages_created": pages_created,
            "pages_updated": pages_updated,
            "total_target_nodes": len(target_ids),
            "updated_page_ids": updated_page_ids,
        }

    def get_page(self, canonical_id: str) -> Optional[Dict]:
        path = self._page_path(canonical_id)
        if not os.path.exists(path):
            return None
        with open(path) as f:
            return json.load(f)

    def list_pages(self, query: Optional[str] = None, file_ids: Optional[List[str]] = None, limit: int = 100) -> Dict:
        index_data = self._load_index()
        pages = index_data.get("pages", [])

        if file_ids:
            allowed = set(file_ids)
            pages = [p for p in pages if set(p.get("source_files", [])) & allowed]

        if query:
            q = query.lower().strip()
            pages = [
                p for p in pages
                if q in str(p.get("title", "")).lower() or q in str(p.get("entity_type", "")).lower()
            ]

        pages = pages[: max(1, min(limit, 500))]
        return {
            "pages": pages,
            "count": len(pages),
            "updated_at": index_data.get("updated_at"),
        }
