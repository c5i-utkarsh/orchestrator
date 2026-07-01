# DHS V2 Migration Report

Evolution of the existing app into the DHS lifecycle. No backend architecture redesigned; FastAPI, Celery, Redis, Postgres+pgvector, Ollama, KG, SLM Factory, Orchestrator all preserved and reused.

## 1. What changed (by lifecycle stage)
| Stage | Status | Change |
|---|---|---|
| **Nav / shell** | done | Top bar → left `Sidebar` regrouped into the 5 lifecycle labels (prior commit). |
| **Information Harnessing** (`/`) | done | Session wizard: added Business Unit / Description / Industry / Tags → stored in `ingest_jobs.metadata.session` (jsonb, no schema change) + `sessionStorage.dhs_session`. Reuses existing upload + `/data/ingest`. |
| **Knowledge Harnessing** (`/processing`) | done | Added explicit **Knowledge Review** gate after the 14-layer pipeline: Approve → Build Custom AI; Regenerate → `POST /data/retry` + reload; Reject → back to setup. Links to `/wiki` + `/quality` for graph/entity review. Replaced the old graph approval gate. |
| **Inference Harnessing** (`/query`) | done (mostly pre-existing) | Header relabeled. Dynamic prompt suggestions (`PromptBuilder` ← `/data/wiki` + `/slm/suggestions`), model weights/fallback, and the orchestration timeline (`/orchestrator/ask` SSE) already existed — unchanged. |
| **Outcome Harnessing** (`/recommendations`) | unchanged | Per spec, not redesigned. Consumes orchestrator output via existing `sessionStorage.orchestrator_output`; already integrated with the flow. |
| **Benchmarking** (`/benchmarking`) | done | New read-only analytics layer (below). |

## 2. Benchmarking — real-data, config-driven
- **Endpoint**: `GET /api/v1/benchmark/summary` ([backend/app/routes/benchmark.py](../backend/app/routes/benchmark.py)) — aggregates **only real data**: `query_history`, `bandit_scores`, `slm_registry`, `ingest_jobs`, and on-disk `graph_consistency.json` / `ontology.json`.
- **Computed live**: Completion×Process×Security combined score, harness score, functional score, routing accuracy (query `slm_used` vs best bandit model per task), learning velocity (Δ completion across months), knowledge coverage (entities/communities/ontology conformance), monthly trends.
- **Config**: [backend/app/benchmark_config.json](../backend/app/benchmark_config.json) holds every weight, dimension def, and `measured` flag — **no hardcoded scores in code**. New benchmark categories can be added via JSON.
- **Honesty**: KPIs with no producing measurement (`baseline_ab_score`, `roi_currency`, `business_value_generated`, `cost_avoided`, `hours_saved`, `revenue_impact`) return `null` and appear as **N/A — not measured** in the UI. Nothing fabricated.
- **Frontend**: [frontend/app/benchmarking/page.tsx](../frontend/app/benchmarking/page.tsx) — 5 tabs (Overview, Harness, Functional, Technical, Executive) via Recharts (already installed). Sidebar "Benchmarking" → `/benchmarking`.

## 3. Architecture diagram (flow)
```
/login → Information Harnessing (/)                [session + ingest]
            │ POST /data/ingest (metadata.session)
            ▼
        Knowledge Harnessing (/processing)         [14-layer SSE pipeline]
            │ EventSource /data/progress → Knowledge Review gate
            │   Approve → SLM build (/slm/build) │ Regenerate → /data/retry │ Reject → /
            ▼
        Inference Harnessing (/query)              [PromptBuilder ← wiki/slm suggestions]
            │ POST /orchestrator/ask (SSE timeline: classify→route→exec→hallucination→synthesis)
            ▼
        Outcome Harnessing (/recommendations)      [orchestrator output tabs]
            ▼
        Benchmarking (/benchmarking) ── read-only ── GET /benchmark/summary
              consumes: query_history · bandit_scores · slm_registry · ingest_jobs · graph artifacts
```

## 4. API changes
- **Added**: `GET /api/v1/benchmark/summary` (new `benchmark` router registered in `main.py`).
- **Extended (backward-compatible)**: `POST /api/v1/data/ingest` accepts optional `business_unit`, `description`, `industry`, `tags`.
- **No other endpoints changed.** No WebSockets introduced. All SSE handlers untouched.

## 5. Files modified / added
- Added: `docs/CURRENT_ARCHITECTURE.md`, `docs/MIGRATION_REPORT.md`, `backend/app/routes/benchmark.py`, `backend/app/benchmark_config.json`, `frontend/app/benchmarking/page.tsx`
- Modified: `backend/app/routes/data.py`, `backend/app/main.py`, `frontend/app/page.tsx`, `frontend/app/processing/page.tsx`, `frontend/app/query/page.tsx`, `frontend/app/components/Sidebar.tsx`
- Prior commit: `Sidebar.tsx` (from `Topbar.tsx`), `layout.tsx`, `LayoutShell.tsx`, wiki/quality Topbar removal

## 6. Audit results
- ✔ No broken routes — `/processing /query /benchmarking /wiki /quality /dashboard /` all 200; `/benchmark/summary` 200.
- ✔ No API mismatches — benchmark page consumes exactly the `/summary` shape.
- ✔ No mock data / no hardcoded benchmark values — real aggregation + JSON-config weights; unmeasured KPIs are N/A.
- ✔ No duplicate components/services — reused OnboardingWizard patterns, PipelineCanvas, PromptBuilder, existing endpoints.
- ✔ Dead code removed — old `showGate`/`gateStep`/`ApprovalGate` usage in processing deleted.
- ⚠ `frontend/app/components/ApprovalGate.tsx` is now **orphaned** (its only caller was replaced by the Knowledge Review gate). Left in place as a reusable primitive; safe to delete if unwanted.
- ✔ Typecheck: `tsc --noEmit` clean. Backend: `py_compile` clean.

## 7. Performance review
- `/benchmark/summary` = ~10 lightweight aggregate SQL queries + one JSON file read. Fine at current scale. **ponytail:** add a short-TTL cache only if `query_history` grows to millions and the dashboard is hit frequently — not before.
- Ingest/orchestrator paths unchanged → no perf impact.

## 8. Verification — benchmark values are real
`GET /benchmark/summary` on the live DB returned `sample_sizes.queries=0, slm_models=1`; consequently query-derived KPIs were `null` (N/A) and only the registry-derived `accuracy` populated. This confirms values track actual system state rather than constants — with an empty query log the dashboard honestly shows N/A instead of a fabricated 0.82.

## 9. Remaining TODOs
1. **Instrument the unmeasured KPIs** if the exec deck needs them: an A/B eval harness (Model-alone vs Model+DHS, via `/evaluation`) for the baseline/waterfall; ROI/hours/₹ capture (new columns or a `benchmark_outcomes` table) for business value; feedback capture for adoption. Until then they remain honest N/A.
2. Optionally delete orphaned `ApprovalGate.tsx`.
3. Outcome Harnessing: confirmed integrated via sessionStorage; no change made per "do not redesign".
