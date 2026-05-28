"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface StepExplanation {
  what: string; why: string; what_we_found: string; decision_made: string;
  confidence: number; caveats: string[]; graph_entity_ids: string[];
}
interface OrchestratorStep {
  step_number: number; step_name: string; explanation: StepExplanation; duration_ms: number;
}
interface ModelRec {
  model_name: string; provider: string; task_type: string; composite_score: number;
  benchmark_score: number; why_primary: string; why_not_alternatives: string[];
  is_primary: boolean; is_available_locally: boolean;
}
interface SubTaskResult {
  task_type: string; query_fragment: string; assigned_model: string;
  response: string; confidence: number;
}
interface OrchestratorOutput {
  session_id: string; query: string; intent: string; primary_task_type: string;
  coverage_action: string; slm_model_id: string | null; steps: OrchestratorStep[];
  model_recommendations: ModelRec[]; sub_task_results: SubTaskResult[];
  final_answer: string; hallucination_rate: number; total_tokens_used: number;
  tokens_saved_by_compression: number; build_in_progress: boolean; error?: string;
}
interface ChatMessage { role: "user" | "assistant"; content: string; }

interface BuildStep {
  id: number; phase: string; title: string; description: string;
  models: { name: string; provider: string; score: number; local: boolean; why: string }[];
  effort: string; priority: "critical" | "high" | "medium";
}

function deriveBuildPlan(output: OrchestratorOutput): BuildStep[] {
  const recs = output.model_recommendations;
  const getModels = (types: string[]) => {
    const seen = new Set<string>();
    const results: BuildStep["models"] = [];
    for (const r of recs.filter(m => types.includes(m.task_type))) {
      if (!seen.has(r.model_name)) {
        seen.add(r.model_name);
        results.push({ name: r.model_name, provider: r.provider, score: r.composite_score,
          local: r.is_available_locally, why: r.why_primary || `Best for ${r.task_type}` });
      }
    }
    if (results.length === 0) {
      results.push(
        { name: "qwen2.5:7b", provider: "ollama", score: 0.782, local: true, why: "Strong reasoning, runs locally, 7B params" },
        { name: "llama3:8b", provider: "ollama", score: 0.748, local: true, why: "Fast inference, excellent instruction following" },
        { name: "mistral:latest", provider: "ollama", score: 0.731, local: true, why: "Efficient 7B, good at structured outputs" },
      );
    }
    return results.slice(0, 3);
  };
  return [
    { id: 1, phase: "Data & Corpus", title: "Supply Chain Data Ingestion & Knowledge Graph",
      description: "Ingest all CPG supply chain data: historical orders, supplier records, event logs, tariff tables, trade route data. "
        + "Run entity extraction to identify products, suppliers, ports, routes, and events. "
        + "Build a knowledge graph with co-occurrence and causal relationships between events and demand shifts. "
        + "Output: graph.json with entity nodes, event trigger edges, supplier-product mappings.",
      models: getModels(["domain_qa", "data_analysis"]), effort: "2–3 days", priority: "critical" },
    { id: 2, phase: "Event Intelligence", title: "Event Trigger Engine (Tariffs · Wars · Route Closures)",
      description: "Define event taxonomy: Level 1 (monitor), Level 2 (prepare alt source), Level 3 (emergency procurement), Level 4 (force majeure). "
        + "Integrate live feeds: GDELT for geopolitical events, UN Comtrade for tariff changes, NOAA for weather disruptions. "
        + "Train per-event impact models on historical event→demand pairs: tariff spike → +15-30% pre-buy demand; "
        + "route closure → −10-20% short-term suppression; war disruption → +25-60% essential category surge.",
      models: getModels(["general_reasoning", "time_series"]), effort: "3–5 days", priority: "critical" },
    { id: 3, phase: "Demand Forecasting", title: "Event-Aware Demand Forecasting Engine",
      description: "Build ensemble forecasting: Prophet/ARIMA base model + event adjustment layer. "
        + "Event adjustments apply multiplicative factors derived from the trigger engine per SKU-category. "
        + "Train LSTM-Event model with event embeddings for each CPG product category. "
        + "Target: MAPE < 8% under normal conditions, < 15% during active disruption events. "
        + "KPIs to track: Forecast accuracy (WMAPE), bias, event detection lag.",
      models: getModels(["time_series", "data_analysis"]), effort: "5–7 days", priority: "critical" },
    { id: 4, phase: "Supply Intelligence", title: "Supplier Risk Scoring & Alternate Sourcing",
      description: "Score each supplier: on-time delivery rate, geopolitical exposure index, financial health, single-source concentration. "
        + "Maintain alternate supplier matrix: for each SKU, pre-qualify 2-3 alternates with lead-time delta and cost delta. "
        + "Auto-trigger alternate sourcing recommendation when primary supplier risk score exceeds 0.70. "
        + "Benchmark: Perfect Order Rate >95%, Supplier OTIF >92%.",
      models: getModels(["financial", "general_reasoning"]), effort: "3–4 days", priority: "high" },
    { id: 5, phase: "Optimization", title: "Safety Stock & Inventory Optimization",
      description: "Dynamic safety stock: SS = Z × σ_LT × D̄, recalculated daily with event adjustments applied. "
        + "Segment SKUs A/B/C by velocity, apply differentiated service levels (99%/97%/95%). "
        + "Optimize reorder points and order quantities across DC network to minimize total landed cost. "
        + "Cash-to-Cash cycle target: <45 days. DIO target: 30–45 days.",
      models: getModels(["data_analysis", "general_reasoning"]), effort: "2–3 days", priority: "high" },
    { id: 6, phase: "AI Layer", title: "Domain SLM — CPG Supply Chain Q&A",
      description: "Fine-tune a domain-specific small language model (QLoRA on Mistral-7B or Llama-3-8B) "
        + "trained on the CPG supply chain corpus + synthetic Q&A pairs generated via teacher distillation. "
        + "The SLM answers: 'What is demand impact of 25% US tariff on personal care?', "
        + "'Which suppliers are at risk if Red Sea closes?', 'Optimal safety stock for Shampoo Pro 500ml?' "
        + "Target: hallucination rate < 3%, response latency < 2s on local GPU.",
      models: getModels(["domain_qa"]), effort: "4–6 hours (training)", priority: "high" },
    { id: 7, phase: "Dashboard", title: "Real-Time Control Tower Dashboard & Alerting",
      description: "Supply chain control tower showing: live event feed with severity scores, "
        + "demand forecast vs actuals with event overlays, supplier risk heatmap, inventory position vs reorder points. "
        + "Alert rules: notify procurement when event severity > 0.7 or forecast deviation > 20%. "
        + "Tech stack: Next.js dashboard, WebSocket for live updates, PostgreSQL time-series store.",
      models: getModels(["ui_building", "code_generation"]), effort: "3–5 days", priority: "medium" },
  ];
}

