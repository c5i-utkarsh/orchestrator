# DHS Demo Walkthrough — 10–15 Minute Script

**Version:** 2026-07-07  
**Application:** Domain Harnessing System (DHS)  
**Demo URL (no login):** http://192.168.42.61:3002  
**Production URL:** http://192.168.42.61:3001 (admin / orchestrator)  
**Backend API:** http://192.168.42.61:8000  

---

## Pre-Demo Checklist (5 minutes before)

```
□ Open http://192.168.42.61:3002 in Chrome — verify home page loads
□ Open a second tab at /recommendations for the CPG corpus (job pre-loaded)
□ Verify logo appears top-left
□ Confirm Ollama is running: curl http://localhost:11434/api/tags
□ Have the 9 CPG demo files ready in ~/orchestrator/demo-data/corpus/
□ Close any unrelated browser tabs
□ Set browser zoom to 90% for more screen real estate
```

---

## Step 1 — Opening the Application (30 seconds)

**URL:** http://192.168.42.61:3002

**What to click:** Nothing yet — let the page load and describe what they see.

**What should appear:**
- C5i logo top-left in the sidebar
- Left sidebar: Overview / Information Harnessing / Knowledge Harnessing / Inference Harnessing / Outcome Harnessing / Benchmarking
- Main panel: "Start a new DHS session" with domain selector
- Below the form: **Projects section** with collapsed project groups

**Key talking points:**
> "This is the Domain Harnessing System. The left sidebar maps exactly to the AI adoption journey — from loading your data, to building a knowledge graph, to creating a custom AI, to querying it, to measuring business outcomes. Each layer builds on the previous one."

> "Notice the Projects section below the form. All your previous workspaces are organized into collapsible groups by domain — Supply Chain Logistics, Financial Risk, Manufacturing. You can expand any project to see its versions and files."

**Expected audience questions:**
- *"What is a 'Harness'?"* → "A harness is the infrastructure around an AI model — the knowledge graph, routing logic, quality checks, and governance. DHS is the harness. The model alone is just GPT-4 or Llama. DHS gives it domain memory and accountability."
- *"Is this cloud or on-premise?"* → "Fully on-premise in this deployment. The inference runs on local GPU, the data never leaves the machine."

**Fallback:** If page shows an error, navigate to the login page at /login, use admin/orchestrator, and the production data will load.

---

## Step 2 — Information Harnessing — The Entry Layer (1 minute)

**What to click:** Scroll down to see the Projects section. Click the **▼ chevron** on "Supply Chain Logistics" to expand it.

**What should appear:**
- Two workspaces expand with animation: "Supply Chain Intelligence – Global Ops" (9 files, 487 entities, v3) and "Supply Chain Intelligence – Q4 Update" (4 files)
- Each workspace shows + Update and Open → buttons
- The file list shows names like cpg_sku_master.csv, product_catalog.txt, etc.

**Key talking points:**
> "Information Harnessing is where we define what the AI will know. We select the domain, give the project a name, and upload the corpus — PDFs, CSVs, Excel, plain text. No format restrictions."

> "Each project can have multiple versions. Here Supply Chain has three ingestion runs — when new data arrives, we add it without losing the previous knowledge graph."

> "The system groups related workspaces automatically. If you upload three files today and two more next week, they live in the same project group."

**Show:** Point to the file list. "Notice the system tracks exactly which files are in each version — cpg_sku_master.csv, cpg_vendor_scorecard.csv, the trade promotion guidelines. When you delete a file, the system warns you that knowledge regeneration is required."

**Expected audience questions:**
- *"What file types are supported?"* → "PDF, DOCX, CSV, Excel, JSON, Parquet, plain text. Structured and unstructured in the same project."
- *"How large can the corpus be?"* → "This 9-file CPG corpus with 487 entities processes in under 5 minutes. We've tested up to 500 documents."

---

## Step 3 — Creating a New Project (1 minute)

**What to click:** Click the **⊕ New Project** button in the top-right of the Projects section.

**What should appear:**
- A modal appears: "Create a Project"
- Fields: Project Name (required) + Description (optional)
- Create Project button

**Demo script:**
> Type "CPG Carbonated Drinks 2026" in the Project Name field.
> Type "SKU rationalization and demand forecasting for beverage category" in Description.
> Click Create Project.

