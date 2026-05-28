"""
Pure-Python knowledge graph builder.
No external CLI required — uses regex NER + co-occurrence + networkx community detection.

Produces:
  <corpus_dir>/graphify-out/graph.json      — nodes/edges JSON
  <corpus_dir>/graphify-out/wiki/           — one .md per community
"""
import re
import json
import hashlib
import asyncio
import collections
from pathlib import Path
from typing import Callable, Awaitable

from app.config import get_settings

settings = get_settings()

# spaCy entity types to keep (filters out DATE, CARDINAL, PERCENT, MONEY, etc.)
_KEPT_TYPES = {
    "ORG",      # companies, agencies, institutions
    "GPE",      # countries, cities, states
    "LOC",      # non-GPE locations (mountain ranges, bodies of water)
    "PRODUCT",  # objects, vehicles, foods, products
    "PERSON",   # people
    "EVENT",    # named hurricanes, battles, wars, sports events
    "FAC",      # facilities (airports, bridges, hospitals)
    "NORP",     # nationalities, religious or political groups
    "LAW",      # named laws and regulations
}

# Regex fallback patterns (used only if spaCy is unavailable)
_ENTITY_PATTERNS = [
    r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})\b",
    r"\b([A-Z]{2,8})\b",
    r"\b(tariff\s+\w+|trade\s+\w+|supply\s+chain\s+\w*|port\s+of\s+\w+|"
    r"route\s+\w+|vendor\s+\w*|carrier\s+\w*|warehouse\s+\w*|SKU[-\s]?\w*|"
    r"lead\s+time\s*\w*|demand\s+forecast\s*\w*|inventory\s+\w*)\b",
]
_COMPILED = [re.compile(p, re.IGNORECASE) for p in _ENTITY_PATTERNS]

# Co-occurrence window (sentences within which two entities are related)
_CO_WINDOW = 3

# Event trigger keywords to tag on nodes
_EVENT_TRIGGERS = {
    "tariff", "sanction", "war", "conflict", "closure", "strike", "shortage",
    "disruption", "delay", "congestion", "pandemic", "earthquake", "flood",
    "hurricane", "fire", "bankruptcy", "acquisition", "merger", "regulation",
    "embargo", "blockade", "route closure", "port closure", "price surge",
    "demand spike", "inventory shortage", "lead time increase",
}

# Module-level NLP cache (loaded once per process)
_NLP_CACHE: dict = {}


def _get_nlp():
    """Load spaCy model once and cache it. Returns None if spaCy is unavailable."""
    if "nlp" in _NLP_CACHE:
        return _NLP_CACHE["nlp"]
    try:
        import spacy
        for model_name in ("en_core_web_lg", "en_core_web_md", "en_core_web_sm"):
            try:
                nlp = spacy.load(model_name, disable=["parser", "senter", "lemmatizer"])
                nlp.max_length = 2_000_000
                _NLP_CACHE["nlp"] = nlp
                return nlp
            except OSError:
                continue
    except ImportError:
        pass
    _NLP_CACHE["nlp"] = None
    return None


