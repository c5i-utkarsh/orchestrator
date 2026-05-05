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
  const colors: Record<string, string> = {
    ollama: "bg-green-900 text-green-300", openai: "bg-blue-900 text-blue-300",
    local: "bg-purple-900 text-purple-300",
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${colors[provider] ?? "bg-gray-800 text-gray-400"}`}>
      {local ? "● " : ""}{provider}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const s: Record<string, string> = {
    critical: "bg-red-900/50 text-red-300 border border-red-700",
    high:     "bg-orange-900/50 text-orange-300 border border-orange-700",
    medium:   "bg-gray-800 text-gray-400 border border-gray-700",
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full ${s[priority] ?? s.medium}`}>{priority}</span>;
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
    setJobId(sessionStorage.getItem("job_id"));
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

  if (!output) return <div className="flex items-center justify-center h-screen text-gray-500">Loading…</div>;

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex gap-2 mb-6 text-xs text-gray-500">
        {["1 · Setup", "2 · Processing", "3 · Recommendations"].map((s, i) => (
          <span key={i} className={`px-3 py-1 rounded-full ${i === 2 ? "bg-brand-600 text-white" : "bg-gray-800"}`}>{s}</span>
        ))}
      </div>

      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-100 mb-1">Build Plan & Recommendations</h2>
        <p className="text-sm text-gray-500 italic mb-3">"{output.query}"</p>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="bg-gray-800 px-2 py-1 rounded">Intent: <span className="text-brand-400">{output.intent}</span></span>
          <span className="bg-gray-800 px-2 py-1 rounded">Coverage: <span className="text-yellow-400">{output.coverage_action}</span></span>
          {output.slm_model_id && <span className="bg-gray-800 px-2 py-1 rounded">SLM: <span className="text-green-400">{output.slm_model_id}</span></span>}
          {output.build_in_progress && <span className="bg-yellow-900/50 text-yellow-300 border border-yellow-700 px-2 py-1 rounded">⏳ SLM build queued</span>}
          <span className="bg-gray-800 px-2 py-1 rounded">Hallucination: <span className={output.hallucination_rate < 0.05 ? "text-green-400" : "text-red-400"}>{(output.hallucination_rate * 100).toFixed(1)}%</span></span>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-800">
        {([
          { key: "plan", label: "📋 Build Plan" },
          { key: "answer", label: "💡 Answer" },
          { key: "chat", label: "💬 Q&A Chat" },
          { key: "trace", label: "🔍 Decision Trace" },
        ] as { key: typeof activeTab; label: string }[]).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${activeTab === tab.key ? "bg-gray-900 text-brand-400 border-b-2 border-brand-500" : "text-gray-500 hover:text-gray-300"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* BUILD PLAN TAB */}
      {activeTab === "plan" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-400 mb-4">
            Complete implementation plan for your <span className="text-brand-400 font-medium">CPG Supply Chain Intelligence System</span>{" "}
            with event triggers (tariffs, war disruptions, route closures) and demand forecasting.
          </p>
          {buildPlan.map(step => (
            <div key={step.id} className={`bg-gray-900 border rounded-xl overflow-hidden transition-colors ${expandedStep === step.id ? "border-brand-600" : "border-gray-700 hover:border-gray-600"}`}>
              <button className="w-full flex items-start gap-4 px-5 py-4 text-left" onClick={() => setExpandedStep(expandedStep === step.id ? null : step.id)}>
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-900 border border-brand-700 flex items-center justify-center text-sm font-bold text-brand-400">{step.id}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-xs text-gray-500 font-mono">{step.phase}</span>
                    <PriorityBadge priority={step.priority} />
                    <span className="text-xs text-gray-600">~{step.effort}</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-100">{step.title}</p>
                </div>
                <span className="text-gray-600 flex-shrink-0 mt-1">{expandedStep === step.id ? "▲" : "▼"}</span>
              </button>
              {expandedStep === step.id && (
                <div className="px-5 pb-5 border-t border-gray-800 pt-4 space-y-4">
                  <p className="text-sm text-gray-300 leading-relaxed">{step.description}</p>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recommended Models for this Step</p>
                    <div className="space-y-2">
                      {step.models.map((m, i) => (
                        <div key={i} className={`flex items-start gap-3 bg-gray-800 rounded-lg px-3 py-2.5 border ${i === 0 ? "border-brand-700" : "border-gray-700"}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-gray-200 font-mono">{m.name}</span>
                              <ProviderBadge provider={m.provider} local={m.local} />
                              {i === 0 && <span className="text-xs bg-brand-900 text-brand-300 px-1.5 py-0.5 rounded">PRIMARY</span>}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{m.why}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-mono font-bold text-brand-400">{m.score.toFixed(3)}</p>
                            <p className="text-xs text-gray-600">composite</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          <p className="text-xs text-gray-600 text-center pt-1">Click any step to expand · Steps marked <span className="text-red-400">critical</span> are required for event-triggered forecasting</p>
        </div>
      )}

      {/* ANSWER TAB */}
      {activeTab === "answer" && (
        <div>
          {output.final_answer ? (
            <div className="bg-gray-900 border border-brand-800 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Direct answer to your query</p>
                {output.slm_model_id && <span className="text-xs text-brand-400 ml-auto font-mono">{output.slm_model_id}</span>}
              </div>
              <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{output.final_answer}</p>
              {output.sub_task_results?.length > 0 && (
                <div className="mt-6 pt-4 border-t border-gray-800">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Sub-task Breakdown</p>
                  <div className="space-y-3">
                    {output.sub_task_results.map((r, i) => (
                      <div key={i} className="bg-gray-800 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-mono bg-gray-700 px-1.5 py-0.5 rounded text-gray-300">{r.task_type}</span>
                          <span className="text-xs text-gray-500 font-mono">{r.assigned_model}</span>
                          <span className="ml-auto text-xs text-gray-600">{(r.confidence * 100).toFixed(0)}% conf.</span>
                        </div>
                        <p className="text-xs text-gray-400 italic mb-1.5">{r.query_fragment}</p>
                        <p className="text-sm text-gray-300 leading-relaxed">{r.response?.slice(0, 500)}{(r.response?.length ?? 0) > 500 ? "…" : ""}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-900 border border-yellow-800 rounded-xl p-8 text-center">
              <p className="text-yellow-400 font-semibold text-lg mb-2">⏳ Corpus Processing In Progress</p>
              <p className="text-sm text-gray-400 leading-relaxed mb-4">
                The system is ingesting your supply chain data and building the knowledge graph.<br />
                Once complete, the domain SLM will synthesize a full answer here.<br />
                Use the <strong className="text-brand-400">Q&A Chat</strong> tab to ask questions right now using the available base models.
              </p>
              {output.error && <p className="text-xs text-red-400 mt-2 font-mono">{output.error}</p>}
            </div>
          )}
        </div>
      )}

      {/* Q&A CHAT TAB */}
      {activeTab === "chat" && (
        <div className="flex flex-col" style={{ height: "540px" }}>
          <p className="text-xs text-gray-500 mb-3">
            Ask questions about your supply chain using the available local models.
            {jobId && <span className="text-green-500 ml-2">● corpus context loaded from job</span>}
          </p>
          <div className="flex-1 overflow-auto bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3 mb-3">
            {chatMessages.length === 0 && (
              <div className="text-center mt-6">
                <p className="text-gray-600 text-sm mb-4">Try these questions:</p>
                <div className="space-y-2 max-w-lg mx-auto">
                  {[
                    "What's the demand impact if US tariffs on personal care products increase 25%?",
                    "Which suppliers face highest risk from a Red Sea route closure?",
                    "What safety stock should I hold for Shampoo Pro 500ml given current risks?",
                    "How should I adjust CPG demand forecasts if a global war disruption hits East Asia?",
                    "Give me a step-by-step plan to build this supply chain intelligence system.",
                  ].map(q => (
                    <button key={q} onClick={() => setChatInput(q)}
                      className="block w-full text-left text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg px-3 py-2.5 text-gray-400 hover:text-gray-200 transition-colors">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-2xl rounded-xl px-4 py-3 text-sm ${msg.role === "user" ? "bg-brand-700 text-white" : "bg-gray-800 text-gray-200"}`}>
                  {msg.role === "assistant" && <p className="text-xs text-brand-400 mb-1.5 font-semibold">Supply Chain AI</p>}
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ))}
            {isChatting && (
              <div className="flex justify-start">
                <div className="bg-gray-800 text-gray-400 rounded-xl px-4 py-3 text-sm animate-pulse">Thinking…</div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="flex gap-2">
            <input className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-100 focus:outline-none focus:border-brand-500"
              placeholder="Ask about demand forecasting, event impacts, supplier risks…"
              value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }} />
            <button onClick={sendChat} disabled={isChatting || !chatInput.trim()}
              className="bg-brand-600 hover:bg-brand-500 text-white px-5 py-3 rounded-xl text-sm font-medium disabled:opacity-40 transition-colors">
              Send
            </button>
          </div>
        </div>
      )}

      {/* DECISION TRACE TAB */}
      {activeTab === "trace" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 mb-3">Every orchestration decision with confidence scores and reasoning.</p>
          {output.steps.map((step, i) => (
            <div key={i} className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
              <button className="w-full flex items-center justify-between px-4 py-3 text-left"
                onClick={() => setTraceExpanded(traceExpanded === i ? null : i)}>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono bg-gray-800 px-2 py-0.5 rounded text-gray-400">Step {step.step_number}</span>
                  <span className="text-sm font-medium text-gray-200">{step.step_name}</span>
                  <span className="text-xs text-gray-600">{step.duration_ms}ms</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-500 rounded-full" style={{ width: `${step.explanation.confidence * 100}%` }} />
                  </div>
                  <span className={`text-xs font-mono ${step.explanation.confidence >= 0.8 ? "text-green-400" : step.explanation.confidence >= 0.6 ? "text-yellow-400" : "text-red-400"}`}>
                    {(step.explanation.confidence * 100).toFixed(0)}%
                  </span>
                  <span className="text-gray-600">{traceExpanded === i ? "▲" : "▼"}</span>
                </div>
              </button>
              {traceExpanded === i && (
                <div className="px-4 pb-4 pt-3 border-t border-gray-800 space-y-2 text-xs">
                  {([["WHAT", step.explanation.what], ["WHY", step.explanation.why],
                    ["FOUND", step.explanation.what_we_found], ["DECISION", step.explanation.decision_made]] as [string, string][])
                    .map(([label, value]) => (
                      <div key={label} className="flex gap-2">
                        <span className="text-gray-600 font-bold w-16 flex-shrink-0">{label}</span>
                        <span className="text-gray-300">{value}</span>
                      </div>
                    ))}
                  {step.explanation.caveats.length > 0 && (
                    <div className="flex gap-2">
                      <span className="text-gray-600 font-bold w-16 flex-shrink-0">CAVEATS</span>
                      <span className="text-yellow-600 italic">{step.explanation.caveats.join(" · ")}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {output.model_recommendations.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">All Model Recommendations from Orchestrator</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {output.model_recommendations.map((rec, i) => (
                  <div key={i} className={`bg-gray-900 border rounded-lg px-3 py-2.5 ${rec.is_primary ? "border-brand-600" : "border-gray-700"}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-200 font-mono">{rec.model_name}</p>
                        <p className="text-xs text-gray-500">{rec.provider} · {rec.task_type}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono text-brand-400 font-bold">{rec.composite_score.toFixed(3)}</p>
                        {rec.is_available_locally && <p className="text-xs text-green-500">● local</p>}
                      </div>
                    </div>
                    {rec.why_primary && <p className="text-xs text-gray-600 mt-1">{rec.why_primary}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-10 pt-6 border-t border-gray-800 flex justify-between items-center">
        <button onClick={() => router.push("/")} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">← Start new query</button>
        <div className="text-xs text-gray-600 text-right">
          Session: <span className="font-mono">{output.session_id?.slice(0, 8)}…</span>
          {output.total_tokens_used > 0 && <span className="ml-3">{output.total_tokens_used.toLocaleString()} tokens</span>}
        </div>
      </div>
    </main>
  );
}