**What should appear after:**
- New project group "CPG Carbonated Drinks 2026" appears in the list (expanded, empty, with dashed border)
- "No workspaces yet — click Add Files to populate this project."

**Key talking points:**
> "Projects are organizational containers. Creating one takes three seconds — name it, describe it, done. Now when we click Add Files we can choose to populate this specific project."

**Expected audience questions:**
- *"Can multiple teams share a project?"* → "In this release, projects are per-user. Multi-tenancy is on the roadmap."

---

## Step 4 — Add Files Flow (1 minute)

**What to click:** Click the **+ Add Files** button.

**What should appear:**
- Modal: "Where should these files go?"
- Two radio options: "Existing Project" (with dropdown) and "Create New Project"
- File picker below

**Demo script:**
> Select "Existing Project"  
> From the dropdown, choose "CPG Carbonated Drinks 2026"  
> Click the file picker and select 2-3 CSV files from ~/orchestrator/demo-data/corpus/  
> (Do NOT click the submit button — this would start a real pipeline run)

**Key talking points:**
> "The Add Files flow connects to our existing ingestion pipeline. You pick the project, drop the files, and DHS handles everything from here — extraction, knowledge graph, embeddings, wiki, quality checks. You don't configure anything."

> "The pipeline is 14 layers. We'll see exactly what each layer does in the next step."

**Cancel → don't submit** — Click Cancel on this modal.

---

## Step 5 — Knowledge Harnessing — The Pipeline (2 minutes)

**What to click:** In the Projects section, find "Supply Chain Intelligence – Global Ops" and click **Open →**.

> This navigates to the Query page with that corpus loaded. Instead, let's look at the Knowledge Harnessing page for a corpus that has already been processed.

**Alternative:** Navigate directly to http://192.168.42.61:3002/processing (shows the pipeline canvas for the last session).

**What should appear:**
- Pipeline Canvas showing 14 nodes: File Upload → Ingestion → Cleaning → Chunking → Metadata → Entity+Relationship Extraction → Semantic Embedding → EDA → ML Validation → Ontology → Canonicalization → Knowledge Graph → Graph Validation → Wiki Generation
- Each completed node shows a green ✓ with a detail count
- Progress bar at 100%
- Live log panel at the bottom

**Key talking points, pointing at each node:**
> "This is the 14-layer pipeline. Every layer is deterministic and auditable. Let me walk through the key ones."

1. **Ingestion & Extraction (Layer 2):** "Parses all formats. For the CPG corpus: 9 files extracted, 169 text chunks produced."

2. **Entity + Relationship Extraction (Layer 6):** "spaCy NLP extracts named entities — organizations, products, contracts, metrics. For this corpus: 244 entities, 2,115 relationships identified across all 9 files."

3. **Semantic Embedding (Layer 7):** "768-dimensional vectors for every chunk. Powers semantic search and the SLM's context retrieval."

4. **ML Validation (Layer 9):** "Quality gates. Graph trust 0.828, extraction reliability 1.0. Low-confidence entities are flagged, not discarded."

5. **Ontology & Governance (Layer 10):** "Rules engine. 8 allowed relationship types. If an edge violates the ontology, it's quarantined — not silently dropped."

6. **Knowledge Graph (Layer 12):** "182 canonical nodes after entity resolution. Cross-file merges: 28 entities unified across multiple documents."

7. **Wiki Generation (Layer 14):** "181 auto-generated wiki articles — one per canonical entity. This becomes the SLM's grounding corpus."

**Expected audience questions:**
- *"How long does this take?"* → "For 9 files totalling ~600KB: 3–5 minutes on this GPU. Larger corpora scale roughly linearly with chunk count."
- *"What if a file has errors?"* → "Each file gets an independent quality scorecard. The pipeline continues; the problematic file is flagged in Layer 8 (EDA) and Layer 9 (Validation)."
- *"Can we run this on schedule?"* → "The backend supports /data/ingest-update which adds files to an existing corpus. Scheduled ingestion via cron is a deployment option."

**Fallback (if pipeline page is blank):** "The pipeline has already completed for our pre-loaded corpus. Let's jump directly to the Review step where we examine the outputs."

---

## Step 6 — Knowledge Review (2 minutes)

**What to click:** The review modal appears automatically after pipeline completion. For demo, it's pre-loaded. If starting fresh, the modal appears after pipeline finishes.

