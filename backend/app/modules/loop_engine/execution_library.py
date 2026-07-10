"""
Execution Library — Phase 2 of Loop Engineering.

Stores high-quality planning strategies (NOT answers) for reuse.
A stored entry contains:
  - query_embedding  — vector for cosine similarity search
  - task_category    — intent/task type
  - planner_goal     — the goal sentence from the original plan
  - planner_subtasks — JSON list of subtask descriptions
  - expected_output  — output type (Report, Explanation, Code…)
  - complexity       — Simple / Medium / Complex
  - verifier_score   — quality gate (only stored when >= min_store_score)

Storage rules:
  - Only store when verifier_score >= min_store_score (default 0.90)
  - Never store when hallucination_risk == High
  - Never store generated answers — only the plan structure

Retrieval:
  - Embed incoming query, search by cosine similarity
  - Return plan if similarity >= similarity_threshold (default 0.88)
"""
from __future__ import annotations

import json
import logging
import math
import time
from dataclasses import dataclass

log = logging.getLogger(__name__)

# ── DB helpers ────────────────────────────────────────────────────────────────

async def _get_db():
    from app.db.database import AsyncSessionLocal
    return AsyncSessionLocal()


def _emb_str(embedding: list[float]) -> str:
    return "[" + ",".join(str(v) for v in embedding) + "]"


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class LibrarySearchResult:
    found: bool
    similarity: float
    entry_id: int | None
    planner_goal: str
    planner_subtasks: list[str]
    expected_output: str
    complexity: str
    success_criteria: str
    usage_count: int
    elapsed_ms: int


@dataclass
class LibraryStoreResult:
    stored: bool
    entry_id: int | None
    reason: str
    elapsed_ms: int


# ── Execution Library ─────────────────────────────────────────────────────────

