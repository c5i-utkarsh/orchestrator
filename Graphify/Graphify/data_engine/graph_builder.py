"""Build a keyword/entity co-occurrence graph with bigrams, communities, and PageRank."""

from __future__ import annotations

import json
import logging
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import networkx as nx

from .models import Document
from .text_utils import tokenize

logger = logging.getLogger(__name__)

_STOP_WORDS = frozenset({
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "shall", "can", "this",
    "that", "these", "those", "it", "its", "we", "they", "he", "she",
    "you", "i", "my", "our", "their", "his", "her", "not", "no", "so",
    "if", "then", "than", "there", "here", "when", "what", "which",
    "who", "how", "all", "each", "every", "both", "few", "more", "most",
    "other", "some", "such", "into", "through", "during", "before",
    "after", "above", "below", "between", "out", "up", "about",
})


def build_graph(
    docs: list[Document],
    output_dir: str,
    top_n_keywords: int = 25,
    min_edge_weight: int = 2,
    use_spacy_entities: bool = True,
    spacy_model: str = "en_core_web_sm",
    use_bigrams: bool = True,
    community_detection: bool = True,
    pagerank_alpha: float = 0.85,
) -> nx.Graph:
    """Build and persist a keyword/entity co-occurrence graph.

    Nodes: unigram keywords + bigrams + named entities.
    Edges: co-occurrence within the same document.
    Node attributes: frequency, pagerank, community_id.

    Args:
        docs: All pipeline documents (only accepted ones used).
        output_dir: Directory for graph.json and graph.graphml.
        top_n_keywords: Number of top-frequency terms to keep as nodes.
        min_edge_weight: Drop edges below this co-occurrence count.
        use_spacy_entities: Augment with NER entities if spaCy is available.
        spacy_model: spaCy model name.
        use_bigrams: Include meaningful bigrams as additional nodes.
        community_detection: Run Louvain community detection and annotate nodes.
        pagerank_alpha: Damping factor for PageRank computation.

    Returns:
        The constructed NetworkX graph with community and PageRank attributes.
    """
    accepted = [d for d in docs if d.accepted]
    if not accepted:
        logger.warning("No accepted documents — graph will be empty")
        return nx.Graph()

    nlp = _load_spacy(spacy_model) if use_spacy_entities else None

    # ── Step 1: extract terms per document ────────────────────────────────────
    doc_term_sets: list[set[str]] = []
    global_freq: Counter[str] = Counter()

    for doc in accepted:
        terms = _extract_terms(doc.clean_text, nlp, use_bigrams)
        doc_term_sets.append(terms)
        global_freq.update(terms)

    # ── Step 2: select top-N nodes ────────────────────────────────────────────
    top_keywords = {term for term, _ in global_freq.most_common(top_n_keywords)}

    # ── Step 3: co-occurrence counting ────────────────────────────────────────
    edge_counts: dict[tuple[str, str], int] = defaultdict(int)
    for terms in doc_term_sets:
        relevant = sorted(terms & top_keywords)
        for i in range(len(relevant)):
            for j in range(i + 1, len(relevant)):
                edge_counts[(relevant[i], relevant[j])] += 1

    # ── Step 4: build graph ───────────────────────────────────────────────────
    G = nx.Graph()
    G.graph["name"] = "data_readiness_cooccurrence"

    for term in top_keywords:
        G.add_node(term, frequency=global_freq[term])

    for (u, v), weight in edge_counts.items():
        if weight >= min_edge_weight:
            G.add_edge(u, v, weight=weight)

    # Remove isolated nodes (no edges above threshold)
    isolated = [n for n in list(G.nodes) if G.degree(n) == 0]
    G.remove_nodes_from(isolated)

    # ── Step 5: PageRank ──────────────────────────────────────────────────────
    if G.number_of_nodes() > 0:
        pr = nx.pagerank(G, alpha=pagerank_alpha, weight="weight")
        nx.set_node_attributes(G, pr, "pagerank")
    else:
        nx.set_node_attributes(G, {}, "pagerank")

    # ── Step 6: Louvain community detection ───────────────────────────────────
    num_communities = 0
    if community_detection and G.number_of_nodes() > 0:
        try:
            communities = nx.community.louvain_communities(G, weight="weight", seed=42)
            community_map: dict[str, int] = {}
            for cid, members in enumerate(communities):
                for node in members:
                    community_map[node] = cid
            nx.set_node_attributes(G, community_map, "community_id")
            num_communities = len(communities)
            logger.info("Louvain detected %d communities", num_communities)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Community detection failed: %s", exc)

    logger.info(
        "Graph built — %d nodes, %d edges, %d communities",
        G.number_of_nodes(), G.number_of_edges(), num_communities,
    )

    _persist(G, output_dir)
    return G


def _extract_terms(text: str, nlp: Any | None, use_bigrams: bool) -> set[str]:
    """Return unigrams + bigrams + NER entities from text."""
    tokens = [t for t in tokenize(text) if len(t) > 2 and t not in _STOP_WORDS and t.isalpha()]
    terms: set[str] = set(tokens)

    if use_bigrams:
        for a, b in zip(tokens, tokens[1:]):
            bigram = f"{a}_{b}"
            terms.add(bigram)

    if nlp is not None:
        try:
            doc = nlp(text[:100_000])
            for ent in doc.ents:
                if ent.label_ in {"ORG", "PRODUCT", "GPE", "PERSON", "EVENT", "WORK_OF_ART", "LOC"}:
                    terms.add(ent.text.lower().replace(" ", "_"))
        except Exception as exc:  # noqa: BLE001
            logger.debug("spaCy NER failed: %s", exc)

    return terms


def _load_spacy(model: str) -> Any | None:
    try:
        import spacy
        return spacy.load(model)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not load spaCy model '%s': %s — NER disabled", model, exc)
        return None


def _persist(G: nx.Graph, output_dir: str) -> None:
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    json_path = out / "graph.json"
    data = nx.node_link_data(G, edges="edges")
    json_path.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")

    graphml_path = out / "graph.graphml"
    nx.write_graphml(G, str(graphml_path))

    logger.info("graph.json and graph.graphml written to '%s'", out)
