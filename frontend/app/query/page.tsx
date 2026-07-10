"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import PromptBuilder from "../components/PromptBuilder";
import { runOrchestrator, answeredBy, type OrchestratorOutput } from "../lib/orchestrator";

interface StoredCorpus {
  job_id: string;
  domain_label: string;
  project_name?: string;
  file_count: number;
  entity_count: number;
  created_at: string;
}

const DOMAIN_ICONS: Record<string, string> = {
  manufacturing: "\u{1F3ED}",
  "it industry": "\u{1F4BB}",
  software: "\u{1F4BB}",
  healthcare: "\u{1F3E5}",
  medical: "\u{1F3E5}",
  finance: "\u{1F4C9}",
  banking: "\u{1F4C9}",
  legal: "\u{2696}\uFE0F",
  law: "\u{2696}\uFE0F",
  retail: "\u{1F6CD}\uFE0F",
  education: "\u{1F393}",
  logistics: "\u{1F69A}",
  supply: "\u{1F69A}",
  energy: "\u26A1",
  pharma: "\u{1F48A}",
  pharmaceutical: "\u{1F48A}",
  research: "\u{1F52C}",
  science: "\u{1F52C}",
  construction: "\u{1F3D7}\uFE0F",
};

function domainIcon(label: string): string {
  const key = label.toLowerCase();
  for (const [k, v] of Object.entries(DOMAIN_ICONS)) {
    if (key.includes(k.trim())) return v;
  }
  return "\u{1F5C2}\uFE0F";
}

