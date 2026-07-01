"use client";

import { useEffect, useState, useRef, Suspense } from "react";
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

  const esRef = useRef<EventSource | null>(null);

  // Knowledge Review gate (approve / reject / regenerate over wiki+graph+entities)
  const [showReview, setShowReview] = useState(false);
  const [reviewStats, setReviewStats] = useState<{ entityCount: number; topEntities: string[] }>({ entityCount: 0, topEntities: [] });
  const reviewResolveRef = useRef<((a: "approve" | "reject" | "regenerate") => void) | null>(null);
  const showKnowledgeReview = (stats: { entityCount: number; topEntities: string[] }): Promise<"approve" | "reject" | "regenerate"> =>
    new Promise((resolve) => { setReviewStats(stats); setShowReview(true); reviewResolveRef.current = resolve; });

  const addLog = (msg: string) => setLog(prev => [...prev.slice(-80), msg]);

  const setNodeStatus = (id: string, status: NodeStatus, metric?: string) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, status, metric } : n));
  };

  // Fetch available models on mount
  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
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

    const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
      addLog(`[${status}] ${ev.overall_pct ?? 0}%`);

      // Drive all 14 layer nodes generically from the SSE `steps` array — each step
      // carries {id, status, detail}; the backend status strings map 1:1 to NodeStatus.
      const stepsArr: { id: string; status: string; detail?: string }[] = ev.steps ?? [];
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

        // Knowledge Review — user must approve the wiki/graph/entities before Build Custom AI.
        const action = await showKnowledgeReview({ entityCount: ev.entity_count ?? 0, topEntities: entities });
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

  const startSlmBuildPolling = (API: string, domainLabel: string, taskId: string | null, navigateAfter: boolean) => {
    if (slmPollRef.current) clearInterval(slmPollRef.current);
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
          addLog(`✓ Custom AI built: ${data.model_id}`);
          fireAchievement("🧠", "Custom AI ready!", "Your domain AI is built and ready");
          if (navigateAfter) router.push("/query");
        } else if (data.status === "failed") {
          clearInterval(slmPollRef.current!); slmPollRef.current = null;
          setSlmBuildStatus("failed");
          setNodeStatus("build-ai", "done", "used fallback");
          if (navigateAfter) router.push("/query");
        }
      } catch { /* keep polling */ }
    }, 5000);
  };

  const triggerSlmBuild = async (cfg: SLMConfig, quickRebuild: boolean) => {
    const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const jobId = sessionStorage.getItem("job_id") ?? "";
    const domainLabel = sessionStorage.getItem("domain_label") ?? "general";
    setSlmBuildStatus("queued");
    setNodeStatus("build-ai", "running", "building…");
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
      addLog(`🧠 ${label} queued — task ${data.task_id ?? "(bg)"}`);
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
    addLog(`[${event.type ?? event.phase}] ${JSON.stringify(event).slice(0, 120)}`);

    // SLM build was already configured during ingestion — no re-prompt during orchestrator run

    if (event.phase === "slm_build") {
      if (event.type === "step" && event.step === 3 && event.val_loss !== undefined) {
        setEpochs(prev => [...prev, { epoch: prev.length + 1, loss: event.val_loss }]);
      }
      if (event.type === "done") {
        setBuildModelId(event.model_id);
        setSlmRecord({ val_loss: event.val_loss, hallucination_rate: event.hallucination_rate });
        setShowApproveModal(true);
        fireAchievement("🧠", "Your Custom AI is ready!", `Model ${event.model_id ?? ""} trained and awaiting deployment`);
      }
    }

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
      const sessionRecord = {
        job_id: jobId, query, domain_label: domainLabel,
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
    const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
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
      {showReview && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
          <div className="bg-card border border-dborder rounded-2xl overflow-hidden max-w-md w-full shadow-2xl">
            <div className="px-6 pt-6 pb-4 border-b border-dborder">
              <div className="text-[10px] font-bold uppercase tracking-widest text-t3 mb-0.5">Knowledge Review</div>
              <div className="text-[16px] font-semibold text-t1 font-sora">Review generated knowledge</div>
              <div className="text-[11px] text-t3 mt-1">
                {reviewStats.entityCount.toLocaleString()} validated entities. Review the wiki, graph and entities, then approve to build your Custom AI.
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              {reviewStats.topEntities.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {reviewStats.topEntities.slice(0, 12).map((e, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 bg-bg3 border border-dborder rounded text-t2">{e}</span>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => window.open("/wiki", "_blank")} className="btn py-2 text-[12px] border border-dborder2 text-t2 hover:border-accent/40">📖 Review Wiki</button>
                <button onClick={() => window.open("/quality", "_blank")} className="btn py-2 text-[12px] border border-dborder2 text-t2 hover:border-accent/40">🕸️ Review Graph & Entities</button>
              </div>
              <div className="space-y-2 pt-1">
                <button
                  onClick={() => { setShowReview(false); reviewResolveRef.current?.("approve"); reviewResolveRef.current = null; }}
                  className="w-full btn btn-p py-3 text-[13px] font-semibold"
                >✓ Approve &amp; Build Custom AI →</button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setShowReview(false); reviewResolveRef.current?.("regenerate"); reviewResolveRef.current = null; }}
                    className="btn py-2.5 text-[12px] border border-dborder2 text-t2 hover:border-amber/40"
                  >↻ Regenerate</button>
                  <button
                    onClick={() => { setShowReview(false); reviewResolveRef.current?.("reject"); reviewResolveRef.current = null; }}
                    className="btn py-2.5 text-[12px] border border-dborder2 text-t3 hover:border-coral/40 hover:text-coral"
                  >✕ Reject</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
                        setSlmStudioMode("build");
                        setShowSLMStudio(true);
                        addLog("Opening AI Builder…");
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
          <div className="font-sora text-2xl font-semibold text-t1">Knowledge harnessing</div>
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

        {/* Build AI progress */}
        {(slmBuildStatus === "queued" || slmBuildStatus === "building") && (
          <div className="card mb-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse flex-shrink-0" />
              <div>
                <div className="text-[12px] font-semibold text-t1">Building your Custom AI…</div>
                <div className="text-[10px] text-t3 mt-0.5">Training may take 10–60 min. You'll be taken to the Query Builder when done.</div>
              </div>
            </div>
            <button
              onClick={() => { if (slmPollRef.current) clearInterval(slmPollRef.current); router.push("/query"); }}
              className="btn btn-sm text-t3 flex-shrink-0"
            >Skip to Query Builder →</button>
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
