"""
Semantic cache — Redis + embedding similarity.
TTL: 900s for news/volatile, 86400s for stable domain answers.
"""
import json
import hashlib
from typing import Any

import numpy as np

from app.config import get_settings

settings = get_settings()

TTL_NEWS    = 900        # 15 min for volatile/news queries
TTL_STABLE  = 86400      # 24h for stable domain Q&A
SIMILARITY_THRESHOLD = 0.92


class SemanticCache:
    def __init__(self, redis_client):
        self._redis = redis_client

    def _key(self, prefix: str, identifier: str) -> str:
        h = hashlib.sha256(identifier.encode()).hexdigest()[:16]
        return f"semcache:{prefix}:{h}"

    async def get(self, query: str, query_embedding: list[float]) -> Any | None:
        """
        First try exact hash lookup, then embedding similarity scan.
        Returns cached response or None.
        """
        # Exact lookup
        exact_key = self._key("exact", query.strip().lower())
        cached = await self._redis.get(exact_key)
        if cached:
            return json.loads(cached)

        # Embedding similarity scan (scan recent keys)
        try:
            cursor = 0
            while True:
                cursor, keys = await self._redis.scan(cursor, match="semcache:emb:*", count=200)
                for key in keys:
                    raw = await self._redis.get(key)
                    if raw:
                        entry = json.loads(raw)
                        stored_emb = entry.get("embedding", [])
                        if stored_emb:
                            sim = self._cosine_sim(query_embedding, stored_emb)
                            if sim >= SIMILARITY_THRESHOLD:
                                return entry.get("response")
                if cursor == 0:
                    break
        except Exception:
            pass

        return None

    async def set(
        self,
        query: str,
        query_embedding: list[float],
        response: Any,
        volatile: bool = False,
    ) -> None:
        ttl = TTL_NEWS if volatile else TTL_STABLE

        # Exact key
        exact_key = self._key("exact", query.strip().lower())
        await self._redis.setex(exact_key, ttl, json.dumps(response))

        # Embedding key
        emb_key = self._key("emb", query.strip().lower())
        entry = {"embedding": query_embedding, "response": response}
        await self._redis.setex(emb_key, ttl, json.dumps(entry))

    def _cosine_sim(self, a: list[float], b: list[float]) -> float:
        va, vb = np.array(a), np.array(b)
        denom = (np.linalg.norm(va) * np.linalg.norm(vb)) + 1e-9
        return float(np.dot(va, vb) / denom)
