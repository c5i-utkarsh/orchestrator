# DHS Demo Mode

## Overview

Demo Mode allows the DHS application to run **completely offline** — no backend, no Ollama, no PostgreSQL, no Redis required. Every API call is intercepted and fulfilled from embedded synthetic enterprise data compiled from the `demo-data/` directory.

The production application and the demo are **the same codebase**. No components are duplicated. No pages are forked. Only a single environment flag switches between live and demo behaviour.

---

## How to Enable Demo Mode

### Option 1 — `npm run demo` (recommended)

```bash
cd frontend
npm run demo            # starts on default port (3000)
npm run demo -- --port 3001   # starts on a specific port
```

This sets `NEXT_PUBLIC_DEMO_MODE=true` automatically.

### Option 2 — environment variable

```bash
cd frontend
NEXT_PUBLIC_DEMO_MODE=true npm run dev -- --port 3001
```

### Option 3 — `.env.local`

Create or edit `frontend/.env.local`:

```env
NEXT_PUBLIC_DEMO_MODE=true
NEXT_PUBLIC_API_URL=
```

Then run normally:

```bash
npm run dev -- --port 3001
```

### Option 4 — production build (fully static, no backend)

```bash
cd frontend
npm run demo:build   # builds with NEXT_PUBLIC_DEMO_MODE=true baked in
npm run demo:start   # serves the static build
```

---

## How to Disable Demo Mode (return to production)

Simply start without the flag:

```bash
npm run dev -- --port 3001
# or
NEXT_PUBLIC_DEMO_MODE=false npm run dev -- --port 3001
```

No `.env.local` changes needed if you started with option 1 or 2.

---

## What Happens in Each Mode

| Behaviour | Production Mode | Demo Mode |
|-----------|----------------|-----------|
| Backend required | ✅ Yes (port 8000) | ❌ No |
| Ollama required | ✅ Yes (port 11434) | ❌ No |
| PostgreSQL required | ✅ Yes (port 5432) | ❌ No |
| Redis / Celery required | ✅ Yes (port 6379) | ❌ No |
| Login required | ✅ Yes (`admin`/`orchestrator`) | ❌ Auto-logged in as `demo` |
| API calls | Real FastAPI backend | Intercepted by `mockFetch.ts` |
| Data source | Live database | `demoData.ts` (compiled from `demo-data/`) |
| Inference streaming | Real Ollama SSE | Simulated SSE with realistic timing |
| Knowledge graphs | Live PostgreSQL + file | `demo-data/json/graph_*.json` |
| Wiki articles | Live file system | `demo-data/json/wiki_*.md` |
| Benchmark metrics | Live `query_history` table | `demo-data/csv/benchmark_results.csv` |

---

## Where Demo Data Is Loaded From

All demo data originates from the `demo-data/` directory at the repository root:

```
demo-data/
├── json/
│   ├── domains.json                       → DEMO_DOMAINS (10 business domains)
│   ├── graph_supply_chain.json            → DEMO_GRAPHS["supply_chain_logistics"]
│   ├── graph_financial_risk.json          → DEMO_GRAPHS["financial_risk_compliance"]
│   ├── wiki_supply_chain_community_0.md   → DEMO_WIKIS["supply_chain_logistics"]
│   ├── wiki_financial_risk_community_0.md → DEMO_WIKIS["financial_risk_compliance"]
│   └── train_supply_chain.jsonl           → SLM training reference data
├── csv/
│   ├── entities.csv            → DEMO_GRAPHS (nodes, per-domain)
│   ├── relationships.csv       → DEMO_GRAPHS (edges, per-domain)
│   ├── benchmark_results.csv  → DEMO_BENCHMARK_ROWS
│   └── feedback_records.csv   → DEMO_FEEDBACK
└── sql/                        → Database seed scripts (used in production seeding)
```

This data is **compiled at build time** into `frontend/app/lib/demoData.ts` — a single TypeScript module that exports all constants. To refresh demo data after changing the source files, re-run:

```bash
python3 /home/kumar1/orchestrator/demo-data/scripts/seed_all.sh  # seeds the DB
# then re-run the Python compilation step to regenerate demoData.ts
```

---

## How the API Mocking Works

### Architecture

```
Browser
  │
  ├── window.fetch()              ← patched by mockFetch.ts
  │     └── If url contains /api/v1/*
  │           └── handleMockRequest(url, init) → returns mock Response
  │                 ↓ if no match → pass through to real fetch
  │
  └── window.EventSource()        ← patched by mockFetch.ts
        └── If url contains /api/v1/data/progress/*
              └── MockEventSource → simulates 14-layer SSE stream
```

### Files

| File | Purpose |
|------|---------|
| `frontend/app/lib/demoData.ts` | All embedded data constants. Compiled from `demo-data/` source files. Shape matches every live API response exactly. |
| `frontend/app/lib/mockFetch.ts` | Global `fetch` + `EventSource` interceptor. Maps every `/api/v1/*` route to a mock response. |
| `frontend/app/components/DemoModeProvider.tsx` | Client component mounted in `layout.tsx` when `NEXT_PUBLIC_DEMO_MODE=true`. Installs both interceptors and auto-logs in the demo user. |

### Interceptor activation