**Navigate to:** The review is a full-screen modal — trigger it by completing an ingestion or navigate using the browser's preloaded session.

> For the demo, use the CPG corpus (job `5f238c7e`) which is pre-loaded in production. Open `/recommendations` for that job.

**What should appear — 11 tabs:**

Navigate through these tabs in sequence:

### Tab 1: Pipeline
> "14 steps, all green. Notice the detail on each — '9 files received', '169 chunks from 9 files', '255 entities, 2,115 relationships', 'trust 0.828'."

### Tab 2: Overview
> "The KPI summary. Overall quality score: 82.8%. Orphan nodes: 182 — these are canonical entities that don't yet have cross-file edges, which is expected when cross-source linking hasn't been validated."

### Tab 3: EDA
> "Exploratory Data Analysis per file. Look at cpg_sku_master.csv: 65 entities, 158 relationships, graph density 0.028. The cpg_inventory_snapshot had only 3 nodes — it was a simpler file."

### Tab 4: Knowledge Graph
> "**This is the interactive graph.** 182 canonical nodes. Scroll to zoom. Drag nodes to rearrange. Click any node to see its connections."

**Demo interaction:**
> Click on "ZingEnergy" or another product node → detail panel appears on the right showing: entity type, mention count, connected entities with relationship labels.
> "The edge labels show the relationship type — 'has_revenue', 'owns', 'related_to'. This is the knowledge the Custom AI will use when answering questions."

### Tab 5: Quality Metrics
> "Every file gets a multi-dimensional scorecard. cpg_sku_master.csv scores 0.916 overall — high completeness, high consistency. cpg_inventory_snapshot is lower at 0.521 — it had fewer relationships to extract."

**Key talking point:**
> "Nothing is invented here. These scores come directly from the extraction pipeline — confidence distributions, graph trust, canonical resolution. If a score is low, the system tells you which file and why."

**Expected audience questions:**
- *"What's the difference between completeness and consistency?"* → "Completeness measures what fraction of expected entities were extracted. Consistency measures freedom from contradictions — the same entity not having conflicting types across files."
- *"Can we reject the knowledge and start over?"* → "Yes — the Regenerate Knowledge button re-runs the full 14-layer pipeline. The Reject button discards everything and returns to the upload screen."

---

## Step 7 — Knowledge Graph Deep Dive (1 minute)

**Stay on:** Knowledge Graph tab in the Review modal.

**What to demonstrate:**
1. **Zoom:** Use mouse wheel — graph scales smoothly
2. **Pan:** Click and drag background — viewport moves
3. **Drag node:** Click and hold a node, drag it — repositions in force-directed layout
4. **Click node:** Click any node → detail panel shows entity name, type, mention count, source files, and all direct connections with relationship labels
5. **Legend:** Point to bottom-left — colour codes: purple=ORG, amber=PERSON, teal=LOC, blue=PRODUCT, red=EVENT

**Key talking points:**
> "Every node is a real entity from your documents — not a placeholder. The edges are extracted relationships with confidence scores. This graph is what grounds the Custom AI's answers."

> "When you ask 'What are ZingEnergy's main distribution relationships?' — the AI traverses this graph. It doesn't hallucinate nodes; it reads what's actually here."

**Expected audience questions:**
- *"Why are some nodes isolated?"* → "Cross-file edges require validated cross-linking. Within each source file, relationships are rich — 2,115 total. The canonical graph is conservative: it only shows edges that passed the ontology and quality gates."
- *"Can we export this graph?"* → "The graph artifacts are in corpus_store/{job_id}/canonical_graph.json. Neo4j integration is on the roadmap for graph analytics at scale."

---

## Step 8 — Approval and Building Custom AI (1 minute)

**What to click:** Navigate to the Approval tab in the Review modal → Click **✓ Approve & Build Custom AI →**

**What should appear:**
- Modal closes
- Pipeline canvas updates: Layer 13 (Graph Validation) turns green
- "Build Custom AI" node activates — shows "building…"
- Progress card appears: "Knowledge distillation · QLoRA fine-tuning · Ollama deployment"

**Key talking points:**
> "This is the point where the knowledge graph becomes a language model. The process has two phases: first a teacher model (llama3:8b) generates 500 question-answer pairs grounded in the knowledge graph. Then a 1.7B student model is fine-tuned via QLoRA on those pairs."

