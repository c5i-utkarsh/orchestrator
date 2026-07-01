# DHS — Session-Driven Workflow Migration

Converts the page-by-page wizard into a session-state-machine flow. No UI redesign, no backend API changes.

## Analysis (before)
- Navigation was ~30 scattered `router.push` calls + ~30 ad-hoc `sessionStorage` keys (`job_id`, `domain_label`, `query`, `reuse_corpus`, …).
- Reuse/dedup **already existed** server-side: `POST /data/ingest` returns `reused:true` when a completed corpus exists for the domain (unless `force_reingest`); `GET /slm/for-corpus?job_id=` reports whether an SLM exists. The frontend just wasn't deciding off it centrally.

## What changed (one new module + one wired decision)
### `frontend/app/lib/session.ts` (new — the state machine)
- **Session object** persisted under one key (`dhs_session`): `session_id, domain, data_sources, kg_version, wiki_version, slm_version, last_ingested_at, knowledge_changed, stage` (+ wizard fields).
- **Stages**: `NEW_SESSION → INFORMATION_HARNESSING → CHECK_KNOWLEDGE → OPTIONAL_REBUILD → INFERENCE → OUTCOME → BENCHMARK`, mapped to routes via `STAGE_ROUTE`.
- `getSession()` / `setSession(patch)` — persist + **mirror legacy keys** (`job_id`, `domain_label`) so the 10 existing pages keep reading them unchanged (this is why no page rewrite was needed).
- `goToStage(router, stage, patch)` — state-driven navigation: set stage, then route to it.
- `nextStageAfterInformation({reused, uploadedNew, slmExists})` — pure CHECK_KNOWLEDGE decision.

### `frontend/app/page.tsx` (wired the decision)
- After `/data/ingest`, sends `force_reingest = (files or db present)` so **new data = knowledge changed**.
- Calls `/slm/for-corpus` → then `nextStageAfterInformation`:
  - unchanged + SLM exists → **`INFERENCE`** (skip rebuild, straight to `/query`, `reuse_corpus` set → orchestrator never rebuilds).
  - otherwise → **`OPTIONAL_REBUILD`** (`/processing` runs the 14-layer pipeline + SLM build).
- Persists the full Session via `saveSession(...)`; "Skip upload" is now allowed when the chosen domain already has a corpus (button → "Continue with existing knowledge →").

## Validation
- ✔ **Existing SLM reused / rebuild only on change** — truth table verified (4/4):
  | reused | new upload | SLM | → stage | knowledge_changed |
  |---|---|---|---|---|
  | ✓ | ✗ | ✓ | INFERENCE | false |
  | ✓ | ✗ | ✗ | OPTIONAL_REBUILD | false (build once) |
  | ✗ | ✓ | ✗ | OPTIONAL_REBUILD | true |
  | ✓ | ✓ | ✓ | OPTIONAL_REBUILD | true |
- ✔ **Query executes without rebuild** — INFERENCE path sets `reuse_corpus`; `/processing` reuse branch runs the orchestrator directly (no ingest, no SLM build).
- ✔ **No incorrect navigation** — transitions from the Information decision go through `goToStage`/`STAGE_ROUTE`.
- ✔ `tsc --noEmit` clean; `/ /query /processing /benchmarking` all 200.

## Reused / not duplicated
- No new backend endpoint, no new service, no new dependency. Uses existing `/data/ingest` (dedup + `force_reingest`) and `/slm/for-corpus`.

## Deliberately NOT done (ponytail — flagged, not built blind)
- **Full "navigation driven by state" across all 10 pages**: only the Information→CHECK_KNOWLEDGE→(INFERENCE|REBUILD) decision was routed through the state machine. Downstream pages keep their existing `router.push` (they read the mirrored legacy keys). Migrating each remaining transition to `goToStage` is mechanical and can be done incrementally — it was not done in bulk to avoid a large diff across working pages (and "do not redesign UI").
- **Inference with zero page redirection** (`/query` streaming the answer in-place instead of pushing to `/processing`): that requires moving the streaming UI onto `/query` — a UI change. Left as-is; the current path already *never rebuilds*. Say the word to build in-place inference.

## Add-when
- Route the remaining transitions through `goToStage` → when you want the whole app state-driven, not just the reuse decision.
- In-place inference streaming on `/query` → when you want to drop the `/query → /processing` redirect.
