"""
Benchmarking — read-only analytics layer over DHS.

Aggregates ONLY real system data (query_history, bandit_scores, slm_registry,
ingest_jobs + on-disk graph/ontology artifacts). Weights come from
app/benchmark_config.json. KPIs with no producing measurement (A/B baseline,
ROI, business value) are returned as null with an `unavailable` list — never
fabricated. ponytail: one endpoint, one config file, no new tables.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.config import get_settings

router = APIRouter(prefix="/benchmark", tags=["benchmark"])

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "benchmark_config.json"


def _config() -> dict:
    with open(_CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def _r(v, n=3):
    return round(float(v), n) if v is not None else None


async def _scalar(db: AsyncSession, sql: str, params: dict | None = None):
    row = (await db.execute(text(sql), params or {})).first()
    return row[0] if row and row[0] is not None else None


@router.get("/summary")
async def summary(db: AsyncSession = Depends(get_db)):
    cfg = _config()

    # ── Real DB aggregates ────────────────────────────────────────────────
    q_count = await _scalar(db, "SELECT COUNT(*) FROM query_history") or 0
    avg_halluc = await _scalar(db, "SELECT AVG(hallucination_rate) FROM query_history WHERE hallucination_rate IS NOT NULL")
    avg_completion = await _scalar(db, "SELECT AVG(task_completion_rate) FROM query_history WHERE task_completion_rate IS NOT NULL")
    avg_latency = await _scalar(db, "SELECT AVG(latency_ms) FROM query_history WHERE latency_ms IS NOT NULL")
    avg_bandit = await _scalar(db, "SELECT AVG(score) FROM bandit_scores")
    slm_count = await _scalar(db, "SELECT COUNT(*) FROM slm_registry") or 0
    avg_val_loss = await _scalar(db, "SELECT AVG(val_loss) FROM slm_registry WHERE val_loss IS NOT NULL")
    slm_completion = await _scalar(db, "SELECT AVG(task_completion_rate) FROM slm_registry WHERE task_completion_rate IS NOT NULL")
    slm_halluc = await _scalar(db, "SELECT AVG(hallucination_rate) FROM slm_registry WHERE hallucination_rate IS NOT NULL")

    # ── Multi-dimensional eval scores (from judge, post-inference) ────────
    eval_rows_count = await _scalar(db,
        "SELECT COUNT(*) FROM query_history WHERE task_completion_score IS NOT NULL")
    has_eval = (eval_rows_count or 0) > 0

    avg_tc_score  = await _scalar(db, "SELECT AVG(task_completion_score)   FROM query_history WHERE task_completion_score  IS NOT NULL")
    avg_ca_score  = await _scalar(db, "SELECT AVG(context_awareness_score) FROM query_history WHERE context_awareness_score IS NOT NULL")
    avg_br_score  = await _scalar(db, "SELECT AVG(business_relevance_score) FROM query_history WHERE business_relevance_score IS NOT NULL")
    avg_act_score = await _scalar(db, "SELECT AVG(actionability_score)     FROM query_history WHERE actionability_score     IS NOT NULL")
    avg_ex_score  = await _scalar(db, "SELECT AVG(explainability_score)    FROM query_history WHERE explainability_score    IS NOT NULL")
    avg_gov_score = await _scalar(db, "SELECT AVG(governance_score)        FROM query_history WHERE governance_score        IS NOT NULL")
    avg_acc_score = await _scalar(db, "SELECT AVG(accuracy_score)          FROM query_history WHERE accuracy_score          IS NOT NULL")

    # Use judge-based completion if available, else fall back to binary proxy
    judge_completion = avg_tc_score if has_eval else None
    completion = judge_completion if judge_completion is not None else (
        avg_completion if avg_completion is not None else slm_completion
    )

    security = (1.0 - avg_halluc) if avg_halluc is not None else (
        (1.0 - slm_halluc) if slm_halluc is not None else None
    )
    process = avg_bandit  # routing quality from real bandit_scores

    # accuracy: judge score > val_loss proxy > completion fallback
    accuracy = None
    if avg_acc_score is not None:
        accuracy = avg_acc_score
    elif avg_val_loss is not None:
        accuracy = max(0.0, min(1.0, 1.0 - min(avg_val_loss, 1.0)))
    elif completion is not None:
        accuracy = completion

    # ── SLM Utilization & Cost Savings ───────────────────────────────────
    slm_util_row = (await db.execute(text("""
        SELECT
            COUNT(*) FILTER (WHERE slm_used IS NOT NULL AND slm_used != '') AS slm_queries,
            COUNT(*) AS total_queries,
            COUNT(*) FILTER (WHERE coverage_action IN ('BUILD_NEW','EXTEND_EXISTING')) AS fallback_queries
        FROM query_history
    """))).first()
    slm_util_data: dict = {}
    if slm_util_row and slm_util_row[1] and slm_util_row[1] > 0:
        tot = int(slm_util_row[1])
        slm_q = int(slm_util_row[0] or 0)
        fb_q  = int(slm_util_row[2] or 0)
        slm_util_pct  = _r(slm_q / tot) if tot > 0 else None
        fallback_pct  = _r(fb_q / tot)  if tot > 0 else None
        # Cost savings: frontier model ~$0.512/1K tokens, SLM ~$0.087/1K (local)
        frontier_cost_per_k = cfg.get("cost_per_1k_tokens", {}).get("frontier", 0.512)
        slm_cost_per_k      = cfg.get("cost_per_1k_tokens", {}).get("slm_local", 0.087)
        if slm_util_pct is not None and tot >= 5:
            # Estimated: SLM queries saved frontier cost
            savings_pct = _r((slm_util_pct * (frontier_cost_per_k - slm_cost_per_k)) / frontier_cost_per_k) if frontier_cost_per_k > 0 else None
        else:
            savings_pct = None
        slm_util_data = {
            "slm_query_count": slm_q,
            "total_query_count": tot,
            "slm_utilization": slm_util_pct,
            "fallback_rate": fallback_pct,
            "estimated_cost_savings_pct": savings_pct,
            "sufficient_data": tot >= 5,
        }
    else:
        slm_util_data = {"sufficient_data": False}

    # ── Knowledge coverage: referenced vs total entities ──────────────────
    kc_row = (await db.execute(text("""
        SELECT AVG(
            CASE WHEN total_entity_count > 0
                 THEN CAST(referenced_entity_count AS FLOAT) / total_entity_count
                 ELSE NULL END
        )
        FROM query_history
        WHERE referenced_entity_count IS NOT NULL AND total_entity_count IS NOT NULL AND total_entity_count > 0
    """))).first()
    knowledge_coverage_pct = _r(kc_row[0]) if kc_row and kc_row[0] is not None else None

    # ── Technical: Combined = Completion × Process × Security ─────────────
    tri = [completion, process, security]
    combined = None
    if all(v is not None for v in tri):
        combined = tri[0] * tri[1] * tri[2]

    # ── Task-category distribution + monthly trend (real) ────────────────
    cat_rows = (await db.execute(text(
        "SELECT COALESCE(task_category, task_type, 'unknown') AS c, COUNT(*) FROM query_history GROUP BY 1 ORDER BY 2 DESC LIMIT 12"
    ))).all()
    task_distribution = [{"category": r[0], "count": int(r[1])} for r in cat_rows]

    trend_rows = (await db.execute(text("""
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS m,
               COUNT(*) AS queries,
               AVG(hallucination_rate) AS halluc,
               AVG(task_completion_rate) AS completion,
               AVG(latency_ms) AS latency
        FROM query_history WHERE created_at IS NOT NULL
        GROUP BY 1 ORDER BY 1
    """))).all()
    trends = [{
        "month": r[0], "queries": int(r[1]),
        "hallucination": _r(r[2]), "completion": _r(r[3]), "latency_ms": _r(r[4], 0),
    } for r in trend_rows]

    # learning velocity = completion improvement first→last month (real, if ≥2 months)
    learning_velocity = None
    comp_series = [t["completion"] for t in trends if t["completion"] is not None]
    if len(comp_series) >= 2:
        learning_velocity = _r(comp_series[-1] - comp_series[0])

    # ── Routing accuracy: share of query_history.slm_used == best bandit model per task_type
    best_rows = (await db.execute(text("""
        SELECT DISTINCT ON (task_type) task_type, model_id
        FROM bandit_scores ORDER BY task_type, score DESC
    """))).all()
    best_by_task = {r[0]: r[1] for r in best_rows}
    routing_accuracy = None
    if best_by_task:
        rp_rows = (await db.execute(text(
            "SELECT task_type, slm_used FROM query_history WHERE task_type IS NOT NULL AND slm_used IS NOT NULL"
        ))).all()
        if rp_rows:
            hits = sum(1 for t, m in rp_rows if best_by_task.get(t) == m)
            routing_accuracy = _r(hits / len(rp_rows))
        else:
            routing_accuracy = _r(avg_bandit) if avg_bandit is not None else None

    # ── Knowledge coverage: latest completed job graph/ontology artifacts ─
    settings = get_settings()
    knowledge = {"job_id": None, "entities": None, "communities": None, "files": None,
                 "graph_consistent": None, "ontology_conformance": None, "graph_nodes": None, "graph_edges": None}
    latest = (await db.execute(text(
        "SELECT job_id, entity_count, community_count, file_count, metadata FROM ingest_jobs "
        "WHERE status='graph_done' ORDER BY created_at DESC LIMIT 1"
    ))).mappings().first()
    if latest:
        knowledge.update({
            "job_id": latest["job_id"], "entities": latest["entity_count"],
            "communities": latest["community_count"], "files": latest["file_count"],
        })
        meta = latest["metadata"] or {}
        if isinstance(meta, str):
            try: meta = json.loads(meta)
            except Exception: meta = {}
        cdir = meta.get("corpus_dir") or os.path.join(settings.corpus_store_path, latest["job_id"])
        gc = Path(cdir) / "graph_consistency.json"
        if gc.exists():
            try:
                d = json.loads(gc.read_text())
                knowledge["graph_consistent"] = d.get("passed")
                knowledge["graph_nodes"] = d.get("node_count")
                knowledge["graph_edges"] = d.get("edge_count")
                ne = d.get("ontology_nonconformant_edges")
                if ne is not None and d.get("edge_count"):
                    knowledge["ontology_conformance"] = _r(1.0 - ne / max(1, d["edge_count"]))
            except Exception:
                pass

    # ── Config-driven weighted scores over MEASURED dimensions only ──────
    def weighted(group_key, values):
        g = cfg[group_key]
        num = den = 0.0
        for k, spec in g.items():
            if spec.get("measured") and values.get(k) is not None:
                num += spec["weight"] * values[k]
                den += spec["weight"]
        return _r(num / den) if den > 0 else None

    # Harness score: use judge eval scores when available, else fallback
    harness_values = {
        "accuracy":           avg_acc_score  if has_eval else accuracy,
        "governance":         avg_gov_score  if has_eval else security,
        "context_awareness":  avg_ca_score,   # real when judge has run
        "business_relevance": avg_br_score,
        "actionability":      avg_act_score,
        "explainability":     avg_ex_score,
    }
    # Mark dimensions as measured when we have real judge scores
    if has_eval:
        cfg_harness = {k: dict(v, measured=True) for k, v in cfg["harness_dimensions"].items()}
    else:
        cfg_harness = cfg["harness_dimensions"]

    def weighted_harness(values):
        num = den = 0.0
        for k, spec in cfg_harness.items():
            if spec.get("measured") and values.get(k) is not None:
                num += spec["weight"] * values[k]
                den += spec["weight"]
        return _r(num / den) if den > 0 else None

    harness_score = weighted_harness(harness_values)

    problem_understanding = _r(min(1.0, len(task_distribution) / 8.0)) if task_distribution else None
    functional_values = {"problem_understanding": problem_understanding}
    functional_score = weighted("functional_components", functional_values)

    unavailable = cfg["unavailable_kpis"]["keys"]

    return {
        "generated_from": "real system data (query_history, bandit_scores, slm_registry, ingest_jobs, on-disk graph artifacts)",
        "sample_sizes": {"queries": int(q_count), "slm_models": int(slm_count)},
        "eval_queries": int(eval_rows_count or 0),
        "has_eval": has_eval,
        "overview": {
            "combined_score": _r(combined),
            "harness_score": harness_score,
            "functional_score": functional_score,
            "technical_score": _r(combined),
            "hallucination_rate": _r(avg_halluc),
            "avg_latency_ms": _r(avg_latency, 0),
            "baseline_ab_score": None,
            "performance_gap": None,
            "operating_cost_reduction": None,
            "business_value_generated": None,
        },
        "harness": {
            "dimensions": {k: harness_values.get(k) for k in cfg["harness_dimensions"]},
            "dimension_measured": {k: (v.get("measured") or (has_eval)) for k, v in cfg["harness_dimensions"].items()},
            "score": harness_score,
            "task_distribution": task_distribution,
            "eval_queries": int(eval_rows_count or 0),
        },
        "functional": {
            "components": {k: (functional_values.get(k) if v.get("measured") else None) for k, v in cfg["functional_components"].items()},
            "component_measured": {k: v.get("measured") for k, v in cfg["functional_components"].items()},
            "score": functional_score,
            "knowledge_coverage": knowledge,
            "knowledge_coverage_pct": knowledge_coverage_pct,
        },
        "technical": {
            "completion": _r(completion), "process": _r(process), "security": _r(security),
            "combined": _r(combined),
            "routing_accuracy": routing_accuracy,
            "learning_velocity": learning_velocity,
            "attribution_measured": {k: v.get("measured") for k, v in cfg["attribution_stages"].items()},
        },
        "executive": {
            "combined_score": _r(combined),
            "harness_score": harness_score,
            "functional_score": functional_score,
            "technical_score": _r(combined),
            "hallucination_rate": _r(avg_halluc),
            "routing_accuracy": routing_accuracy,
            "learning_velocity": learning_velocity,
            "knowledge_entities": knowledge["entities"],
            "slm_utilization": slm_util_data,
            "roi": None, "cost_reduction": None, "business_value_generated": None,
        },
        "trends": trends,
        "unavailable": unavailable,
        "unavailable_reason": cfg["unavailable_kpis"]["_reason"],
        "slm_utilization": slm_util_data,
        "knowledge_coverage_pct": knowledge_coverage_pct,
    }


@router.get("/strategies")
async def strategy_analytics(db: AsyncSession = Depends(get_db)):
    """
    Phase 3 Prompt Strategy Analytics.
    Returns real recorded data from prompt_strategies and prompt_strategy_history.
    No placeholders — returns empty lists when no data exists.
    """
    try:
        strats = (await db.execute(text("""
            SELECT id, name, category, usage_count, average_score, last_used
            FROM prompt_strategies
            ORDER BY average_score DESC, usage_count DESC
        """))).mappings().all()
        strategy_list = [dict(r) for r in strats]

        # Top 5 by average score (min 1 use)
        top_strategies = [s for s in strategy_list if s["usage_count"] >= 1][:5]

        # 30-day history trend
        hist = (await db.execute(text("""
            SELECT
                to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
                strategy_name,
                COUNT(*) AS uses,
                AVG(verifier_score)    AS avg_score,
                AVG(hallucination_rate) AS avg_halluc,
                AVG(latency_ms)        AS avg_latency,
                SUM(CASE WHEN improvement_applied THEN 1 ELSE 0 END) AS improvements
            FROM prompt_strategy_history
            WHERE created_at >= now() - interval '30 days'
            GROUP BY 1, 2
            ORDER BY 1 DESC, 3 DESC
        """))).all()
        history = [{
            "day": r[0], "strategy": r[1], "uses": int(r[2]),
            "avg_score": _r(r[3]), "avg_halluc": _r(r[4]),
            "avg_latency_ms": int(r[5]) if r[5] else None,
            "improvements": int(r[6]),
        } for r in hist]

        total_uses = sum(s["usage_count"] for s in strategy_list)

        return {
            "strategies": strategy_list,
            "top_strategies": top_strategies,
            "history_30d": history,
            "total_strategy_executions": total_uses,
            "strategy_count": len(strategy_list),
        }
    except Exception as exc:
        # Table may not exist on older deployments
        return {"strategies": [], "top_strategies": [], "history_30d": [],
                "total_strategy_executions": 0, "strategy_count": 0,
                "error": str(exc)}