`DemoModeProvider` is conditionally mounted in `layout.tsx`:

```tsx
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// In RootLayout:
{DEMO_MODE && <DemoModeProvider />}
```

In production builds where `NEXT_PUBLIC_DEMO_MODE` is absent or `false`, `DemoModeProvider` is never mounted and the mock modules are **tree-shaken** — they add zero bytes to the production bundle.

### Middleware bypass

`middleware.ts` skips the auth cookie check in demo mode:

```ts
if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
  return NextResponse.next();
}
```

---

## Mocked Endpoints

Every `/api/v1/*` endpoint used by the frontend has a matching mock handler in `mockFetch.ts`:

| Endpoint | Mock response |
|----------|---------------|
| `GET /benchmark/summary` | `DEMO_BENCHMARK` (live-captured shape + seeded metrics) |
| `GET /models` | `DEMO_MODELS` (24 Ollama models + 10 custom SLMs) |
| `GET /slm/registry` | `DEMO_SLM_REGISTRY` (11 registered SLMs) |
| `GET /slm/stats` | `DEMO_SLM_STATS` |
| `GET /slm/status?domain_label=X` | `DEMO_SLM_STATUS[domain]` (status=done for all 10) |
| `GET /slm/suggestions?domain_label=X` | `DEMO_SUGGESTIONS[domain]` (6 per domain) |
| `GET /slm/learning-progress` | `DEMO_LEARNING` |
| `GET /slm/for-corpus?job_id=X` | exists=true for demo job IDs |
| `POST /slm/build` | Returns queued task ID |
| `POST /slm/approve-install` | Returns installed |
| `GET /data/corpora` | `DEMO_CORPORA` (38 corpora including 10 demo domains) |
| `GET /data/status/{job_id}` | status=graph_done, entity counts from corpus |
| `GET /data/graph/{job_id}` | `DEMO_GRAPHS[domain_label]` (per-domain graph) |
| `GET /data/wiki/{job_id}` | `DEMO_WIKIS[domain_label]` (community wiki articles) |
| `GET /data/entities/{job_id}` | Derived from `DEMO_GRAPHS` nodes |
| `POST /data/ingest` | Returns demo job_id, status=queued |
| `GET /data/progress/{job_id}` *(SSE)* | Streams 14-layer pipeline animation (~20s) |
| `POST /orchestrator/ask` *(SSE)* | Streams classification → routing → token-by-token answer |
| `GET /models/insights/{task_type}` | `DEMO_NASH_INSIGHTS` |
| `GET /models/bandit-status` | `DEMO_BANDIT` |
| `POST /feedback` | Returns recorded |
| `GET /quality/{job_id}/metrics` | Quality scores |
| `GET /data/test-connection` | Mock DB schema |

---

## Inference Simulation

The orchestrator SSE mock (`makeOrchestratorSSE`) simulates the full execution timeline:

1. **task_classify** (400ms delay) — classifies intent as DOMAIN
2. **coverage_check** (300ms) — REUSE_SLM for existing domain
3. **slm_select** (300ms) — selects the domain's trained SLM
4. **query_decompose** (400ms) — decomposes the query
5. **model_recommend** (300ms) — Nash equilibrium model selection
6. **execute** (running) — begins token streaming
7. **Token stream** — answer streamed word-by-word in ~60ms chunks
8. **final** — complete `OrchestratorOutput` with answer, hallucination rate, model recommendations, process steps

Answers are per-domain from `DEMO_ANSWERS`. All 10 domains have full, realistic enterprise-grade answers. The active domain is resolved from the `domain_label` in the request body, or looked up from `job_id` via `DEMO_CORPORA`.

---

## Chatbot (Outcome Harnessing)

The existing `ChatBot` component is reused unchanged. In demo mode, it calls `runOrchestrator()` (unchanged), which calls `POST /orchestrator/ask`. The mock interceptor catches this call and returns the domain-specific SSE answer stream. Conversation history persists in `localStorage` as in production.

---

## Knowledge Graph Visualisation

The existing graph viewer is reused unchanged. `GET /data/graph/{job_id}` returns the graph JSON from `DEMO_GRAPHS`, keyed by `domain_label` looked up from `DEMO_CORPORA`. The supply chain and financial risk domains use the rich graphs from `demo-data/json/`. All other 8 domains use graphs derived from `demo-data/csv/entities.csv` and `relationships.csv`.

---

## Benchmarking

The existing benchmarking page is reused unchanged. `GET /benchmark/summary` returns `DEMO_BENCHMARK`, which was captured from the live backend after seeding with `demo-data/sql/` scripts. The benchmark `sample_sizes` shows 44 queries and 11 SLMs — exactly what was seeded.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Redirected to `/login` in demo mode | Ensure `NEXT_PUBLIC_DEMO_MODE=true` is set. Check `middleware.ts` has the bypass. |
| API calls still hitting real backend | Confirm `DemoModeProvider` is rendered (check browser console for `[DHS DEMO MODE]` log). |
| Port already in use | Use `npm run demo -- --port 3002` to specify a different port. |
| `demoData.ts` type errors | Run `npx tsc --noEmit` from `frontend/`. The type definitions use `unknown[]` for graph data to stay flexible. |
| Old cache causing issues | `rm -rf frontend/.next` then restart. |
