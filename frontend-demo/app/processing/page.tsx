"use client";

import React, { useEffect, useState, useRef, Suspense } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useRouter, useSearchParams } from "next/navigation";
import PipelineCanvas, { type PipelineNode, type NodeStatus } from "../components/PipelineCanvas";
import AchievementToast, { fireAchievement } from "../components/AchievementToast";
import SLMStudio, { type SLMConfig } from "../components/SLMStudio";

interface EpochEntry { epoch: number; loss: number; }

function formatEta(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "";
  if (seconds < 60) return `~${seconds}s remaining`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `~${m}m ${s}s remaining`;
}

// The 14-layer ingestion architecture ("Information harnessing"). Node ids match the
// backend pipeline step ids (see backend/app/tasks/ingest_task.py) so the canvas can be
// driven generically from the SSE `steps` array.
const INGEST_LAYERS: PipelineNode[] = [
  { id: "upload",           label: "File Upload",                 icon: "📥", status: "pending" },
  { id: "extract",          label: "Ingestion & Extraction",     icon: "📤", status: "pending" },
  { id: "clean",            label: "Cleaning & Normalization",   icon: "🧹", status: "pending" },
  { id: "chunk",            label: "Chunking & Segmentation",    icon: "✂️",  status: "pending" },
  { id: "metadata",         label: "Metadata Intelligence",      icon: "🏷️",  status: "pending" },
  { id: "entities",         label: "Entity & Relationship",      icon: "🔗", status: "pending" },
  { id: "semantic",         label: "Semantic Learning",          icon: "🧬", status: "pending" },
  { id: "eda",              label: "EDA Intelligence",           icon: "📊", status: "pending" },
  { id: "validation",       label: "ML Validation & Accuracy",   icon: "✅", status: "pending" },
  { id: "ontology",         label: "Ontology & Governance",      icon: "📚", status: "pending" },
  { id: "canonical",        label: "Canonicalization",           icon: "🧩", status: "pending" },
  { id: "graph",            label: "Knowledge Graph",            icon: "🕸️",  status: "pending" },
  { id: "graph_validation", label: "Graph Validation",           icon: "🔍", status: "pending" },
  { id: "wiki",             label: "Wiki & Explainability",      icon: "📖", status: "pending" },
];

// Post-ingestion journey nodes (custom-AI build + orchestrator answer).
const POST_NODES: PipelineNode[] = [
  { id: "build-ai", label: "Build Custom AI",   icon: "🧠", status: "pending" },
  { id: "ai",       label: "Select AI Models",  icon: "🤖", status: "pending" },
  { id: "answer",   label: "Generate Answer",   icon: "✨", status: "pending" },
];

const INITIAL_NODES: PipelineNode[] = [...INGEST_LAYERS, ...POST_NODES];

const RESULT_NODES: PipelineNode[] = [
  ...INGEST_LAYERS.map(n => ({ ...n, status: "done" as NodeStatus })),
  ...POST_NODES,
];

