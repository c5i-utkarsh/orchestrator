"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from "recharts";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const TABS = ["Overview", "Harness", "Functional", "Technical", "Executive"] as const;
type Tab = typeof TABS[number];

// N/A-aware formatters
const pct = (v: number | null | undefined) => (v === null || v === undefined ? null : `${(v * 100).toFixed(1)}%`);
const num = (v: number | null | undefined, d = 3) => (v === null || v === undefined ? null : v.toFixed(d));

function KTile({ label, value, sub }: { label: string; value: string | null; sub?: string }) {
  const na = value === null;
  return (
    <div className="bg-card border border-dborder rounded-xl p-4 shadow-sm">
      <div className={`text-[22px] font-bold leading-none ${na ? "text-t3" : "text-t1"}`}>{na ? "N/A" : value}</div>
      <div className="text-[10px] text-t3 mt-1.5 uppercase tracking-wider">{label}</div>
      {na ? <div className="text-[9px] text-amber mt-1">not measured</div>
          : sub ? <div className="text-[10px] text-gg mt-1">{sub}</div> : null}
    </div>
  );
}

export default function BenchmarkingPage() {
  const [tab, setTab] = useState<Tab>("Overview");
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch(`${API}/api/v1/benchmark/summary`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setData)
      .catch(e => setErr(e.message));
  }, []);

  if (err) return <div className="p-8 text-[13px] text-coral">Failed to load benchmark data: {err}</div>;
  if (!data) return <div className="p-8 text-[13px] text-t2">Loading benchmark data…</div>;

  const ov = data.overview, tech = data.technical, harn = data.harness, fun = data.functional, exec = data.executive;
  const trends = data.trends ?? [];

  return (
    <div>
      {/* Header */}
      <div className="bg-card border-b border-dborder px-8 py-7 mb-6">
        <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-t3 mb-1.5 flex items-center gap-2">
          <span className="inline-block w-4 h-px bg-accent" /> DHS Benchmarking · read-only analytics
        </div>
        <div className="font-sora text-2xl font-semibold text-t1">The harness is as important as the model</div>
        <div className="text-[12px] text-t2 mt-1">
          Agent = Model + DHS · computed from real system data ({data.sample_sizes.queries} queries, {data.sample_sizes.slm_models} SLMs)
        </div>
      </div>

      <div className="px-8">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-dborder mb-6">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-[12px] font-semibold border-b-2 -mb-px transition-colors ${
                tab === t ? "border-accent text-accent" : "border-transparent text-t3 hover:text-t2"}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Honest data-source banner */}
        <div className="flex items-start gap-2 px-4 py-2.5 bg-amber/10 border border-amber/30 rounded-lg text-[11px] text-t2 mb-6">
          <span>ℹ️</span>
          <span>All values are computed from real system data. KPIs shown as <b>N/A</b> have no producing measurement yet:
            {" "}{(data.unavailable ?? []).join(", ")}.</span>
        </div>

        {tab === "Overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KTile label="Combined Score" value={num(ov.combined_score)} />
              <KTile label="Harness Score" value={num(ov.harness_score)} />
              <KTile label="Functional Score" value={num(ov.functional_score)} />
              <KTile label="Hallucination Rate" value={pct(ov.hallucination_rate)} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { q: "Is the intelligence better?", to: "Harness" as Tab },
                { q: "Is the business better?", to: "Functional" as Tab },
                { q: "Is the AI output better?", to: "Technical" as Tab },
              ].map(c => (
                <button key={c.to} onClick={() => setTab(c.to)}
                  className="text-left bg-card border border-dborder rounded-xl p-5 hover:border-accent/40 transition-colors">
                  <div className="text-[14px] font-semibold text-t1 mb-1">{c.q}</div>
                  <div className="text-[11px] text-accent font-semibold">Explore {c.to} →</div>
                </button>
              ))}
            </div>
            <TrendChart trends={trends} />
          </div>
        )}

        {tab === "Harness" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(harn.dimensions).map(([k, v]) => (
                <KTile key={k} label={k.replace(/_/g, " ")} value={pct(v as number | null)} />
              ))}
            </div>
            <div className="bg-card border border-dborder rounded-xl p-5">
              <div className="text-[13px] font-semibold text-t1 mb-3">Query task distribution (real)</div>
              {harn.task_distribution.length ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={harn.task_distribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="category" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} />
                    <Tooltip /><Bar dataKey="count" fill="#7c6af8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <Empty />}
            </div>
          </div>
        )}

        {tab === "Functional" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(fun.components).map(([k, v]) => (
                <KTile key={k} label={k.replace(/_/g, " ")} value={pct(v as number | null)} />
              ))}
            </div>
            <div className="bg-card border border-dborder rounded-xl p-5">
              <div className="text-[13px] font-semibold text-t1 mb-3">Knowledge coverage (latest completed corpus)</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KTile label="Entities" value={fun.knowledge_coverage.entities?.toLocaleString() ?? null} />
                <KTile label="Communities" value={fun.knowledge_coverage.communities?.toString() ?? null} />
                <KTile label="Graph Nodes" value={fun.knowledge_coverage.graph_nodes?.toString() ?? null} />
                <KTile label="Ontology Conformance" value={pct(fun.knowledge_coverage.ontology_conformance)} />
              </div>
            </div>
          </div>
        )}

        {tab === "Technical" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KTile label="Completion" value={num(tech.completion)} />
              <KTile label="Process (routing)" value={num(tech.process)} />
              <KTile label="Security" value={num(tech.security)} />
              <KTile label="Combined (C×P×S)" value={num(tech.combined)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <KTile label="Routing Accuracy" value={pct(tech.routing_accuracy)} />
              <KTile label="Learning Velocity (Δ completion)" value={num(tech.learning_velocity)} />
            </div>
            <TrendChart trends={trends} />
          </div>
        )}

        {tab === "Executive" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KTile label="Combined Score" value={num(exec.combined_score)} />
              <KTile label="Harness Score" value={num(exec.harness_score)} />
              <KTile label="Functional Score" value={num(exec.functional_score)} />
              <KTile label="Technical Score" value={num(exec.technical_score)} />
              <KTile label="Hallucination Rate" value={pct(exec.hallucination_rate)} />
              <KTile label="Routing Accuracy" value={pct(exec.routing_accuracy)} />
              <KTile label="Knowledge Entities" value={exec.knowledge_entities?.toLocaleString() ?? null} />
              <KTile label="ROI / Business Value" value={exec.roi} />
            </div>
            <TrendChart trends={trends} />
            <div className="bg-card border border-dborder rounded-xl p-5 text-[12px] text-t2 leading-relaxed">
              <b className="text-t1">Executive summary:</b> Scores are computed live from {data.sample_sizes.queries} recorded
              queries and {data.sample_sizes.slm_models} registered domain model(s). Currency ROI, business value, and
              the Model-alone-vs-Model+DHS baseline are <b>not shown</b> because the system records no producing
              measurement for them — populating those requires an A/B eval harness and KPI/feedback capture.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TrendChart({ trends }: { trends: any[] }) {
  return (
    <div className="bg-card border border-dborder rounded-xl p-5">
      <div className="text-[13px] font-semibold text-t1 mb-3">Monthly trends (real query history)</div>
      {trends.length ? (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={trends}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} />
            <Tooltip /><Legend wrapperStyle={{ fontSize: 10 }} />
            <Line type="monotone" dataKey="completion" stroke="#2dd4a0" strokeWidth={2} />
            <Line type="monotone" dataKey="hallucination" stroke="#e63755" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      ) : <Empty />}
    </div>
  );
}

function Empty() {
  return <div className="text-[11px] text-t3 py-8 text-center">No data yet — run queries to populate this chart.</div>;
}
