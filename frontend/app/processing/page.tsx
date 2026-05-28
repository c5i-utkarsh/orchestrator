"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface PipelineStep {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  pct: number;
  detail: string;
}

interface ProgressEvent {
  type: string;
  status: string;
  steps: PipelineStep[];
  current_step: number;
  overall_pct: number;
  eta_seconds: number | null;
  entity_count: number;
  community_count: number;
  file_count: number;
  error?: string;
}

interface EpochEntry { epoch: number; loss: number; }

// Fallback steps shown before first SSE event arrives
const DEFAULT_STEPS: PipelineStep[] = [
  { id: "parse",   label: "1 · Parsing & normalizing files",    status: "pending", pct: 0, detail: "" },
  { id: "dedup",   label: "2 · Deduplication (MinHash LSH)",    status: "pending", pct: 0, detail: "" },
  { id: "quality", label: "3 · Quality scoring & filtering",    status: "pending", pct: 0, detail: "" },
  { id: "graph",   label: "4 · Building knowledge graph",       status: "pending", pct: 0, detail: "" },
  { id: "done",    label: "5 · Pipeline complete",              status: "pending", pct: 0, detail: "" },
];

// Orchestrator steps shown after ingest completes
const ORCHESTRATOR_STEPS = [
  { id: "distill", label: "6 · Teacher Synthesis (Q&A Distillation)" },
  { id: "qlora",   label: "7 · QLoRA Fine-Tuning" },
  { id: "deploy",  label: "8 · Deploy SLM to Ollama" },
];

function formatEta(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "";
  if (seconds < 60) return `~${seconds}s remaining`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `~${m}m ${s}s remaining`;
}

function StatusDot({ status }: { status: string }) {
  if (status === "done")    return <span className="inline-block w-2 h-2 rounded-full bg-gg flex-shrink-0" />;
  if (status === "error")   return <span className="inline-block w-2 h-2 rounded-full bg-coral flex-shrink-0" />;
  if (status === "running") return <span className="inline-block w-2 h-2 rounded-full bg-amber animate-pulse flex-shrink-0" />;
  return <span className="inline-block w-2 h-2 rounded-full bg-dborder2 flex-shrink-0" />;
}

function Pyramid({ phase }: { phase: "ingest" | "orchestrator" | "done" }) {
  const layers = [
    { label: phase === "done" ? "✓ Result" : "Result",                              w: 80,  done: phase === "done" },
    { label: phase === "orchestrator" ? "▶ Model selection — active" : phase === "done" ? "✓ Model selection" : "Model selection", w: 190, active: phase === "orchestrator", done: phase === "done" },
    { label: phase !== "ingest" ? "▶ SLM engine — active" : "SLM engine",          w: 280, active: phase === "orchestrator", done: false },
    { label: phase === "ingest" ? "▶ Data + GraphRAG — active" : "✓ Data + GraphRAG", w: 390, active: phase === "ingest", done: phase !== "ingest" },
  ];
  return (
    <div className="flex flex-col items-center gap-1 pb-7 pt-1">
      {layers.map((t, i) => (
        <div
          key={i}
          className={`flex items-center justify-center h-9 rounded-[10px] text-[12px] font-semibold px-5 ${
            t.active ? "bg-amber/10 border border-amber/40 text-amber"
            : t.done  ? "bg-gg/10 border border-gg/30 text-gg"
            : "bg-bg4 border border-dborder text-t3"
          }`}
          style={{ width: t.w }}
        >
          {t.label}
        </div>
      ))}
    </div>
  );
}

function ProcessingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ingestSteps, setIngestSteps] = useState<PipelineStep[]>(DEFAULT_STEPS);
  const [orchStatus, setOrchStatus] = useState<Record<string, "pending"|"running"|"done"|"error">>({
    distill: "pending", qlora: "pending", deploy: "pending",
  });
  const [overallPct, setOverallPct] = useState(0);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [phase, setPhase] = useState<"ingest" | "orchestrator" | "done">("ingest");
  const [epochs, setEpochs] = useState<EpochEntry[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [buildModelId, setBuildModelId] = useState<string | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approving, setApproving] = useState(false);
  const [stats, setStats] = useState({ files: 0, entities: 0, communities: 0 });
  const esRef = useRef<EventSource | null>(null);

  const addLog = (msg: string) => setLog(prev => [...prev.slice(-80), msg]);

  useEffect(() => {
    // Accept URL params as fallback (allows direct linking with existing job)
    const urlJobId = searchParams.get("job_id");
    const urlQuery = searchParams.get("query");
    const urlDomain = searchParams.get("domain_label");
    if (urlJobId && urlQuery) {
      sessionStorage.setItem("job_id", urlJobId);
      sessionStorage.setItem("query", urlQuery);
      if (urlDomain) sessionStorage.setItem("domain_label", urlDomain);
    }

    const jobId = sessionStorage.getItem("job_id");
    const query = sessionStorage.getItem("query");
    const domainLabel = sessionStorage.getItem("domain_label") ?? "general";
    if (!jobId || !query) { router.push("/"); return; }

    const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

    // Mark step 1 as running immediately
    setIngestSteps(prev => prev.map((s, i) => i === 0 ? { ...s, status: "running" } : s));
    addLog("Pipeline started — streaming progress…");

    // Open SSE connection to /progress/:jobId
    const es = new EventSource(`${API}/api/v1/data/progress/${jobId}`);
    esRef.current = es;

    es.onmessage = (e) => {
      const ev: ProgressEvent = JSON.parse(e.data);

      if (ev.type === "error") {
        addLog(`❌ ${(ev as any).message ?? ev.error ?? "Unknown error"}`);
        es.close();
        return;
      }

      // Update steps from server
      if (ev.steps && ev.steps.length > 0) {
        setIngestSteps(ev.steps.map(s => ({
          ...s,
          status: s.status as PipelineStep["status"],
        })));
      }

      // Update overall progress & ETA
      setOverallPct(ev.overall_pct ?? 0);
      setEtaSeconds(ev.eta_seconds ?? null);

      // Update stats
      if (ev.file_count) setStats(p => ({ ...p, files: ev.file_count }));
      if (ev.entity_count) setStats(p => ({ ...p, entities: ev.entity_count }));
      if (ev.community_count) setStats(p => ({ ...p, communities: ev.community_count }));

      addLog(`[${ev.status}] ${ev.overall_pct}% — ${ev.steps?.find(s => s.status === "running")?.detail ?? ""}`);

      // When ingest is done, start orchestrator
      if (ev.status === "graph_done") {
        es.close();
        setPhase("orchestrator");
        addLog("Knowledge graph built — starting model recommendations…");
        startOrchestrator(API, query, domainLabel);
      } else if (ev.status === "failed") {
        addLog(`❌ Pipeline failed: ${ev.error ?? ""}`);
        es.close();
      }
    };

    es.onerror = () => {
      addLog("⚠ SSE connection lost — retrying…");
    };

    return () => {
      es.close();
      esRef.current?.close();
    };
  }, []);

  const startOrchestrator = async (API: string, query: string, domainLabel: string) => {
    setOrchStatus(p => ({ ...p, distill: "running" }));
    try {
      const res = await fetch(`${API}/api/v1/orchestrator/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, domain_label: domainLabel, job_id: sessionStorage.getItem("job_id") }),
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
            try { handleOrchestratorEvent(JSON.parse(line.slice(6))); } catch { /* skip */ }
          }
        }
      }
    } catch (e: any) {
      addLog(`⚠ Orchestrator error: ${e.message}`);
    }
  };

  const handleOrchestratorEvent = (event: any) => {
    addLog(`[${event.type}] ${JSON.stringify(event).slice(0, 100)}`);

    if (event.type === "build_start") {
      setOrchStatus(p => ({ ...p, distill: "running" }));
    }
    if (event.type === "progress" && event.step === 1) {
      const pct = Math.round((event.article / event.total) * 100);
      setOverallPct(Math.round(50 + pct * 0.25));
    }
    if (event.type === "step" && event.step === 3) {
      setOrchStatus(p => ({ ...p, distill: "done", qlora: "running" }));
      setOverallPct(75);
    }
    if (event.phase === "slm_build") {
      if (event.type === "step" && event.step === 3 && event.val_loss !== undefined) {
        setEpochs(prev => [...prev, { epoch: prev.length + 1, loss: event.val_loss }]);
      }
      if (event.type === "step" && event.step === 4 && event.status === "done") {
        setOrchStatus(p => ({ ...p, qlora: "done", deploy: "running" }));
        setOverallPct(90);
      }
      if (event.type === "done") {
        setBuildModelId(event.model_id);
        setOrchStatus(p => ({ ...p, deploy: "done" }));
        setOverallPct(100);
        setShowApproveModal(true);
      }
    }
    if (event.type === "output") {
      setPhase("done");
      setOverallPct(100);
      const outputData = event.data;
      sessionStorage.setItem("orchestrator_output", JSON.stringify(outputData));
      // Persist session to localStorage for dashboard history
      const jobId = sessionStorage.getItem("job_id") ?? "";
      const query = sessionStorage.getItem("query") ?? "";
      const domainLabel = sessionStorage.getItem("domain_label") ?? "general";
      const sessionRecord = {
        job_id: jobId,
        query,
        domain_label: domainLabel,
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
        // Replace if same job_id already exists, otherwise prepend
        const filtered = existing.filter((s: any) => s.job_id !== jobId);
        localStorage.setItem("orch_sessions", JSON.stringify([sessionRecord, ...filtered].slice(0, 20)));
      } catch { /* ignore */ }
      router.push("/recommendations");
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
      setShowApproveModal(false);
    } finally {
      setApproving(false);
    }
  };

  // Combined display: ingest steps + orchestrator steps
  const allOrchSteps = ORCHESTRATOR_STEPS.map(s => ({
    ...s,
    status: orchStatus[s.id] ?? "pending",
    pct: orchStatus[s.id] === "done" ? 100 : orchStatus[s.id] === "running" ? 50 : 0,
    detail: "",
  }));

  return (
    <div>
      {/* Page header */}
      <div className="bg-card border-b border-dborder px-0 py-7 mb-7">
        <div className="max-w-[860px] mx-auto px-8">
          <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-t3 mb-1.5 flex items-center gap-2">
            <span className="inline-block w-4 h-px bg-accent" />
            Step 2 of 3 · Building
          </div>
          <div className="font-sora text-2xl font-semibold text-t1">Building Your Domain SLM</div>
          <div className="text-[12px] text-t2 mt-1">
            {etaSeconds !== null && phase === "ingest" ? formatEta(etaSeconds) : "Pipeline running — streaming live progress below"}
          </div>
        </div>
      </div>

      <div className="max-w-[860px] mx-auto px-8">
        <Pyramid phase={phase} />

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
              { label: "Documents", value: stats.files, color: "#60a5fa" },
              { label: "Entities",  value: stats.entities, color: "#7c6af8" },
              { label: "Communities", value: stats.communities, color: "#2dd4a0" },
            ].map(({ label, value, color }) => (
              <div key={label} className="mcard text-center">
                <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t" style={{ background: color }} />
                <div className="font-sora text-[22px] font-bold text-t1 leading-none">{value}</div>
                <div className="text-[10px] text-t3 mt-1 uppercase tracking-wider">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Ingest pipeline steps */}
        <div className="sect">Pipeline stages</div>
        <div className="space-y-2 mb-4">
          {ingestSteps.map(step => (
            <div
              key={step.id}
              className={`model-row ${step.status === "running" ? "border-accent" : step.status === "done" ? "border-gg/30" : ""}`}
            >
              <StatusDot status={step.status} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-t1">{step.label}</p>
                {step.detail && <p className="text-[10px] text-t3 mt-0.5 truncate">{step.detail}</p>}
                {step.status === "running" && step.pct > 0 && (
                  <div className="prog-bar mt-1.5">
                    <div className="prog-fill" style={{ width: `${step.pct}%` }} />
                  </div>
                )}
              </div>
              <span className="text-[11px] flex-shrink-0">
                {step.status === "done"    && <span className="text-gg">✓</span>}
                {step.status === "running" && step.pct > 0 && <span className="text-t3">{step.pct}%</span>}
                {step.status === "running" && step.pct === 0 && <span className="w-3 h-3 rounded-full border-2 border-accent border-t-transparent animate-spin inline-block" />}
              </span>
            </div>
          ))}
        </div>

        {/* Orchestrator steps */}
        {phase !== "ingest" && (
          <>
            <div className="sect">Orchestrator</div>
            <div className="space-y-2 mb-6">
              {allOrchSteps.map(step => (
                <div
                  key={step.id}
                  className={`model-row ${step.status === "running" ? "border-purple/50" : step.status === "done" ? "border-gg/30" : ""}`}
                >
                  <StatusDot status={step.status} />
                  <p className="text-[12px] font-medium text-t1 flex-1">{step.label}</p>
                  {step.status === "done" && <span className="text-gg text-[11px]">✓</span>}
                  {step.status === "running" && <span className="w-3 h-3 rounded-full border-2 border-purple border-t-transparent animate-spin" />}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Epoch loss chart */}
        {epochs.length > 0 && (
          <div className="card mb-6">
            <div className="sect">Training Loss</div>
            <div className="flex items-end gap-1 h-20">
              {epochs.map((e, i) => (
                <div key={i} className="flex flex-col items-center flex-1">
                  <div
                    className="w-full bg-accent rounded-sm"
                    style={{ height: `${Math.max(4, (1 - Math.min(e.loss / 3, 1)) * 60)}px` }}
                  />
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

      {/* Approve install modal */}
      {showApproveModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-card2 border border-dborder2 rounded-card p-6 max-w-md w-full mx-4">
            <h3 className="font-sora text-lg font-bold text-t1 mb-2">SLM Ready to Deploy</h3>
            <p className="text-[12px] text-t2 mb-4">
              Model <code className="text-accent">{buildModelId}</code> has been trained.
              Approve to deploy it to Ollama and make it available for queries.
            </p>
            <div className="flex gap-3">
              <button
                onClick={approveInstall}
                disabled={approving}
                className="btn btn-p flex-1 disabled:opacity-50"
              >
                {approving ? "Deploying…" : "Approve & Deploy to Ollama"}
              </button>
              <button
                onClick={() => setShowApproveModal(false)}
                className="btn px-4"
              >
                Skip
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


