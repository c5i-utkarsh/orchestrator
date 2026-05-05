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
  const colors: Record<string, string> = {
    pending: "bg-gray-600",
    running: "bg-yellow-400 animate-pulse",
    done:    "bg-green-400",
    error:   "bg-red-400",
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${colors[status] ?? "bg-gray-600"}`} />;
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
      sessionStorage.setItem("orchestrator_output", JSON.stringify(event.data));
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
    <main className="max-w-3xl mx-auto px-4 py-12">
      {/* Step indicator */}
      <div className="flex gap-2 mb-8 text-xs text-gray-500">
        {["1 · Setup", "2 · Processing", "3 · Recommendations"].map((s, i) => (
          <span key={i} className={`px-3 py-1 rounded-full ${i === 1 ? "bg-brand-600 text-white" : "bg-gray-800"}`}>{s}</span>
        ))}
      </div>

      <h2 className="text-2xl font-bold text-gray-100 mb-1">Building Your Domain SLM</h2>
      {etaSeconds !== null && phase === "ingest" && (
        <p className="text-sm text-gray-400 mb-4">{formatEta(etaSeconds)}</p>
      )}

      {/* Overall progress bar */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Overall progress</span>
          <span>{overallPct}%</span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 transition-all duration-700 rounded-full"
            style={{ width: `${overallPct}%` }}
          />
        </div>
      </div>

      {/* Stats row */}
      {(stats.files > 0 || stats.entities > 0) && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Documents", value: stats.files },
            { label: "Entities", value: stats.entities },
            { label: "Communities", value: stats.communities },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-brand-400">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Ingest pipeline steps */}
      <div className="space-y-2 mb-4">
        {ingestSteps.map(step => (
          <div key={step.id} className={`bg-gray-900 border rounded-lg px-4 py-3 ${step.status === "running" ? "border-brand-600" : "border-gray-700"}`}>
            <div className="flex items-center gap-3">
              <StatusDot status={step.status} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-200">{step.label}</p>
                {step.detail && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{step.detail}</p>
                )}
                {step.status === "running" && (
                  <div className="mt-1.5 h-1 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500 transition-all duration-500"
                      style={{ width: `${step.pct}%` }}
                    />
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-600 flex-shrink-0">
                {step.status === "done" ? "✓" : step.status === "running" ? `${step.pct}%` : ""}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Orchestrator steps (shown once ingest is done) */}
      {phase !== "ingest" && (
        <div className="space-y-2 mb-6">
          {allOrchSteps.map(step => (
            <div key={step.id} className={`bg-gray-900 border rounded-lg px-4 py-3 ${step.status === "running" ? "border-brand-600" : "border-gray-700"}`}>
              <div className="flex items-center gap-3">
                <StatusDot status={step.status} />
                <p className="text-sm font-medium text-gray-200 flex-1">{step.label}</p>
                {step.status === "done" && <span className="text-xs text-green-400">✓</span>}
                {step.status === "running" && (
                  <span className="w-3 h-3 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Epoch loss chart */}
      {epochs.length > 0 && (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-6">
          <p className="text-xs font-medium text-gray-400 mb-2">Training Loss</p>
          <div className="flex items-end gap-1 h-20">
            {epochs.map((e, i) => (
              <div key={i} className="flex flex-col items-center flex-1">
                <div
                  className="w-full bg-brand-500 rounded-sm"
                  style={{ height: `${Math.max(4, (1 - Math.min(e.loss / 3, 1)) * 60)}px` }}
                />
                <span className="text-xs text-gray-600 mt-1">{e.epoch}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live log */}
      <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 max-h-48 overflow-auto">
        <p className="text-xs text-gray-600 mb-1">Live log</p>
        {log.map((l, i) => (
          <p key={i} className="text-xs text-gray-500 font-mono leading-relaxed">{l}</p>
        ))}
        {log.length === 0 && <p className="text-xs text-gray-700">Waiting for events…</p>}
      </div>

      {/* Approve install modal */}
      {showApproveModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-100 mb-2">SLM Ready to Deploy</h3>
            <p className="text-sm text-gray-400 mb-4">
              Model <code className="text-brand-400">{buildModelId}</code> has been trained.
              Approve to deploy it to Ollama and make it available for queries.
            </p>
            <div className="flex gap-3">
              <button
                onClick={approveInstall}
                disabled={approving}
                className="flex-1 bg-brand-600 hover:bg-brand-500 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {approving ? "Deploying…" : "Approve & Deploy to Ollama"}
              </button>
              <button
                onClick={() => setShowApproveModal(false)}
                className="px-4 bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 rounded-lg text-sm"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Loading…</div>}>
      <ProcessingPage />
    </Suspense>
  );
}