> "The result: a 2.4GB quantized model that knows your domain. It runs locally at 47 tokens/second, costs zero per query, and answers with citations from the knowledge graph."

> "For demo purposes, we have pre-built SLMs already deployed. The build takes 30–90 minutes on GPU — we'll use the existing it_industry_v10 model."

**Navigate to pre-built model:** Instead of waiting, click **Skip →** on the build progress card → navigate to `/query`.

**Expected audience questions:**
- *"Why not just use GPT-4 for everything?"* → "Cost and privacy. GPT-4 costs $0.03/1K tokens × thousands of daily queries = significant spend. Our SLM costs nothing per query after training. And your data never leaves the building."
- *"How much GPU do you need?"* → "Training: 10GB VRAM (RTX 2080 Ti or better). Inference: 4GB VRAM or CPU-only."

---

## Step 9 — Benchmarking (1 minute)

**Navigate to:** Click **Benchmarking** in the left sidebar.

**What should appear:**
- 10 tabs: Overview / Harness / Functional / Technical / Executive / Knowledge / SLM / Routing / Business / Comparison
- Overview shows real live metrics from the system

**Key talking points, pointing at specific numbers:**

**Overview tab:**
> "Combined Score 0.606 — that's Completion 0.900 × Process 0.923 × Security 0.697. The security score reflects hallucination rate in our current demo query set. Real production deployments with curated corpora typically achieve 0.85+."

> "17 queries recorded. 12 SLMs registered across different domains."

**Harness tab:**
> "This chart compares DHS to GPT-4o and Claude on domain-specific tasks. For Relational queries — questions that require traversing entity relationships — DHS scores 91% versus 44% for GPT-4o alone. The harness, not the model, is the differentiator."

**SLM tab:**
> "Val loss chart — our production-deployed SLMs. The it_industry_v10 model has a val_loss of 1.57 — this is a real number from the training run on this machine."

**Comparison tab:**
> "DHS versus Traditional RAG versus Fine-tuned LLM. Setup time: DHS under 1 day, fine-tuned LLM 8–16 weeks. Cost per 1,000 queries: DHS $145, GPT-4o alone $512. Continuous learning: only DHS."

**Expected audience questions:**
- *"What does 'harness score' mean?"* → "It's the weighted combination of accuracy and governance — how well the system answers correctly AND cites its sources. The model alone gets 0.14; with DHS it reaches 0.63+."
- *"Can we see our own domain's metrics?"* → "Yes — the Benchmarking layer reads from live query history. After you run 20+ queries against your corpus, the numbers reflect your actual domain."

---

## Step 10 — Query Interface (2 minutes)

**Navigate to:** Click **Inference Harnessing** in the left sidebar (or go to `/query`).

**What should appear:**
- "Run a Query" page with domain and corpus selectors at the top
- Text input for the question
- Submit button

**Demo queries to run in sequence:**

### Query 1 — Factual lookup
**Type:** `What are the main product SKUs in the ZingEnergy range?`  
**Select corpus:** Supply Chain Logistics (job-sc-001 or the CPG corpus)  
**Click:** Run Query →

**What should appear:**
- SSE stream opens — real-time step events appear on screen
- Steps: Understanding Query → Loading Domain SLM → SLM Planning → Validating Model Availability → Generating Response → Synthesizing Answer → Validating Response
- Final answer with entity citations like [ZingEnergy], [SKU_CD], etc.

**Key talking points:**
> "Watch the execution blueprint — the domain SLM decomposes the query into subtasks, recommends which model handles each subtask, then orchestrates execution. The catalog is validation-only; the SLM drives planning."

### Query 2 — Multi-hop reasoning
**Type:** `Which vendors have the highest OTIF scores and what products do they supply?`

> "This is a multi-hop query — it needs to traverse vendor→OTIF score and vendor→product relationships. A standalone LLM would guess. DHS traverses the knowledge graph nodes."

### Query 3 — Domain judgment
**Type:** `What are the top 3 risks to our supply chain for carbonated drinks in 2026?`

**Key talking points:**
> "Notice the Reasoning Trail tab in the results — every claim is cited against a specific entity in the knowledge graph. If a fact isn't in the graph, the system says 'not measured' rather than fabricating an answer."

> "The hallucination rate on this domain is 0.083 — that's one in twelve statements needing verification. For enterprise decisions, that's auditable."

