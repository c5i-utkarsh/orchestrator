# DHS — Current Architecture (Phase 0)

Snapshot of the existing production app before the V2 workflow migration. No code changed to produce this.

## Frontend architecture
- **Next.js 15 App Router** (`frontend/app`), React 19, TypeScript, Tailwind. Client components (`"use client"`) throughout.
- **Auth**: cookie `orch_logged_in` set client-side on `/login`; `middleware.ts` redirects any non-public route to `/login`. No server auth on API calls.
- **Nav**: single `components/Sidebar.tsx` (left sidebar; regrouped last commit into the DHS lifecycle labels). `components/LayoutShell.tsx` offsets content (`pl-60`). Mounted once in `app/layout.tsx`.
- **State**: no Redux/Zustand/Context. Cross-page state = `sessionStorage`/`localStorage` (`job_id`, `query`, `domain_label`, `orchestrator_output`, `orch_sessions`, `orch_pipeline_config`) + component-local `useState`.
- **API layer**: no shared wrapper. Every page inlines `fetch(\`${API}/api/v1/...\`)` with `API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"`.
- **Streaming**: SSE via `EventSource` for ingest progress (`/data/progress/{job_id}`); orchestrator uses `fetch` + `ReadableStream` reader parsing `data:` lines. **No WebSockets anywhere.**

## Route inventory (pages)
| Route | File | Role today | New lifecycle role |
|---|---|---|---|
| `/` | `app/page.tsx` (`WorkspacePage`) | Workspace/upload home | **Home / Information Harnessing** |
| `/processing` | `app/processing/page.tsx` | 14-layer ingest visualization | **Knowledge Harnessing** (pipeline) |
| `/query` | `app/query/page.tsx` | Query builder | **Inference Harnessing** |
| `/planning` | `app/planning/page.tsx` | Intent/build planner | Inference (recommendations) |
| `/recommendations` | `app/recommendations/page.tsx` | Orchestrator output tabs | **Outcome Harnessing** |
| `/wiki` | `app/wiki/page.tsx` | Wiki articles | **Benchmarking** group |
| `/quality` | `app/quality/page.tsx` | KG quality scorecard | **Benchmarking** group |
| `/dashboard`, `/templates`, `/login` | — | system/health, templates, auth | unchanged |

## Component inventory (`app/components`)
Reusable, already built — **reuse these, don't duplicate**:
- `Sidebar`, `LayoutShell`, `AchievementToast`
- `OnboardingWizard` (collects workspace name + domain + files) — basis for the session wizard
- `PipelineCanvas` (renders arbitrary node list; already drives the 14 layers from SSE `steps`)
- `PipelineProgress`, `SLMBuildProgress`, `SLMStudio` (live SLM build config/progress)
- `ApprovalGate` (approve/skip gate — basis for Knowledge Review)
- `PromptBuilder` (**already** generates suggestions dynamically from fetched wiki articles — not hardcoded)
- `ModelRecommendationPanel`, `ExplainedBuildPlan`, `KPIDashboard`, `DataGapAlert`
- `CorpusUploader`, `DBCredentialForm`, `ChatBot`, `InstallApprovalModal`, `WorkspaceCard`
- `lib/processTemplates.ts`, `lib/customTemplates.ts`

## Backend architecture
- **FastAPI** (`backend/app/main.py`) mounts 13 routers under `/api/v1`.
- **Celery + Redis** for pipelines (`app/tasks/ingest_task.py`: 14-layer file pipeline + 14-layer DB pipeline + reindex; `slm_build_task.py`).
- **PostgreSQL + pgvector** (`backend/db/init.sql`): tables `ingest_jobs` (status/progress JSONB, domain_label, entity/community/file counts, metadata JSONB), `slm_registry` (domain_embedding vector, val_loss, hallucination_rate, coverage_topics), `query_history` (query, task_category, slm_used, hallucination_rate, latency_ms, tokens, timestamp), `bandit_scores` (task_type, model_id, score), `sessions`, plus `sio_*` graph/knowledge tables.
- **Ollama** for embeddings + inference; **FAISS** per-corpus vector index; **NetworkX** knowledge graph.
- **Artifacts on disk** per job: `corpus_store/{job_id}/` → `processed/*_metadata.json`, `*_semantic.json`, `*_validation.json`, `*_eda.json`; `canonical_graph.json`, `canonical_registry.json`, `graph_consistency.json`, `ontology.json`, `graphs/*.json`, `wiki_pages/*.json`, `faiss/`.