function ProviderBadge({ provider, local }: { provider: string; local: boolean }) {
  const map: Record<string, string> = {
    ollama:     "bg-gg/10 text-gg border-gg/30",
    openai:     "bg-blue/10 text-blue border-blue/30",
    anthropic:  "bg-purple/10 text-purple border-purple/30",
    groq:       "bg-amber/10 text-amber border-amber/30",
  };
  return (
    <span className={`inline-flex items-center text-[9px] font-bold px-2 py-0.5 rounded-md border ${map[provider] ?? "bg-bg4 text-t3 border-dborder"}`}>
      {local && <span className="mr-1">●</span>}{provider}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    critical: "pill-coral bg-coral/10 text-coral border-coral/30",
    high:     "pill-a",
    medium:   "apill",
  };
  return <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-lg border ${priority === "critical" ? "bg-coral/10 text-coral border-coral/30" : priority === "high" ? "bg-amber/10 text-amber border-amber/30" : "bg-bg4 text-t3 border-dborder"}`}>{priority}</span>;
}

function Pyramid() {
  return (
    <div className="flex flex-col items-center gap-1 pb-7 pt-1">
      {[
        { label: "✓ Result",             w: 80  },
        { label: "✓ Model selection",    w: 190 },
        { label: "✓ SLM engine",         w: 280 },
        { label: "✓ Data + GraphRAG",    w: 390 },
      ].map((t, i) => (
        <div
          key={i}
          className="flex items-center justify-center h-9 rounded-[10px] text-[12px] font-semibold px-5 bg-gg/10 border border-gg/30 text-gg"
          style={{ width: t.w }}
        >
          {t.label}
        </div>
      ))}
    </div>
  );
}

export default function RecommendationsPage() {
  const router = useRouter();
  const [output, setOutput] = useState<OrchestratorOutput | null>(null);
  const [buildPlan, setBuildPlan] = useState<BuildStep[]>([]);
  const [activeTab, setActiveTab] = useState<"plan" | "answer" | "chat" | "trace">("plan");
  const [expandedStep, setExpandedStep] = useState<number | null>(1);
  const [traceExpanded, setTraceExpanded] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  useEffect(() => {
    const jid = sessionStorage.getItem("job_id");
    setJobId(jid);
    const raw = sessionStorage.getItem("orchestrator_output");
    if (raw) {
      try {
        const parsed: OrchestratorOutput = JSON.parse(raw);
        setOutput(parsed);
        setBuildPlan(deriveBuildPlan(parsed));
        if (parsed.final_answer) {
          setChatMessages([{ role: "assistant", content: parsed.final_answer }]);
        }
      } catch { router.push("/"); }
    } else { router.push("/"); }
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  const startNewSession = () => {
    sessionStorage.removeItem("job_id");
    sessionStorage.removeItem("query");
    sessionStorage.removeItem("domain_label");
    sessionStorage.removeItem("orchestrator_output");
    router.push("/");
  };

  const downloadPDF = () => {
    window.print();
  };

  const sendChat = async () => {
    if (!chatInput.trim() || !output) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: msg }]);
    setIsChatting(true);
    try {
      const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const res = await fetch(`${API}/api/v1/orchestrator/ask`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: msg, session_id: output.session_id, job_id: jobId,
          domain_label: output.slm_model_id ?? sessionStorage.getItem("domain_label") ?? "general",
        }),
      });
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "", answer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try { const ev = JSON.parse(line.slice(6)); if (ev.type === "output") answer = ev.data?.final_answer ?? ""; } catch { /**/ }
          }
        }
      }
      setChatMessages(prev => [...prev, { role: "assistant", content: answer || "I couldn't generate a response." }]);
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Error communicating with the model." }]);
    } finally { setIsChatting(false); }
  };

  if (!output) return <div className="flex items-center justify-center h-screen text-t3 text-sm">Loading…</div>;

  return (
    <div>
      {/* Page header */}
      <div className="bg-card border-b border-dborder px-0 py-7 mb-7 no-print">
        <div className="max-w-[1000px] mx-auto px-8 flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-t3 mb-1.5 flex items-center gap-2">
              <span className="inline-block w-4 h-px bg-accent" />
              Step 3 of 3 · Complete
            </div>
            <div className="font-sora text-2xl font-semibold text-t1">Build Plan &amp; Recommendations</div>
            <div className="text-[12px] text-t2 mt-1 italic">"{output.query}"</div>
          </div>
          <div className="flex gap-2 pt-1 flex-shrink-0">
            <button onClick={downloadPDF} className="btn btn-sm" title="Download as PDF">
              ⬇ PDF
            </button>
            <button onClick={() => router.push("/dashboard")} className="btn btn-sm">
              Dashboard
            </button>
            <button onClick={startNewSession} className="btn btn-sm btn-p">
              + New Session
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1000px] mx-auto px-8">
        <Pyramid />

        {/* Meta row */}
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="apill">Intent: <span className="text-accent">{output.intent}</span></span>
          <span className="apill">Coverage: <span className="text-amber">{output.coverage_action}</span></span>
          {output.slm_model_id && <span className="apill-done apill">SLM: {output.slm_model_id}</span>}
          {output.build_in_progress && <span className="apill bg-amber/10 text-amber border-amber/30">⏳ SLM build queued</span>}
          <span className={`apill ${output.hallucination_rate < 0.05 ? "apill-done" : "bg-coral/10 text-coral border-coral/30"}`}>
            Hallucination: {(output.hallucination_rate * 100).toFixed(1)}%
          </span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-dborder">
          {([
            { key: "plan",  label: "Build Plan" },
            { key: "answer", label: "Answer" },
            { key: "chat",  label: "Q&A Chat" },
            { key: "trace", label: "Decision Trace" },
          ] as { key: typeof activeTab; label: string }[]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-[12px] font-semibold rounded-t transition-colors ${
                activeTab === tab.key
                  ? "bg-bg3 text-accent border-b-2 border-accent"
                  : "text-t3 hover:text-t2"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* BUILD PLAN TAB */}
        {activeTab === "plan" && (
          <div className="space-y-2.5">
            {buildPlan.map(step => (
              <div
                key={step.id}
                className={`bg-card2 border rounded-card overflow-hidden transition-colors ${expandedStep === step.id ? "border-accent" : "border-dborder hover:border-dborder2"}`}
              >
                <button className="w-full flex items-start gap-4 px-5 py-4 text-left" onClick={() => setExpandedStep(expandedStep === step.id ? null : step.id)}>
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center text-[13px] font-bold text-accent">{step.id}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-[10px] text-t3 font-mono">{step.phase}</span>
                      <PriorityBadge priority={step.priority} />
                      <span className="text-[10px] text-t3">~{step.effort}</span>
                    </div>
                    <p className="text-[13px] font-semibold text-t1">{step.title}</p>
                  </div>
                  <span className="text-t3 flex-shrink-0 mt-1 text-[11px]">{expandedStep === step.id ? "▲" : "▼"}</span>
                </button>
                {expandedStep === step.id && (
                  <div className="px-5 pb-5 border-t border-dborder pt-4 space-y-4">
                    <p className="text-[12px] text-t2 leading-relaxed">{step.description}</p>
                    <div className="sect">Recommended models for this step</div>
                    <div className="space-y-1.5">
                      {step.models.map((m, i) => (
                        <div key={i} className={`model-row ${i === 0 ? "border-teal chosen" : ""}`}>
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: i === 0 ? "#2dd4a0" : "#5c5a78" }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[12px] font-medium font-mono ${i === 0 ? "text-teal" : "text-t1"}`}>{m.name}</span>
                              <ProviderBadge provider={m.provider} local={m.local} />
                              {i === 0 && <span className="ft-badge bg-teal/10 text-teal border border-teal/30">PRIMARY</span>}
                            </div>
                            <p className="text-[10px] text-t3 mt-0.5">{m.why}</p>
                          </div>
                          <span className={`text-[14px] font-bold font-mono ${m.score >= 0.8 ? "text-gg" : m.score >= 0.6 ? "text-t2" : "text-coral"}`}>{m.score.toFixed(3)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ANSWER TAB */}
        {activeTab === "answer" && (
          <div>
            {output.final_answer ? (
              <div className="card">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2 h-2 rounded-full bg-gg" />
                  <p className="text-[10px] font-semibold text-t3 uppercase tracking-widest">Direct answer</p>
                  {output.slm_model_id && <span className="ml-auto apill font-mono">{output.slm_model_id}</span>}
                </div>
                <p className="text-[13px] text-t1 whitespace-pre-wrap leading-relaxed">{output.final_answer}</p>
                {output.sub_task_results?.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-dborder">
                    <div className="sect">Sub-task breakdown</div>
                    <div className="space-y-3">
                      {output.sub_task_results.map((r, i) => (
                        <div key={i} className="bg-bg3 rounded-sm p-3 border border-dborder">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="apill font-mono">{r.task_type}</span>
                            <span className="text-[10px] text-t3 font-mono">{r.assigned_model}</span>
                            <span className="ml-auto text-[10px] text-t3">{(r.confidence * 100).toFixed(0)}% conf.</span>
                          </div>
                          <p className="text-[10px] text-t3 italic mb-1.5">{r.query_fragment}</p>
                          <p className="text-[12px] text-t2 leading-relaxed">{r.response?.slice(0, 500)}{(r.response?.length ?? 0) > 500 ? "…" : ""}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="card border-amber/30">
                <p className="text-amber font-semibold text-[15px] mb-2">⏳ Corpus Processing In Progress</p>
                <p className="text-[12px] text-t2 leading-relaxed mb-4">
                  The system is ingesting your data and building the knowledge graph.<br />
                  Use the <span className="text-accent font-medium">Q&A Chat</span> tab to ask questions right now.
                </p>
                {output.error && <p className="text-[11px] text-coral mt-2 font-mono">{output.error}</p>}
              </div>
            )}
          </div>
        )}

        {/* Q&A CHAT TAB */}
        {activeTab === "chat" && (
          <div className="flex flex-col" style={{ height: "540px" }}>
            <p className="text-[11px] text-t3 mb-3">
              Ask questions about your data using available models.
              {jobId && <span className="text-gg ml-2">● corpus context loaded</span>}
            </p>
            <div className="flex-1 overflow-auto bg-bg rounded-sm border border-dborder p-4 space-y-3 mb-3">
              {chatMessages.length === 0 && (
                <div className="text-center mt-4">
                  <p className="text-t3 text-[11px] mb-3">Try these questions:</p>
                  <div className="space-y-2 max-w-lg mx-auto">
                    {[
                      "What's the demand impact if US tariffs on personal care products increase 25%?",
                      "Which suppliers face highest risk from a Red Sea route closure?",
                      "What safety stock should I hold given current risks?",
                      "How should I adjust demand forecasts if a disruption hits East Asia?",
                      "Give me a step-by-step plan to build this intelligence system.",
                    ].map(q => (
                      <button key={q} onClick={() => setChatInput(q)}
                        className="block w-full text-left text-[11px] bg-bg3 hover:bg-bg4 border border-dborder rounded-sm px-3 py-2.5 text-t3 hover:text-t2 transition-colors">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-2xl rounded-card px-4 py-3 text-[12px] ${msg.role === "user" ? "bg-accent text-white" : "bg-card2 border border-dborder text-t1"}`}>
                    {msg.role === "assistant" && <p className="text-[10px] text-accent mb-1.5 font-semibold">AI Orchestrator</p>}
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              ))}
              {isChatting && (
                <div className="thinking-bar">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple animate-blink" />
                  Thinking…
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 prompt-box resize-none"
                style={{ minHeight: "unset" }}
                placeholder="Ask about your data…"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
              />
              <button onClick={sendChat} disabled={isChatting || !chatInput.trim()} className="btn btn-p px-6 disabled:opacity-40">
                Send
              </button>
            </div>
          </div>
        )}

        {/* DECISION TRACE TAB */}
        {activeTab === "trace" && (
          <div className="space-y-2">
            {output.steps.map((step, i) => (
              <div key={i} className="bg-card2 border border-dborder rounded-card overflow-hidden">
                <button className="w-full flex items-center justify-between px-4 py-3 text-left"
                  onClick={() => setTraceExpanded(traceExpanded === i ? null : i)}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-purple/10 border border-purple/30 text-[11px] font-bold text-purple">
                      {step.step_number}
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold text-t1">{step.step_name}</p>
                      <p className="text-[10px] text-t3">{step.duration_ms}ms</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="prog-bar w-16"><div className="prog-fill" style={{ width: `${step.explanation.confidence * 100}%` }} /></div>
                    <span className={`text-[11px] font-mono font-semibold ${step.explanation.confidence >= 0.8 ? "text-gg" : step.explanation.confidence >= 0.6 ? "text-amber" : "text-coral"}`}>
                      {(step.explanation.confidence * 100).toFixed(0)}%
                    </span>
                    <span className="text-t3 text-[11px]">{traceExpanded === i ? "▲" : "▼"}</span>
                  </div>
                </button>
                {traceExpanded === i && (
                  <div className="px-4 pb-4 pt-3 border-t border-dborder space-y-2 text-[11px]">
                    {([["WHAT", step.explanation.what], ["WHY", step.explanation.why],
                      ["FOUND", step.explanation.what_we_found], ["DECISION", step.explanation.decision_made]] as [string, string][])
                      .map(([label, value]) => (
                        <div key={label} className="flex gap-3">
                          <span className="text-t3 font-bold w-16 flex-shrink-0">{label}</span>
                          <span className="text-t2">{value}</span>
                        </div>
                      ))}
                    {step.explanation.caveats.length > 0 && (
                      <div className="flex gap-3">
                        <span className="text-t3 font-bold w-16 flex-shrink-0">CAVEATS</span>
                        <span className="text-amber italic">{step.explanation.caveats.join(" · ")}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {output.model_recommendations.length > 0 && (
              <div className="mt-6">
                <div className="sect">All model recommendations</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {output.model_recommendations.map((rec, i) => (
                    <div key={i} className={`model-row ${rec.is_primary ? "chosen" : ""}`}>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: rec.is_primary ? "#2dd4a0" : "#5c5a78" }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[12px] font-medium font-mono ${rec.is_primary ? "text-teal" : "text-t1"}`}>{rec.model_name}</span>
                          <ProviderBadge provider={rec.provider} local={rec.is_available_locally} />
                        </div>
                        <p className="text-[10px] text-t3">{rec.provider} · {rec.task_type}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[13px] font-mono text-accent font-bold">{rec.composite_score.toFixed(3)}</p>
                        {rec.is_available_locally && <p className="text-[9px] text-gg">● local</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-10 pt-6 border-t border-dborder flex justify-between items-center mb-8">
          <button onClick={() => router.push("/")} className="btn btn-sm text-t3 hover:text-t1">← New query</button>
          <div className="text-[10px] text-t3 text-right">
            Session: <span className="font-mono">{output.session_id?.slice(0, 8)}…</span>
            {output.total_tokens_used > 0 && <span className="ml-3">{output.total_tokens_used.toLocaleString()} tokens</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