class GraphifyRunner:
    """
    Pure-Python knowledge graph builder.
    Extracts entities via regex NER, builds co-occurrence graph with networkx,
    detects communities via Louvain/greedy modularity, writes graph.json + wiki .md files.
    """

    def __init__(self, corpus_dir: str, output_dir: str | None = None):
        self.corpus_dir = Path(corpus_dir)
        self.output_dir = Path(output_dir) if output_dir else self.corpus_dir / "graphify-out"

    @property
    def graph_json_path(self) -> Path:
        return self.output_dir / "graph.json"

    @property
    def wiki_dir(self) -> Path:
        return self.output_dir / "wiki"

    @property
    def report_path(self) -> Path:
        return self.output_dir / "GRAPH_REPORT.md"

    def _corpus_hash(self) -> str:
        h = hashlib.sha256()
        for f in sorted(self.corpus_dir.rglob("*")):
            if f.is_file() and f.suffix != ".bin":
                h.update(f"{f}:{f.stat().st_mtime}".encode())
        return h.hexdigest()[:16]

    async def run(
        self,
        update_only: bool = False,
        progress_callback: Callable[[int, str], Awaitable[None]] | None = None,
    ) -> dict:
        """
        Build knowledge graph from canonical_corpus.jsonl (or any text files).
        Returns stats: entity_count, edge_count, community_count.
        """
        self.output_dir.mkdir(parents=True, exist_ok=True)

        async def _cb(pct: int, detail: str = ""):
            if progress_callback:
                await progress_callback(pct, detail)

        await _cb(5, "Loading corpus documents…")

        # 1. Load documents
        docs = self._load_corpus()
        if not docs:
            raise RuntimeError("No documents found in corpus directory")

        await _cb(15, f"Loaded {len(docs)} documents — extracting entities…")

        # 2. Extract entities per document (run in executor to avoid blocking event loop)
        loop = asyncio.get_event_loop()
        entity_map = await loop.run_in_executor(None, self._extract_entities, docs)

        await _cb(40, f"Found {len(entity_map)} unique entities — building co-occurrence graph…")

        # 3. Build co-occurrence graph
        import networkx as nx
        G = await loop.run_in_executor(None, self._build_graph, docs, entity_map)

        await _cb(65, f"Graph has {G.number_of_nodes()} nodes, {G.number_of_edges()} edges — detecting communities…")

        # 4. Community detection
        communities = await loop.run_in_executor(None, self._detect_communities, G)

        # Assign community IDs to nodes
        node_community = {}
        for comm_id, members in enumerate(communities):
            for node in members:
                node_community[node] = comm_id

        for node in G.nodes:
            G.nodes[node]["community"] = node_community.get(node, 0)

        await _cb(80, f"Detected {len(communities)} communities — writing graph.json…")

        # 5. Serialize graph
        graph_data = self._serialize_graph(G)
        self.graph_json_path.write_text(json.dumps(graph_data, ensure_ascii=False))

        await _cb(90, "Writing community wiki articles…")

        # 6. Write wiki articles per community
        self._write_wiki(G, communities, docs)

        stats = {
            "entity_count": G.number_of_nodes(),
            "edge_count": G.number_of_edges(),
            "community_count": len(communities),
        }

        await _cb(100, f"Done — {stats['entity_count']} entities, {stats['edge_count']} edges, {stats['community_count']} communities")
        return stats

    def _load_corpus(self) -> list[dict]:
        """Load canonical_corpus.jsonl or fallback to raw text files."""
        corpus_jsonl = self.corpus_dir / "canonical_corpus.jsonl"
        docs = []
        if corpus_jsonl.exists():
            with open(corpus_jsonl, encoding="utf-8", errors="replace") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            docs.append(json.loads(line))
                        except Exception:
                            continue
        else:
            for ext in ["*.txt", "*.json", "*.jsonl", "*.csv", "*.md"]:
                for p in self.corpus_dir.glob(ext):
                    text = p.read_text(encoding="utf-8", errors="replace")
                    docs.append({"id": p.stem, "title": p.stem, "text": text})
        return docs

    def _extract_entities(self, docs: list[dict]) -> dict[str, dict]:
        """Extract named entities. Uses spaCy NER if available, regex fallback otherwise."""
        nlp = _get_nlp()
        if nlp is not None:
            return self._extract_entities_spacy(docs, nlp)
        return self._extract_entities_regex(docs)

    def _extract_entities_spacy(self, docs: list[dict], nlp) -> dict[str, dict]:
        """spaCy NER: extracts typed real-world entities (ORG, GPE, PRODUCT, EVENT, etc.)."""
        entity_counts: dict[str, int] = collections.Counter()
        entity_types: dict[str, str] = {}

        # Collect text chunks — keep within spaCy's safe max_length
        chunks = []
        for doc in docs:
            text = doc.get("text", "")
            for i in range(0, len(text), 100_000):
                chunk = text[i:i + 100_000].strip()
                if chunk:
                    chunks.append(chunk)

        # Batch NER (disable unneeded components for speed)
        for spacy_doc in nlp.pipe(chunks, batch_size=32):
            for ent in spacy_doc.ents:
                if ent.label_ not in _KEPT_TYPES:
                    continue
                key = ent.text.strip()
                if not (3 <= len(key) <= 80):
                    continue
                lower = key.lower()
                entity_counts[lower] += 1
                if lower not in entity_types:
                    entity_types[lower] = ent.label_

        min_count = max(2, len(docs) // 50)
        entity_map = {}
        for ent_lower, cnt in entity_counts.items():
            if cnt >= min_count:
                is_trigger = any(t in ent_lower for t in _EVENT_TRIGGERS)
                entity_map[ent_lower] = {
                    "count": cnt,
                    "type": entity_types.get(ent_lower, "ENTITY"),
                    "is_event_trigger": is_trigger,
                }
        return entity_map

    def _extract_entities_regex(self, docs: list[dict]) -> dict[str, dict]:
        """Regex fallback when spaCy is unavailable."""
        entity_counts: dict[str, int] = collections.Counter()
        for doc in docs:
            text = doc.get("text", "")
            for pattern in _COMPILED:
                for m in pattern.finditer(text):
                    ent = m.group(0).strip()
                    if 2 < len(ent) < 80:
                        entity_counts[ent.lower()] += 1

        min_count = max(2, len(docs) // 50)
        entity_map = {}
        for ent, cnt in entity_counts.items():
            if cnt >= min_count:
                is_trigger = any(t in ent for t in _EVENT_TRIGGERS)
                entity_map[ent] = {
                    "count": cnt,
                    "type": "ENTITY",
                    "is_event_trigger": is_trigger,
                }
        return entity_map

    def _build_graph(self, docs: list[dict], entity_map: dict) -> "nx.Graph":
        """Build weighted co-occurrence graph from entity pairs in sentence windows."""
        import networkx as nx
        G = nx.Graph()

        # Add nodes
        for ent, props in entity_map.items():
            G.add_node(ent,
                       count=props["count"],
                       type=props.get("type", "ENTITY"),
                       is_event_trigger=props["is_event_trigger"],
                       label=ent)

        entity_keys = set(entity_map.keys())

        for doc in docs:
            text = doc.get("text", "")
            sentences = re.split(r"(?<=[.!?])\s+", text)

            # Sliding window over sentences
            for i in range(len(sentences)):
                window = " ".join(sentences[i: i + _CO_WINDOW]).lower()
                present = [e for e in entity_keys if e in window]

                for a_idx in range(len(present)):
                    for b_idx in range(a_idx + 1, len(present)):
                        a, b = present[a_idx], present[b_idx]
                        if G.has_edge(a, b):
                            G[a][b]["weight"] += 1
                        else:
                            G.add_edge(a, b, weight=1)

        # Prune very weak edges
        weak = [(u, v) for u, v, d in G.edges(data=True) if d.get("weight", 0) < 2]
        G.remove_edges_from(weak)

        # Remove isolated nodes
        isolates = list(nx.isolates(G))
        G.remove_nodes_from(isolates)

        return G

    def _detect_communities(self, G: "nx.Graph") -> list[set]:
        """Use greedy modularity community detection (networkx built-in)."""
        import networkx as nx
        import networkx.algorithms.community as nx_comm
        if G.number_of_nodes() == 0:
            return []
        try:
            communities = list(nx_comm.greedy_modularity_communities(G, weight="weight"))
        except Exception:
            # Fallback: each connected component is its own community
            communities = [c for c in nx.connected_components(G)]
        return communities

    def _serialize_graph(self, G: "nx.Graph") -> dict:
        nodes = []
        for node, data in G.nodes(data=True):
            nodes.append({
                "id": node,
                "label": data.get("label", node),
                "type": data.get("type", "ENTITY"),
                "count": data.get("count", 1),
                "community": data.get("community", 0),
                "is_event_trigger": data.get("is_event_trigger", False),
            })
        edges = []
        for u, v, data in G.edges(data=True):
            edges.append({"source": u, "target": v, "weight": data.get("weight", 1)})
        return {"nodes": nodes, "edges": edges}

    def _write_wiki(self, G: "nx.Graph", communities: list[set], docs: list[dict]) -> None:
        """Write one markdown wiki article per community, entities grouped by type."""
        self.wiki_dir.mkdir(parents=True, exist_ok=True)
        doc_texts = [d.get("text", "") for d in docs]

        _TYPE_LABELS = {
            "ORG": "Organizations", "GPE": "Countries & Cities",
            "LOC": "Locations", "PRODUCT": "Products & Goods",
            "PERSON": "People", "EVENT": "Events",
            "FAC": "Facilities", "NORP": "Groups & Nationalities",
            "LAW": "Regulations & Laws", "ENTITY": "Other Entities",
        }
        _TYPE_ORDER = ["ORG", "GPE", "LOC", "PRODUCT", "PERSON",
                       "EVENT", "FAC", "NORP", "LAW", "ENTITY"]

        for comm_id, members in enumerate(communities):
            members_list = sorted(members)
            triggers = [m for m in members_list if G.nodes[m].get("is_event_trigger", False)]

            # Group entities by spaCy type
            by_type: dict[str, list[str]] = collections.defaultdict(list)
            for m in members_list:
                etype = G.nodes[m].get("type", "ENTITY")
                by_type[etype].append(m)

            # Title: most-connected nodes (hub entities = most informative)
            hub_nodes = sorted(members_list, key=lambda n: G.degree(n), reverse=True)[:3]

            # Find sentences mentioning ≥2 entities from this community
            search_terms = set(m.lower() for m in members_list[:20])
            scored_snippets = []
            for text in doc_texts[:40]:
                for sent in re.split(r"(?<=[.!?])\s+", text):
                    sent_lower = sent.lower()
                    hits = sum(1 for t in search_terms if t in sent_lower)
                    if hits >= 2 and 8 <= len(sent.split()) <= 60:
                        scored_snippets.append((hits, sent.strip()))
                if len(scored_snippets) >= 10:
                    break
            scored_snippets.sort(reverse=True)
            top_snippets = [s for _, s in scored_snippets[:6]]

            # Build article
            md = f"# {', '.join(hub_nodes)}\n\n"
            for etype in _TYPE_ORDER:
                if etype in by_type:
                    label = _TYPE_LABELS.get(etype, etype)
                    entities = by_type[etype][:25]
                    md += f"**{label}:** {', '.join(entities)}\n\n"
            if triggers:
                md += f"**Disruption signals:** {', '.join(triggers[:10])}\n\n"
            if top_snippets:
                md += "## Key passages\n\n"
                for s in top_snippets:
                    md += f"> {s}\n\n"

            wiki_path = self.wiki_dir / f"community_{comm_id:04d}.md"
            wiki_path.write_text(md, encoding="utf-8")

    def get_graph_data(self) -> dict:
        if not self.graph_json_path.exists():
            return {"nodes": [], "edges": []}
        return json.loads(self.graph_json_path.read_text())

    def get_wiki_articles(self) -> list[dict]:
        articles = []
        if not self.wiki_dir.exists():
            return articles
        for md_file in sorted(self.wiki_dir.glob("*.md")):
            content = md_file.read_text(encoding="utf-8", errors="replace")
            articles.append({"title": md_file.stem, "content": content})
        return articles

    def query_graph(self, query: str, token_budget: int = 50000) -> str:
        """Return typed graph context relevant to query (keyword match on node labels)."""
        if not self.graph_json_path.exists():
            return ""
        data = self.get_graph_data()
        query_words = set(query.lower().split())
        relevant_nodes = [
            n for n in data.get("nodes", [])
            if any(w in n.get("label", "").lower() for w in query_words)
        ]
        if not relevant_nodes:
            return ""
        # Group by entity type for cleaner, more informative context
        by_type: dict[str, list[str]] = collections.defaultdict(list)
        for n in relevant_nodes[:80]:
            by_type[n.get("type", "ENTITY")].append(n["label"])
        context = "Relevant knowledge graph entities:\n"
        for etype, labels in sorted(by_type.items()):
            context += f"  [{etype}] {', '.join(labels[:20])}\n"
        return context
