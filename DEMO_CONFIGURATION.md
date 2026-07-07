# DHS Demo Configuration Guide

## Recommended Demo Files to Upload

For the most compelling demo, use documents that match one of the 10 pre-seeded enterprise domains. The richest demo data is in Supply Chain and Financial Risk.

### Tier 1 — Best for live demo (pre-seeded, instant graph)
These domains are already in the system. Simply **select the existing workspace** — no upload needed.

| Domain | Workspace Name | Pre-loaded Entities |
|--------|---------------|-------------------|
| Supply Chain & Logistics | `supply_chain_logistics` | 487 entities, 5 communities |
| Financial Risk & Compliance | `financial_risk_compliance` | 612 entities, 11 communities |
| Customer Experience Analytics | `customer_experience_analytics` | 398 entities, 7 communities |

### Tier 2 — Upload new files (triggers animated 14-layer pipeline)
Upload 3–8 documents from a single domain. Ideal file types:
- `.txt` or `.pdf` — reports, policies, procedures
- `.docx` — business documents, meeting minutes
- `.csv` — structured data exports

**Recommended corpus size**: 3–10 files, 5–50 pages total. Larger corpora give richer graphs but increase demo time.

**Avoid**: Binary files, images, password-protected PDFs.

---

## Demo Timing

| Stage | Demo Mode | Production Mode |
|-------|-----------|----------------|
| Information Harnessing (upload + 14-layer pipeline) | ~20 seconds animated | 2–8 minutes (real processing) |
| Knowledge Harnessing nav (for existing workspace) | Instant | Instant |
| Build Custom AI | **~35 seconds** (simulated) | 15–90 minutes (real QLoRA training) |
| Run Query (inference + streaming) | ~15–20 seconds | 10–30 seconds |
| Total end-to-end (new upload) | ~75 seconds | 20–100 minutes |
| Total end-to-end (existing workspace) | ~35–55 seconds | 30–60 seconds |

---

## Build Custom AI — Demo Stages

When `DEMO_MODE=true` and the user clicks "Build Your AI →", the following simulation runs in sequence (no real training):

| Stage | Duration | Log Message |
|-------|---------|-------------|
| Validate corpus | 2s | 🔍 Validating corpus integrity and checking for duplicates… |
| Teacher LLM | 5s | 🎓 Loading teacher LLM (llama3:8b) for knowledge distillation… |
| Generate QA pairs | 5s | 📝 Generating synthetic QA pairs from knowledge graph entities… |
| Filter dataset | 5s | 🧹 Filtering low-confidence pairs and removing hallucinated answers… |
| Student model training | 8s | 🏋️ Training student model (SmolLM2-1.7B) via QLoRA fine-tuning… |
| Register SLM | 5s | 📋 Registering SLM in model registry with domain embeddings… |
| Validation | 5s | ✅ Running validation benchmark and hallucination checks… |
| **Total** | **~35s** | — |

After completion, the app auto-navigates to Inference Harnessing.

---

## Demo Mode Behaviour

When `NEXT_PUBLIC_DEMO_MODE=true`:

| Feature | Behaviour |
|---------|-----------|
| Login | Bypassed — auto-logged in as user `demo` |
| Authentication middleware | Bypassed — all routes accessible |
| Backend API calls | All intercepted by `mockFetch.ts` — no real backend |
| SSE progress stream | Simulated 14-layer animation at ~1.3s/layer |
| Orchestrator inference | Simulated streaming token-by-token response |
| Build Custom AI | Simulated 35-second pipeline |
| Knowledge Review gate | Auto-approved (no modal shown) |
| Knowledge Graphs | Loaded from `demo-data/json/graph_*.json` |
| Wiki articles | Loaded from `demo-data/json/wiki_*.md` |
| Benchmarking | Populated from seeded DB data |

---

## How to Switch Back to Production Mode

**Option 1 — Don't set the flag:**
```bash
cd frontend && npm run dev -- --port 3001
# NEXT_PUBLIC_DEMO_MODE is absent = production mode
```

**Option 2 — Explicit false:**
```bash
NEXT_PUBLIC_DEMO_MODE=false npm run dev -- --port 3001
```

**Option 3 — Edit `.env.local`:**
```env
# Set to false or remove the line entirely
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_API_URL=          # empty = use Next.js proxy to backend:8000
```

In production mode, all API calls go to the FastAPI backend at `http://localhost:8000` via the Next.js proxy rewrite in `next.config.ts`.

---

## Recommended 5-Minute Demo Script

1. **Dashboard** (30s) — show KPI tiles: active SLMs, queries processed, benchmark score
2. **Information Harnessing** (15s) — click "Supply Chain & Logistics" existing workspace
3. **Knowledge Harnessing** (15s, optional) — show pipeline animation if uploading new docs
4. **Inference Harnessing** (45s) — click a suggestion chip → watch inference timeline → answer streams
5. **Outcome Harnessing** (45s) — show Answer tab, type a follow-up in Chat, show Decision Trace
6. **Benchmarking** (30s) — show combined score 0.839, hallucination rate 4.0%, trend charts

**Total: ~3 minutes active demo + Q&A**