function ProcessingPage() {
  const [query, setQuery] = useState<string>("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [nodes, setNodes] = useState<PipelineNode[]>(INITIAL_NODES);
  const [overallPct, setOverallPct] = useState(0);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [phase, setPhase] = useState<"ingest" | "orchestrator" | "done">("ingest");
  const [epochs, setEpochs] = useState<EpochEntry[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [stats, setStats] = useState({ files: 0, entities: 0, communities: 0, dupCount: 0, keptCount: 0 });
  const [qualityDist, setQualityDist] = useState({ high: 0, medium: 0, low: 0 });
  const [topEntities, setTopEntities] = useState<string[]>([]);
  const [availableModels, setAvailableModels] = useState<{name:string;provider:string;is_available_locally:boolean}[]>([]);

  // Gate state
  // Track which gates have already been shown (prevents re-triggering on reconnect)
  const gatesShownRef = useRef<Set<string>>(new Set());

  // SLM Studio state
  const [showSLMStudio, setShowSLMStudio] = useState(false);
  const [slmStudioResolveRef] = useState(() => ({ current: null as ((cfg: SLMConfig | null) => void) | null }));

  // SLM approve modal
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approving, setApproving] = useState(false);
  const [buildModelId, setBuildModelId] = useState<string | null>(null);
  const [slmRecord, setSlmRecord] = useState<{ val_loss?: number; hallucination_rate?: number } | null>(null);

  // Build AI phase state
  const [slmBuildStatus, setSlmBuildStatus] = useState<"idle"|"exists"|"queued"|"building"|"done"|"failed">("idle");
  const [slmBuildModelId, setSlmBuildModelId] = useState<string | null>(null);
  const [slmStudioMode, setSlmStudioMode] = useState<"build"|"reconfigure"|"orchestrator">("build");
  const [slmExistsRecord, setSlmExistsRecord] = useState<{ model_id: string; domain_label: string; model_path?: string; val_loss?: number; ollama_model_name?: string } | null>(null);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const slmPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Demo-mode AI Builder wizard
  const [showDemoWizard, setShowDemoWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);

  // Demo-mode Knowledge Review (shows real pipeline output before AI Builder)
  const [showDemoReview, setShowDemoReview] = useState(false);
  const [demoReviewData, setDemoReviewData] = useState<{ wiki: any; graph: any } | null>(null);
  const [demoReviewQuality, setDemoReviewQuality] = useState<{ quality: any; report: any } | null>(null);
  const demoReviewResolveRef = useRef<((a: "approve" | "reject" | "regenerate") => void) | null>(null);
  const [reviewTab, setReviewTab] = useState<"overview"|"graph"|"wiki"|"ontology"|"entities"|"relationships"|"communities"|"statistics"|"quality"|"approval">("overview");

  const esRef = useRef<EventSource | null>(null);
  // Track previous step states to fire logs only on transitions
  const prevStepStatusRef = useRef<Record<string, string>>({});

  // Descriptive log messages for each pipeline layer (mirrors demo LOG_MESSAGES)
  const STEP_START_LOGS: Record<string, string> = {
    upload:           "📥 Uploading and validating documents…",
    extract:          "📤 Extracting text and structured content from all files…",
    clean:            "🧹 Removing duplicates and normalising text…",
    chunk:            "✂️  Chunking documents into semantic segments…",
    metadata:         "🏷️  Enriching metadata and source attribution…",
    entities:         "🔗 Extracting entities and relationships with spaCy NLP…",
    semantic:         "🧬 Running semantic embedding and clustering…",
    eda:              "📊 Performing exploratory data analysis on each file…",
    validation:       "✅ Running ML validation and accuracy trust gates…",
    ontology:         "📚 Applying ontology and semantic governance rules…",
    canonical:        "🧩 Canonicalising entities and resolving references…",
    graph:            "🕸️  Building the knowledge graph with community detection…",
    graph_validation: "🔍 Validating graph structure, consistency and edge confidence…",
    wiki:             "📖 Generating wiki articles and explainability pages…",
  };
  const STEP_DONE_ICONS: Record<string, string> = {
    upload:"📥",extract:"📤",clean:"🧹",chunk:"✂️",metadata:"🏷️",
    entities:"🔗",semantic:"🧬",eda:"📊",validation:"✅",ontology:"📚",
    canonical:"🧩",graph:"🕸️",graph_validation:"🔍",wiki:"📖",
  };

  const addLog = (msg: string) => setLog(prev => [...prev.slice(-80), msg]);

  const setNodeStatus = (id: string, status: NodeStatus, metric?: string) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, status, metric } : n));
  };

  // Fetch available models on mount
  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_API_URL ?? "";
    fetch(`${API}/api/v1/models`)
      .then(r => r.json())
      .then(d => {
        const raw: {model_id?:string; name?:string; provider?:string; status?:string}[] = d.models ?? d ?? [];
        setAvailableModels(raw.map(m => ({
          name: m.name ?? m.model_id ?? "",
          provider: m.provider ?? "ollama",
          is_available_locally: m.status === "local",
        })));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const urlJobId = searchParams.get("job_id");
    const urlQuery = searchParams.get("query");
    const urlDomain = searchParams.get("domain_label");
    if (urlJobId && urlQuery) {
      sessionStorage.setItem("job_id", urlJobId);
      sessionStorage.setItem("query", urlQuery);
      if (urlDomain) sessionStorage.setItem("domain_label", urlDomain);
    }
    const sessionQuery = sessionStorage.getItem("query");
    setQuery(sessionQuery ?? "");
    const jobId = sessionStorage.getItem("job_id");
    const query = sessionStorage.getItem("query");
    const domainLabel = sessionStorage.getItem("domain_label") ?? "general";
    const reuseCorpus = sessionStorage.getItem("reuse_corpus") === "true";
    if (!jobId) { router.push("/"); return; }

    const API = process.env.NEXT_PUBLIC_API_URL ?? "";

    if (reuseCorpus) {
      if (!query) { router.push("/query"); return; }
      setNodes(RESULT_NODES.map(n => n.id === "ai" ? { ...n, status: "running" as NodeStatus } : n));
      setOverallPct(100);
      setPhase("orchestrator");
      addLog("Reusing existing knowledge base — starting AI model selection…");
      startOrchestrator(API, query, domainLabel);
      return;
    }

    setNodeStatus("upload", "running");
    addLog("Information harnessing started — streaming all 14 layers…");

    const es = new EventSource(`${API}/api/v1/data/progress/${jobId}`);
    esRef.current = es;

    es.onmessage = async (e) => {
      const ev = JSON.parse(e.data);
      setOverallPct(ev.overall_pct ?? 0);
      setEtaSeconds(ev.eta_seconds ?? null);
      if (ev.file_count)      setStats(p => ({ ...p, files: ev.file_count }));
      if (ev.entity_count)    setStats(p => ({ ...p, entities: ev.entity_count }));
      if (ev.community_count) setStats(p => ({ ...p, communities: ev.community_count }));

      const status = ev.status;

      // Smart log generation: fire a log only when a step TRANSITIONS (not on every poll tick).
      // This mirrors the demo's per-layer log messages using the real step detail data.
      const stepsArr: { id: string; status: string; detail?: string }[] = ev.steps ?? [];
      const prev = prevStepStatusRef.current;
      for (const s of stepsArr) {
        const prevStatus = prev[s.id];
        if (prevStatus !== s.status) {
          if (s.status === "running") {
            addLog(STEP_START_LOGS[s.id] ?? `[${s.id}] Starting…`);
          } else if (s.status === "done" && prevStatus === "running") {
            const icon = STEP_DONE_ICONS[s.id] ?? "✓";
            addLog(`${icon} ${s.detail || s.id + " complete"}`);
          } else if (s.status === "error") {
            addLog(`❌ ${s.id} failed: ${s.detail ?? "error"}`);
          }
          prev[s.id] = s.status;
        }
      }
      prevStepStatusRef.current = { ...prev };

      // Drive all 14 layer nodes generically from the SSE `steps` array — each step
      // carries {id, status, detail}; the backend status strings map 1:1 to NodeStatus.
      if (status === "ingesting" && stepsArr.length) {
        setNodes(prev => prev.map(n => {
          const s = stepsArr.find(x => x.id === n.id);
          if (!s) return n;
          const mapped: NodeStatus =
            s.status === "done" ? "done"
            : s.status === "running" ? "running"
            : s.status === "error" ? "error"
            : "pending";
          return { ...n, status: mapped, metric: s.detail || n.metric };
        }));
        // Fire a one-time achievement when the knowledge graph layer completes.
        const graphStep = stepsArr.find(x => x.id === "graph");
        if (graphStep?.status === "done" && !gatesShownRef.current.has("graph")) {
          gatesShownRef.current.add("graph");
          fireAchievement("🕸️", "Knowledge graph built!", "Entities and relationships linked");
        }
      }
      // "graph_done" — pipeline complete
      if (status === "graph_done") {
        const entities: string[] = ev.top_entities ?? [];
        setTopEntities(entities);
        setStats(p => ({ ...p, entities: ev.entity_count ?? p.entities, communities: ev.community_count ?? p.communities }));
        // All 14 layers complete — mark the ingest layers done, then gate at Layer 13
        // (Graph Validation & Consistency) before proceeding to the custom-AI build.
        setNodes(prev => prev.map(n =>
          INGEST_LAYERS.some(l => l.id === n.id)
            ? { ...n, status: (n.id === "graph_validation" ? "waiting-approval" : "done") as NodeStatus }
            : n
        ));
        fireAchievement("✅", "Information harnessing complete!", `${ev.entity_count ?? 0} validated entities across 14 layers`);
        es.close();

        // Knowledge Review — fetch pipeline output and show the rich 10-tab review screen.
        const [wikiData, graphData, qualityData, reportData] = await Promise.all([
          fetch(`${API}/api/v1/data/wiki/${jobId}`).then(r => r.json()).catch(() => null),
          fetch(`${API}/api/v1/data/graph/${jobId}`).then(r => r.json()).catch(() => null),
          fetch(`${API}/api/v1/quality/${jobId}/metrics`).then(r => r.json()).catch(() => null),
          fetch(`${API}/api/v1/data/ingestion-report/${jobId}`).then(r => r.json()).catch(() => null),
        ]);
        setDemoReviewData({ wiki: wikiData, graph: graphData });
        setDemoReviewQuality({ quality: qualityData, report: reportData });
        setReviewTab("overview");
        setShowDemoReview(true);
        const action = await new Promise<"approve" | "reject" | "regenerate">(resolve => {
          demoReviewResolveRef.current = resolve;
        });
        setShowDemoReview(false);
        setDemoReviewData(null);
        if (action === "reject") {
          addLog("Knowledge rejected — returning to session setup.");
          router.push("/");
          return;
        }
        if (action === "regenerate") {
          addLog("Regenerating knowledge — re-running the pipeline…");
          try { await fetch(`${API}/api/v1/data/retry/${jobId}`, { method: "POST" }); } catch { /* */ }
          window.location.reload();
          return;
        }
        setNodeStatus("graph_validation", "done", `${ev.entity_count ?? 0} entities`);
        addLog("Knowledge approved — checking for existing custom AI…");
        setNodeStatus("build-ai", "running", "checking…");

        try {
          const forCorpusRes = await fetch(`${API}/api/v1/slm/for-corpus?job_id=${jobId}`);
          const forCorpus = await forCorpusRes.json();

          // Always show the model selector — richer card if model exists, build card if not
          setSlmExistsRecord(forCorpus.exists ? forCorpus : null);
          setNodeStatus("build-ai", "waiting-approval");
          setShowModelSelector(true);
          addLog(forCorpus.exists
            ? `ℹ️ Custom AI found: ${forCorpus.model_id}`
            : "No Custom AI yet — configure your AI in the builder…");
        } catch {
          // Fallback: show build card
          setSlmExistsRecord(null);
          setNodeStatus("build-ai", "waiting-approval");
          setShowModelSelector(true);
        }
      } else if (status === "failed") {
        addLog(`❌ Pipeline failed: ${ev.error ?? ""}`);
        es.close();
      }
    };

    es.onerror = () => { addLog("⚠ SSE connection lost — retrying…"); };
    return () => { es.close(); esRef.current?.close(); };
  }, []);

  const slmBuildStartRef = useRef<number>(0);
  const prevSlmPhaseRef = useRef<string>("");

  const startSlmBuildPolling = (API: string, domainLabel: string, taskId: string | null, navigateAfter: boolean) => {
    if (slmPollRef.current) clearInterval(slmPollRef.current);
    if (!slmBuildStartRef.current) slmBuildStartRef.current = Date.now();
    slmPollRef.current = setInterval(async () => {
      try {
        const params = new URLSearchParams({ domain_label: domainLabel });
        if (taskId) params.set("task_id", taskId);
        const res = await fetch(`${API}/api/v1/slm/status?${params}`);
        const data = await res.json();
        if (data.status === "done") {
          clearInterval(slmPollRef.current!); slmPollRef.current = null;
          setSlmBuildStatus("done");
          setSlmBuildModelId(data.model_id ?? null);
          setNodeStatus("build-ai", "done", "AI ready");
          addLog(`🧠 Custom AI registered: ${data.model_id}`);
          addLog("✅ Knowledge distillation complete — domain SLM deployed");
          fireAchievement("🧠", "Custom AI ready!", "Your domain AI is built and ready");
          if (navigateAfter) router.push("/query");
        } else if (data.status === "failed") {
          clearInterval(slmPollRef.current!); slmPollRef.current = null;
          setSlmBuildStatus("failed");
          setNodeStatus("build-ai", "done", "used fallback");
          addLog("⚠️ SLM training skipped — using best available Ollama model as domain SLM");
          if (navigateAfter) router.push("/query");
        } else if (data.status === "building" && data.progress) {
          const p = data.progress;
          const elapsed = p.elapsed_ms ?? (Date.now() - slmBuildStartRef.current);
          const elapsedSec = Math.floor(elapsed / 1000);
          const elapsedStr = elapsedSec < 60
            ? `${elapsedSec}s`
            : `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`;

          // Node metric: show current stage + progress
          let metric = "building…";
          if (p.article != null && p.articles_total) {
            const pct = Math.round((p.article / p.articles_total) * 100);
            metric = `distilling ${pct}% · ${elapsedStr}`;
          } else if (p.phase && p.phase !== "progress") {
            metric = p.phase.slice(0, 28) + "…";
          }
          setNodeStatus("build-ai", "running", metric);

          // Log only when phase changes
          const phaseLabel = p.phase_label || p.phase || "";
          if (phaseLabel && phaseLabel !== prevSlmPhaseRef.current) {
            prevSlmPhaseRef.current = phaseLabel;
            if (p.article != null && p.articles_total) {
              const pct = Math.round((p.article / p.articles_total) * 100);
              const etaStr = p.eta_ms ? ` · ETA ${Math.ceil(p.eta_ms / 60000)}m` : "";
              const pairsStr = p.pairs_so_far ? ` · ${p.pairs_so_far} QA pairs` : "";
              addLog(`🎓 Teacher distillation: article ${p.article}/${p.articles_total} (${pct}%)${pairsStr} · elapsed ${elapsedStr}${etaStr}`);
            } else {
              const icons: Record<string, string> = {
                "Teacher synthesis": "🎓",
                "QLoRA skipped": "⚡",
                "Student model selected": "🧑‍🎓",
                "QLoRA fine-tuning": "🏋️",
                "Packaging model": "📦",
                "Deploying to Ollama": "🚀",
              };
              const icon = Object.entries(icons).find(([k]) => phaseLabel.includes(k))?.[1] ?? "⚙️";
              addLog(`${icon} ${phaseLabel} · ${elapsedStr} elapsed`);
            }
          }
        }
      } catch { /* keep polling */ }
    }, 5000);
  };

  /**
   * Demo-mode fast build: simulates the full SLM pipeline in <60s using
   * realistic stage logs and timing. No actual training — no Ollama or GPU needed.
   */
  const triggerDemoBuild = async () => {
    const domainLabel = sessionStorage.getItem("domain_label") ?? "general";
    const modelId = `dhs-slm-${domainLabel.replace(/_/g, "-")}-v1`;

    const stages: Array<{ log: string; metric: string; delay: number }> = [
      { log: "🔍 Validating corpus integrity and checking for duplicates…",   metric: "validating…", delay: 2000 },
      { log: "🎓 Loading teacher LLM (llama3:8b) for knowledge distillation…", metric: "teacher LLM…", delay: 5000 },
      { log: "📝 Generating synthetic QA pairs from knowledge graph entities…", metric: "gen QA pairs…", delay: 5000 },
      { log: "🧹 Filtering low-confidence pairs and removing hallucinated answers…", metric: "filtering…", delay: 5000 },
      { log: "🏋️ Training student model (SmolLM2-1.7B) via QLoRA fine-tuning…", metric: "training…", delay: 8000 },
      { log: "📋 Registering SLM in model registry with domain embeddings…",   metric: "registering…", delay: 5000 },
      { log: "✅ Running validation benchmark and hallucination checks…",       metric: "validating…", delay: 5000 },
    ];

    setSlmBuildStatus("queued");
    setNodeStatus("build-ai", "running", "starting…");
    await new Promise(r => setTimeout(r, 400));
    setSlmBuildStatus("building");

    let totalElapsed = 0;
    const totalTime = stages.reduce((s, st) => s + st.delay, 0);

    for (const stage of stages) {
      setNodeStatus("build-ai", "running", stage.metric);
      addLog(stage.log);
      await new Promise(r => setTimeout(r, stage.delay));
      totalElapsed += stage.delay;
      // Update progress percentage on the build-ai node
      const pct = Math.round((totalElapsed / totalTime) * 100);
      setNodeStatus("build-ai", "running", `${pct}%`);
    }

    addLog(`✓ Custom AI model registered: ${modelId}`);
    addLog(`📊 Val loss: 0.0812 · Hallucination rate: 4.7% · Task completion: 94.1%`);

    setSlmBuildStatus("done");
    setSlmBuildModelId(modelId);
    setNodeStatus("build-ai", "done", "AI ready");
    fireAchievement("🧠", "Custom AI ready!", `${modelId} built and deployed locally`);

    // Persist to sessionStorage so query page shows the SLM status
    sessionStorage.setItem("slm_model_id", modelId);

    await new Promise(r => setTimeout(r, 800));
    router.push("/query");
  };

  const triggerSlmBuild = async (cfg: SLMConfig, quickRebuild: boolean) => {
    const API = process.env.NEXT_PUBLIC_API_URL ?? "";
    const jobId = sessionStorage.getItem("job_id") ?? "";
    const domainLabel = sessionStorage.getItem("domain_label") ?? "general";
    setSlmBuildStatus("queued");
    setNodeStatus("build-ai", "running", "building…");
    // Reset timers for fresh build
    slmBuildStartRef.current = Date.now();
    prevSlmPhaseRef.current = "";
    addLog("🔍 Validating corpus and preparing knowledge distillation…");
    try {
      const res = await fetch(`${API}/api/v1/slm/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain_label: domainLabel,
          coverage_topics: topEntities.slice(0, 10),
          corpus_hash: jobId,
          quick_rebuild: quickRebuild,
          teacher_model: cfg.teacher_model,
          advisor_model: cfg.advisor_model,
          student_model: cfg.student_model === "" ? undefined : cfg.student_model,
          lora_r: cfg.lora_r,
          num_epochs: cfg.num_epochs,
          learning_rate: cfg.learning_rate,
          qa_pairs_target: cfg.qa_pairs_target,
          curriculum_stages: cfg.curriculum_stages,
        }),
      });
      const data = await res.json();
      const label = quickRebuild ? "Quick rebuild" : "SLM build";
      addLog(`🎓 ${label} queued (task: ${(data.task_id ?? "(bg)").slice(0,15)}…)`);
      addLog(`📚 Loading wiki articles for teacher distillation…`);
      startSlmBuildPolling(API, domainLabel, data.task_id ?? null, true);
    } catch (e: any) {
      addLog(`⚠ SLM build failed: ${e.message}`);
      setSlmBuildStatus("failed");
      setNodeStatus("build-ai", "done", "failed");
      router.push("/query");
    }
  };

  const startOrchestrator = async (API: string, query: string, domainLabel: string) => {
    const systemPrompt = sessionStorage.getItem("system_prompt") ?? "";
    const modelOverrides = (() => {
      try { return JSON.parse(sessionStorage.getItem("orch_model_overrides") ?? "null"); } catch { return null; }
    })();
    try {
      const body: Record<string, unknown> = {
        query,
        domain_label: domainLabel,
        job_id: sessionStorage.getItem("job_id"),
        system_prompt: systemPrompt,
      };
      if (modelOverrides) body.model_overrides = modelOverrides;

      const res = await fetch(`${API}/api/v1/orchestrator/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.body) { addLog("⚠ No SSE body from orchestrator"); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try { await handleOrchestratorEvent(JSON.parse(line.slice(6))); } catch { /* skip */ }
          }
        }
      }
    } catch (e: any) {
      addLog(`⚠ Orchestrator error: ${e.message}`);
    }
  };

  const handleOrchestratorEvent = async (event: any) => {
    // Extract a human-readable stage name from the event.
    // Step events: name lives at event.step_name (new) or event.data.step_name (compat).
    // Never log raw JSON blobs or slm_build events (those are Celery-only, not query events).
    const stageName: string =
      event.step_name ??
      event.data?.step_name ??
      event.phase ??
      (event.type === "step" ? `Step ${event.step ?? ""}` : null) ??
      event.type ?? "";

    if (event.type === "step" || event.type === "stage") {
      const detail: string = event.detail ?? event.data?.explanation?.what_we_found ?? "";
      addLog(`▸ ${stageName}${detail ? ` — ${detail}` : ""}`);
    } else if (event.type === "warning" && event.code !== "embedding_unavailable") {
      addLog(`⚠ ${event.message ?? event.code ?? "warning"}`);
    } else if (event.type === "error") {
      addLog(`✖ ${event.message ?? "error"}`);
    }
    // model_context, embedding_unavailable warning, info events: silent in log

    // Map orchestrator phases to canvas nodes
    if (event.type === "step" || event.type === "progress") {
      if (event.step === 4 || event.phase === "recommend") {
        setNodeStatus("ai", "running", "scoring models…");
      }
      if (event.step === 5 || event.phase === "execute") {
        setNodeStatus("ai", "done");
        setNodeStatus("answer", "running");
      }
    }

    if (event.type === "output") {
      setNodeStatus("ai", "done");
      setNodeStatus("answer", "done");
      setPhase("done");
      setOverallPct(100);
      fireAchievement("✨", "Answer ready!", "Your AI has generated a response — tap Results to view");

      // Model auto-selected by the scoring weights — no approval gate needed
      const outputData = event.data;

      sessionStorage.setItem("orchestrator_output", JSON.stringify(outputData));
      const jobId = sessionStorage.getItem("job_id") ?? "";
      const query = sessionStorage.getItem("query") ?? "";
      const domainLabel = sessionStorage.getItem("domain_label") ?? "general";
      const projectName = sessionStorage.getItem("project_name") ?? "";
      const sessionRecord = {
        job_id: jobId, query, domain_label: domainLabel, project_name: projectName,
        timestamp: new Date().toISOString(),
        slm_model_id: outputData.slm_model_id ?? null,
        final_answer: outputData.final_answer ?? "",
        intent: outputData.intent ?? "",
        coverage_action: outputData.coverage_action ?? "",
        hallucination_rate: outputData.hallucination_rate ?? 0,
        output: outputData,
      };
      try {
        const existing = JSON.parse(localStorage.getItem("orch_sessions") ?? "[]");
        const filtered = existing.filter((s: any) => s.job_id !== jobId);
        localStorage.setItem("orch_sessions", JSON.stringify([sessionRecord, ...filtered].slice(0, 20)));
      } catch { /**/ }

      // Navigate to /planning (intent wizard) instead of /recommendations
      router.push("/planning");
    }
  };

  const approveInstall = async () => {
    if (!buildModelId) return;
    setApproving(true);
    const API = process.env.NEXT_PUBLIC_API_URL ?? "";
    try {
      await fetch(`${API}/api/v1/slm/approve-install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: buildModelId }),
      });
      fireAchievement("🚀", "AI deployed!", `${buildModelId} is now live in your system`);
      setShowApproveModal(false);
    } finally {
      setApproving(false);
    }
  };

  return (
    <div>


      {showModelSelector && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
          <div className="bg-card border border-dborder rounded-2xl overflow-hidden max-w-md w-full shadow-2xl">

            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-dborder">
              <div className="text-[10px] font-bold uppercase tracking-widest text-t3 mb-0.5">Step 2 · Build AI</div>
              <div className="text-[16px] font-semibold text-t1 font-sora">
                {slmExistsRecord ? "Your AI model is ready" : "Build your custom AI"}
              </div>
              <div className="text-[11px] text-t3 mt-1">
                {slmExistsRecord
                  ? "A domain-specific AI was already trained for this corpus. Use it or configure a new one."
                  : "Train a small AI model on your corpus using knowledge distillation — no cloud required."}
              </div>
            </div>

            <div className="px-6 py-5">
              {slmExistsRecord ? (
                /* ── Existing model card ── */
                <div className="bg-bg3 border border-dborder rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/25 flex items-center justify-center text-lg flex-shrink-0">🧠</div>
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-t1">{slmExistsRecord.domain_label}</div>
                      <div className="text-[10px] font-mono text-t3 truncate">{slmExistsRecord.model_id}</div>
                    </div>
                    <span className="ml-auto text-[9px] px-2 py-0.5 bg-gg/10 text-gg border border-gg/20 rounded font-semibold flex-shrink-0">Ready</span>
                  </div>
                  {slmExistsRecord.val_loss !== undefined && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-center bg-card border border-dborder rounded-lg p-2">
                        <div className="text-[14px] font-bold text-gg">{((1 - Math.min(slmExistsRecord.val_loss, 1)) * 100).toFixed(0)}%</div>
                        <div className="text-[9px] text-t3 uppercase tracking-wider">Accuracy</div>
                      </div>
                      <div className="text-center bg-card border border-dborder rounded-lg p-2">
                        <div className="text-[14px] font-bold text-accent">{slmExistsRecord.val_loss.toFixed(3)}</div>
                        <div className="text-[9px] text-t3 uppercase tracking-wider">Val Loss</div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* ── No model yet — build prompt ── */
                <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 mb-4">
                  <div className="flex gap-3">
                    <span className="text-2xl flex-shrink-0">🧠</span>
                    <div>
                      <div className="text-[12px] font-semibold text-t1 mb-1">Train a domain expert AI</div>
                      <div className="text-[11px] text-t2 leading-relaxed">
                        Your documents will be used to generate Q&amp;A pairs via knowledge distillation. A small model (SmolLM2 or Qwen2.5) is then fine-tuned on those pairs and deployed locally.
                      </div>
                      <div className="mt-2 flex gap-3 text-[10px] text-t3">
                        <span>⏱ 15–60 min</span>
                        <span>💾 Runs locally</span>
                        <span>🔒 No cloud</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="space-y-2">
                {slmExistsRecord ? (
                  <>
                    <button
                      onClick={() => {
                        setShowModelSelector(false);
                        setSlmBuildStatus("exists");
                        setNodeStatus("build-ai", "done", "AI ready");
                        sessionStorage.setItem("selected_model_id", slmExistsRecord!.model_id);
                        addLog(`✓ Using existing AI: ${slmExistsRecord!.model_id}`);
                        fireAchievement("🧠", "Custom AI ready!", `Using ${slmExistsRecord!.model_id}`);
                        router.push("/query");
                      }}
                      className="w-full btn btn-p py-3 text-[13px] font-semibold"
                    >
                      ✓ Use this AI →
                    </button>
                    <button
                      onClick={() => {
                        setShowModelSelector(false);
                        setSlmStudioMode("reconfigure");
                        setShowSLMStudio(true);
                        addLog("Opening AI Builder to reconfigure…");
                      }}
                      className="w-full btn py-2.5 text-[12px] border border-dborder2 text-t2 hover:border-accent/40"
                    >
                      ⚙ Reconfigure &amp; Build New
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setShowModelSelector(false);
                        // In demo mode: show the AI Builder wizard first, then simulate build
                        if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
                          setWizardStep(0);
                          setShowDemoWizard(true);
                        } else {
                          setSlmStudioMode("build");
                          setShowSLMStudio(true);
                          addLog("Opening AI Builder…");
                        }
                      }}
                      className="w-full btn btn-p py-3 text-[13px] font-semibold"
                    >
                      🧠 Build Your AI →
                    </button>
                    <button
                      onClick={() => {
                        setShowModelSelector(false);
                        setNodeStatus("build-ai", "done", "skipped");
                        addLog("AI build skipped — proceeding to Query Builder…");
                        router.push("/query");
                      }}
                      className="w-full btn py-2.5 text-[12px] border border-dborder2 text-t3 hover:border-t2"
                    >
                      Skip for now
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Knowledge Review (10 tabs, works in Demo + Production) ─────── */}
      {showDemoReview && demoReviewData && (() => {
        const wiki    = demoReviewData.wiki;
        const graph   = demoReviewData.graph;
        const quality = demoReviewQuality?.quality;
        const report  = demoReviewQuality?.report;

        const gNodes: Array<{id:string;label:string;type:string;count?:number;community?:number}> = graph?.nodes ?? [];
        const gEdges: Array<{source:string;target:string;relation:string;weight?:number}> = graph?.edges ?? [];
        const articles: Array<{title:string;content:string;community?:number}> = wiki?.articles ?? [];
        const pipelineSteps: Array<{id:string;label:string;status:string;pct:number;detail?:string}> = report?.pipeline_steps ?? [];
        const scorecards: Array<{file_id:string;scorecard:any}> = report?.file_scorecards ?? [];
        const regMetrics = quality?.registry_metrics ?? report?.registry_metrics ?? null;
        const gMetrics = quality?.graph_metrics ?? null;

        // Community map
        const commMap: Record<number, string[]> = {};
        gNodes.forEach(n => { const c = n.community ?? 0; commMap[c] = [...(commMap[c]||[]), n.label]; });

        // Entity type distribution (from graph nodes)
        const typeDist: Record<string,number> = {};
        gNodes.forEach(n => { typeDist[n.type] = (typeDist[n.type]||0) + 1; });
        const typeChartData = Object.entries(typeDist).map(([type,count]) => ({type, count})).sort((a,b)=>b.count-a.count);

        // Edge confidence distribution
        const confDist = gMetrics?.edge_confidence_distribution ?? quality?.graph_metrics?.edge_confidence_distribution ?? null;
        const confChartData = confDist ? [
          {band:"High (≥0.8)", count: confDist.high, fill:"#16a34a"},
          {band:"Medium (0.5-0.8)", count: confDist.medium, fill:"#d97706"},
          {band:"Low (<0.5)", count: confDist.low, fill:"#e63755"},
        ] : [];

        // Gauge helper — returns an SVG arc path for a 0-1 value
        const arc = (v: number, r=44) => {
          const a = Math.PI * (1 - v); // 180° arc
          const x = 56 + r * Math.cos(a), y = 56 - r * Math.sin(a);
          return `M 12 56 A ${r} ${r} 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`;
        };

        const TABS = [
          {key:"overview",      label:"📊 Overview"},
          {key:"graph",         label:"🕸 Knowledge Graph"},
          {key:"wiki",          label:"📖 Wiki"},
          {key:"ontology",      label:"📚 Ontology"},
          {key:"entities",      label:"🔗 Entities"},
          {key:"relationships", label:"↔ Relationships"},
          {key:"communities",   label:"🏘 Communities"},
          {key:"statistics",    label:"📈 Statistics"},
          {key:"quality",       label:"🎯 Quality Metrics"},
          {key:"approval",      label:"✓ Approval"},
        ] as const;

        const Kpi = ({label,value,color}:{label:string;value:string|number|null;color?:string}) =>
          value == null ? null : (
            <div className="bg-bg2 border border-dborder rounded-xl p-3 text-center">
              <div className="text-[18px] font-bold" style={color?{color}:{color:"#6c5cf7"}}>{value}</div>
              <div className="text-[9px] font-semibold text-t3 uppercase tracking-wider mt-0.5">{label}</div>
            </div>
          );

        const Gauge = ({val,label,color="#6c5cf7"}:{val:number;label:string;color?:string}) => (
          <div className="flex flex-col items-center gap-1">
            <svg viewBox="0 0 112 64" width="112" height="64">
              <path d={arc(1)} fill="none" stroke="#e2e2ee" strokeWidth="8" strokeLinecap="round"/>
              <path d={arc(val)} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"/>
            </svg>
            <div className="text-[16px] font-bold -mt-1" style={{color}}>{(val*100).toFixed(0)}%</div>
            <div className="text-[9px] font-semibold text-t3 uppercase tracking-wider">{label}</div>
          </div>
        );

        const Empty = ({msg="No data available"}:{msg?:string}) => (
          <div className="text-[11px] text-t3 text-center py-10">{msg}</div>
        );

        return (
          <div className="fixed inset-0 bg-black/60 z-50 flex flex-col" style={{backdropFilter:"blur(4px)"}}>
            <div className="flex flex-col h-full max-w-5xl w-full mx-auto my-4 bg-card border border-dborder rounded-2xl shadow-2xl overflow-hidden">

              {/* Header */}
              <div className="px-6 py-3 border-b border-dborder bg-bg2 flex items-center gap-4 flex-shrink-0">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-t3">Knowledge Review · Step 2 of 3</div>
                  <div className="text-[15px] font-semibold text-t1 font-sora">Review Generated Knowledge</div>
                </div>
                {/* Summary strip */}
                <div className="ml-auto flex items-center gap-4">
                  {[
                    {l:"Docs", v:stats.files||report?.file_count||0},
                    {l:"Entities", v:(stats.entities||gNodes.length||0).toLocaleString()},
                    {l:"Relations", v:gEdges.length||0},
                    {l:"Communities", v:Object.keys(commMap).length||stats.communities||0},
                  ].map(item => (
                    <div key={item.l} className="text-center">
                      <div className="text-[14px] font-bold text-accent">{item.v}</div>
                      <div className="text-[8px] font-semibold text-t3 uppercase">{item.l}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tab bar — horizontally scrollable */}
              <div className="flex border-b border-dborder flex-shrink-0 bg-bg2 overflow-x-auto">
                {TABS.map(t => (
                  <button key={t.key} onClick={() => setReviewTab(t.key as typeof reviewTab)}
                    className={`flex items-center gap-1 px-3.5 py-2.5 text-[10px] font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors flex-shrink-0 ${
                      reviewTab === t.key ? "border-accent text-accent bg-accent/5" : "border-transparent text-t3 hover:text-t2"}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-5">

                {/* ── OVERVIEW TAB ──────────────────────────────────── */}
                {reviewTab === "overview" && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-4 gap-3">
                      <Kpi label="Graph Nodes" value={(gMetrics?.node_count ?? gNodes.length) || null} color="#6c5cf7"/>
                      <Kpi label="Relationships" value={(gMetrics?.active_edge_count ?? gEdges.length) || null} color="#0d9e74"/>
                      <Kpi label="Density" value={gMetrics?.stats?.density != null ? gMetrics.stats.density.toFixed(5) : null} color="#2563eb"/>
                      <Kpi label="Communities" value={Object.keys(commMap).length || null}/>
                      <Kpi label="Orphan Nodes" value={gMetrics ? (gMetrics.node_count - Math.round(gMetrics.stats.avg_degree * gMetrics.node_count / 2)) : null} color="#d97706"/>
                      <Kpi label="Suppressed Edges" value={gMetrics?.suppressed_edge_count ?? null} color="#d97706"/>
                      <Kpi label="High Risk Edges" value={gMetrics ? `${(gMetrics.high_risk_edge_ratio*100).toFixed(1)}%` : null} color={gMetrics?.high_risk_edge_ratio > 0.1 ? "#e63755" : "#16a34a"}/>
                      <Kpi label="Overall Quality" value={quality?.overall_quality != null ? `${(quality.overall_quality*100).toFixed(0)}%` : null} color="#16a34a"/>
                    </div>
                    {quality && (
                      <div className="bg-bg2 border border-dborder rounded-xl p-5">
                        <div className="text-[11px] font-semibold text-t3 uppercase tracking-wider mb-4">Quality Profile</div>
                        <div className="flex items-center justify-around flex-wrap gap-4">
                          <Gauge val={quality.completeness ?? 0} label="Completeness" color="#6c5cf7"/>
                          <Gauge val={quality.consistency ?? 0} label="Consistency" color="#0d9e74"/>
                          <Gauge val={quality.accuracy ?? 0} label="Accuracy" color="#2563eb"/>
                          <Gauge val={quality.overall_quality ?? 0} label="Overall" color="#16a34a"/>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── STATISTICS TAB ────────────────────────────────── */}
                {reviewTab === "statistics" && (
                  <div className="space-y-5">
                    {typeChartData.length > 0 && (
                      <div className="bg-bg2 border border-dborder rounded-xl p-4">
                        <div className="text-[12px] font-semibold text-t1 mb-1">Entity Type Distribution</div>
                        <div className="text-[10px] text-t3 mb-3">{gNodes.length} entities across {typeChartData.length} types</div>
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={typeChartData} layout="vertical">
                            <XAxis type="number" tick={{fontSize:10}}/>
                            <YAxis dataKey="type" type="category" tick={{fontSize:10}} width={90}/>
                            <Tooltip/>
                            <Bar dataKey="count" radius={[0,4,4,0]}>
                              {typeChartData.map((_,i) => (
                                <Cell key={i} fill={["#6c5cf7","#0d9e74","#2563eb","#d97706","#e63755","#7c3aed","#0ea5e9","#16a34a"][i%8]}/>
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    {confChartData.length > 0 && (
                      <div className="bg-bg2 border border-dborder rounded-xl p-4">
                        <div className="text-[12px] font-semibold text-t1 mb-1">Edge Confidence Distribution</div>
                        <div className="text-[10px] text-t3 mb-3">{gEdges.length} relationships classified by confidence</div>
                        <ResponsiveContainer width="100%" height={140}>
                          <BarChart data={confChartData}>
                            <XAxis dataKey="band" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/>
                            <Tooltip/>
                            <Bar dataKey="count" radius={[4,4,0,0]}>
                              {confChartData.map((d,i) => <Cell key={i} fill={d.fill}/>)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    {scorecards.length > 0 && (
                      <div className="space-y-3">
                        <div className="text-[11px] font-semibold text-t3 uppercase tracking-wider">Per-File Extraction Statistics</div>
                        {scorecards.map(({file_id, scorecard: sc}) => (
                          <div key={file_id} className="border border-dborder rounded-xl overflow-hidden">
                            <div className="px-4 py-2.5 bg-bg2 border-b border-dborder flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-semibold text-t1 font-mono">{file_id}</span>
                              {sc.parser_confidence != null && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent ml-auto">{(sc.parser_confidence*100).toFixed(0)}% confidence</span>}
                            </div>
                            <div className="px-4 py-3 grid grid-cols-3 gap-3">
                              {sc.chunks_extracted != null && <Kpi label="Chunks" value={sc.chunks_extracted}/>}
                              {sc.entity_count != null && <Kpi label="Entities" value={sc.entity_count} color="#0d9e74"/>}
                              {sc.relationship_count != null && <Kpi label="Relations" value={sc.relationship_count} color="#2563eb"/>}
                              {sc.pages_processed != null && <Kpi label="Pages" value={sc.pages_processed}/>}
                              {sc.row_count != null && <Kpi label="Rows" value={sc.row_count}/>}
                            </div>
                            {sc.warnings?.length > 0 && (
                              <div className="px-4 pb-3 space-y-1">
                                {sc.warnings.map((w: string, i: number) => (
                                  <div key={i} className="text-[10px] text-amber bg-amber/8 border border-amber/20 rounded px-2 py-1">⚠ {w}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {scorecards.map(({file_id, scorecard: sc}) => sc.eda && (
                      <div key={file_id} className="bg-bg2 border border-dborder rounded-xl p-4">
                        <div className="text-[11px] font-semibold text-t1 mb-2 font-mono">{file_id} — EDA</div>
                        <div className="grid grid-cols-3 gap-3">
                          {sc.eda.semantic_drift != null && <Kpi label="Semantic Drift" value={sc.eda.semantic_drift.toFixed(3)} color={sc.eda.semantic_drift > 0.2 ? "#d97706" : "#16a34a"}/>}
                        </div>
                      </div>
                    ))}
                    {typeChartData.length === 0 && confChartData.length === 0 && scorecards.length === 0 && <Empty msg="Statistics data not available for this job."/>}
                  </div>
                )}

                {/* ── ONTOLOGY TAB ──────────────────────────────────── */}
                {reviewTab === "ontology" && (
                  <div className="space-y-4">
                    {typeChartData.length === 0 && !regMetrics && <Empty msg="Ontology data not available for this job."/>}
                    {typeChartData.length > 0 && (
                      <div className="bg-bg2 border border-dborder rounded-xl p-4">
                        <div className="text-[12px] font-semibold text-t1 mb-1">Entity Type Distribution</div>
                        <div className="text-[10px] text-t3 mb-3">{gNodes.length} entities across {typeChartData.length} types</div>
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={typeChartData} layout="vertical">
                            <XAxis type="number" tick={{fontSize:10}}/>
                            <YAxis dataKey="type" type="category" tick={{fontSize:10}} width={90}/>
                            <Tooltip/>
                            <Bar dataKey="count" radius={[0,4,4,0]}>
                              {typeChartData.map((_,i) => (
                                <Cell key={i} fill={["#6c5cf7","#0d9e74","#2563eb","#d97706","#e63755","#7c3aed","#0ea5e9","#16a34a"][i%8]}/>
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    {regMetrics?.entity_types?.length > 0 && (
                      <div className="bg-bg2 border border-dborder rounded-xl p-4">
                        <div className="text-[11px] font-semibold text-t3 uppercase tracking-wider mb-2">Entity Taxonomy ({regMetrics.entity_types.length} types)</div>
                        <div className="flex flex-wrap gap-1.5">
                          {regMetrics.entity_types.map((t: string) => (
                            <span key={t} className="text-[10px] px-2 py-0.5 bg-card border border-dborder rounded-full text-t2 font-mono">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {regMetrics && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-4 gap-3">
                          <Kpi label="Canonical Nodes" value={regMetrics.canonical_node_count} color="#6c5cf7"/>
                          <Kpi label="Aliases Resolved" value={regMetrics.total_alias_count} color="#0d9e74"/>
                          <Kpi label="Merges" value={regMetrics.merge_history_count}/>
                          <Kpi label="Splits" value={regMetrics.split_history_count}/>
                          <Kpi label="Pending Reviews" value={regMetrics.pending_review_count} color={regMetrics.pending_review_count > 0 ? "#d97706" : "#16a34a"}/>
                          <Kpi label="Resolved Reviews" value={regMetrics.resolved_review_count} color="#16a34a"/>
                          <Kpi label="Avg Aliases/Node" value={regMetrics.avg_aliases_per_node?.toFixed(2)}/>
                          {gMetrics?.contradiction_ratio != null && <Kpi label="Contradictions" value={`${(gMetrics.contradiction_ratio*100).toFixed(1)}%`} color={gMetrics.contradiction_ratio > 0.05 ? "#e63755" : "#16a34a"}/>}
                        </div>
                        {regMetrics.pending_review_count > 0 && (
                          <div className="bg-amber/8 border border-amber/30 rounded-xl p-4">
                            <div className="text-[11px] font-semibold text-amber mb-1">⚠ {regMetrics.pending_review_count} Pending Ontology Reviews</div>
                            <div className="text-[11px] text-t2">Some entity merges or ontology decisions require manual review before final deployment.</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}



                {/* ── KNOWLEDGE GRAPH TAB ───────────────────────────── */}
                {reviewTab === "graph" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-4 gap-3">
                      <Kpi label="Nodes" value={(gMetrics?.node_count ?? gNodes.length) || null} color="#6c5cf7"/>
                      <Kpi label="Active Edges" value={(gMetrics?.active_edge_count ?? gEdges.length) || null} color="#0d9e74"/>
                      <Kpi label="Density" value={gMetrics?.stats?.density != null ? gMetrics.stats.density.toFixed(5) : null}/>
                      <Kpi label="Avg Degree" value={gMetrics?.stats?.avg_degree != null ? gMetrics.stats.avg_degree.toFixed(2) : null}/>
                      <Kpi label="Suppressed" value={gMetrics?.suppressed_edge_count ?? null} color="#d97706"/>
                      <Kpi label="Suppressed %" value={gMetrics?.suppressed_ratio_pct != null ? `${gMetrics.suppressed_ratio_pct}%` : null} color="#d97706"/>
                      <Kpi label="Contradictions" value={gMetrics?.contradiction_ratio != null ? `${(gMetrics.contradiction_ratio*100).toFixed(1)}%` : null} color={gMetrics?.contradiction_ratio > 0.05 ? "#e63755" : "#16a34a"}/>
                      <Kpi label="Communities" value={Object.keys(commMap).length || null}/>
                    </div>
                    {/* Top entities by mention */}
                    <div className="bg-bg2 border border-dborder rounded-xl p-4">
                      <div className="text-[11px] font-semibold text-t3 uppercase tracking-wider mb-3">Top Entities</div>
                      <div className="space-y-1.5">
                        {gNodes.slice(0,20).map((n,i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                              n.type==="ORG"?"bg-accent/10 text-accent":n.type==="PERSON"?"bg-teal/10 text-teal":
                              n.type==="REGULATION"?"bg-amber/10 text-amber":n.type==="RISK"||n.type==="EVENT"?"bg-coral/10 text-coral":"bg-bg3 text-t3"}`}>{n.type}</span>
                            <span className="text-[12px] text-t1 flex-1 truncate">{n.label}</span>
                            {n.count && <><div className="w-16 h-1.5 bg-bg3 rounded-full overflow-hidden"><div className="h-full bg-accent/60 rounded-full" style={{width:`${Math.min(100,(n.count/10)*100)}%`}}/></div><span className="text-[9px] text-t3 w-6">{n.count}</span></>}
                            {n.community !== undefined && <span className="text-[8px] text-t3 bg-bg3 px-1.5 py-0.5 rounded">c{n.community}</span>}
                          </div>
                        ))}
                        {gNodes.length > 20 && <div className="text-[10px] text-t3 pt-1">+{gNodes.length-20} more entities</div>}
                        {gNodes.length === 0 && <Empty msg="Graph data not available — pipeline may not have written graph_path to the database yet."/>}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── QUALITY METRICS TAB ───────────────────────────── */}
                {reviewTab === "quality" && (
                  <div className="space-y-5">
                    {!quality && confChartData.length === 0 && <Empty msg="Quality metrics not available for this job."/>}
                    {confChartData.length > 0 && (
                      <>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-gg/8 border border-gg/30 rounded-xl p-4 text-center">
                            <div className="text-[22px] font-bold text-gg">{confDist?.high ?? 0}</div>
                            <div className="text-[10px] font-semibold text-t3 uppercase mt-0.5">High Confidence ≥0.8</div>
                          </div>
                          <div className="bg-amber/8 border border-amber/30 rounded-xl p-4 text-center">
                            <div className="text-[22px] font-bold text-amber">{confDist?.medium ?? 0}</div>
                            <div className="text-[10px] font-semibold text-t3 uppercase mt-0.5">Medium 0.5-0.8</div>
                          </div>
                          <div className="bg-coral/8 border border-coral/30 rounded-xl p-4 text-center">
                            <div className="text-[22px] font-bold text-coral">{confDist?.low ?? 0}</div>
                            <div className="text-[10px] font-semibold text-t3 uppercase mt-0.5">Low Confidence &lt;0.5</div>
                          </div>
                        </div>
                        <div className="bg-bg2 border border-dborder rounded-xl p-4">
                          <div className="text-[12px] font-semibold text-t1 mb-3">Confidence Distribution</div>
                          <ResponsiveContainer width="100%" height={160}>
                            <BarChart data={confChartData}>
                              <XAxis dataKey="band" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/>
                              <Tooltip/>
                              <Bar dataKey="count" radius={[4,4,0,0]}>
                                {confChartData.map((d,i) => <Cell key={i} fill={d.fill}/>)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </>
                    )}
                    {quality && (
                      <div className="bg-bg2 border border-dborder rounded-xl p-5">
                        <div className="text-[12px] font-semibold text-t1 mb-4">Trust Profile</div>
                        <div className="flex items-center justify-around flex-wrap gap-4">
                          <Gauge val={quality.accuracy ?? 0} label="Graph Trust" color="#16a34a"/>
                          <Gauge val={gMetrics?.high_risk_edge_ratio != null ? (1 - gMetrics.high_risk_edge_ratio) : (quality.consistency ?? 0)} label="Hallucination Risk ↓" color={gMetrics?.high_risk_edge_ratio > 0.1 ? "#e63755" : "#d97706"}/>
                          <Gauge val={quality.completeness ?? 0} label="Calibration" color="#6c5cf7"/>
                        </div>
                      </div>
                    )}
                    {gMetrics?.high_risk_edge_ratio != null && (
                      <div className="bg-bg2 border border-dborder rounded-xl p-4">
                        <div className="text-[11px] font-semibold text-t3 uppercase tracking-wider mb-3">Risk Indicators</div>
                        <div className="space-y-2">
                          {[
                            {label:"High Risk Edge Ratio", v:gMetrics.high_risk_edge_ratio, danger:0.1},
                            {label:"Contradiction Ratio", v:gMetrics.contradiction_ratio??0, danger:0.05},
                          ].map(r => (
                            <div key={r.label} className="flex items-center gap-3">
                              <span className="text-[11px] text-t2 w-44">{r.label}</span>
                              <div className="flex-1 h-2 bg-bg3 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{width:`${(r.v*100).toFixed(0)}%`, background: r.v > r.danger?"#e63755":"#16a34a"}}/>
                              </div>
                              <span className="text-[11px] font-bold w-12 text-right" style={{color: r.v > r.danger?"#e63755":"#16a34a"}}>{(r.v*100).toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {quality && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-bg2 border border-dborder rounded-xl p-4">
                          <div className="text-[11px] font-semibold text-t3 uppercase tracking-wider mb-3">Entity Metrics</div>
                          {[
                            {label:"Completeness", v: quality.completeness},
                            {label:"Accuracy", v: quality.accuracy},
                            {label:"Consistency", v: quality.consistency},
                          ].map(m => (
                            <div key={m.label} className="flex items-center gap-2 mb-2">
                              <span className="text-[11px] text-t2 w-28">{m.label}</span>
                              <div className="flex-1 h-1.5 bg-bg3 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-accent" style={{width:`${((m.v??0)*100).toFixed(0)}%`}}/>
                              </div>
                              <span className="text-[10px] font-bold text-t1 w-10 text-right">{((m.v??0)*100).toFixed(0)}%</span>
                            </div>
                          ))}
                        </div>
                        <div className="bg-bg2 border border-dborder rounded-xl p-4">
                          <div className="text-[11px] font-semibold text-t3 uppercase tracking-wider mb-3">Relationship Metrics</div>
                          {confChartData.map(d => (
                            <div key={d.band} className="flex items-center gap-2 mb-2">
                              <span className="text-[11px] text-t2 flex-1 truncate">{d.band}</span>
                              <span className="text-[11px] font-bold" style={{color:d.fill}}>{d.count}</span>
                            </div>
                          ))}
                          {confChartData.length === 0 && <Empty/>}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── GOVERNANCE PLACEHOLDER (data merged into Ontology tab) ── */}
                {/* ── ENTITIES TAB ──────────────────────────────────── */}
                {reviewTab === "entities" && (
                  <div className="space-y-4">
                    {topEntities.length > 0 && (
                      <div className="bg-bg2 border border-dborder rounded-xl p-4">
                        <div className="text-[11px] font-semibold text-t3 uppercase tracking-wider mb-2">Top Extracted Entities</div>
                        <div className="flex flex-wrap gap-1.5">
                          {topEntities.slice(0,20).map((e,i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 bg-card border border-dborder rounded-full text-t2">{e}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="bg-bg2 border border-dborder rounded-xl p-4">
                      <div className="text-[11px] font-semibold text-t3 uppercase tracking-wider mb-3">
                        All Entities {gNodes.length > 0 ? `(${gNodes.length})` : ""}
                      </div>
                      <div className="space-y-1 max-h-[460px] overflow-y-auto pr-1">
                        {gNodes.length === 0 && (
                          topEntities.length > 0
                            ? <div className="text-[11px] text-t3 py-4">Detailed entity data from the knowledge graph is not available. Top entities shown above are from the pipeline summary.</div>
                            : <Empty msg="No entity data available for this job."/>
                        )}
                        {gNodes.map((n, i) => (
                          <div key={i} className="flex items-center gap-2 py-1.5 border-b border-dborder last:border-0">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                              n.type==="ORG"?"bg-accent/10 text-accent":n.type==="PERSON"?"bg-teal/10 text-teal":
                              n.type==="REGULATION"?"bg-amber/10 text-amber":n.type==="RISK"||n.type==="EVENT"?"bg-coral/10 text-coral":"bg-bg3 text-t3"}`}>{n.type}</span>
                            <span className="text-[12px] text-t1 flex-1 truncate">{n.label}</span>
                            {n.community !== undefined && <span className="text-[8px] text-t3 bg-bg3 px-1.5 py-0.5 rounded shrink-0">c{n.community}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                    {scorecards.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[11px] font-semibold text-t3 uppercase tracking-wider">Per-File Entity Counts</div>
                        {scorecards.map(({file_id, scorecard: sc}) => (
                          sc.entity_count != null ? (
                            <div key={file_id} className="flex items-center gap-3 px-4 py-2.5 border border-dborder rounded-xl bg-bg2">
                              <span className="text-[11px] font-mono text-t1 flex-1 truncate">{file_id}</span>
                              <span className="text-[12px] font-bold text-accent">{sc.entity_count}</span>
                              <span className="text-[10px] text-t3">entities</span>
                              {sc.relationship_count != null && <><span className="text-[12px] font-bold text-teal">{sc.relationship_count}</span><span className="text-[10px] text-t3">relations</span></>}
                            </div>
                          ) : null
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── RELATIONSHIPS TAB ─────────────────────────────── */}
                {reviewTab === "relationships" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <Kpi label="Total Edges" value={(gMetrics?.active_edge_count ?? gEdges.length) || null} color="#0d9e74"/>
                      <Kpi label="Suppressed" value={gMetrics?.suppressed_edge_count ?? null} color="#d97706"/>
                      <Kpi label="High Risk %" value={gMetrics?.high_risk_edge_ratio != null ? `${(gMetrics.high_risk_edge_ratio*100).toFixed(1)}%` : null} color={gMetrics?.high_risk_edge_ratio > 0.1 ? "#e63755" : "#16a34a"}/>
                    </div>
                    <div className="bg-bg2 border border-dborder rounded-xl p-4">
                      <div className="text-[11px] font-semibold text-t3 uppercase tracking-wider mb-3">
                        All Relationships {gEdges.length > 0 ? `(${gEdges.length})` : ""}
                      </div>
                      <div className="space-y-1 max-h-[460px] overflow-y-auto pr-1">
                        {gEdges.length === 0 && <Empty msg="No relationship data available — graph endpoint returned no edges for this job."/>}
                        {gEdges.map((e, i) => (
                          <div key={i} className="flex items-center gap-2 py-1.5 border-b border-dborder last:border-0 text-[11px]">
                            <span className="text-t1 font-medium truncate" style={{maxWidth:160}}>{e.source}</span>
                            <span className="text-[10px] px-2 py-0.5 bg-accent/10 text-accent rounded-full font-semibold shrink-0 truncate" style={{maxWidth:120}}>{e.relation}</span>
                            <span className="text-t2 truncate flex-1">{e.target}</span>
                            {e.weight != null && <span className="text-[9px] text-t3 shrink-0">{e.weight.toFixed(2)}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── COMMUNITIES TAB ───────────────────────────────── */}
                {reviewTab === "communities" && (
                  <div className="space-y-3">
                    {Object.keys(commMap).length === 0 && <Empty msg="No community data available — graph data is required for community detection."/>}
                    {Object.entries(commMap).map(([cId, members]) => (
                      <div key={cId} className="border border-dborder rounded-xl overflow-hidden">
                        <div className="px-4 py-2.5 bg-bg2 border-b border-dborder flex items-center gap-3">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-t3">Community {parseInt(cId)+1}</span>
                          <span className="text-[10px] font-semibold text-t1 flex-1 truncate">{members[0]}</span>
                          <span className="text-[10px] text-t3 shrink-0">{members.length} entities</span>
                        </div>
                        <div className="px-4 py-3 flex flex-wrap gap-1.5">
                          {members.slice(0,20).map((m, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 bg-card border border-dborder rounded-full text-t2">{m}</span>
                          ))}
                          {members.length > 20 && <span className="text-[10px] text-t3 self-center">+{members.length-20} more</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── WIKI TAB ─────────────────────────────────────── */}
                {reviewTab === "wiki" && (
                  <div className="space-y-4">
                    {articles.length === 0
                      ? <Empty msg="No wiki articles available — the pipeline writes wiki pages to wiki_pages/ but the wiki API reads from graphify-out/wiki/."/>
                      : articles.map((a,i) => (
                        <div key={i} className="border border-dborder rounded-xl overflow-hidden">
                          <div className="px-4 py-2.5 bg-bg2 border-b border-dborder flex items-center gap-2">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-t3">Community {(a.community ?? i)+1}</span>
                            <span className="text-[12px] font-semibold text-t1 ml-1">{a.title}</span>
                          </div>
                          <div className="px-4 py-3 text-[12px] text-t2 leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto">
                            {a.content}
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* ── APPROVAL TAB ──────────────────────────────────── */}
                {reviewTab === "approval" && (
                  <div className="space-y-5">
                    <div className="bg-bg2 border border-dborder rounded-xl p-5">
                      <div className="text-[12px] font-semibold text-t1 mb-3">Knowledge Summary</div>
                      <div className="grid grid-cols-4 gap-3">
                        <Kpi label="Documents" value={(stats.files || report?.file_count) || null}/>
                        <Kpi label="Entities" value={(gNodes.length || stats.entities) || null} color="#6c5cf7"/>
                        <Kpi label="Relationships" value={gEdges.length || null} color="#0d9e74"/>
                        <Kpi label="Communities" value={Object.keys(commMap).length || null}/>
                      </div>
                    </div>
                    {quality && (
                      <div className="bg-bg2 border border-dborder rounded-xl p-4">
                        <div className="text-[11px] font-semibold text-t3 uppercase tracking-wider mb-3">Quality Assessment</div>
                        <div className="grid grid-cols-4 gap-3">
                          <Kpi label="Completeness" value={quality.completeness != null ? `${(quality.completeness*100).toFixed(0)}%` : null} color="#6c5cf7"/>
                          <Kpi label="Consistency" value={quality.consistency != null ? `${(quality.consistency*100).toFixed(0)}%` : null} color="#0d9e74"/>
                          <Kpi label="Accuracy" value={quality.accuracy != null ? `${(quality.accuracy*100).toFixed(0)}%` : null} color="#2563eb"/>
                          <Kpi label="Overall" value={quality.overall_quality != null ? `${(quality.overall_quality*100).toFixed(0)}%` : null} color="#16a34a"/>
                        </div>
                      </div>
                    )}
                    <div className="space-y-3 pt-2">
                      <button
                        onClick={() => { setShowDemoReview(false); demoReviewResolveRef.current?.("approve"); demoReviewResolveRef.current = null; }}
                        className="w-full btn btn-p py-3.5 text-[14px] font-semibold"
                      >✓ Approve &amp; Build Custom AI →</button>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => { setShowDemoReview(false); demoReviewResolveRef.current?.("regenerate"); demoReviewResolveRef.current = null; }}
                          className="btn py-3 text-[13px] border border-dborder2 text-t2 hover:border-amber/40 hover:text-amber"
                        >↻ Regenerate Knowledge</button>
                        <button
                          onClick={() => { setShowDemoReview(false); demoReviewResolveRef.current?.("reject"); demoReviewResolveRef.current = null; }}
                          className="btn py-3 text-[13px] border border-dborder2 text-t3 hover:border-coral/40 hover:text-coral"
                        >✕ Reject &amp; Start Over</button>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-dborder bg-bg2 flex items-center gap-3 flex-shrink-0">
                <div className="text-[10px] text-t3">{(gNodes.length || stats.entities || 0).toLocaleString()} entities · {gEdges.length} relationships · {articles.length} wiki articles</div>
                <div className="flex-1"/>
                <button
                  onClick={() => setReviewTab("approval")}
                  className="btn btn-p px-5 py-2.5 text-[12px] font-semibold"
                >Go to Approval →</button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* ── Demo AI Builder Wizard ────────────────────────────────────────── */}
      {showDemoWizard && (() => {
        const domainLabel = sessionStorage.getItem("domain_label") ?? "general";
        const entityCount = stats.entities || 487;
        const modelId = `dhs-slm-${domainLabel.replace(/_/g, "-")}-v1`;

        const WIZARD_STEPS = [
          {
            title: "Dataset Review",
            subtitle: "Corpus analysis complete — ready for distillation",
            icon: "📊",
            content: (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Documents", value: stats.files || 9 },
                    { label: "Entities", value: entityCount.toLocaleString() },
                    { label: "Communities", value: stats.communities || 5 },
                  ].map(item => (
                    <div key={item.label} className="text-center bg-bg3 border border-dborder rounded-xl p-3">
                      <div className="text-[20px] font-bold text-accent">{item.value}</div>
                      <div className="text-[9px] font-semibold text-t3 uppercase tracking-wider mt-0.5">{item.label}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-gg/5 border border-gg/20 rounded-lg p-3">
                  <div className="text-[11px] font-semibold text-gg mb-1">✓ Recommended QA pair count</div>
                  <div className="text-[13px] font-bold text-t1">500 pairs · <span className="text-t3 font-normal">auto-calculated from corpus density</span></div>
                </div>
                <div className="text-[11px] text-t3 leading-relaxed">Domain: <span className="font-semibold text-t2">{domainLabel.replace(/_/g," ")}</span> · Estimated training time in demo mode: <span className="font-semibold text-t2">~35 seconds</span></div>
              </div>
            ),
          },
          {
            title: "Teacher Model",
            subtitle: "Selects the LLM that generates synthetic QA pairs",
            icon: "🎓",
            content: (
              <div className="space-y-2">
                {[
                  { name: "llama3:8b", desc: "Recommended · Best domain comprehension · Available locally", badge: "✓ Selected", sel: true },
                  { name: "gemma3", desc: "Alternative · Faster generation, slightly lower accuracy", badge: "Available", sel: false },
                  { name: "mistral:7b", desc: "Legacy · Fast but lower quality QA pairs", badge: "Available", sel: false },
                ].map(m => (
                  <div key={m.name} className={`flex items-center gap-3 p-3 rounded-xl border ${m.sel ? "bg-accent/8 border-accent/40" : "bg-bg2 border-dborder"}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[15px] flex-shrink-0 ${m.sel ? "bg-accent/15" : "bg-bg3"}`}>🤖</div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[12px] font-semibold ${m.sel ? "text-accent" : "text-t2"}`}>{m.name}</div>
                      <div className="text-[10px] text-t3">{m.desc}</div>
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${m.sel ? "bg-accent/15 text-accent" : "bg-bg3 text-t3"}`}>{m.badge}</span>
                  </div>
                ))}
              </div>
            ),
          },
          {
            title: "Student Model",
            subtitle: "The small model that will be fine-tuned and deployed",
            icon: "🧑‍🎓",
            content: (
              <div className="space-y-2">
                {[
                  { name: "SmolLM2-1.7B-Instruct", desc: "Recommended · 1.7B params · 4GB VRAM · QLoRA fine-tuning", badge: "✓ Selected", sel: true },
                  { name: "Qwen2.5-1.5B-Instruct", desc: "Alternative · 1.5B params · Excellent multilingual", badge: "Available", sel: false },
                  { name: "Phi-3-mini-4k-instruct", desc: "Alternative · 3.8B params · Higher quality, more VRAM", badge: "Available", sel: false },
                ].map(m => (
                  <div key={m.name} className={`flex items-center gap-3 p-3 rounded-xl border ${m.sel ? "bg-gg/8 border-gg/40" : "bg-bg2 border-dborder"}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[15px] flex-shrink-0 ${m.sel ? "bg-gg/15" : "bg-bg3"}`}>🧠</div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[12px] font-semibold ${m.sel ? "text-gg" : "text-t2"}`}>{m.name}</div>
                      <div className="text-[10px] text-t3">{m.desc}</div>
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${m.sel ? "bg-gg/15 text-gg" : "bg-bg3 text-t3"}`}>{m.badge}</span>
                  </div>
                ))}
              </div>
            ),
          },
          {
            title: "Training Configuration",
            subtitle: "QLoRA hyper-parameters — optimised for your corpus",
            icon: "⚙️",
            content: (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "QA Pair Target", value: "500", rec: "auto-calculated" },
                    { label: "LoRA Rank (r)", value: "8", rec: "recommended" },
                    { label: "Training Epochs", value: "3", rec: "recommended" },
                    { label: "Learning Rate", value: "2e-4", rec: "recommended" },
                    { label: "Batch Size", value: "4", rec: "auto" },
                    { label: "Context Window", value: "2048", rec: "model default" },
                  ].map(p => (
                    <div key={p.label} className="bg-bg2 border border-dborder rounded-lg p-2.5">
                      <div className="text-[9px] font-semibold text-t3 uppercase tracking-wider">{p.label}</div>
                      <div className="text-[14px] font-bold text-t1 mt-0.5">{p.value}</div>
                      <div className="text-[9px] text-gg">{p.rec}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-accent/5 border border-accent/20 rounded-lg p-3 text-[11px] text-t2">
                  <span className="font-semibold text-accent">Adapter type:</span> QLoRA (4-bit quantized) ·
                  <span className="font-semibold text-accent ml-2">Deploy target:</span> Ollama (local)
                </div>
              </div>
            ),
          },
        ];

        const step = WIZARD_STEPS[wizardStep];
        const isLast = wizardStep === WIZARD_STEPS.length - 1;

        return (
          <div className="fixed inset-0 bg-black/65 z-50 flex items-center justify-center p-6" style={{backdropFilter:"blur(4px)"}}>
            <div className="bg-card border border-dborder rounded-2xl overflow-hidden w-full shadow-2xl" style={{maxWidth: 480}}>
              {/* Progress bar */}
              <div className="h-1 bg-bg3">
                <div className="h-full bg-accent transition-all duration-500" style={{width:`${((wizardStep+1)/WIZARD_STEPS.length)*100}%`}} />
              </div>

              {/* Header */}
              <div className="px-6 pt-5 pb-4 border-b border-dborder">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-t3">
                    Step {wizardStep+1} of {WIZARD_STEPS.length} · AI Builder
                  </span>
                  <span className="ml-auto text-[9px] font-bold px-2 py-0.5 bg-accent/10 text-accent rounded-full">
                    DEMO MODE
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{step.icon}</span>
                  <div>
                    <div className="text-[15px] font-semibold text-t1 font-sora">{step.title}</div>
                    <div className="text-[11px] text-t3">{step.subtitle}</div>
                  </div>
                </div>
              </div>

              {/* Step dots */}
              <div className="flex items-center justify-center gap-1.5 py-3 border-b border-dborder bg-bg2">
                {WIZARD_STEPS.map((_, i) => (
                  <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i < wizardStep ? "w-4 bg-gg" : i === wizardStep ? "w-6 bg-accent" : "w-1.5 bg-dborder2"}`} />
                ))}
              </div>

              {/* Content */}
              <div className="px-6 py-4">{step.content}</div>

              {/* Footer */}
              <div className="px-6 pb-5 flex items-center gap-2">
                {wizardStep > 0 && (
                  <button
                    onClick={() => setWizardStep(s => s - 1)}
                    className="btn btn-sm border border-dborder2 text-t3 hover:text-t2"
                  >
                    ← Back
                  </button>
                )}
                <button
                  onClick={() => {
                    if (isLast) {
                      setShowDemoWizard(false);
                      setWizardStep(0);
                      triggerDemoBuild();
                    } else {
                      setWizardStep(s => s + 1);
                    }
                  }}
                  className="flex-1 btn btn-p py-2.5 text-[13px] font-semibold"
                >
                  {isLast ? "🚀 Start Training →" : "Continue →"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showSLMStudio && (
        slmStudioMode === "orchestrator" ? (
          <SLMStudio
            availableModels={availableModels}
            onStart={(cfg) => { slmStudioResolveRef.current?.(cfg); }}
            onSkip={() => { slmStudioResolveRef.current?.(null); }}
          />
        ) : (
          <SLMStudio
            availableModels={availableModels}
            onStart={(cfg) => { setShowSLMStudio(false); triggerSlmBuild(cfg, slmStudioMode === "reconfigure"); }}
            onSkip={() => {
              setShowSLMStudio(false);
              setNodeStatus("build-ai", "done", "skipped");
              addLog("SLM Studio skipped — proceeding to Query Builder…");
              router.push("/query");
            }}
          />
        )
      )}

      <AchievementToast />

      {/* Page header */}
      <div className="bg-card border-b border-dborder px-0 py-7 mb-7">
        <div className="w-full px-8">
          <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-t3 mb-1.5 flex items-center gap-2">
            <span className="inline-block w-4 h-px bg-accent" />
            Step 2 · Knowledge Harnessing
          </div>
          <div className="font-sora text-2xl font-semibold text-t1">
            {typeof window !== "undefined" && sessionStorage.getItem("project_name")
              ? sessionStorage.getItem("project_name")
              : "Knowledge harnessing"}
          </div>
          <div className="text-[12px] text-t2 mt-1">
            {etaSeconds !== null && phase === "ingest" ? formatEta(etaSeconds) : "14-layer semantic-trust pipeline running — watch each layer complete in real time"}
          </div>
        </div>
      </div>

      <div className="w-full px-8">

        {/* Pipeline canvas */}
        <div className="bg-white border border-dborder rounded-2xl mb-6 overflow-hidden">
          <PipelineCanvas
            nodes={nodes}
            onNodeClick={(node) => {
              // Allow clicking waiting-approval nodes to re-open gate
              addLog(`Clicked node: ${node.id}`);
            }}
          />
        </div>

        {/* Overall progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-[11px] text-t3 mb-1.5">
            <span>Overall progress</span>
            <span className="text-t2 font-semibold">{overallPct}%</span>
          </div>
          <div className="prog-bar h-2">
            <div className="prog-fill h-2" style={{ width: `${overallPct}%` }} />
          </div>
        </div>

        {/* Stats row */}
        {(stats.files > 0 || stats.entities > 0) && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: "Documents",    value: stats.files,       color: "#60a5fa" },
              { label: "Entities",     value: stats.entities,    color: "#7c6af8" },
              { label: "Communities",  value: stats.communities,  color: "#2dd4a0" },
            ].map(({ label, value, color }) => (
              <div key={label} className="mcard text-center">
                <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t" style={{ background: color }} />
                <div className="font-sora text-[22px] font-bold text-t1 leading-none">{value}</div>
                <div className="text-[10px] text-t3 mt-1 uppercase tracking-wider">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Build AI progress — rich card matching demo quality */}
        {(slmBuildStatus === "queued" || slmBuildStatus === "building") && (
          <div className="mb-6 bg-card border border-dborder rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-dborder bg-bg2 flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-t1">Building Custom AI</div>
                <div className="text-[10px] text-t3">Knowledge distillation · QLoRA fine-tuning · Ollama deployment</div>
              </div>
              <button
                onClick={() => { if (slmPollRef.current) clearInterval(slmPollRef.current); router.push("/query"); }}
                className="btn btn-sm text-t3 flex-shrink-0 border border-dborder hover:border-accent/30"
              >Skip →</button>
            </div>
            {/* Progress details from Redis */}
            {(() => {
              // Pull latest progress from the node metric
              const nodeMetric = nodes.find(n => n.id === "build-ai")?.metric ?? "";
              const logs = log;
              const lastBuildLog = [...logs].reverse().find(l =>
                l.includes("distill") || l.includes("Teacher") || l.includes("QLoRA") ||
                l.includes("Packaging") || l.includes("Deploying") || l.includes("queued") ||
                l.includes("Loading wiki")
              );
              return (
                <div className="px-5 py-4 space-y-3">
                  {/* Current stage */}
                  <div className="flex items-center gap-3">
                    <div className="text-[11px] font-semibold text-t3 w-20 shrink-0">Stage</div>
                    <div className="text-[12px] text-t1 font-medium truncate">{nodeMetric || "Initialising…"}</div>
                  </div>
                  {/* Last log message */}
                  {lastBuildLog && (
                    <div className="flex items-start gap-3">
                      <div className="text-[11px] font-semibold text-t3 w-20 shrink-0 pt-0.5">Activity</div>
                      <div className="text-[11px] text-t2 leading-relaxed">{lastBuildLog}</div>
                    </div>
                  )}
                  {/* Progress bar (indeterminate) */}
                  <div className="h-1.5 bg-bg3 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-accent/60 animate-pulse w-3/4" />
                  </div>
                  <div className="text-[10px] text-t3">Distillation takes 30–90 min · you'll be redirected automatically when done</div>
                </div>
              );
            })()}
          </div>
        )}
        {slmBuildStatus === "done" && (
          <div className="card mb-6 flex items-center gap-2">
            <span>🧠</span>
            <div className="text-[12px] text-t1">Custom AI ready — redirecting to Query Builder…</div>
          </div>
        )}
        {slmBuildStatus === "failed" && (
          <div className="card mb-6 flex items-center gap-2">
            <span>⚠️</span>
            <div className="text-[12px] text-t2">AI build failed — you can still use the Query Builder with a general model.</div>
          </div>
        )}

        {/* Epoch loss chart */}
        {epochs.length > 0 && (
          <div className="card mb-6">
            <div className="sect">Training Loss</div>
            <div className="flex items-end gap-1 h-20">
              {epochs.map((e, i) => (
                <div key={i} className="flex flex-col items-center flex-1">
                  <div className="w-full bg-accent rounded-sm"
                    style={{ height: `${Math.max(4, (1 - Math.min(e.loss / 3, 1)) * 60)}px` }} />
                  <span className="text-[9px] text-t3 mt-1">{e.epoch}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live log */}
        <div className="mb-8">
          <div className="sect">Live log</div>
          <div className="bg-bg rounded-sm border border-dborder p-3 max-h-48 overflow-auto">
            {log.map((l, i) => (
              <p key={i} className="text-[11px] text-t3 font-mono leading-relaxed">{l}</p>
            ))}
            {log.length === 0 && (
              <div className="thinking-bar">
                <span className="w-1.5 h-1.5 rounded-full bg-purple animate-blink" />
                Waiting for events…
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Ready to Deploy modal */}
      {showApproveModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-dborder rounded-2xl p-7 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gg/10 border border-gg/30 flex items-center justify-center text-xl">🧠</div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-t3">Custom AI Ready</div>
                <div className="font-sora text-[16px] font-bold text-t1">Your Custom AI is Ready</div>
              </div>
            </div>
            <div className="bg-bg3 rounded-xl p-4 mb-4 space-y-2">
              <div className="flex justify-between text-[12px]">
                <span className="text-t3">Model</span>
                <span className="font-semibold text-t1 font-mono text-[11px]">{buildModelId}</span>
              </div>
              {slmRecord?.val_loss !== undefined && (
                <div className="flex justify-between text-[12px]">
                  <span className="text-t3">Training quality</span>
                  <span className="font-semibold text-gg">{slmRecord.val_loss.toFixed(3)}</span>
                </div>
              )}
              {slmRecord?.hallucination_rate !== undefined && (
                <div className="flex justify-between text-[12px]">
                  <span className="text-t3">Accuracy score</span>
                  <span className="font-semibold text-gg">{((1 - slmRecord.hallucination_rate) * 100).toFixed(1)}%</span>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={approveInstall} disabled={approving}
                className="btn btn-p flex-1 disabled:opacity-50">
                {approving ? "Deploying…" : "🚀 Deploy to My System"}
              </button>
              <button onClick={() => setShowApproveModal(false)} className="btn px-5">
                Not Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg flex items-center justify-center text-t2 text-sm">Loading…</div>}>
      <ProcessingPage />
    </Suspense>
  );
}
