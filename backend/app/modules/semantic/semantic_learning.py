"""
Layer 7 · Semantic Learning Layer.

WHY IT EXISTS
    Lexical tokens alone cannot tell whether two mentions mean the same thing, what a
    corpus is "about", or which chunks are semantically central. This layer turns text
    into vector semantics and learns an adaptive semantic profile of the corpus, which
    is what makes resolution, ontology governance and GraphRAG retrieval possible.

WHAT IT PRODUCES
    - The FAISS embedding index (this layer OWNS embedding — moved here from the old
      final stage so semantics are available to every later layer).
    - A semantic profile (`{file_id}_semantic.json`): salient terms (adaptive domain
      vocabulary), corpus centroid coherence, and representative chunks.

WHY ITS ORDERING MATTERS
    It runs AFTER entity extraction (so it can relate terms to entities) but BEFORE EDA,
    validation, resolution and ontology — all of which consume embeddings or the learned
    vocabulary. Embedding late (as the old pipeline did) starved those layers of meaning.

DOWNSTREAM DEPENDENCY IT ENABLES
    - Canonicalization & Resolution (Layer 11) uses embeddings for fuzzy entity merging.
    - Ontology Governance (Layer 10) seeds domain vocabulary from salient terms.
    - GraphRAG / orchestrator retrieval queries this FAISS index at answer time.
"""
from __future__ import annotations

import json
import math
import os
import re
from collections import Counter
from typing import Any, Dict, List

_STOPWORDS = {
    "the", "and", "for", "are", "was", "were", "this", "that", "with", "from", "have",
    "has", "had", "not", "but", "you", "your", "they", "their", "what", "which", "when",
    "will", "would", "there", "been", "being", "into", "than", "then", "them", "these",
    "those", "such", "also", "can", "may", "any", "all", "our", "its", "out", "per",
}
_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z\-]{2,}")


def _salient_terms(chunks: List[Dict[str, Any]], top_k: int = 25) -> List[Dict[str, Any]]:
    """TF-weighted salient terms = adaptive domain vocabulary for this corpus."""
    doc_freq: Counter = Counter()
    term_freq: Counter = Counter()
    n_chunks = max(1, len(chunks))
    for ch in chunks:
        toks = [t.lower() for t in _TOKEN_RE.findall(ch.get("text", "") or "")]
        toks = [t for t in toks if t not in _STOPWORDS]
        term_freq.update(toks)
        doc_freq.update(set(toks))
    ranked = []
    for term, tf in term_freq.most_common(200):
        idf = math.log((n_chunks + 1) / (doc_freq.get(term, 1) + 1)) + 1.0
        ranked.append((term, round(tf * idf, 3)))
    ranked.sort(key=lambda x: x[1], reverse=True)
    return [{"term": t, "salience": s} for t, s in ranked[:top_k]]


def _coherence(embed_store, chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Embed a sample of chunks, compute the corpus centroid, and measure how tightly
    chunks cluster around it (mean cosine to centroid). High coherence => focused
    corpus; low => mixed/noisy. Surfaces the most-representative chunks.
    """
    try:
        import numpy as np
    except Exception:
        return {"checked": False}
    sample = chunks[:64]
    vecs = []
    for ch in sample:
        try:
            v = embed_store.embed_text(ch.get("text", "") or "")
            v = np.asarray(v, dtype="float32").ravel()
            if v.size:
                vecs.append(v)
        except Exception:
            continue
    if not vecs:
        return {"checked": False}
    mat = np.vstack(vecs)
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    unit = mat / norms
    centroid = unit.mean(axis=0)
    cn = np.linalg.norm(centroid) or 1.0
    sims = unit @ (centroid / cn)
    order = sims.argsort()[::-1][:3]
    return {
        "checked": True,
        "sampled": int(mat.shape[0]),
        "mean_centroid_similarity": round(float(sims.mean()), 4),
        "representative_chunk_idx": [int(sample[i].get("idx", i)) for i in order],
    }


def learn_semantics(
    file_id: str,
    chunks: List[Dict[str, Any]],
    embed_store,
    corpus_dir: str = "corpus_store",
) -> Dict[str, Any]:
    """
    Embed+index the chunks (owns embedding) and learn the corpus semantic profile.
    Returns {"embed_count", "profile"}.
    """
    embed_count = 0
    try:
        embed_count = embed_store.add_chunks(file_id, chunks)
    except Exception:
        embed_count = 0

    profile = {
        "file_id": file_id,
        "salient_terms": _salient_terms(chunks),
        "coherence": _coherence(embed_store, chunks),
        "embedded_chunks": embed_count,
    }
    try:
        processed_dir = os.path.join(corpus_dir, "processed")
        os.makedirs(processed_dir, exist_ok=True)
        with open(os.path.join(processed_dir, f"{file_id}_semantic.json"), "w", encoding="utf-8") as f:
            json.dump(profile, f)
    except Exception:
        pass

    return {"embed_count": embed_count, "profile": profile}
