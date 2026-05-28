"""
Per-corpus FAISS vector store — ported from AI_Orchestrator/backend/embedding.py.

Each corpus job gets its own isolated FAISS index stored under:
    corpus_store/{job_id}/faiss/index.faiss
    corpus_store/{job_id}/faiss/chunks.pkl

Usage:
    store = FaissStore(corpus_dir="/path/to/corpus_store/job-uuid")
    store.add_chunks("file-id", chunks)          # chunks = [{"idx": 0, "text": "..."}]
    results = store.search("my query", k=5)      # returns top-k dicts with score
"""
import os
import ssl
import pickle
import logging
import hashlib
from pathlib import Path
from typing import List, Dict, Optional

import numpy as np

logger = logging.getLogger(__name__)

# ── SSL bypass so sentence-transformers downloads work behind corporate proxies ─
os.environ.setdefault("HF_HUB_DISABLE_SSL_VERIFY", "1")
os.environ.setdefault("CURL_CA_BUNDLE", "")
try:
    ssl._create_default_https_context = ssl._create_unverified_context
except Exception:
    pass
try:
    import urllib3
    urllib3.disable_warnings()
except Exception:
    pass
try:
    import requests as _req
    _orig_send = _req.Session.send
    def _no_verify_send(self, *args, **kwargs):
        kwargs.setdefault("verify", False)
        return _orig_send(self, *args, **kwargs)
    _req.Session.send = _no_verify_send
except Exception:
    pass
# ─────────────────────────────────────────────────────────────────────────────

DIMENSION = 384
MODEL_NAME = "all-MiniLM-L6-v2"


class FaissStore:
    """
    Lightweight per-job FAISS index for chunk-level semantic search.
    Thread-safe for concurrent reads; serialises writes via Python's GIL.
    """

    def __init__(self, corpus_dir: str | Path):
        self.corpus_dir = Path(corpus_dir)
        self.faiss_dir = self.corpus_dir / "faiss"
        self.faiss_dir.mkdir(parents=True, exist_ok=True)
        self._index_path = self.faiss_dir / "index.faiss"
        self._chunks_path = self.faiss_dir / "chunks.pkl"
        self._model = None
        self.index = None
        self.chunks: List[Dict] = []
        self._load()

    # ── Public API ────────────────────────────────────────────────────────────

    def add_chunks(self, file_id: str, chunks: List[Dict]) -> int:
        """
        Embed *chunks* and add them to the FAISS index.
        Returns the number of vectors added.
        """
        if not chunks:
            return 0
        texts = [c["text"] for c in chunks]
        embeddings = self._embed_batch(texts)
        self.index.add(embeddings)
        for i, chunk in enumerate(chunks):
            self.chunks.append({
                "file_id": file_id,
                "text": chunk["text"],
                "chunk_idx": chunk.get("idx", i),
            })
        self._save()
        logger.info("FaissStore: indexed %d chunks for %s (total %d)", len(chunks), file_id, len(self.chunks))
        return len(chunks)

    def search(
        self,
        query: str,
        k: int = 5,
        file_ids: Optional[List[str]] = None,
    ) -> List[Dict]:
        """
        Embed *query* and return the top-k most similar chunks.
        Optionally restrict to specific file_ids.
        """
        if not self.chunks:
            return []
        q_emb = self.embed_text(query)
        k_fetch = min(k * 4, len(self.chunks))
        scores, indices = self.index.search(q_emb.reshape(1, -1), k_fetch)
        results: List[Dict] = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(self.chunks):
                continue
            chunk = self.chunks[idx]
            if file_ids and chunk["file_id"] not in file_ids:
                continue
            results.append({**chunk, "score": float(score)})
            if len(results) >= k:
                break
        return results

    def embed_text(self, text: str) -> np.ndarray:
        """Embed a single string to a float32 vector of length DIMENSION."""
        model = self._get_model()
        if model is False:
            return self._fallback_embed(text)
        try:
            return model.encode([text], normalize_embeddings=True)[0].astype(np.float32)
        except Exception as e:
            logger.warning("embed_text failed (%s); using fallback", e)
            self._model = False
            return self._fallback_embed(text)

    @property
    def chunk_count(self) -> int:
        return len(self.chunks)

    @property
    def is_built(self) -> bool:
        return self._index_path.exists() and len(self.chunks) > 0

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _get_model(self):
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer
                self._model = SentenceTransformer(MODEL_NAME)
                logger.info("FaissStore: SentenceTransformer loaded (%s)", MODEL_NAME)
            except Exception as e:
                logger.warning("SentenceTransformer unavailable (%s); using fallback embeddings", e)
                self._model = False
        return self._model

    def _embed_batch(self, texts: List[str]) -> np.ndarray:
        model = self._get_model()
        if model is False:
            return np.vstack([self._fallback_embed(t) for t in texts]).astype(np.float32)
        try:
            return model.encode(
                texts, normalize_embeddings=True, batch_size=32, show_progress_bar=False
            ).astype(np.float32)
        except Exception as e:
            logger.warning("Batch embed failed (%s); using fallback", e)
            self._model = False
            return np.vstack([self._fallback_embed(t) for t in texts]).astype(np.float32)

    def _fallback_embed(self, text: str) -> np.ndarray:
        """Deterministic hash-based embedding so the API stays functional when the model is unavailable."""
        vec = np.zeros(DIMENSION, dtype=np.float32)
        if not text:
            return vec
        tokens = text.lower().split()
        for tok in tokens:
            digest = hashlib.sha256(tok.encode("utf-8", errors="ignore")).digest()
            for i in range(0, len(digest), 2):
                idx = ((digest[i] << 8) | digest[i + 1]) % DIMENSION
                sign = 1.0 if (digest[i] & 1) else -1.0
                vec[idx] += sign
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        return vec

    def _load(self):
        try:
            import faiss
        except ImportError:
            logger.error("faiss-cpu not installed — FaissStore disabled. Run: pip install faiss-cpu")
            self._init_dummy()
            return

        if self._index_path.exists() and self._chunks_path.exists():
            try:
                self.index = faiss.read_index(str(self._index_path))
                with open(self._chunks_path, "rb") as f:
                    self.chunks = pickle.load(f)
                logger.info("FaissStore: loaded %d chunks from %s", len(self.chunks), self.faiss_dir)
                return
            except Exception as e:
                logger.error("FaissStore load failed (%s); re-initialising", e)
        self._init_index(faiss)

    def _init_index(self, faiss_mod=None):
        if faiss_mod is None:
            import faiss as faiss_mod
        self.index = faiss_mod.IndexFlatIP(DIMENSION)
        self.chunks = []

    def _init_dummy(self):
        """Stub index used when faiss-cpu is missing."""
        class _DummyIndex:
            def add(self, _): pass
            def search(self, _q, _k): return (np.array([[]]), np.array([[]])) 
        self.index = _DummyIndex()
        self.chunks = []

    def _save(self):
        try:
            import faiss
            faiss.write_index(self.index, str(self._index_path))
            with open(self._chunks_path, "wb") as f:
                pickle.dump(self.chunks, f)
        except Exception as e:
            logger.error("FaissStore save failed: %s", e)
