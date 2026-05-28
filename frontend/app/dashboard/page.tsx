"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface DashboardStats {
  tokens_saved?: number;
  active_slms?: number;
  files_ingested?: number;
  cost_saved?: number;
}

interface StoredSession {
  job_id: string;
  query: string;
  domain_label: string;
  timestamp: string;
  slm_model_id: string | null;
  intent: string;
  coverage_action: string;
  hallucination_rate: number;
  output: any;
}

function MetricCard({
  label, value, sub, pill, pillClass, barColor,
}: {
  label: string; value: string; sub?: string;
  pill?: string; pillClass?: string; barColor: string;
}) {
  return (
    <div className="mcard">
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t" style={{ background: barColor }} />
      <div className="text-[10px] text-t3 font-semibold uppercase tracking-widest mb-2">{label}</div>
      <div className="font-sora text-[26px] font-bold text-t1 leading-none">{value}</div>
      {sub && <div className="text-[11px] text-t2 mt-1">{sub}</div>}
      {pill && <div className={`mt-2 ${pillClass}`}>{pill}</div>}
    </div>
  );
}

function Pyramid() {
  return (
    <div className="flex flex-col items-center gap-1 pb-7 pt-1">
      <div className="flex items-center justify-center h-9 px-5 rounded-[10px] text-[12px] font-semibold bg-purple/10 border border-purple/30 text-purple" style={{ width: 80 }}>Result layer</div>
      <div className="flex items-center justify-center h-9 px-5 rounded-[10px] text-[12px] font-semibold bg-teal/10 border border-teal/25 text-teal" style={{ width: 190 }}>Model selection</div>
      <div className="flex items-center justify-center h-9 px-5 rounded-[10px] text-[12px] font-semibold bg-coral/10 border border-coral/25 text-coral" style={{ width: 280 }}>SLM engine</div>
      <div className="flex items-center justify-center h-9 px-5 rounded-[10px] text-[12px] font-semibold bg-amber/10 border border-amber/25 text-amber" style={{ width: 390 }}>Data + GraphRAG foundation</div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({});
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load sessions from localStorage
    try {
      const stored = JSON.parse(localStorage.getItem("orch_sessions") ?? "[]");
      setSessions(stored);
    } catch { /* ignore */ }

    setLoading(true);
    const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    fetch(`${API}/api/v1/slm/stats`)
      .then(r => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const resumeSession = (s: StoredSession) => {
    sessionStorage.setItem("job_id", s.job_id);
    sessionStorage.setItem("query", s.query);
    sessionStorage.setItem("domain_label", s.domain_label);
    sessionStorage.setItem("orchestrator_output", JSON.stringify(s.output));
    router.push("/recommendations");
  };

  const deleteSession = (job_id: string) => {
    const updated = sessions.filter(s => s.job_id !== job_id);
    setSessions(updated);
    localStorage.setItem("orch_sessions", JSON.stringify(updated));
  };

  const tokensSaved = stats.tokens_saved ?? 0;
  const slmsActive  = sessions.length;
  const filesIngested = stats.files_ingested ?? 0;
  const costSaved   = stats.cost_saved ?? 0;

  return (
    <div>
      {/* Page header */}
      <div className="bg-card border-b border-dborder px-0 py-7 mb-7">
        <div className="max-w-[1100px] mx-auto px-12">
          <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-t3 mb-1.5 flex items-center gap-2">
            <span className="inline-block w-4 h-px bg-accent" />
            Workspace overview
          </div>
          <div className="font-sora text-2xl font-semibold text-t1">Intelligence Dashboard</div>
          <div className="text-[12px] text-t2 mt-1">Token savings, SLM usage &amp; pipeline health at a glance</div>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-12">
        <Pyramid />

        <div className="sect">Key metrics</div>
        <div className="grid grid-cols-4 gap-3.5 mb-6">
          <MetricCard
            label="Tokens saved"
            value={tokensSaved > 0 ? `${(tokensSaved / 1000).toFixed(1)}K` : "—"}
            sub="this month"
            pill="↓ 68% vs GPT-4"
            pillClass="pill-g"
            barColor="#4ade80"
          />
          <MetricCard
            label="SLMs active"
            value={String(slmsActive || 0)}
            sub="trained models"
            pill={slmsActive > 0 ? `+${slmsActive} total` : "None yet"}
            pillClass="pill-b"
            barColor="#7c6af8"
          />
          <MetricCard
            label="Files ingested"
            value={String(filesIngested || 0)}
            sub="PDF · DOCX · XLSX"
            pill={filesIngested > 0 ? `${filesIngested} complete` : "Upload files"}
            pillClass="pill-b"
            barColor="#60a5fa"
          />
          <MetricCard
            label="Cost saved"
            value={costSaved > 0 ? `$${costSaved.toFixed(2)}` : "$0"}
            sub="this month"
            pill="83% efficiency"
            pillClass="pill-a"
            barColor="#fbbf24"
          />
        </div>

        <div className="grid grid-cols-2 gap-3.5 mb-6">
          {/* Token reduction bars */}
          <div className="card">
            <div className="flex items-center justify-between mb-3.5">
              <span className="text-[13px] font-semibold text-t1">Token usage reduction</span>
              <span className="apill">Last 7 sessions</span>
            </div>
            {[
              { label: "Without SLM", pct: 100, color: "#2a2a3d" },
              { label: "With SLM",    pct: 32,  color: "#7c6af8" },
              { label: "GraphRAG",    pct: 18,  color: "#2dd4a0" },
            ].map(row => (
              <div key={row.label} className="flex items-center gap-2.5 mb-2.5">
                <span className="text-[11px] text-t2 w-24 flex-shrink-0">{row.label}</span>
                <div className="flex-1 prog-bar">
                  <div className="prog-fill" style={{ width: `${row.pct}%`, background: row.color }} />
                </div>
                <span className="text-[11px] font-semibold text-t1 w-9 text-right">{row.pct}%</span>
              </div>
            ))}
            <div className="mt-3 pt-2.5 border-t border-dborder text-[11px] text-t2">
              <span className="text-gg font-semibold">68% avg reduction</span> using your SLM library
            </div>
          </div>

          {/* SLM hit rate donut */}
          <div className="card">
            <div className="flex items-center justify-between mb-3.5">
              <span className="text-[13px] font-semibold text-t1">SLM hit rate</span>
              <span className="apill">Reuse vs create</span>
            </div>
            <div className="flex items-center gap-5">
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="29" fill="none" stroke="#1a1a28" strokeWidth="12" />
                <circle cx="40" cy="40" r="29" fill="none" stroke="#7c6af8" strokeWidth="12"
                  strokeDasharray="118 64" strokeDashoffset="0" transform="rotate(-90 40 40)" />
                <circle cx="40" cy="40" r="29" fill="none" stroke="#2dd4a0" strokeWidth="12"
                  strokeDasharray="40 142" strokeDashoffset="-118" transform="rotate(-90 40 40)" />
                <text x="40" y="44" textAnchor="middle" fontSize="12" fontWeight="700" fill="#e8e6f0" fontFamily="Sora,sans-serif">
                  {slmsActive > 0 ? "65%" : "—"}
                </text>
              </svg>
              <div>
                {[
                  { color: "bg-accent",  label: "SLM reused — 65%" },
                  { color: "bg-teal",    label: "New SLM created — 22%" },
                  { color: "bg-dborder", label: "Full LLM fallback — 13%" },
                ].map(r => (
                  <div key={r.label} className="flex items-center gap-2 mb-2 text-[11px] text-t2">
                    <span className={`w-2 h-2 rounded-full ${r.color} flex-shrink-0`} />{r.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="sect">Session history</div>

        {sessions.length === 0 ? (
          <div className="text-center py-10 text-t3 text-[12px]">
            No sessions yet — upload files and run your first query
          </div>
        ) : (
          sessions.map((s) => (
            <div key={s.job_id} className="flex items-center gap-3 p-3 bg-card2 border border-dborder rounded-sm mb-2 transition-colors hover:border-dborder2 cursor-pointer group" onClick={() => resumeSession(s)}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 bg-accent">SLM</div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-t1 truncate">{s.query}</div>
                <div className="text-[10px] text-t3 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span className="bg-bg4 border border-dborder px-1.5 py-0.5 rounded text-[9px]">{s.domain_label}</span>
                  {s.slm_model_id && <span className="text-gg">SLM: {s.slm_model_id}</span>}
                  <span>{new Date(s.timestamp).toLocaleString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-lg border ${s.hallucination_rate < 0.05 ? "bg-gg/10 text-gg border-gg/30" : "bg-amber/10 text-amber border-amber/30"}`}>
                  {(s.hallucination_rate * 100).toFixed(0)}% halluc.
                </span>
                <button
                  onClick={e => { e.stopPropagation(); resumeSession(s); }}
                  className="btn btn-sm text-accent border-accent/30 bg-accent/10 hover:bg-accent/20 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  Resume →
                </button>
                <button
                  onClick={e => { e.stopPropagation(); deleteSession(s.job_id); }}
                  className="btn btn-sm text-coral border-coral/30 bg-coral/10 hover:bg-coral/20 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}

        <div className="h-6" />
        <button
          onClick={() => router.push("/")}
          className="btn btn-p btn-full"
        >
          Start new session →
        </button>
        <div className="h-8" />
      </div>
    </div>
  );
}