function domainLabel(label: string): string {
  return label.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function QueryPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [selectedCorpus, setSelectedCorpus] = useState<StoredCorpus | null>(null);
  const [savedCorpora, setSavedCorpora] = useState<StoredCorpus[]>([]);
  const [error, setError] = useState("");
  const [lastKpis, setLastKpis] = useState<{ kpi: string; phase: string }[]>([]);
  const [selectedKpis, setSelectedKpis] = useState<Set<string>>(new Set());
  const [kpiApplied, setKpiApplied] = useState(false);
  const [slmStatus, setSlmStatus] = useState<"none" | "building" | "done">("none");
  const [slmModelId, setSlmModelId] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  // In-place inference (no redirect): stream orchestrator timeline + answer here.
  const [running, setRunning] = useState(false);
  const [timeline, setTimeline] = useState<{ name: string; detail?: string }[]>([]);
  const [answer, setAnswer] = useState("");
  const [answeredByLabel, setAnsweredByLabel] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [loopImproved, setLoopImproved] = useState<boolean | null>(null);
  const [loopScore, setLoopScore] = useState<number | null>(null);
  const [loopPlanReused, setLoopPlanReused] = useState<boolean | null>(null);
  const [loopPlanSimilarity, setLoopPlanSimilarity] = useState<number | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);  // Loop Engineering toggle (default OFF)
  const [weights, setWeights] = useState({
    benchmark: 0.30, availability: 0.20, bandit: 0.20,
    speed: 0.15, ctx_fit: 0.10, task_fit: 0.05,
  });

  const WEIGHT_PRESETS = {
    balanced: { benchmark: 0.30, availability: 0.20, bandit: 0.20, speed: 0.15, ctx_fit: 0.10, task_fit: 0.05 },
    quality:  { benchmark: 0.55, availability: 0.10, bandit: 0.10, speed: 0.05, ctx_fit: 0.10, task_fit: 0.10 },
    speed:    { benchmark: 0.15, availability: 0.15, bandit: 0.15, speed: 0.50, ctx_fit: 0.05, task_fit: 0.00 },
    reliable: { benchmark: 0.15, availability: 0.35, bandit: 0.35, speed: 0.05, ctx_fit: 0.05, task_fit: 0.05 },
  } as const;
  type PresetKey = keyof typeof WEIGHT_PRESETS;

  const WEIGHT_LABELS: Record<string, { label: string; desc: string }> = {
    benchmark:    { label: "Quality",      desc: "Benchmark accuracy / reasoning score" },
    availability: { label: "Availability", desc: "How often the model is reachable" },
    bandit:       { label: "Reliability",  desc: "Historical success rate (bandit)" },
    speed:        { label: "Speed",        desc: "Tokens-per-second throughput" },
    ctx_fit:      { label: "Context fit",  desc: "Handles your document length" },
    task_fit:     { label: "Task fit",     desc: "Specialised for this task type" },
  };

  const weightTotal = Object.values(weights).reduce((s, v) => s + v, 0);

  const applyPreset = (key: PresetKey) => {
    setWeights({ ...WEIGHT_PRESETS[key] });
    sessionStorage.setItem("scoring_weights", JSON.stringify(WEIGHT_PRESETS[key]));
  };

  const updateWeight = (key: string, val: number) => {
    const next = { ...weights, [key]: val };
    setWeights(next);
    sessionStorage.setItem("scoring_weights", JSON.stringify(next));
  };

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("scoring_weights") ?? "null");
      if (saved && typeof saved === "object") setWeights(w => ({ ...w, ...saved }));
    } catch { /**/ }

    const savedSysPrompt = sessionStorage.getItem("system_prompt") ?? "";
    if (savedSysPrompt) setSystemPrompt(savedSysPrompt);

    try {
      const kpis = JSON.parse(localStorage.getItem("orch_last_kpis") ?? "[]");
      if (Array.isArray(kpis) && kpis.length > 0) setLastKpis(kpis);
    } catch { /**/ }

    const local: StoredCorpus[] = (() => {
      try { return JSON.parse(localStorage.getItem("orch_corpora") ?? "[]"); }
      catch { return []; }
    })();
    setSavedCorpora(local);

    const API = process.env.NEXT_PUBLIC_API_URL ?? "";
    const domainLbl = sessionStorage.getItem("domain_label") ?? "general";

    fetch(`${API}/api/v1/slm/status?domain_label=${encodeURIComponent(domainLbl)}`)
      .then(r => r.json())
      .then(d => {
        if (d.status === "done") { setSlmStatus("done"); setSlmModelId(d.model_id ?? null); }
        else if (d.status === "running" || d.status === "queued") setSlmStatus("building");
      })
      .catch(() => {});

    const jobId = sessionStorage.getItem("job_id");
    if (jobId) {
      const match = local.find(c => c.job_id === jobId);
      if (match) {
        setSelectedCorpus(match);
      } else {
        setSelectedCorpus({ job_id: jobId, domain_label: domainLbl, file_count: 0, entity_count: 0, created_at: "" });
      }
    }
    // No else — if no job_id in sessionStorage, default to "All Projects" (null)
  }, []);

  // Run Query — streams the orchestrator IN PLACE. Never redirects, never rebuilds
  // (reuses the current SLM via the existing orchestrator).
  const handleRun = async (overrideQuery?: string, overrideSysPrompt?: string) => {
    const q = (overrideQuery ?? query).trim();
    const sp = (overrideSysPrompt ?? systemPrompt).trim();
    if (!q) { setError("Please enter a question or goal"); return; }
    setError(""); setRunning(true); setTimeline([]); setAnswer(""); setAnsweredByLabel(null); setConfidence(null); setLoopImproved(null); setLoopScore(null); setLoopPlanReused(null); setLoopPlanSimilarity(null);
    const API = process.env.NEXT_PUBLIC_API_URL ?? "";
    const domain = selectedCorpus?.domain_label ?? "general";
    if (selectedCorpus) {
      sessionStorage.setItem("job_id", selectedCorpus.job_id);
      sessionStorage.setItem("domain_label", selectedCorpus.domain_label);
    }
    sessionStorage.setItem("query", q);
    try {
      const out = await runOrchestrator(API, {
        query: q, domain_label: domain,
        job_id: selectedCorpus?.job_id ?? undefined, system_prompt: sp,
        loop_enabled: loopEnabled,
      }, (ev) => {
        if (ev.type === "step" || ev.type === "stage") {
          // step_name is at the top level (new) or nested under ev.data (compat)
          const name = String(
            (ev as any).step_name ??
            (ev as any).data?.step_name ??
            (ev as any).phase ??
            `Step ${(ev as any).step ?? ""}`
          ).trim();
          const detail = (ev as any).detail ?? (ev as any).data?.explanation?.what_we_found;
          if (name) setTimeline(t => [...t, { name, detail: typeof detail === "string" ? detail : undefined }]);
        }
      });
      const ab = answeredBy(out as OrchestratorOutput | null);
      setAnswer(out?.final_answer ?? "No answer returned.");
      setAnsweredByLabel(ab.label); setConfidence(ab.confidence);
      if ((out as any)?.loop_improved === true) setLoopImproved(true);
      if ((out as any)?.loop_improved === false) setLoopImproved(false);
      if ((out as any)?.loop_verifier_score != null) setLoopScore((out as any).loop_verifier_score);
      if ((out as any)?.loop_plan_reused != null) setLoopPlanReused(!!(out as any).loop_plan_reused);
      if ((out as any)?.loop_plan_similarity != null) setLoopPlanSimilarity((out as any).loop_plan_similarity);
      if (out) sessionStorage.setItem("orchestrator_output", JSON.stringify(out));  // Outcome page reads this
    } catch (e: any) {
      setError(e.message ?? "Query failed");
    } finally {
      setRunning(false);
    }
  };

  const goToOutcome = () => {
    sessionStorage.setItem("from_inference", "true");
    router.push("/recommendations");
  };

  const selectCorpus = (c: StoredCorpus) => {
    setSelectedCorpus(c);
    sessionStorage.setItem("job_id", c.job_id);
    sessionStorage.setItem("domain_label", c.domain_label);
    if (c.project_name) sessionStorage.setItem("project_name", c.project_name);
    setManualMode(false);
  };

  return (
    <div>
      {/* Header */}
      <div className="bg-white border-b border-dborder px-8 py-5 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[11px] font-semibold text-t3 uppercase tracking-widest">Step 3</span>
              <span className="text-t3 text-[11px]">·</span>
              <span className="text-[11px] font-semibold text-accent uppercase tracking-widest">Inference Harnessing</span>
            </div>
            <h1 className="text-[20px] font-semibold text-t1 tracking-tight">Ask your domain AI</h1>
            <p className="text-[13px] text-t3 mt-0.5">Choose your domain, then pick what you want to do</p>
          </div>
          <button onClick={() => router.push("/")} className="btn btn-sm text-t3 mt-1">← Back</button>
        </div>
      </div>

      <div className="w-full px-8">

        {/* Workspace / Domain selector — collapsed to a compact chip when already selected */}
        {savedCorpora.length === 0 && !selectedCorpus ? (
          <div className="px-4 py-3 bg-accent/5 border border-accent/20 rounded-lg text-[12px] text-t2 mb-6 flex items-center gap-3">
            <span className="text-lg">🌐</span>
            <div>
              <span className="font-semibold text-t1">All Projects Mode</span>
              <span className="text-t3 ml-2">Queries will automatically route to the most appropriate Domain SLM based on your request.</span>
              <button onClick={() => router.push("/")} className="underline ml-2 text-accent hover:text-accent/70">Upload files →</button>
            </div>
          </div>
        ) : selectedCorpus && !manualMode ? (
          /* ── Compact selected-domain bar (shown when domain already resolved) ── */
          <div className="flex items-center gap-3 px-4 py-3 mb-6 bg-accent/8 border border-accent/30 rounded-card">
            <span className="text-xl">{domainIcon(selectedCorpus.domain_label)}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-accent">
                {selectedCorpus.project_name || domainLabel(selectedCorpus.domain_label)}
              </div>
              <div className="text-[10px] text-t3 mt-0.5 flex items-center gap-3">
                {selectedCorpus.entity_count > 0 && <span>🕸️ {selectedCorpus.entity_count} entities</span>}
                <span className="text-gg font-semibold">✓ Knowledge Graph Ready</span>
                {slmStatus === "done" && <span className="text-gg font-semibold">✓ Domain SLM Ready</span>}
                {slmStatus === "building" && <span className="text-amber font-semibold">⚙ Building SLM…</span>}
              </div>
            </div>
            <button
              onClick={() => setManualMode(true)}
              className="text-[11px] text-t3 hover:text-accent border border-dborder hover:border-accent/30 px-2.5 py-1 rounded-lg transition-colors flex-shrink-0"
            >
              Change
            </button>
          </div>
        ) : !selectedCorpus && !manualMode ? (
          /* ── All Projects compact bar ── */
          <div className="flex items-center gap-3 px-4 py-3 mb-6 bg-accent/5 border border-accent/20 rounded-card">
            <span className="text-xl">🌐</span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-accent">All Projects Mode</div>
              <div className="text-[10px] text-t3 mt-0.5">Queries will automatically route to the most appropriate Domain SLM based on your request</div>
            </div>
            {savedCorpora.length > 0 && (
              <button
                onClick={() => setManualMode(true)}
                className="text-[11px] text-t3 hover:text-accent border border-dborder hover:border-accent/30 px-2.5 py-1 rounded-lg transition-colors flex-shrink-0"
              >
                Filter
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 mb-6">
            {/* All Projects — global routing option */}
            <div
              onClick={() => { setSelectedCorpus(null); setManualMode(false); }}
              className={`flex items-center gap-4 px-4 py-3.5 rounded-card border cursor-pointer transition-all ${
                !selectedCorpus
                  ? "bg-accent/10 border-accent/50 shadow-sm"
                  : "bg-card2 border-dborder hover:border-accent/30 hover:bg-accent/5"
              }`}
            >
              <div className="text-2xl flex-shrink-0 w-8 text-center">🌐</div>
              <div className="flex-1 min-w-0">
                <div className={`text-[13px] font-semibold ${!selectedCorpus ? "text-accent" : "text-t1"}`}>All Projects</div>
                <div className="text-[10px] text-t3 mt-0.5">Global knowledge routing — no project filter</div>
              </div>
              {!selectedCorpus && <span className="text-[11px] text-accent font-bold flex-shrink-0">✓</span>}
            </div>

            {savedCorpora.map(c => (
              <div
                key={c.job_id}
                onClick={() => selectCorpus(c)}
                className={`flex items-center gap-4 px-4 py-3.5 rounded-card border cursor-pointer transition-all ${
                  selectedCorpus?.job_id === c.job_id
                    ? "bg-accent/10 border-accent/50 shadow-sm"
                    : "bg-card2 border-dborder hover:border-accent/30 hover:bg-accent/5"
                }`}
              >
                <div className="text-2xl flex-shrink-0 w-8 text-center">{domainIcon(c.domain_label)}</div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[13px] font-semibold ${selectedCorpus?.job_id === c.job_id ? "text-accent" : "text-t1"}`}>
                    {c.project_name || domainLabel(c.domain_label)}
                  </div>
                  <div className="text-[10px] text-t3 mt-0.5">
                    {c.file_count > 0 ? `${c.file_count} file${c.file_count !== 1 ? "s" : ""}` : "Just ingested"}
                    {c.entity_count > 0 && ` · ${c.entity_count} entities`}
                    {c.created_at ? " · " + new Date(c.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                  </div>
                </div>
                {selectedCorpus?.job_id === c.job_id ? (
                  <span className="text-[11px] text-accent font-bold flex-shrink-0">✓</span>
                ) : (
                  <span className="text-[11px] text-t3 flex-shrink-0">›</span>
                )}
              </div>
            ))}

            {/* Just-ingested corpus not yet in localStorage */}
            {selectedCorpus && !savedCorpora.find(c => c.job_id === selectedCorpus.job_id) && (
              <div className="flex items-center gap-4 px-4 py-3.5 rounded-card border bg-accent/10 border-accent/50 shadow-sm">
                <div className="text-2xl w-8 text-center">{domainIcon(selectedCorpus.domain_label)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-accent">
                    {selectedCorpus.project_name || domainLabel(selectedCorpus.domain_label)}
                  </div>
                  <div className="text-[10px] text-t3 mt-0.5">Just ingested · knowledge graph ready</div>
                </div>
                <span className="text-[11px] text-accent font-bold flex-shrink-0">✓</span>
              </div>
            )}
          </div>
        )}

        {/* Active context display */}
        {(selectedCorpus || !manualMode) && (
          <div className="mb-5 flex items-center gap-3 text-[11px] text-t3">
            {selectedCorpus ? (
              <>
                <span className="font-semibold text-t2">Project:</span>
                <span className="text-t1">{selectedCorpus.project_name || domainLabel(selectedCorpus.domain_label)}</span>
                {slmStatus === "done" && slmModelId && (
                  <>
                    <span className="text-dborder">·</span>
                    <span className="font-semibold text-t2">SLM:</span>
                    <span className="text-emerald-400 font-medium">{slmModelId}</span>
                  </>
                )}
                {slmStatus === "building" && (
                  <span className="text-amber font-semibold">⚙ Building SLM…</span>
                )}
              </>
            ) : (
              <>
                <span className="font-semibold text-t2">Scope:</span><span className="text-accent">All Projects</span>
                <span className="text-dborder">·</span>
                <span className="font-semibold text-t2">Routing:</span><span>Automatic</span>
              </>
            )}
          </div>
        )}

        {/* SLM badge */}
        {slmStatus !== "none" && (
          <div className="mb-5">
            {slmStatus === "done" ? (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                ✨ Custom AI ready{slmModelId && <span className="font-normal text-emerald-500/70 ml-1">({slmModelId})</span>}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                ⚙️ Building your custom AI…
              </span>
            )}
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-dborder mb-6" />

        {/* Prompt Builder or manual input */}
        {manualMode ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-t3">Your question or goal</div>
              <button
                onClick={() => setManualMode(false)}
                className="text-[10px] text-accent hover:text-accent/70 transition-colors"
              >
                ← Back to suggestions
              </button>
            </div>
            <textarea
              className="w-full bg-bg3 border border-dborder2 rounded-card px-4 py-3 text-[12px] text-t1 outline-none transition-colors focus:border-accent font-dm resize-none mb-2"
              rows={4}
              placeholder="e.g. Analyze supplier risk across the manufacturing chain…"
              value={query}
              onChange={e => { setQuery(e.target.value); setError(""); }}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRun(); }}
            />
            <div className="text-[10px] text-t3 mb-4">Ctrl+Enter to run</div>
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-coral/10 border border-coral/30 rounded-sm text-[12px] text-coral mb-4">
                \u26A0 {error}
              </div>
            )}
            <button
              onClick={() => handleRun()}
              disabled={!query.trim() || running}
              className="btn btn-p btn-full py-3 text-sm disabled:opacity-40 mb-4"
            >
              {running ? "Running…" : "Run Query →"}
            </button>

            {/* In-place execution timeline + streamed answer (no redirect) */}
            {(running || timeline.length > 0 || answer) && (
              <div className="mb-8 space-y-3">
                {timeline.length > 0 && (
                  <div className="bg-bg3 border border-dborder rounded-card p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-t3 mb-2">Execution timeline</div>
                    <div className="space-y-1">
                      {timeline.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px] text-t2">
                          <span className="w-1.5 h-1.5 rounded-full bg-gg flex-shrink-0" />
                          <span className="font-medium">{s.name}</span>
                          {s.detail && <span className="text-t3 truncate">\u2014 {s.detail}</span>}
                        </div>
                      ))}
                      {running && (
                        <div className="flex items-center gap-2 text-[11px] text-t3">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse flex-shrink-0" /> working\u2026
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {answer && (
                  <div className="bg-card border border-dborder rounded-card p-4">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-t3">Answer</div>
                        {/* Strategy provenance badge */}
                        {loopPlanReused === true && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal/10 text-teal border border-teal/25 uppercase tracking-wider">
                            ♻ Reused Strategy{loopPlanSimilarity != null ? ` · ${(loopPlanSimilarity * 100).toFixed(0)}%` : ""}
                          </span>
                        )}
                        {loopPlanReused === false && loopEnabled && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-bg3 text-t3 border border-dborder uppercase tracking-wider">
                            ✦ Fresh Strategy
                          </span>
                        )}
                        {/* Improvement badge */}
                        {loopImproved === true && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/25 uppercase tracking-wider">
                            ↑ Improved{loopScore != null ? ` · ${(loopScore * 100).toFixed(0)}%` : ""}
                          </span>
                        )}
                        {loopImproved === false && loopScore != null && (
                          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-gg/10 text-gg border border-gg/25 uppercase tracking-wider">
                            ✓ Verified · {(loopScore * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      {answeredByLabel && (
                        <div className="text-[10px] text-t3">
                          Answered by <span className="font-semibold text-t2">{answeredByLabel}</span>
                          {confidence !== null && <span className="text-gg"> · {(confidence * 100).toFixed(0)}% conf</span>}
                        </div>
                      )}
                    </div>
                    <div className="text-[13px] text-t1 whitespace-pre-wrap leading-relaxed">{answer}</div>
                    <button onClick={goToOutcome} className="btn btn-sm mt-3 text-accent">Open Outcome Workspace</button>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <PromptBuilder
            corpus={selectedCorpus}
            onUsePrompt={(q, sp, proc) => {
              // Store process info if present
              if (proc) {
                sessionStorage.setItem("process_plan", "true");
                sessionStorage.setItem("process_intent", proc.intent);
                sessionStorage.setItem("process_topic", proc.topic);
                sessionStorage.setItem("process_topics", JSON.stringify(proc.selectedTopics ?? []));
                if (proc.customTemplateId) {
                  sessionStorage.setItem("process_custom_template", proc.customTemplateId);
                } else {
                  sessionStorage.removeItem("process_custom_template");
                }
              } else {
                sessionStorage.removeItem("process_plan");
                sessionStorage.removeItem("process_intent");
                sessionStorage.removeItem("process_topic");
                sessionStorage.removeItem("process_topics");
                sessionStorage.removeItem("process_custom_template");
              }
              // Fill the textarea so the user can review before clicking Run
              const mergedSp = [systemPrompt, sp].filter(Boolean).join("\n\n").trim();
              setQuery(q);
              if (mergedSp) setSystemPrompt(mergedSp);
              setManualMode(true);
            }}
            onManual={() => {
              sessionStorage.removeItem("process_plan");
              sessionStorage.removeItem("process_intent");
              sessionStorage.removeItem("process_topic");
              sessionStorage.removeItem("process_topics");
              sessionStorage.removeItem("process_custom_template");
              setManualMode(true);
            }}
          />
        )}

        {/* Advanced settings */}
        <div className="border border-dborder2 rounded-card mb-8 mt-4">
          <button
            className="w-full flex items-center justify-between px-4 py-3 text-left"
            onClick={() => setAdvancedOpen(o => !o)}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-t3">Advanced settings</span>
            <span className="text-[10px] text-t3">{advancedOpen ? "▲ hide" : "▼ show"}</span>
          </button>

          {advancedOpen && (
            <div className="px-4 pb-4 border-t border-dborder2 pt-4 space-y-5">

              {/* Loop Engineering toggle */}
              <div className="flex items-center justify-between px-3 py-2.5 bg-bg2 border border-dborder rounded-lg">
                <div>
                  <div className="text-[12px] font-semibold text-t1">Loop Engineering</div>
                  <div className="text-[10px] text-t3 mt-0.5">Planner → Executor → Verifier → Critic → Improver · adds ~30–60s per query</div>
                </div>
                <button
                  onClick={() => setLoopEnabled(e => !e)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ml-3 ${loopEnabled ? "bg-accent" : "bg-dborder2"}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${loopEnabled ? "translate-x-4" : "translate-x-0.5"}`}/>
                </button>
              </div>

              {/* System prompt */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-t3 mb-1.5">
                  System prompt <span className="font-normal normal-case">(optional)</span>
                </div>
                <textarea
                  className="w-full bg-bg3 border border-dborder2 rounded-card px-4 py-3 text-[12px] text-t1 outline-none transition-colors focus:border-accent font-dm resize-none"
                  rows={3}
                  placeholder="e.g. You are an expert in pharmaceutical regulatory affairs. Always cite sources."
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                />
                <div className="text-[10px] text-t3 mt-1">Prepended to every LLM call. Set a persona, constraints, or output format.</div>
              </div>

              {/* KPI panel */}
              {lastKpis.length > 0 && (
                <div className="bg-bg3 border border-amber/20 rounded-card px-4 py-3">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-amber flex items-center gap-2">
                        <span className="w-3 h-px bg-amber/60" />Quality KPIs from last session
                      </div>
                      <p className="text-[10px] text-t3 mt-0.5">Select KPIs to inject as constraints</p>
                    </div>
                    {selectedKpis.size > 0 && !kpiApplied && (
                      <button
                        onClick={() => {
                          const lines = [...selectedKpis];
                          const prefix = systemPrompt.trim() ? systemPrompt.trim() + "\n\n" : "";
                          const kpiBlock = "Enforce the following quality targets in every response:\n" + lines.map(k => `- ${k}`).join("\n");
                          const newPrompt = prefix + kpiBlock;
                          setSystemPrompt(newPrompt);
                          sessionStorage.setItem("system_prompt", newPrompt);
                          setKpiApplied(true);
                        }}
                        className="text-[11px] font-semibold px-3 py-1.5 bg-amber/10 border border-amber/40 rounded-md text-amber hover:bg-amber/20 transition-colors flex-shrink-0 ml-4"
                      >
                        Apply {selectedKpis.size} KPI{selectedKpis.size > 1 ? "s" : ""}
                      </button>
                    )}
                    {kpiApplied && <span className="text-[11px] text-gg font-semibold flex-shrink-0 ml-4">\u2713 Added</span>}
                  </div>
                  <div className="space-y-2">
                    {[...new Set(lastKpis.map(k => k.phase))].map(phase => (
                      <div key={phase}>
                        <div className="text-[9px] font-bold uppercase tracking-wider text-t3 mb-1">{phase}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {lastKpis.filter(k => k.phase === phase).map(({ kpi }) => (
                            <button
                              key={kpi}
                              onClick={() => {
                                setSelectedKpis(prev => { const n = new Set(prev); n.has(kpi) ? n.delete(kpi) : n.add(kpi); return n; });
                                setKpiApplied(false);
                              }}
                              className={`text-[10px] px-2.5 py-1 rounded-md border transition-colors ${
                                selectedKpis.has(kpi) ? "bg-amber/15 border-amber/50 text-amber" : "bg-bg border-dborder text-t3 hover:border-amber/30 hover:text-t2"
                              }`}
                            >
                              {selectedKpis.has(kpi) && <span className="mr-1">\u2713</span>}{kpi}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Scoring weights */}
              <div className="border border-dborder2 rounded-card">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                  onClick={() => setWeightsOpen(o => !o)}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-t3">AI scoring preferences</span>
                  <span className="text-[10px] text-t3">{weightsOpen ? "▲ hide" : "▼ customise"}</span>
                </button>
                {weightsOpen && (
                  <div className="px-4 pb-4 border-t border-dborder2">
                    <div className="flex gap-2 mt-3 mb-4 flex-wrap">
                      {(Object.keys(WEIGHT_PRESETS) as PresetKey[]).map(k => (
                        <button key={k} onClick={() => applyPreset(k)}
                          className="text-[10px] px-3 py-1 rounded-full border border-dborder2 text-t2 hover:border-accent hover:text-accent transition-colors capitalize">
                          {k === "balanced" ? "Balanced (default)" : k.charAt(0).toUpperCase() + k.slice(1) + " first"}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-3">
                      {Object.entries(weights).map(([key, val]) => (
                        <div key={key}>
                          <div className="flex justify-between mb-1">
                            <span className="text-[11px] text-t1 font-medium">{WEIGHT_LABELS[key].label}</span>
                            <span className="text-[11px] text-accent font-mono">{Math.round(val * 100)}%</span>
                          </div>
                          <input type="range" min={0} max={1} step={0.05} value={val}
                            onChange={e => updateWeight(key, parseFloat(e.target.value))}
                            className="w-full accent-accent h-1" />
                          <div className="text-[10px] text-t3 mt-0.5">{WEIGHT_LABELS[key].desc}</div>
                        </div>
                      ))}
                    </div>
                    <div className={`mt-4 text-[10px] font-mono ${Math.abs(weightTotal - 1.0) > 0.01 ? "text-amber" : "text-t3"}`}>
                      Weight total: {(weightTotal * 100).toFixed(0)}%
                      {Math.abs(weightTotal - 1.0) > 0.01 && " \u2014 will be normalised automatically"}
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  );
}