class ExecutionLibrary:
    """
    Stores and retrieves execution plans by query embedding similarity.
    Every operation is independent and non-blocking on failure.
    """

    def __init__(
        self,
        embed_fn,
        similarity_threshold: float = 0.88,
        min_store_score: float = 0.90,
        enabled: bool = True,
    ):
        self._embed = embed_fn
        self._similarity_threshold = similarity_threshold
        self._min_store_score = min_store_score
        self._enabled = enabled

    # ── Search ────────────────────────────────────────────────────────────────

    async def search(self, query: str) -> LibrarySearchResult:
        """
        Embed the query and find the most similar stored plan.
        Returns a found=False result if library is disabled, empty, or no match above threshold.
        """
        t0 = time.monotonic()
        _NOT_FOUND = LibrarySearchResult(
            found=False, similarity=0.0, entry_id=None,
            planner_goal="", planner_subtasks=[], expected_output="Explanation",
            complexity="Medium", success_criteria="", usage_count=0,
            elapsed_ms=0,
        )

        if not self._enabled:
            return _NOT_FOUND

        log.info("[Execution Library] Search — embedding query (%.60s…)", query)

        try:
            embedding = await self._embed(query)
            if not embedding or all(v == 0.0 for v in embedding):
                log.warning("[Execution Library] Zero embedding — skipping search")
                _NOT_FOUND.elapsed_ms = int((time.monotonic() - t0) * 1000)
                return _NOT_FOUND

            emb_s = _emb_str(embedding)

            from sqlalchemy import text
            async with await _get_db() as db:
                result = await db.execute(text("""
                    SELECT
                        id,
                        planner_goal,
                        planner_subtasks,
                        expected_output,
                        complexity,
                        success_criteria,
                        usage_count,
                        1 - (query_embedding <=> (:emb)::vector) AS similarity
                    FROM execution_library
                    WHERE query_embedding IS NOT NULL
                    ORDER BY query_embedding <=> (:emb)::vector
                    LIMIT 1
                """), {"emb": emb_s})
                row = result.mappings().first()

            elapsed = int((time.monotonic() - t0) * 1000)

            if not row:
                log.info("[Execution Library] No entries in library (%dms)", elapsed)
                return LibrarySearchResult(
                    found=False, similarity=0.0, entry_id=None,
                    planner_goal="", planner_subtasks=[], expected_output="Explanation",
                    complexity="Medium", success_criteria="", usage_count=0,
                    elapsed_ms=elapsed,
                )

            sim = float(row["similarity"] or 0.0)
            if math.isnan(sim):
                sim = 0.0

            if sim < self._similarity_threshold:
                log.info("[Execution Library] Best match similarity=%.3f < threshold=%.3f (%dms)",
                         sim, self._similarity_threshold, elapsed)
                return LibrarySearchResult(
                    found=False, similarity=sim, entry_id=int(row["id"]),
                    planner_goal="", planner_subtasks=[], expected_output="Explanation",
                    complexity="Medium", success_criteria="", usage_count=0,
                    elapsed_ms=elapsed,
                )

            # Hit!
            subtasks = row["planner_subtasks"]
            if isinstance(subtasks, str):
                try:
                    subtasks = json.loads(subtasks)
                except Exception:
                    subtasks = [subtasks]
            elif not isinstance(subtasks, list):
                subtasks = []

            log.info("[Execution Library] Reused Plan — entry_id=%s similarity=%.3f (%dms)",
                     row["id"], sim, elapsed)

            return LibrarySearchResult(
                found=True,
                similarity=sim,
                entry_id=int(row["id"]),
                planner_goal=str(row["planner_goal"] or ""),
                planner_subtasks=list(subtasks),
                expected_output=str(row["expected_output"] or "Explanation"),
                complexity=str(row["complexity"] or "Medium"),
                success_criteria=str(row.get("success_criteria") or ""),
                usage_count=int(row["usage_count"] or 1),
                elapsed_ms=elapsed,
            )

        except Exception as exc:
            elapsed = int((time.monotonic() - t0) * 1000)
            log.warning("[Execution Library] Search error (%dms): %s", elapsed, exc)
            return LibrarySearchResult(
                found=False, similarity=0.0, entry_id=None,
                planner_goal="", planner_subtasks=[], expected_output="Explanation",
                complexity="Medium", success_criteria="", usage_count=0,
                elapsed_ms=elapsed,
            )

    # ── Update usage count ────────────────────────────────────────────────────

    async def record_usage(self, entry_id: int, verifier_score: float) -> None:
        """Update usage_count, avg_verifier_score, last_used_at on reuse."""
        try:
            from sqlalchemy import text
            async with await _get_db() as db:
                await db.execute(text("""
                    UPDATE execution_library SET
                        usage_count      = usage_count + 1,
                        last_used_at     = now(),
                        avg_verifier_score = CASE
                            WHEN avg_verifier_score IS NULL THEN CAST(:sc AS FLOAT)
                            ELSE avg_verifier_score * 0.8 + CAST(:sc AS FLOAT) * 0.2
                        END
                    WHERE id = :eid
                """), {"eid": entry_id, "sc": verifier_score})
                await db.commit()
        except Exception as exc:
            log.warning("[Execution Library] record_usage error: %s", exc)

    # ── Store ─────────────────────────────────────────────────────────────────

    async def store(
        self,
        query: str,
        plan,                 # PlanResult
        verifier_score: float,
        hallucination_risk: str = "Low",
        task_category: str = "domain_qa",
    ) -> LibraryStoreResult:
        """
        Store a plan ONLY when quality gates pass.
        Never stores the generated answer — only the plan structure.
        """
        t0 = time.monotonic()

        if not self._enabled:
            return LibraryStoreResult(stored=False, entry_id=None,
                                      reason="Library disabled", elapsed_ms=0)

        # Quality gate 1: minimum verifier score
        if verifier_score < self._min_store_score:
            reason = f"Score {verifier_score:.2f} < min_store_score {self._min_store_score:.2f}"
            log.info("[Execution Library] Not stored — %s", reason)
            return LibraryStoreResult(stored=False, entry_id=None,
                                      reason=reason, elapsed_ms=int((time.monotonic() - t0) * 1000))

        # Quality gate 2: no high hallucination risk
        if hallucination_risk == "High":
            reason = "hallucination_risk=High — plan not stored"
            log.info("[Execution Library] Not stored — %s", reason)
            return LibraryStoreResult(stored=False, entry_id=None,
                                      reason=reason, elapsed_ms=int((time.monotonic() - t0) * 1000))

        log.info("[Execution Library] Storing plan (score=%.2f, category=%s)", verifier_score, task_category)

        try:
            embedding = await self._embed(query)
            if not embedding or all(v == 0.0 for v in embedding):
                return LibraryStoreResult(stored=False, entry_id=None,
                                          reason="Zero embedding — cannot store",
                                          elapsed_ms=int((time.monotonic() - t0) * 1000))

            emb_s = _emb_str(embedding)
            subtasks_json = json.dumps(plan.subtasks if plan.subtasks else [])

            from sqlalchemy import text
            async with await _get_db() as db:
                result = await db.execute(text("""
                    INSERT INTO execution_library (
                        query_embedding, task_category, planner_goal, planner_subtasks,
                        expected_output, complexity, success_criteria,
                        verifier_score, hallucination_risk, avg_verifier_score,
                        usage_count, created_at, last_used_at
                    ) VALUES (
                        (:emb)::vector, :cat, :goal, (:subtasks)::jsonb,
                        :output, :complexity, :criteria,
                        :score, :hall_risk, :score,
                        1, now(), now()
                    )
                    RETURNING id
                """), {
                    "emb":        emb_s,
                    "cat":        task_category,
                    "goal":       plan.goal[:500],
                    "subtasks":   subtasks_json,
                    "output":     plan.expected_output or "Explanation",
                    "complexity": plan.complexity or "Medium",
                    "criteria":   (plan.success_criteria or "")[:300],
                    "score":      verifier_score,
                    "hall_risk":  hallucination_risk,
                })
                row = result.first()
                await db.commit()

            new_id = int(row[0]) if row else None
            elapsed = int((time.monotonic() - t0) * 1000)
            log.info("[Execution Library] Stored Plan — id=%s (%dms)", new_id, elapsed)
            return LibraryStoreResult(stored=True, entry_id=new_id,
                                      reason="Stored", elapsed_ms=elapsed)

        except Exception as exc:
            elapsed = int((time.monotonic() - t0) * 1000)
            log.warning("[Execution Library] Store error (%dms): %s", elapsed, exc)
            return LibraryStoreResult(stored=False, entry_id=None,
                                      reason=str(exc), elapsed_ms=elapsed)
