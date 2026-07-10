// ─────────────────────────────────────────────────────────────────────────────
// DHS Mock Fetch Interceptor
// Activated when NEXT_PUBLIC_DEMO_MODE=true.
// Intercepts every fetch() call to /api/v1/* and returns demo data without
// hitting the backend. Shape matches the real API exactly.
// ─────────────────────────────────────────────────────────────────────────────

import {
  DEMO_BENCHMARK,
  DEMO_MODELS,
  DEMO_SLM_REGISTRY,
  DEMO_CORPORA,
  DEMO_LEARNING,
  DEMO_BANDIT,
  DEMO_SLM_STATS,
  DEMO_SLM_STATUS,
  DEMO_SUGGESTIONS,
  DEMO_ANSWERS,
  DEMO_GRAPHS,
  DEMO_WIKIS,
  DEMO_NASH_INSIGHTS,
  DEMO_FEEDBACK,
  DEMO_PROCESS_STEPS,
  DEMO_EDA_SUMMARY,
  DEMO_ONTOLOGY,
  DEMO_STORAGE,
} from "./demoData";

// ── Helpers ──────────────────────────────────────────────────────────────────

function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function notFound(msg = "Not found"): Response {
  return new Response(JSON.stringify({ detail: msg }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

/** Parse URLSearchParams from a full URL string */
function params(url: string): URLSearchParams {
  try {
    const q = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
    return new URLSearchParams(q);
  } catch {
    return new URLSearchParams();
  }
}

/** Extract the path segment after /api/v1/ */
function apiPath(url: string): string {
  const m = url.match(/\/api\/v1\/(.+?)(?:\?|$)/);
  return m ? m[1] : "";
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

function makeSSE(events: Array<{ data: object; delay: number }>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const ev of events) {
        await new Promise((r) => setTimeout(r, ev.delay));
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(ev.data)}\n\n`)
        );
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/** Simulate the 14-layer ingestion progress SSE stream */
function makeIngestProgressSSE(jobId: string): Response {
  const layers = [
    "upload", "extract", "clean", "chunk", "metadata",
    "entities", "semantic", "eda", "validation", "ontology",
    "canonical", "graph", "graph_validation", "wiki",
  ];
  const events: Array<{ data: object; delay: number }> = [];
  layers.forEach((id, i) => {
    const pct = Math.round(((i + 1) / layers.length) * 95);
    events.push({
      delay: 900,
      data: {
        type: "step",
        step_id: id,
        phase: id,
        status: "running",
        overall_pct: pct,
        steps: layers.slice(0, i + 1).reduce((acc: Record<string, number>, l) => {
          acc[l] = l === id ? pct : 100;
          return acc;
        }, {}),
      },
    });
    events.push({
      delay: 600,
      data: {
        type: "step",
        step_id: id,
        phase: id,
        status: "done",
        overall_pct: Math.round(((i + 1) / layers.length) * 95),
        steps: {},
      },
    });
  });
  events.push({
    delay: 500,
    data: {
      type: "graph_done",
      job_id: jobId,
      domain_label: "supply_chain_logistics",
      entity_count: 487,
      community_count: 5,
      overall_pct: 100,
      reused: false,
    },
  });
  return makeSSE(events);
}

/** Simulate the orchestrator SSE streaming answer */
function makeOrchestratorSSE(domainLabel: string, query: string): Response {
  const domainKey = domainLabel || "supply_chain_logistics";
  const answerData =
    DEMO_ANSWERS[domainKey] ?? DEMO_ANSWERS["supply_chain_logistics"];
  const answer = answerData.answer;
  const slm = answerData.slm;

  // Break answer into ~80-char word chunks to simulate streaming
  const words = answer.split(" ");
  const chunks: string[] = [];
  let cur = "";
  for (const w of words) {
    cur += (cur ? " " : "") + w;
    if (cur.length > 80) { chunks.push(cur); cur = ""; }
  }
  if (cur) chunks.push(cur);

  const events: Array<{ data: object; delay: number }> = [
    { delay: 200, data: { type: "start", phase: "orchestrator" } },
    { delay: 500, data: { type: "step", step: 1, step_name: "Understanding Query",      status: "done", data: { step_name: "Understanding Query",      explanation: { what_we_found: `Intent: DOMAIN | Task: domain_qa`, decision_made: "Intent: DOMAIN | Task: domain_qa" } } } },
    { delay: 200, data: { type: "stage", step_name: "Query Complexity",  detail: "SIMPLE — Direct execution (planner skipped) | Token budget: 700" } },
    { delay: 400, data: { type: "step", step: 2, step_name: "Loading Domain SLM",       status: "done", data: { step_name: "Loading Domain SLM",       explanation: { what: `Routing mode: Domain routing`, decision_made: `Selected: ${slm}`, what_we_found: `Project-exact match → ${slm}` } } } },
    { delay: 350, data: { type: "step", step: 3, step_name: "SLM Planning",             status: "done", data: { step_name: "SLM Planning",             explanation: { what: "Planner mode: Skipped (SIMPLE — direct execution)", decision_made: "Skipped (SIMPLE — direct execution) | Format: conversational | Token budget: 700/response" } } } },
    { delay: 400, data: { type: "step", step: 4, step_name: "Validating Model Availability", status: "done", data: { step_name: "Validating Model Availability", explanation: { decision_made: "All 1 model choice(s) confirmed available" } } } },
    { delay: 200, data: { type: "step", step: 5, step_name: "Generating Response",      status: "running", data: { step_name: "Generating Response", explanation: { what: `Executed 1 subtask(s) | Complexity: SIMPLE | Budget: 700 tokens` } } } },
    ...chunks.map((chunk) => ({
      delay: 55 + Math.random() * 35,
      data: { type: "token", phase: "execute", token: chunk + " " },
    })),
    {
      delay: 300,
      data: {
        // Send as type="output" with payload in data.data — matches production backend format.
        // orchestrator.ts also handles type="final" as a fallback.
        type: "output",
        phase: "done",
        data: {
          // Field names match OrchestratorOutput type used by recommendations/page.tsx.
          // Using wrong names (name vs model_name, task vs query_fragment) causes
          // deriveBuildPlan() to throw and the catch block redirects back to /query.
          intent: "DOMAIN",
          coverage_action: "REUSE_SLM",
          slm_model_id: slm,
          final_answer: answer,
          query: query || "What are the key insights from the domain corpus?",
          hallucination_rate: answerData.hallucination_rate,
          task_completion_rate: answerData.task_completion_rate,
          latency_ms: 2800 + Math.floor(Math.random() * 1000),
          model_recommendations: [
            {
              model_name: slm, provider: "custom_slm", task_type: "domain_qa",
              composite_score: answerData.task_completion_rate, benchmark_score: answerData.task_completion_rate,
              is_available_locally: true, is_primary: true,
              why_primary: "Domain SLM trained on your corpus — highest benchmark delta (+18pp).",
              why_not_alternatives: ["General-purpose models lack domain-specific training"],
            },
            {
              model_name: "llama3:8b", provider: "ollama", task_type: "general_reasoning",
              composite_score: 0.821, benchmark_score: 0.821,
              is_available_locally: true, is_primary: false,
              why_primary: "Strong general-purpose fallback via Ollama.",
              why_not_alternatives: [],
            },
          ],
          sub_task_results: [
            {
              task_type: "domain_qa",
              query_fragment: (query || "domain query").slice(0, 80),
              assigned_model: slm,
              response: answer.slice(0, 300) + "…",
              confidence: answerData.task_completion_rate,
            },
          ],
          process_steps: [...DEMO_PROCESS_STEPS],
        },
      },
    },
  ];
  return makeSSE(events);
}

// ── Route handler ─────────────────────────────────────────────────────────────

function handleMockRequest(url: string, init: RequestInit = {}): Response | null {
  const path = apiPath(url);
  const p = params(url);
  const method = (init.method ?? "GET").toUpperCase();

  // ── GET /benchmark/summary ────────────────────────────────────────────────
  if (path === "benchmark/summary" && method === "GET") {
    return ok(DEMO_BENCHMARK);
  }

  // ── GET /models ───────────────────────────────────────────────────────────
  if (path === "models" && method === "GET") {
    return ok(DEMO_MODELS);
  }

  // ── GET /models/insights/{task_type} ────────────────────────────────────
  if (path.startsWith("models/insights") && method === "GET") {
    return ok(DEMO_NASH_INSIGHTS);
  }

  // ── GET /models/bandit-status ────────────────────────────────────────────
  if (path === "models/bandit-status" && method === "GET") {
    return ok(DEMO_BANDIT);
  }

  // ── GET /slm/registry ────────────────────────────────────────────────────
  if (path === "slm/registry" && method === "GET") {
    return ok(DEMO_SLM_REGISTRY);
  }

  // ── GET /slm/stats ───────────────────────────────────────────────────────
  if (path === "slm/stats" && method === "GET") {
    return ok(DEMO_SLM_STATS);
  }

  // ── GET /slm/learning-progress ───────────────────────────────────────────
  if (path === "slm/learning-progress" && method === "GET") {
    return ok(DEMO_LEARNING);
  }

  // ── GET /slm/status ──────────────────────────────────────────────────────
  if (path === "slm/status" && method === "GET") {
    const domain = p.get("domain_label") ?? "supply_chain_logistics";
    const status = DEMO_SLM_STATUS[domain] ?? { status: "none", model_id: null, domain_label: domain };
    return ok(status);
  }

  // ── GET /slm/suggestions ─────────────────────────────────────────────────
  if (path === "slm/suggestions" && method === "GET") {
    const domain = p.get("domain_label") ?? "supply_chain_logistics";
    const suggestions = DEMO_SUGGESTIONS[domain] ?? DEMO_SUGGESTIONS["supply_chain_logistics"];
    return ok({ suggestions, source: "slm", domain_label: domain });
  }

  // ── GET /slm/for-corpus ──────────────────────────────────────────────────
  if (path.startsWith("slm/for-corpus") && method === "GET") {
    const jobId = p.get("job_id") ?? "";
    const demoJobs = Object.keys(DEMO_SLM_STATUS).map((_, i) => `job-${["sc","fr","cx","hr","it","rd","esg","mfg","ma","dt"][i]}-00${i+1}`);
    const exists = demoJobs.some(j => jobId.startsWith(j.slice(0, 8)));
    return ok({ exists, model_id: exists ? "dhs-slm-supply-chain-v3" : null });
  }

  // ── POST /slm/build ──────────────────────────────────────────────────────
  if (path === "slm/build" && method === "POST") {
    return ok({ task_id: `demo-task-${Date.now()}`, status: "queued", message: "SLM build queued (demo mode)" }, 202);
  }

  // ── POST /slm/approve-install ────────────────────────────────────────────
  if (path === "slm/approve-install" && method === "POST") {
    // display_name accepted but ignored in demo (no persistent storage needed)
    return ok({ status: "deployed", model_id: "demo-slm", ollama_name: "demo-slm", message: "Model deployed (demo mode)" });
  }

  // ── PATCH /slm/registry/{modelId}/display-name ───────────────────────────
  if (path.match(/^slm\/registry\/.+\/display-name$/) && method === "PATCH") {
    return ok({ model_id: path.split("/")[2], display_name: "Demo Display Name" });
  }

  // ── GET /data/storage ─────────────────────────────────────────────────────
  if (path === "data/storage" && method === "GET") {
    return ok(DEMO_STORAGE);
  }

  // ── DELETE /data/project/{jobId} ─────────────────────────────────────────
  if (path.match(/^data\/project\/[^/]+$/) && method === "DELETE") {
    const jobId = path.replace("data/project/", "");
    return ok({ job_id: jobId, deleted: true, slms_removed: [], cleanup_errors: [] });
  }

  // ── GET /data/corpora ─────────────────────────────────────────────────────
  if (path === "data/corpora" && method === "GET") {
    return ok(DEMO_CORPORA);
  }

  // ── POST /data/ingest ─────────────────────────────────────────────────────
  if (path === "data/ingest" && method === "POST") {
    const jobId = `demo-job-${Date.now()}`;
    return ok({ job_id: jobId, status: "queued", reused: false }, 202);
  }

  // ── GET /data/progress/{jobId} — SSE ────────────────────────────────────
  if (path.startsWith("data/progress/") && method === "GET") {
    const jobId = path.replace("data/progress/", "");
    return makeIngestProgressSSE(jobId);
  }

  // ── GET /data/status/{jobId} ─────────────────────────────────────────────
  if (path.startsWith("data/status/") && method === "GET") {
    const jobId = path.replace("data/status/", "");
    const corpus = (DEMO_CORPORA as unknown as Array<{ job_id: string; domain_label: string; entity_count: number; community_count: number }>)
      .find((c) => c.job_id === jobId);
    return ok({
      job_id: jobId,
      status: "graph_done",
      overall_pct: 100,
      domain_label: corpus?.domain_label ?? "supply_chain_logistics",
      entity_count: corpus?.entity_count ?? 487,
      community_count: corpus?.community_count ?? 5,
      reused: false,
    });
  }

  // ── GET /data/graph/{jobId} ──────────────────────────────────────────────
  if (path.startsWith("data/graph/") && !path.includes("/canonical") && method === "GET") {
    const jobId = path.replace("data/graph/", "");
    // Find domain_label for this job_id from corpora list
    const corpus = (DEMO_CORPORA as unknown as Array<{ job_id: string; domain_label: string }>)
      .find(c => c.job_id === jobId);
    const domain = corpus?.domain_label ?? "supply_chain_logistics";
    const graph = (DEMO_GRAPHS as Record<string, { nodes: unknown[]; edges: unknown[]; node_count?: number; edge_count?: number }>)[domain]
      ?? (DEMO_GRAPHS as Record<string, { nodes: unknown[]; edges: unknown[] }>)["supply_chain_logistics"];
    return ok({ job_id: jobId, node_count: (graph as { nodes: unknown[] }).nodes.length, edge_count: (graph as { edges: unknown[] }).edges.length, ...graph });
  }

  // ── GET /data/graph/{jobId}/canonical ────────────────────────────────────
  if (path.startsWith("data/graph/") && path.includes("/canonical") && method === "GET") {
    const graph = DEMO_GRAPHS["job-sc-001"] as { nodes: unknown[]; edges: unknown[] };
    return ok({ job_id: "demo", canonical_graph: { nodes: graph.nodes, edges: graph.edges, stats: { node_count: graph.nodes.length, edge_count: graph.edges.length } } });
  }

  // ── GET /data/wiki/{jobId} ───────────────────────────────────────────────
  if (path.startsWith("data/wiki/") && method === "GET") {
    const jobId = path.replace("data/wiki/", "").split("?")[0];
    const corpus = (DEMO_CORPORA as unknown as Array<{ job_id: string; domain_label: string }>)
      .find(c => c.job_id === jobId);
    const domain = corpus?.domain_label ?? "supply_chain_logistics";
    const articles = (DEMO_WIKIS as Record<string, Array<{ title: string; content: string; community: number }>>)[domain]
      ?? (DEMO_WIKIS as Record<string, Array<{ title: string; content: string }>>)["supply_chain_logistics"]
      ?? [];
    return ok({ job_id: jobId, pipeline_status: "done", article_count: articles.length, articles });
  }

  // ── GET /data/entities/{jobId} ───────────────────────────────────────────
  if (path.startsWith("data/entities/") && method === "GET") {
    const graph = DEMO_GRAPHS["job-sc-001"] as { nodes: Array<{ id: string; label: string; type: string; count: number; community: number }> };
    return ok({
      job_id: path.replace("data/entities/", ""),
      total: graph.nodes.length,
      entities: graph.nodes.map((n) => ({
        text: n.label,
        label: n.type,
        type: n.type.toLowerCase(),
        count: n.count,
        community: n.community,
        source: "graphify",
      })),
    });
  }

  // ── POST /data/test-connection ────────────────────────────────────────────
  if (path === "data/test-connection" && method === "POST") {
    return ok({ status: "ok", tables: ["supply_chain", "inventory", "suppliers", "orders"], row_counts: { supply_chain: 4820, inventory: 12400, suppliers: 250, orders: 88000 } });
  }

  // ── POST /data/retry/{jobId} ──────────────────────────────────────────────
  if (path.startsWith("data/retry/") && method === "POST") {
    return ok({ status: "queued" }, 202);
  }

  // ── POST /data/repair/{jobId} ─────────────────────────────────────────────
  if (path.startsWith("data/repair/") && method === "POST") {
    return ok({ job_id: path.replace("data/repair/", ""), mode: "full_pipeline", status: "queued" }, 202);
  }

  // ── POST /data/ingest-update/{jobId} ─────────────────────────────────────
  if (path.startsWith("data/ingest-update/") && method === "POST") {
    const jobId = path.replace("data/ingest-update/", "");
    return ok({ job_id: jobId, status: "queued", reused: false }, 202);
  }

  // ── DELETE /data/project/{jobId}/file/{fileName} ──────────────────────────
  if (path.startsWith("data/project/") && path.includes("/file/") && method === "DELETE") {
    const parts = path.split("/file/");
    const jobId = parts[0].replace("data/project/", "");
    const fileName = decodeURIComponent(parts[1] ?? "");
    return ok({ job_id: jobId, file_name: fileName, deleted_physical: true, remaining_files: 3, regeneration_required: true });
  }

  // ── GET /data/graph/{jobId}/merged ────────────────────────────────────────
  if (path.startsWith("data/graph/") && path.includes("/merged") && method === "GET") {
    const jobId = path.replace("data/graph/", "").replace("/merged", "");
    const corpus = (DEMO_CORPORA as unknown as Array<{ job_id: string; domain_label: string }>)
      .find(c => c.job_id === jobId);
    const domain = corpus?.domain_label ?? "supply_chain_logistics";
    const graph = (DEMO_GRAPHS as Record<string, { nodes: unknown[]; edges: unknown[] }>)[domain]
      ?? (DEMO_GRAPHS as Record<string, { nodes: unknown[]; edges: unknown[] }>)["supply_chain_logistics"];
    return ok({ job_id: jobId, node_count: (graph as {nodes:unknown[]}).nodes.length, edge_count: (graph as {edges:unknown[]}).edges.length, nodes: (graph as {nodes:unknown[]}).nodes, edges: (graph as {edges:unknown[]}).edges, source: "demo_merged_graph" });
  }

  // ── GET /quality/{jobId}/eda ──────────────────────────────────────────────
  if (path.includes("/eda") && !path.includes("eda/") && method === "GET") {
    const jobId = path.replace("quality/", "").replace("/eda", "");
    return ok({ job_id: jobId, ...DEMO_EDA_SUMMARY });
  }

  // ── GET /quality/{jobId}/ontology ─────────────────────────────────────────
  if (path.includes("/ontology") && method === "GET") {
    const jobId = path.replace("quality/", "").replace("/ontology", "");
    return ok({ job_id: jobId, ...DEMO_ONTOLOGY });
  }

  // ── GET /data/wiki/{jobId}/stats ──────────────────────────────────────────
  if (path.startsWith("data/wiki/") && path.endsWith("/stats") && method === "GET") {
    return ok({ total_articles: 18, schema_articles: 2, graphify_articles: 16, train_tokens: 0, total_tokens: 0, vocab_size: 32064 });
  }

  // ── PATCH /{jobId}/rename ─────────────────────────────────────────────────
  if (path.includes("/rename") && method === "PATCH") {
    return ok({ status: "ok" });
  }

  // ── POST /orchestrator/ask — SSE ──────────────────────────────────────────
  if (path === "orchestrator/ask" && method === "POST") {
    let body: { query?: string; domain_label?: string; job_id?: string } = {};
    try {
      if (init.body) body = JSON.parse(init.body as string);
    } catch { /* ignore */ }
    // Resolve domain_label from job_id if not provided
    let domainLabel = body.domain_label ?? "";
    if (!domainLabel && body.job_id) {
      const corpus = (DEMO_CORPORA as unknown as Array<{ job_id: string; domain_label: string }>)
        .find(c => c.job_id === body.job_id);
      domainLabel = corpus?.domain_label ?? "supply_chain_logistics";
    }
    if (!domainLabel) domainLabel = "supply_chain_logistics";
    return makeOrchestratorSSE(domainLabel, body.query ?? "");
  }

  // ── GET /quality/{jobId}/metrics ─────────────────────────────────────────
  if (path.includes("/metrics") && method === "GET") {
    return ok({
      graph_metrics: {
        node_count: 487, edge_count: 312, active_edge_count: 298, suppressed_edge_count: 14,
        suppressed_ratio_pct: 4.5, high_risk_edge_ratio: 0.047, contradiction_ratio: 0.012,
        edge_confidence_distribution: { low: 29, medium: 124, high: 145 },
        stats: { node_count: 487, edge_count: 298, density: 0.00251, avg_degree: 1.22 }
      },
      registry_metrics: {
        canonical_node_count: 487, total_alias_count: 134, avg_aliases_per_node: 0.28,
        pending_review_count: 3, resolved_review_count: 41, merge_history_count: 28, split_history_count: 6,
        entity_types: ["ORG","PERSON","PRODUCT","REGULATION","METRIC","CONTRACT","FACILITY","SYSTEM","RISK","EVENT"]
      },
      file_scorecards: [
        { overall_kg_quality_score: 0.911, completeness_score: 0.94, consistency_score: 0.97, confidence_score: 0.81, graph_trust_score: 0.87, retrieval_readiness_score: 0.89, semantic_coherence_score: 0.91, canonical_resolution_score: 0.88, extraction_reliability_score: 1.0 },
        { overall_kg_quality_score: 0.871, completeness_score: 0.91, consistency_score: 0.96, confidence_score: 0.78, graph_trust_score: 0.82, retrieval_readiness_score: 0.86, semantic_coherence_score: 0.88, canonical_resolution_score: 0.85, extraction_reliability_score: 1.0 },
      ],
      file_count: 9
    });
  }

  // ── GET /data/ingestion-report/{jobId} ────────────────────────────────────
  if (path.startsWith("data/ingestion-report/") && method === "GET") {
    const jobId = path.replace("data/ingestion-report/", "");
    const domain = (DEMO_CORPORA as unknown as Array<{job_id:string;domain_label:string}>).find(c=>c.job_id===jobId)?.domain_label ?? "supply_chain_logistics";
    return ok({ job_id: jobId, status: "graph_done", entity_count: 487, file_count: 9,
      pipeline_steps: [
        {id:"upload",label:"1 · File upload",status:"done",pct:100,detail:"9 files accepted"},
        {id:"extract",label:"2 · Ingestion & extraction",status:"done",pct:100,detail:"9,241 text blocks"},
        {id:"clean",label:"3 · Cleaning & normalization",status:"done",pct:100,detail:"3 duplicates removed"},
        {id:"chunk",label:"4 · Chunking & segmentation",status:"done",pct:100,detail:"847 semantic chunks"},
        {id:"metadata",label:"5 · Metadata intelligence",status:"done",pct:100,detail:"field types inferred"},
        {id:"entities",label:"6 · Entity & relationship extraction",status:"done",pct:100,detail:"487 entities, 312 relationships"},
        {id:"semantic",label:"7 · Semantic learning",status:"done",pct:100,detail:"768-dim embeddings"},
        {id:"eda",label:"8 · EDA intelligence",status:"done",pct:100,detail:"distributions analysed"},
        {id:"validation",label:"9 · ML validation",status:"done",pct:100,detail:"accuracy 94.3%"},
        {id:"ontology",label:"10 · Ontology & governance",status:"done",pct:100,detail:"3 violations flagged"},
        {id:"canonical",label:"11 · Canonicalization",status:"done",pct:100,detail:"28 merges resolved"},
        {id:"graph",label:"12 · Knowledge graph",status:"done",pct:100,detail:"487 nodes, 312 edges"},
        {id:"graph_validation",label:"13 · Graph validation",status:"done",pct:100,detail:"14 edges suppressed"},
        {id:"wiki",label:"14 · Wiki & explainability",status:"done",pct:100,detail:"5 articles generated"},
      ],
      file_scorecards: [
        { file_id: "supply_chain.txt", scorecard: { file_id:"supply_chain.txt", entity_count:212, relationship_count:148,
            parser_confidence: 0.921, chunks_extracted: 387, pages_processed: 24, warnings: [],
            metadata: { detected_class:"procurement_policy", primary_key:"vendor_id", row_count:null,
              fields:[{name:"vendor_name",type:"string",confidence:0.97},{name:"contract_value",type:"currency",confidence:0.94},{name:"compliance_score",type:"float",confidence:0.88}] },
            eda: { entity_types:{ORG:95,PERSON:42,PRODUCT:78,REGULATION:34,METRIC:58,CONTRACT:29},
              confidence_bands:{high:145,medium:124,low:29}, semantic_drift: 0.12 } } },
        { file_id: "cpg_vendor_scorecard.csv", scorecard: { file_id:"cpg_vendor_scorecard.csv", entity_count:134, relationship_count:89,
            parser_confidence: 0.964, chunks_extracted: 134, pages_processed: null, warnings: [],
            metadata: { detected_class:"structured_table", primary_key:"vendor_id", row_count:134,
              fields:[{name:"vendor_id",type:"integer",confidence:1.0},{name:"otif_score",type:"float",confidence:0.99},{name:"region",type:"categorical",confidence:0.97}] },
            eda: { entity_types:{ORG:45,METRIC:34,FACILITY:18,PRODUCT:37},
              confidence_bands:{high:89,medium:32,low:13}, semantic_drift: 0.04 } } },
      ],
      registry_metrics: { canonical_node_count: 487, total_alias_count: 134, avg_aliases_per_node: 0.28,
        pending_review_count: 3, resolved_review_count: 41, merge_history_count: 28, split_history_count: 6,
        entity_types: ["ORG","PERSON","PRODUCT","REGULATION","METRIC","CONTRACT","FACILITY","SYSTEM","RISK","EVENT"] } });
  }

  // ── GET /wiki/{jobId}/reviews ────────────────────────────────────────────
  if (path.includes("/reviews") && method === "GET") {
    return ok({ reviews: [], total: 0 });
  }

  // ── POST /feedback ────────────────────────────────────────────────────────
  if (path === "feedback" && method === "POST") {
    return ok({ status: "recorded", id: `demo-fb-${Date.now()}` }, 201);
  }

  // ── GET /slm/stats (dashboard KPIs) ──────────────────────────────────────
  if (path === "slm/stats" && method === "GET") {
    return ok(DEMO_SLM_STATS);
  }

  // Not intercepted — let through to real backend (will fail if offline)
  return null;
}

// ── Global fetch override ─────────────────────────────────────────────────────

let _installed = false;

export function installMockFetch(): void {
  if (_installed || typeof window === "undefined") return;
  _installed = true;

  const _realFetch = window.fetch.bind(window);

  window.fetch = function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;

    if (url.includes("/api/v1/")) {
      const mock = handleMockRequest(url, init ?? {});
      if (mock) {
        console.debug("[DHS DEMO]", (init?.method ?? "GET").toUpperCase(), url.replace(/.*\/api\/v1\//, "/api/v1/").split("?")[0]);
        return Promise.resolve(mock);
      }
    }

    // EventSource for progress streams is handled by the SSE mock at the fetch level above.
    // For anything else, attempt the real backend (graceful degradation).
    return _realFetch(input, init);
  };
}

/** Also patch EventSource for /api/v1/data/progress/* */
export function installMockEventSource(): void {
  if (typeof window === "undefined") return;

  const RealEventSource = window.EventSource;

  const LOG_MESSAGES: Record<string, string> = {
    upload:           "Uploading and validating documents…",
    extract:          "Extracting text and structured content…",
    clean:            "Removing duplicates and normalising text…",
    chunk:            "Chunking documents into semantic segments…",
    metadata:         "Enriching metadata and source attribution…",
    entities:         "Extracting entities and relationships…",
    semantic:         "Running semantic embedding and clustering…",
    eda:              "Performing exploratory data analysis…",
    validation:       "Running ML validation and accuracy checks…",
    ontology:         "Applying ontology and governance rules…",
    canonical:        "Canonicalising entities and references…",
    graph:            "Building the knowledge graph…",
    graph_validation: "Validating graph structure and consistency…",
    wiki:             "Generating wiki articles and explanations…",
  };

  const LAYER_ORDER = [
    "upload","extract","clean","chunk","metadata",
    "entities","semantic","eda","validation","ontology",
    "canonical","graph","graph_validation","wiki",
  ];

  // @ts-ignore
  window.EventSource = class MockEventSource {
    private _url: string;
    public onmessage: ((ev: MessageEvent) => void) | null = null;
    public onerror: ((ev: Event) => void) | null = null;
    public onopen: ((ev: Event) => void) | null = null;
    public readyState = 0;
    private _closed = false;

    constructor(url: string) {
      this._url = url;
      if (url.includes("/api/v1/data/progress/")) {
        this._runMockProgress();
      } else {
        return new RealEventSource(url) as unknown as MockEventSource;
      }
    }

    private async _runMockProgress() {
      this.readyState = 1;
      if (this.onopen) this.onopen(new Event("open"));
      await new Promise((r) => setTimeout(r, 200));

      const completedSteps: string[] = [];

      for (let i = 0; i < LAYER_ORDER.length; i++) {
        if (this._closed) break;
        const currentId = LAYER_ORDER[i];

        // Build cumulative steps array: previous = done, current = running, rest = pending
        const steps = LAYER_ORDER.map((id) => ({
          id,
          status: completedSteps.includes(id) ? "done" : id === currentId ? "running" : "pending",
        }));

        const pct = Math.round(((i + 0.5) / LAYER_ORDER.length) * 95);
        const msg = JSON.stringify({
          status: "ingesting",
          overall_pct: pct,
          steps,
          log_message: LOG_MESSAGES[currentId] ?? `Processing ${currentId}…`,
          eta_seconds: Math.max(0, Math.round((LAYER_ORDER.length - i - 1) * 1.4)),
        });
        if (this.onmessage) this.onmessage(new MessageEvent("message", { data: msg }));

        // Each layer takes ~1.3s — feels alive but not too slow
        await new Promise((r) => setTimeout(r, 1300));
        if (this._closed) break;
        completedSteps.push(currentId);

        // Send the "done" state for this step
        const stepsDone = LAYER_ORDER.map((id) => ({
          id,
          status: completedSteps.includes(id) ? "done" : "pending",
        }));
        const pctDone = Math.round(((i + 1) / LAYER_ORDER.length) * 95);
        const msgDone = JSON.stringify({
          status: "ingesting",
          overall_pct: pctDone,
          steps: stepsDone,
          log_message: LOG_MESSAGES[currentId]?.replace("…", " ✓") ?? `${currentId} complete`,
          eta_seconds: Math.max(0, Math.round((LAYER_ORDER.length - i - 1) * 1.3)),
        });
        if (this.onmessage) this.onmessage(new MessageEvent("message", { data: msgDone }));
      }

      if (!this._closed) {
        await new Promise((r) => setTimeout(r, 400));
        const doneMsg = JSON.stringify({
          status: "graph_done",
          overall_pct: 100,
          job_id: "demo",
          domain_label: sessionStorage.getItem("domain_label") ?? "supply_chain_logistics",
          entity_count: 487,
          community_count: 5,
          top_entities: ["Nexus Global Operations", "SemiCore", "FastFreight UK", "Rotterdam Port", "FMCG-HPC-022"],
          log_message: "✓ Knowledge graph ready — 487 entities, 5 communities",
          reused: false,
        });
        if (this.onmessage) this.onmessage(new MessageEvent("message", { data: doneMsg }));
      }
      this.readyState = 2;
    }

    close() { this._closed = true; this.readyState = 2; }
    addEventListener(_type: string, _fn: EventListenerOrEventListenerObject) {}
    removeEventListener(_type: string, _fn: EventListenerOrEventListenerObject) {}
    dispatchEvent(_ev: Event) { return false; }
    get url() { return this._url; }
    get withCredentials() { return false; }
    static get CONNECTING() { return 0; }
    static get OPEN() { return 1; }
    static get CLOSED() { return 2; }
  };
}