**Expected audience questions:**
- *"Can it handle financial queries?"* → "Yes — load a P&L or balance sheet as CSV. The entity extraction identifies line items, the graph maps relationships between accounts, and the SLM answers analytical questions."
- *"What happens when the SLM doesn't know?"* → "The blueprint routes to a frontier model (llama3:8b or qwen2.5) as fallback. The answer notes which model responded and the confidence level."
- *"Is there a query history?"* → "Yes — every query, response summary, hallucination rate, and routing decision is persisted in query_history. The Benchmarking tab reads from it in real time."

---

## Step 11 — Outcome Harnessing (30 seconds)

**Navigate to:** Click **Outcome Harnessing** in the sidebar.

**What should appear:**
- "Recommendations" page with 4 tabs: Solution Blueprint / Answer / Chat / Reasoning Trail
- Pre-loaded results from the last query

**Key talking points:**
> "The Outcome layer is where the answer becomes a deliverable. The Solution Blueprint tab shows a 7-step implementation plan generated from the query — each step has an assigned model, priority, effort estimate, and KPIs."

> "The Chat tab supports follow-up questions without re-running the planning pipeline. The SLM detects follow-ups and answers directly from context — 2 model calls instead of 6."

> "The Reasoning Trail shows every orchestrator decision — which model was chosen, why, confidence score, and entity citations. Full audit trail."

---

## Step 12 — Architecture Close (1 minute)

**Navigate back to:** Click **Overview** in the sidebar.

**What should appear:**
- Dashboard with KPI cards: Active SLMs, Queries Handled, Knowledge Entities, Cost Saved

**Closing talking points:**
> "Let me summarise what you've seen. Five layers:"

> 1. **Information Harnessing** — Organize and ingest your domain corpus. Any format, any domain, versioned.

> 2. **Knowledge Harnessing** — 14-layer deterministic pipeline. Extracts entities, relationships, builds a knowledge graph, runs quality validation, generates wiki articles. Every output is auditable.

> 3. **Custom AI** — Domain-specific Small Language Model trained via knowledge distillation + QLoRA. Runs on your GPU, zero marginal cost, no data leaves the building.

> 4. **Inference Harnessing** — SLM-first orchestration. The domain model plans the execution blueprint, selects specialist models for each subtask, synthesizes the answer with citations.

> 5. **Outcome Harnessing** — Structured deliverables. Blueprints, chat, reasoning trail.

> "The Benchmarking layer measures everything continuously. When the ROI is 6×, you can show exactly where it came from."

**Final statement:**
> "DHS is not a chatbot wrapper. It's an enterprise AI infrastructure layer — knowledge graph, domain model, governed orchestration, continuous benchmarking. The model is one component. The harness is the product."

---

## Appendix A — Fallback Procedures

| Scenario | Fallback |
|---|---|
| Backend 503 / timeout | Use demo mode at :3002 — all API calls return mock data |
| Ollama not responding | Demo mode has pre-built mock answers |
| Pipeline takes too long | Show pre-processed CPG corpus (job `5f238c7e`) |
| Graph tab empty | Navigate to Benchmarking → Knowledge tab — static data always renders |
| SLM build fails | Skip directly to Query using `it_industry_v10:latest` which is pre-deployed |
| Query returns error | Use the chat tab — it uses simpler direct-synthesis path |

---

## Appendix B — Key Numbers to Remember

| Metric | Value | Source |
|---|---|---|
| Pipeline layers | 14 | processing/page.tsx INGEST_LAYERS |
| CPG corpus files | 9 | cpg_sku_master, cpg_vendor_scorecard, etc. |
| Entities extracted | 244 (canonical) / 255 (raw) | quality metrics |
| Avg quality score | 82.8% | file_scorecards average |
| Wiki articles | 181 | wiki pipeline |
| SLMs deployed | 12 | slm_registry |
| Queries processed | 19+ | query_history |
| Combined benchmark | 0.606 | benchmark/summary |
| SLM inference speed | 47 tok/s | local GPU (RTX 2080 Ti) |
| Cost vs GPT-4o | $145 vs $512 per 1K queries | benchmarking |

---

## Appendix C — Demo URLs Quick Reference

```
Demo (no login):    http://192.168.42.61:3002
Production:         http://192.168.42.61:3001  (admin / orchestrator)
API docs:           http://192.168.42.61:8000/docs
Health:             http://192.168.42.61:8000/health
```