## API inventory (prefix `/api/v1`)
- **/data**: `POST /ingest`, `POST /test-connection`, `GET /corpora`, `GET /status/{job}`, `GET /progress/{job}` (SSE), `POST /scrape`, `GET /graph/{job}`, `GET /graph/{job}/canonical`, `GET /entities/{job}`, `GET /search/{job}`, `POST /retry/{job}`, `POST /repair/{job}`, `GET /wiki/{job}`, `GET /wiki/{job}/stats`, `POST /sample-corpus`, `GET /ingestion-report/{job}`
- **/orchestrator**: `POST /ask` (SSE stream: task classification → coverage → decomposition → model selection → execution → hallucination check → synthesis → output)
- **/slm**: `GET /registry`, `POST /build`, `GET /for-corpus`, `POST /approve-install`, `GET /status`, `GET /suggestions`, `GET /stats`, `GET /learning-progress`
- **/pipeline**: `GET /{job}/state`, `PATCH /{job}/config`, `POST /{job}/approve/{step}`, `POST /{job}/pause`, `POST /{job}/resume`, `GET /{job}/entities/preview`
- **/wiki**: `GET /{job}/pages`, `GET /{job}/page/{id}`, `GET /{job}/reviews`, `POST /{job}/review/{id}`
- **/quality**: `GET /{job}/metrics`
- **/eda**: `GET /{job}/file/{id}`, `GET /{job}/file/visuals`, `GET /{job}/db/{id}`, `GET /dashboard`
- **/models**: `GET /bandit-status`, `GET /insights/{task_type}`; **/links**: cross-source + reviews + metrics; **/repair**, **/db**, **/evaluation** (`POST /run`), **/feedback**

## Data flow (current)
```
/login → / (workspace: domain + upload) → POST /data/ingest → job_id
      → /processing (EventSource /data/progress → 14 layers → graph_done gate)
      → SLM build (SLMStudio → POST /slm/build → poll /slm/status)
      → /query (PromptBuilder pulls /data/wiki suggestions) → POST /orchestrator/ask (SSE)
      → /planning (intent wizard) or /recommendations (output tabs)
      → /wiki, /quality (review artifacts)
```

## Current orchestration flow (`/orchestrator/ask`, SSE)
Task Classification → Coverage Check → (SLM build if needed) → Query Decomposition → Model Selection (LinUCB bandit) → parallel Sub-task Execution → Answer Synthesis → Hallucination Detection → Bandit Update → final `output` event. Every step is already emitted as an SSE event with timing/reasoning — the Inference Harnessing "execution timeline" can render these directly.

## Migration-relevant findings
- The new lifecycle **labels already exist** in `Sidebar.tsx`; pages already chain roughly in the target order.
- `PromptBuilder` **already** derives suggestions from generated knowledge (wiki) — the "no hardcoded templates" requirement is largely met.
- `ApprovalGate` + `/pipeline/approve` + `/wiki/reviews` give the **Knowledge Review approve/reject** primitives; "regenerate" maps to existing `/data/retry` or `/data/repair`.
- **Benchmarking data gap** (critical): `query_history`, `bandit_scores`, `slm_registry`, feedback, and the on-disk graph/validation/ontology artifacts are real and aggregatable. But the PRD's headline KPIs — *Model-Alone-vs-Model+DHS A/B scores, 0.36→0.82 waterfall, ₹ business value / ROI, hours saved, monthly trend history* — **have no producing measurement anywhere in the system**. They cannot be "computed from real data" because that data is never recorded. See migration notes.
