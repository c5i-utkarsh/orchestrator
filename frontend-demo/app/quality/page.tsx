"use client";
import { useEffect, useState, useCallback, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";

// ── Utility ──────────────────────────────────────────────────────────────────
function pct(n: number | null | undefined, digits = 1) {
  if (n == null || isNaN(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}
function num(n: number | null | undefined, digits = 0) {
  if (n == null || isNaN(n)) return "—";
  return digits > 0 ? n.toFixed(digits) : String(Math.round(n));
}
function scoreColor(v: number) {
  if (v >= 0.8) return "#16a34a";
  if (v >= 0.6) return "#d97706";
  return "#e11d48";
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Corpus { job_id: string; domain_label?: string; entity_count?: number; file_count?: number; }
interface PipelineStep { id: string; pct: number; label: string; detail: string; status: string; }
interface IngestReport {
  job_id: string; status: string; entity_count: number; file_count: number;
  pipeline_steps: { steps: PipelineStep[] };
  file_scorecards: Array<{ file_id: string; scorecard: Record<string, number> }>;
  registry_metrics: Record<string, unknown>;
}
interface GraphData {
  job_id: string; node_count: number; edge_count: number;
  nodes: Array<{ id: string; label: string; type: string; count: number; community?: number; confidence?: number }>;
  edges: Array<{ source: string; target: string; relation?: string; weight?: number; confidence?: number }>;
}
interface QualityMetrics {
  graph_metrics: { node_count: number; edge_count: number; active_edge_count: number; suppressed_edge_count: number; suppressed_ratio_pct: number; high_risk_edge_ratio: number; contradiction_ratio: number; edge_confidence_distribution: Record<string, number>; stats: { node_count: number; edge_count: number; density: number; avg_degree: number } };
  registry_metrics: { canonical_node_count: number; total_alias_count: number; avg_aliases_per_node: number; pending_review_count: number; resolved_review_count: number; merge_history_count: number; split_history_count: number; entity_types: string[] };
  file_scorecards: Array<Record<string, number>>;
  file_count: number;
}
interface EdaFile {
  file_id: string;
  summary: {
    source: { ext: string; adapter: string; source_type: string };
    entity_statistics: { entity_count: number; low_confidence_count: number; mean_confidence: number; min_confidence: number; max_confidence: number; duplicate_entities: unknown[]; orphan_entities: unknown[]; };
    relationship_statistics: { relationship_count: number; low_confidence_count: number; mean_confidence: number; weak_edges: unknown[]; invalid_edge_patterns: unknown[]; };
    graph_metrics: { node_count: number; edge_count: number; graph_density: number; disconnected_component_count: number; central_entities: unknown[] };
    semantic_quality_metrics: { ontology_violations: unknown[]; semantic_contradictions: unknown[]; consistency_score: number };
    confidence_scores: { entity_confidence_score: number; relationship_confidence_score: number; graph_trust_score: number; semantic_coherence_score: number; canonical_resolution_score: number; knowledge_graph_completeness_score: number; extraction_reliability_score: number };
  };
  metadata: { file_id: string; ext: string; doc_type: string; source_type: string; adapter: string; language?: { language: string; confidence: number }; structure?: { line_count: number; heading_count: number; block_count: number; is_structured: boolean; sample_headings?: string[] }; statistics?: { char_count: number; word_count: number; chunk_count: number; avg_chunk_words: number } };
  scorecard: Record<string, number>;
}
interface EdaData { job_id: string; files: EdaFile[] }
interface WikiData { job_id: string; pipeline_status: string; article_count: number; articles: Array<{ community_id: number; title: string; content: string; entity_type: string; aliases: string[]; sources: unknown[] }> }
interface WikiStats { total_articles: number; schema_articles: number; graphify_articles: number; train_tokens: number; total_tokens: number }
interface OntologyData {
  ontology?: { domain_label: string; entity_types: string[]; allowed_relations: string[]; proposed_relations: Record<string, number>; proposed_entity_types: Record<string, number> };
  graph_consistency?: { node_count: number; edge_count: number; orphan_node_count: number; ontology_nonconformant_edges: number; self_loops: number; dangling_edges: number; referential_integrity: { valid: boolean; error_count: number }; passed: boolean; orphan_nodes_sample?: string[] };
}
interface LinksMetrics { source_artifact_count: number; accepted_links: number; pending_links: number; rejected_links: number; accepted_ratio_pct: number; rejected_ratio_pct: number }

// ── Reusable Components ───────────────────────────────────────────────────────
function ScoreBar({ label, value, tooltip }: { label: string; value: number; tooltip?: string }) {
  const v = isNaN(value) ? 0 : Math.max(0, Math.min(1, value));
  const color = scoreColor(v);
  return (
    <div className="mb-3" title={tooltip}>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-t2 flex items-center gap-1">{label}{tooltip && <span className="text-t3 cursor-help" title={tooltip}>ⓘ</span>}</span>
        <span className="font-semibold font-mono" style={{ color }}>{pct(v)}</span>
      </div>
      <div className="h-1.5 bg-bg3 rounded-full overflow-hidden border border-dborder">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${v * 100}%`, background: color }} />
      </div>
    </div>
  );
}

function StatCard({ label, value, color, tooltip }: { label: string; value: string | number; color?: string; tooltip?: string }) {
  return (
    <div className="card text-center py-4 px-3" title={tooltip}>
      <div className="font-sora text-2xl font-bold" style={{ color: color ?? "#4f46e5" }}>{value}</div>
      <div className="text-[10px] text-t3 mt-1 uppercase tracking-widest leading-tight">{label}</div>
      {tooltip && <div className="text-[9px] text-t3 mt-1 italic truncate max-w-full">{tooltip}</div>}
    </div>
  );
}

function Gauge({ value, label, color }: { value: number; label: string; color?: string }) {
  const v = Math.max(0, Math.min(1, isNaN(value) ? 0 : value));
  const r = 38, cx = 50, cy = 50;
  const arc = Math.PI * r;
  const filled = v * arc;
  const empty = arc - filled;
  const c = color ?? scoreColor(v);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 60" className="w-28">
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="var(--color-bg3,#f0f1f6)" strokeWidth="8" strokeLinecap="round" />
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={c} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${filled} ${empty}`} />
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize="15" fontWeight="700" fill={c}>{Math.round(v * 100)}</text>
      </svg>
      <div className="text-[10px] text-t3 uppercase tracking-widest text-center -mt-2">{label}</div>
    </div>
  );
}

// Force-directed graph layout (kept from original)
function stableHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
function ellipsis(t: string, max = 18) { return t.length > max ? t.slice(0, max - 1) + "…" : t; }
function nodeColor(type: string): string {
  const t = (type || "").toLowerCase();
  if (t === "org" || t === "organization") return "#7c3aed";
  if (t === "person") return "#d97706";
  if (t === "gpe" || t === "loc" || t === "location") return "#0d9488";
  if (t === "event") return "#ef4444";
  if (t === "product") return "#0ea5e9";
  if (t === "artifact" || t === "facility") return "#8b5cf6";
  return "#2563eb";
}
interface PlacedNode { id: string; label: string; type: string; count: number; community?: number; x: number; y: number; vx: number; vy: number; r: number; labelShort: string; }
function buildLayout(nodes: GraphData["nodes"], edges: GraphData["edges"], maxNodes = 80) {
  const W = 960, H = 520, PAD = 40, cx = W / 2, cy = H / 2;
  const degree: Record<string, number> = {};
  nodes.forEach(n => { degree[n.id] = 0; });
  edges.forEach(e => { if (degree[e.source] != null) degree[e.source]++; if (degree[e.target] != null) degree[e.target]++; });
  const ranked = [...nodes].sort((a, b) => (degree[b.id] || 0) - (degree[a.id] || 0));
  const picked = ranked.slice(0, maxNodes);
  const ids = new Set(picked.map(n => n.id));
  const filteredEdges = edges.filter(e => ids.has(e.source) && ids.has(e.target)).slice(0, 200);
  const adj: Record<string, Set<string>> = {};
  picked.forEach(n => { adj[n.id] = new Set(); });
  filteredEdges.forEach(e => { adj[e.source]?.add(e.target); adj[e.target]?.add(e.source); });
  const seeded: PlacedNode[] = picked.map(n => {
    const h = stableHash(n.id), a = (h % 360) * (Math.PI / 180), r2 = 60 + (h % 200);
    return { ...n, x: cx + Math.cos(a) * r2, y: cy + Math.sin(a) * r2, vx: 0, vy: 0, r: 0, labelShort: "" };
  });
  const byId: Record<string, PlacedNode> = {};
  seeded.forEach(n => { byId[n.id] = n; });
  const ITER = 120, REP = 3200, K = 0.02, RL = 80, GRAV = 0.003, DAMP = 0.85;
  for (let it = 0; it < ITER; it++) {
    const forces: Record<string, [number, number]> = {};
    seeded.forEach(n => { forces[n.id] = [0, 0]; });
    for (let i = 0; i < seeded.length; i++) for (let j = i + 1; j < seeded.length; j++) {
      const a2 = seeded[i], b = seeded[j], dx = b.x - a2.x, dy = b.y - a2.y;
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const f = REP / (d * d);
      forces[a2.id][0] -= (dx / d) * f; forces[a2.id][1] -= (dy / d) * f;
      forces[b.id][0] += (dx / d) * f; forces[b.id][1] += (dy / d) * f;
    }
    filteredEdges.forEach(e => {
      const a2 = byId[e.source], b = byId[e.target]; if (!a2 || !b) return;
      const dx = b.x - a2.x, dy = b.y - a2.y, d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const f = K * (d - RL);
      forces[a2.id][0] += (dx / d) * f; forces[a2.id][1] += (dy / d) * f;
      forces[b.id][0] -= (dx / d) * f; forces[b.id][1] -= (dy / d) * f;
    });
    seeded.forEach(n => {
      const [fx, fy] = forces[n.id];
      n.vx = (n.vx + fx) * DAMP + GRAV * (cx - n.x);
      n.vy = (n.vy + fy) * DAMP + GRAV * (cy - n.y);
      n.x = Math.max(PAD, Math.min(W - PAD, n.x + n.vx));
      n.y = Math.max(PAD, Math.min(H - PAD, n.y + n.vy));
    });
  }
  const maxDeg = Math.max(1, ...Object.values(degree));
  seeded.forEach(n => {
    n.r = 5 + Math.sqrt((degree[n.id] || 1) / maxDeg) * 14;
    n.labelShort = ellipsis(n.label, 16);
  });
  return { width: W, height: H, nodes: seeded, edges: filteredEdges, pos: byId };
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type TabKey = "pipeline" | "overview" | "extraction" | "metadata" | "eda" | "graph" | "confidence" | "trust" | "ontology" | "wiki";

export default function KnowledgeReviewPage() {
  const [corpora, setCorpora] = useState<Corpus[]>([]);
  const [selectedJob, setSelectedJob] = useState<string>("");
  const [tab, setTab] = useState<TabKey>("pipeline");

  // Data state
  const [report, setReport] = useState<IngestReport | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [quality, setQuality] = useState<QualityMetrics | null>(null);
  const [eda, setEda] = useState<EdaData | null>(null);
  const [wiki, setWiki] = useState<WikiData | null>(null);
  const [wikiStats, setWikiStats] = useState<WikiStats | null>(null);
  const [ontology, setOntology] = useState<OntologyData | null>(null);
  const [links, setLinks] = useState<LinksMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<PlacedNode | null>(null);
  const loadedJob = useRef<string>("");

  useEffect(() => {
    fetch(`${API}/api/v1/data/corpora`).then(r => r.json()).then(d => {
      const list: Corpus[] = Array.isArray(d) ? d : d.corpora ?? [];
      setCorpora(list);
      if (list.length > 0) setSelectedJob(list[0].job_id);
    }).catch(() => {});
  }, []);

  const loadData = useCallback(() => {
    if (!selectedJob) return;
    setLoading(true); setError(null);
    loadedJob.current = selectedJob;
    Promise.all([
      fetch(`${API}/api/v1/data/ingestion-report/${selectedJob}`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/api/v1/data/graph/${selectedJob}`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/api/v1/quality/${selectedJob}/metrics`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/api/v1/quality/${selectedJob}/eda`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/api/v1/data/wiki/${selectedJob}`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/api/v1/data/wiki/${selectedJob}/stats`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/api/v1/quality/${selectedJob}/ontology`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/api/v1/links/${selectedJob}/metrics`).then(r => r.ok ? r.json() : null),
    ]).then(([r, g, q, e, w, ws, o, l]) => {
      if (r) setReport(r);
      if (g) setGraphData(g);
      if (q) setQuality(q);
      if (e) setEda(e);
      if (w) setWiki(w);
      if (ws) setWikiStats(ws);
      if (o) setOntology(o);
      if (l) setLinks(l);
    }).catch(ex => setError(String(ex))).finally(() => setLoading(false));
  }, [selectedJob]);

  useEffect(() => { loadData(); }, [loadData]);

  // Derived: canonical graph density
  const nc = graphData?.node_count ?? 0;
  const ec = graphData?.edge_count ?? 0;
  const canonicalDensity = nc > 1 ? ec / (nc * (nc - 1)) : 0;

  // Derived: per-file aggregate from EDA
  const edaFiles = eda?.files ?? [];
  const totalEdaEntities = edaFiles.reduce((s, f) => s + (f.summary?.entity_statistics?.entity_count ?? 0), 0);
  const totalEdaRelationships = edaFiles.reduce((s, f) => s + (f.summary?.relationship_statistics?.relationship_count ?? 0), 0);
  const avgEdaDensity = edaFiles.length > 0 ? edaFiles.reduce((s, f) => s + (f.summary?.graph_metrics?.graph_density ?? 0), 0) / edaFiles.length : 0;

  // Derived: averaged scorecard (from quality metrics)
  const scorecards = quality?.file_scorecards ?? [];
  const SCORE_KEYS = ["overall_kg_quality_score", "completeness_score", "consistency_score", "confidence_score", "graph_trust_score", "retrieval_readiness_score", "semantic_coherence_score", "canonical_resolution_score", "extraction_reliability_score"] as const;
  const avgScore: Record<string, number> = {};
  if (scorecards.length > 0) {
    for (const k of SCORE_KEYS) {
      avgScore[k] = scorecards.reduce((s, sc) => s + (Number(sc[k]) || 0), 0) / scorecards.length;
    }
  }

  // Derived: entity type breakdown from graph
  const typeCounts: Record<string, number> = {};
  (graphData?.nodes ?? []).forEach(n => { const t = n.type || "ENTITY"; typeCounts[t] = (typeCounts[t] || 0) + 1; });
  const typeTotal = Math.max(1, Object.values(typeCounts).reduce((a, b) => a + b, 0));

  // Derived: community breakdown
  const commCounts: Record<number, number> = {};
  (graphData?.nodes ?? []).forEach(n => { const c = n.community ?? -1; if (c >= 0) commCounts[c] = (commCounts[c] || 0) + 1; });

  // Graph layout (built once)
  const layout = graphData && graphData.nodes.length > 0 ? buildLayout(graphData.nodes, graphData.edges) : null;

  const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: "pipeline",    label: "Pipeline",            icon: "⚙" },
    { key: "overview",    label: "Overview",            icon: "◎" },
    { key: "extraction",  label: "Extraction",          icon: "⛏" },
    { key: "metadata",    label: "Metadata",            icon: "≡" },
    { key: "eda",         label: "EDA",                 icon: "∿" },
    { key: "graph",       label: "Knowledge Graph",     icon: "⬡" },
    { key: "confidence",  label: "Confidence",          icon: "▦" },
    { key: "trust",       label: "Validation & Trust",  icon: "◈" },
    { key: "ontology",    label: "Governance & Ontology", icon: "⊛" },
    { key: "wiki",        label: "Wiki",                icon: "📖" },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-bg2">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-dborder bg-bg1 flex-shrink-0">
        <div>
          <div className="text-[15px] font-semibold font-sora text-t1">Knowledge Review</div>
          <div className="text-[11px] text-t3 mt-0.5">14-layer pipeline · observatory · all values from pipeline artifacts</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select className="bg-bg3 border border-dborder rounded-lg px-3 py-1.5 text-[12px] text-t1 focus:outline-none"
            value={selectedJob} onChange={e => setSelectedJob(e.target.value)}>
            {corpora.map(c => (
              <option key={c.job_id} value={c.job_id}>{c.domain_label ?? c.job_id.slice(0, 12)}</option>
            ))}
          </select>
          <button onClick={loadData} className="btn btn-sm">Refresh</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-0 border-b border-dborder bg-bg1 flex-shrink-0 px-2">
        {TABS.map(({ key, label, icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2.5 text-[11px] font-medium transition-colors border-b-2 flex items-center gap-1"
            style={{ borderBottomColor: tab === key ? "var(--color-accent,#4f46e5)" : "transparent", color: tab === key ? "#4f46e5" : "var(--color-t2,#5a6077)", background: "transparent" }}>
            <span className="text-[10px]">{icon}</span>{label}
          </button>
        ))}
      </div>

      <div className="flex-1 p-6 max-w-6xl mx-auto w-full">
        {loading && <div className="text-[12px] text-t3 flex items-center gap-2"><span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />Loading pipeline artifacts…</div>}
        {error && <div className="text-[12px] text-coral">Error: {error}</div>}

        {/* ── PIPELINE ─────────────────────────────────────────────────── */}
        {!loading && tab === "pipeline" && (
          <div className="space-y-4">
            {/* Summary row */}
            <div className="grid grid-cols-4 gap-3">
              <StatCard label="Files Ingested"   value={report?.file_count ?? "—"}  color="#4f46e5" tooltip="Total source files processed by the pipeline" />
              <StatCard label="Entities Extracted" value={report?.entity_count ?? "—"} color="#0d9488" tooltip="Canonical entities extracted and resolved across all files" />
              <StatCard label="Pipeline Status"   value={report?.status === "graph_done" ? "Complete" : (report?.status ?? "—")} color={report?.status === "graph_done" ? "#16a34a" : "#d97706"} tooltip="Current stage of the 14-layer pipeline" />
              <StatCard label="Chunks Produced"  value={(() => { const s = report?.pipeline_steps?.steps?.find(s => s.id === "chunk"); return s?.detail?.match(/\d+/)?.[0] ?? "—"; })()} color="#7c3aed" tooltip="Text segments produced by the chunking layer, used for entity extraction" />
            </div>
            {/* 14-step list */}
            {report?.pipeline_steps?.steps && (
              <div className="card">
                <div className="text-[10px] font-bold uppercase tracking-widest text-t3 mb-4">
                  Layer Execution · Source {selectedJob.slice(0, 8)}
                </div>
                <div className="space-y-1.5">
                  {report.pipeline_steps.steps.map((step, i) => (
                    <div key={step.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-bg3 border border-dborder">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                        style={{ background: step.status === "done" ? "#16a34a" : step.status === "error" ? "#e11d48" : "#d97706" }}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-t1">{step.label.replace(/^\d+ · /, "")}</div>
                        {step.detail && <div className="text-[10px] text-t3 mt-0.5">{step.detail}</div>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="h-1 w-20 bg-bg4 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${step.pct}%`, background: step.status === "done" ? "#16a34a" : "#d97706" }} />
                        </div>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${step.status === "done" ? "bg-gg/10 text-gg" : "bg-amber/10 text-amber"}`}>
                          {step.status === "done" ? "✓ ok" : step.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
        {!loading && tab === "overview" && (
          <div className="space-y-5">
            <div className="card">
              <div className="sect mb-4">KPI &amp; Health</div>
              <div className="flex items-center gap-6">
                <Gauge value={avgScore.overall_kg_quality_score ?? 0} label="Overall KG Quality" color={scoreColor(avgScore.overall_kg_quality_score ?? 0)} />
                <div className="flex-1 grid grid-cols-4 gap-3">
                  <StatCard label="Graph Nodes"     value={quality?.graph_metrics?.stats?.node_count ?? nc ?? "—"} color="#4f46e5" tooltip="Canonical nodes in the resolved knowledge graph" />
                  <StatCard label="Edges"           value={totalEdaRelationships} color="#0d9488" tooltip="Total relationships extracted across all source files before canonicalization" />
                  <StatCard label="Density (per-file avg)" value={avgEdaDensity > 0 ? avgEdaDensity.toFixed(4) : "—"} color="#d97706" tooltip="Average graph density across per-file knowledge graphs (edges / nodes²)" />
                  <StatCard label="Sources"         value={report?.file_count ?? "—"} color="#7c3aed" tooltip="Number of source files ingested" />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3 mt-3">
                <StatCard label="Orphan Nodes"       value={ontology?.graph_consistency?.orphan_node_count ?? "—"} color="#e11d48" tooltip="Nodes with no edges — isolated entities not connected to any other entity in the canonical graph" />
                <StatCard label="Ontology Violations" value={ontology?.graph_consistency?.ontology_nonconformant_edges ?? "—"} color={((ontology?.graph_consistency?.ontology_nonconformant_edges ?? 0) > 0) ? "#e11d48" : "#16a34a"} tooltip="Edges that violate the declared ontology relationship constraints" />
                <StatCard label="Avg Entity Confidence" value={edaFiles.length > 0 ? (edaFiles.reduce((s,f) => s + (f.summary?.entity_statistics?.mean_confidence ?? 0), 0) / edaFiles.length).toFixed(3) : "—"} color="#2563eb" tooltip="Average NER extraction confidence across all entities and files" />
                <StatCard label="Low-Conf Edges"     value={quality?.graph_metrics?.active_edge_count != null ? String(quality.graph_metrics.active_edge_count - (quality.graph_metrics.high_risk_edge_ratio * quality.graph_metrics.active_edge_count | 0)) : (links?.rejected_links ?? "—")} color="#d97706" tooltip="Edges with confidence below threshold or rejected during cross-source linking" />
              </div>
            </div>
          </div>
        )}

        {/* ── EXTRACTION ───────────────────────────────────────────────── */}
        {!loading && tab === "extraction" && (
          <div className="space-y-5">
            <div className="card">
              <div className="sect mb-4">Extraction Quality</div>
              <div className="text-[10px] text-t3 mb-3">Parser confidence by source · derived from per-file kg_scorecard.extraction_reliability_score</div>
              <div className="space-y-2">
                {edaFiles.map(f => {
                  const conf = f.scorecard.extraction_reliability_score ?? f.summary?.confidence_scores?.extraction_reliability_score ?? 0;
                  return (
                    <div key={f.file_id} className="flex items-center gap-3">
                      <span className="text-[11px] text-t2 w-44 truncate flex-shrink-0" title={f.file_id}>{f.file_id}</span>
                      <div className="flex-1 h-4 bg-bg3 rounded-sm overflow-hidden border border-dborder">
                        <div className="h-full" style={{ width: `${conf * 100}%`, background: scoreColor(conf) }} />
                      </div>
                      <span className="text-[10px] font-mono text-t2 w-12 text-right">{conf.toFixed(3)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="card">
              <div className="sect mb-4">Extraction Lineage</div>
              <div className="text-[10px] text-t3 mb-3">Per-file extraction output · from pipeline step 6 (Entity + Relationship extraction)</div>
              <table className="w-full text-[11px]">
                <thead><tr className="text-t3 text-left border-b border-dborder">
                  <th className="pb-2 font-semibold">File</th>
                  <th className="pb-2 font-semibold">Adapter</th>
                  <th className="pb-2 font-semibold text-right">Entities</th>
                  <th className="pb-2 font-semibold text-right">Relationships</th>
                  <th className="pb-2 font-semibold text-right">Chunks</th>
                  <th className="pb-2 font-semibold text-right">Low-Conf Entities</th>
                </tr></thead>
                <tbody>
                  {edaFiles.map(f => (
                    <tr key={f.file_id} className="border-b border-dborder/50 hover:bg-bg3 transition-colors">
                      <td className="py-2 text-t1 truncate max-w-[180px]" title={f.file_id}>{f.file_id}</td>
                      <td className="py-2 text-t3">{f.metadata?.adapter ?? f.summary?.source?.adapter ?? "—"}</td>
                      <td className="py-2 text-right font-mono">{f.summary?.entity_statistics?.entity_count ?? "—"}</td>
                      <td className="py-2 text-right font-mono">{f.summary?.relationship_statistics?.relationship_count ?? "—"}</td>
                      <td className="py-2 text-right font-mono">{f.metadata?.statistics?.chunk_count ?? "—"}</td>
                      <td className="py-2 text-right font-mono text-amber">{f.summary?.entity_statistics?.low_confidence_count ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {edaFiles.length === 0 && <p className="text-[11px] text-t3 py-4 text-center">No extraction artifacts found.</p>}
            </div>
          </div>
        )}

        {/* ── METADATA ─────────────────────────────────────────────────── */}
        {!loading && tab === "metadata" && (
          <div className="space-y-4">
            {edaFiles.length === 0 && <div className="card py-10 text-center text-[12px] text-t3">No metadata artifacts found.</div>}
            {edaFiles.map(f => {
              const m = f.metadata;
              const s = m?.statistics;
              return (
                <div key={f.file_id} className="card">
                  <div className="flex items-center gap-3 mb-3 flex-wrap">
                    <div className="text-[13px] font-semibold text-t1">{f.file_id}</div>
                    {m?.doc_type && <span className="apill text-[10px]">Class: {m.doc_type}</span>}
                    {s?.chunk_count != null && <span className="apill text-[10px]">Chunks: {s.chunk_count}</span>}
                    {m?.language?.language && <span className="apill text-[10px]">Lang: {m.language.language.toUpperCase()} ({pct(m.language.confidence ?? 1, 0)} conf)</span>}
                    {m?.structure?.is_structured != null && <span className="apill text-[10px]">{m.structure.is_structured ? "Structured" : "Free text"}</span>}
                  </div>
                  {m?.structure?.sample_headings && m.structure.sample_headings.length > 0 && (
                    <div className="mb-3 text-[10px] text-t3">
                      Sample headings: <span className="text-t2">{m.structure.sample_headings.slice(0, 3).join(" · ")}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: "Words", value: s?.word_count ?? "—", tooltip: "Total word count in the source file" },
                      { label: "Characters", value: s?.char_count ?? "—", tooltip: "Total character count" },
                      { label: "Avg Chunk Words", value: s?.avg_chunk_words?.toFixed(0) ?? "—", tooltip: "Average number of words per chunk produced by the chunker" },
                      { label: "Headings", value: m?.structure?.line_count ?? "—", tooltip: "Number of lines (for documents) or rows (for structured files)" },
                    ].map(x => (
                      <div key={x.label} className="mcard text-center" title={x.tooltip}>
                        <div className="text-[16px] font-bold font-sora text-t1">{x.value}</div>
                        <div className="text-[9px] text-t3 mt-0.5 uppercase tracking-widest">{x.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── EDA ──────────────────────────────────────────────────────── */}
        {!loading && tab === "eda" && (
          <div className="space-y-5">
            {/* Aggregate stats */}
            <div className="card">
              <div className="sect mb-4">Semantic / Graph EDA — Aggregate ({edaFiles.length} source files)</div>
              <div className="grid grid-cols-4 gap-3 mb-4">
                <StatCard label="Total Entities (pre-canonical)" value={totalEdaEntities} color="#4f46e5" tooltip="Sum of entities extracted across all files before canonicalization and deduplication" />
                <StatCard label="Total Relationships"  value={totalEdaRelationships} color="#0d9488" tooltip="Sum of relationships extracted across all files" />
                <StatCard label="Avg Graph Density"   value={avgEdaDensity > 0 ? avgEdaDensity.toFixed(4) : "—"} color="#d97706" tooltip="Average density of per-file knowledge graphs: edges / (nodes × (nodes-1))" />
                <StatCard label="Avg Components"      value={edaFiles.length > 0 ? (edaFiles.reduce((s,f) => s + (f.summary?.graph_metrics?.disconnected_component_count ?? 1), 0) / edaFiles.length).toFixed(1) : "—"} color="#7c3aed" tooltip="Average number of disconnected subgraphs per file (lower = more connected)" />
              </div>

              {/* Entity type distribution aggregated */}
              {(() => {
                const agg: Record<string, number> = {};
                edaFiles.forEach(f => {
                  const g = f.summary?.graph_metrics;
                  if (!g) return;
                });
                // Use canonical graph type counts
                return Object.keys(typeCounts).length > 0 ? (
                  <div className="mb-4">
                    <div className="text-[10px] font-bold text-t3 uppercase tracking-widest mb-2">Entity-type cluster map</div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(typeCounts).sort((a,b) => b[1]-a[1]).map(([type, cnt]) => (
                        <span key={type} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border"
                          style={{ background: nodeColor(type) + "18", color: nodeColor(type), borderColor: nodeColor(type) + "50" }}>
                          <span className="font-bold">{type}</span>: {cnt}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Confidence distribution */}
              {quality?.graph_metrics?.edge_confidence_distribution && (
                <div>
                  <div className="text-[10px] font-bold text-t3 uppercase tracking-widest mb-2">Confidence bands · canonical graph edges</div>
                  <div className="flex gap-4">
                    {Object.entries(quality.graph_metrics.edge_confidence_distribution).map(([level, cnt]) => {
                      const total = Object.values(quality.graph_metrics.edge_confidence_distribution).reduce((a,b) => a+b, 0) || 1;
                      const color = level === "high" ? "#16a34a" : level === "medium" ? "#d97706" : "#e11d48";
                      return (
                        <div key={level} className="flex items-center gap-2 text-[11px]">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                          <span className="capitalize text-t2">{level}: {cnt}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Per-file EDA cards */}
            <div className="grid grid-cols-1 gap-4">
              {edaFiles.map(f => (
                <div key={f.file_id} className="card">
                  <div className="flex items-center gap-3 mb-3 flex-wrap">
                    <div className="text-[12px] font-semibold text-t1">{f.file_id}</div>
                    <span className="apill text-[10px]">{f.metadata?.adapter ?? f.summary?.source?.adapter}</span>
                    <span className="apill text-[10px]">{f.metadata?.source_type ?? f.summary?.source?.source_type}</span>
                  </div>
                  <div className="grid grid-cols-6 gap-2 text-center text-[10px]">
                    {[
                      { l: "Entities",      v: f.summary?.entity_statistics?.entity_count,      color: "#4f46e5" },
                      { l: "Relationships", v: f.summary?.relationship_statistics?.relationship_count, color: "#0d9488" },
                      { l: "Avg Ent Conf",  v: f.summary?.entity_statistics?.mean_confidence?.toFixed(3), color: "#2563eb" },
                      { l: "Avg Rel Conf",  v: f.summary?.relationship_statistics?.mean_confidence?.toFixed(3), color: "#7c3aed" },
                      { l: "Graph Density", v: f.summary?.graph_metrics?.graph_density?.toFixed(4), color: "#d97706" },
                      { l: "Consistency",   v: f.summary?.semantic_quality_metrics?.consistency_score != null ? pct(f.summary.semantic_quality_metrics.consistency_score) : "—", color: scoreColor(f.summary?.semantic_quality_metrics?.consistency_score ?? 0) },
                    ].map(x => (
                      <div key={x.l} className="mcard">
                        <div className="font-bold" style={{ color: x.color }}>{x.v ?? "—"}</div>
                        <div className="text-t3 mt-0.5">{x.l}</div>
                      </div>
                    ))}
                  </div>
                  {(f.summary?.entity_statistics?.duplicate_entities?.length ?? 0) > 0 && (
                    <div className="mt-2 text-[10px] text-amber">
                      ⚠ {f.summary.entity_statistics.duplicate_entities.length} duplicate entities detected
                    </div>
                  )}
                  {(f.summary?.semantic_quality_metrics?.ontology_violations?.length ?? 0) > 0 && (
                    <div className="mt-1 text-[10px] text-coral">
                      ✗ {f.summary.semantic_quality_metrics.ontology_violations.length} ontology violations
                    </div>
                  )}
                </div>
              ))}
              {edaFiles.length === 0 && <div className="card py-10 text-center text-[12px] text-t3">No EDA artifacts found. Run the full ingest pipeline first.</div>}
            </div>
          </div>
        )}

        {/* ── KNOWLEDGE GRAPH ──────────────────────────────────────────── */}
        {!loading && tab === "graph" && (
          <div className="space-y-5">
            {/* Stat row — from canonical_graph + graph_consistency */}
            <div className="grid grid-cols-5 gap-3">
              <StatCard label="Nodes"       value={nc || "—"}  color="#4f46e5" tooltip="Canonical nodes in the resolved knowledge graph (canonical_graph.json)" />
              <StatCard label="Edges"       value={ec || "—"}  color="#0d9488" tooltip="Edges in the canonical graph. Note: cross-file edges may be 0 if no cross-source relationships were validated." />
              <StatCard label="Density"     value={nc > 1 ? canonicalDensity.toFixed(4) : "—"} color="#d97706" tooltip="Graph density: edge_count / (node_count × (node_count−1)). Computed from canonical_graph.json." />
              <StatCard label="Orphan Nodes" value={ontology?.graph_consistency?.orphan_node_count ?? "—"} color="#e11d48" tooltip="Nodes with no edges (graph_consistency.json). High orphan count indicates sparse cross-entity linking." />
              <StatCard label="Communities"  value={Object.keys(commCounts).length || "—"} color="#7c3aed" tooltip="Number of entity communities detected by the community detection algorithm." />
            </div>
            {!graphData || graphData.nodes.length === 0 ? (
              <div className="card flex items-center justify-center py-16 text-center">
                <div><div className="text-[36px] mb-3 opacity-30">⬡</div>
                <p className="text-[13px] text-t3">No graph data yet — complete an ingest pipeline to generate the knowledge graph.</p></div>
              </div>
            ) : layout ? (
              <div className="card overflow-hidden p-0">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-dborder text-[10px] text-t3">
                  <span>Showing {layout.nodes.length}/{graphData.node_count} nodes · {layout.edges.length}/{graphData.edge_count} edges · force-directed · data from canonical_graph.json</span>
                  <span>Hover nodes for details</span>
                </div>
                <div className="relative" style={{ background: "var(--color-bg3,#f4f6fc)" }}>
                  <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className="w-full block" style={{ height: 480 }}>
                    <defs><radialGradient id="qGlow2" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#eef2ff" stopOpacity="0.6"/><stop offset="100%" stopColor="#eef2ff" stopOpacity="0"/></radialGradient></defs>
                    <rect width={layout.width} height={layout.height} fill="url(#qGlow2)" />
                    {layout.edges.map((e, i) => { const s2 = layout.pos[e.source], t = layout.pos[e.target]; if (!s2 || !t) return null; return <line key={i} x1={s2.x} y1={s2.y} x2={t.x} y2={t.y} stroke="#94a3b8" strokeOpacity="0.4" strokeWidth="1.1"><title>{`${s2.label} → ${t.label}`}</title></line>; })}
                    {layout.nodes.map(n => (
                      <g key={n.id} onMouseEnter={() => setHoveredNode(n)} onMouseLeave={() => setHoveredNode(null)} style={{ cursor: "pointer" }}>
                        <circle cx={n.x} cy={n.y} r={n.r + 5} fill={nodeColor(n.type)} opacity="0.10" />
                        <circle cx={n.x} cy={n.y} r={n.r} fill={nodeColor(n.type)} fillOpacity="0.88" stroke="#f8fafc" strokeWidth="1.2"><title>{`${n.label} (${n.type}) · count: ${n.count}`}</title></circle>
                        <rect x={n.x + n.r + 4} y={n.y - 7} width={Math.max(20, (n.labelShort?.length || 0) * 6.2)} height="14" rx="4" fill="rgba(248,250,252,.92)" stroke="rgba(148,163,184,.4)" />
                        <text x={n.x + n.r + 8} y={n.y + 3.5} fontSize="9" fill="#334155" style={{ userSelect: "none" }}>{n.labelShort}</text>
                      </g>
                    ))}
                  </svg>
                  {hoveredNode && (
                    <div className="absolute top-3 right-3 card py-2.5 px-3 text-[11px] pointer-events-none" style={{ minWidth: 160 }}>
                      <div className="font-semibold text-t1 mb-1">{hoveredNode.label}</div>
                      <div className="text-t3">Type: <span className="text-t2">{hoveredNode.type}</span></div>
                      <div className="text-t3">Count: <span className="text-t2">{hoveredNode.count}</span></div>
                      {hoveredNode.community != null && <div className="text-t3">Community: <span className="text-t2">{hoveredNode.community}</span></div>}
                    </div>
                  )}
                  <div className="absolute bottom-3 left-3 card py-2 px-3 flex items-center gap-3 text-[10px]">
                    {[["ORG", "#7c3aed"], ["PERSON", "#d97706"], ["GPE/LOC", "#0d9488"], ["PRODUCT", "#0ea5e9"], ["OTHER", "#2563eb"]].map(([t, c]) => (
                      <span key={t} className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: c }} />{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Per-file graph stats */}
            {edaFiles.length > 0 && (
              <div className="card">
                <div className="sect mb-3">Per-File Graph Statistics · from EDA summaries</div>
                <div className="text-[10px] text-t3 mb-3">Each file's knowledge graph before canonicalization and cross-file merging</div>
                <div className="grid grid-cols-3 gap-2">
                  {edaFiles.map(f => {
                    const gm = f.summary?.graph_metrics;
                    return (
                      <div key={f.file_id} className="bg-bg3 rounded-sm p-3 border border-dborder">
                        <div className="text-[11px] font-semibold text-t1 mb-2 truncate">{f.file_id}</div>
                        <div className="text-[10px] space-y-1">
                          <div className="flex justify-between"><span className="text-t3">Nodes</span><span className="font-mono text-t2">{gm?.node_count ?? "—"}</span></div>
                          <div className="flex justify-between"><span className="text-t3">Edges</span><span className="font-mono text-t2">{gm?.edge_count ?? "—"}</span></div>
                          <div className="flex justify-between"><span className="text-t3">Density</span><span className="font-mono text-t2">{gm?.graph_density?.toFixed(4) ?? "—"}</span></div>
                          <div className="flex justify-between"><span className="text-t3">Components</span><span className="font-mono text-t2">{gm?.disconnected_component_count ?? "—"}</span></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Entity type + community breakdown */}
            <div className="grid grid-cols-2 gap-4">
              <div className="card">
                <div className="sect mb-3">Entity Type Breakdown · canonical graph nodes</div>
                {Object.entries(typeCounts).sort((a,b) => b[1]-a[1]).map(([type, cnt]) => (
                  <div key={type} className="mb-2">
                    <div className="flex justify-between text-[11px] text-t2 mb-1"><span>{type}</span><span>{cnt} ({Math.round(cnt/typeTotal*100)}%)</span></div>
                    <div className="prog-bar"><div className="prog-fill" style={{ width: `${(cnt/typeTotal)*100}%`, background: nodeColor(type) }} /></div>
                  </div>
                ))}
                {Object.keys(typeCounts).length === 0 && <p className="text-[11px] text-t3">No graph data.</p>}
              </div>
              <div className="card">
                <div className="sect mb-3">Community Breakdown · detected by community algorithm</div>
                {Object.entries(commCounts).sort((a,b) => b[1]-a[1]).slice(0, 10).map(([comm, cnt]) => (
                  <div key={comm} className="mb-2">
                    <div className="flex justify-between text-[11px] text-t2 mb-1"><span>Community {comm}</span><span>{cnt} nodes ({Math.round(cnt/nc*100)}%)</span></div>
                    <div className="prog-bar"><div className="prog-fill" style={{ width: `${(cnt/nc)*100}%` }} /></div>
                  </div>
                ))}
                {Object.keys(commCounts).length === 0 && <p className="text-[11px] text-t3">No community data assigned.</p>}
              </div>
            </div>

            {/* Registry metrics */}
            {quality?.registry_metrics && (
              <div className="card">
                <div className="sect mb-3">Entity Registry · from canonicalization layer</div>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Canonical nodes",     value: quality.registry_metrics.canonical_node_count,  color: "#4f46e5", tip: "Entities that have been canonicalized (deduplicated and merged)" },
                    { label: "Total aliases",        value: quality.registry_metrics.total_alias_count,     color: "#0d9488", tip: "Sum of all alias mappings pointing to canonical entities" },
                    { label: "Pending reviews",      value: quality.registry_metrics.pending_review_count,  color: "#d97706", tip: "Entity mentions awaiting human review for correct canonical mapping" },
                    { label: "Resolved",             value: quality.registry_metrics.resolved_review_count, color: "#16a34a", tip: "Entity mentions that have been reviewed and resolved" },
                  ].map(s => (
                    <div key={s.label} className="mcard text-center" title={s.tip}>
                      <div className="font-sora text-[20px] font-bold" style={{ color: s.color }}>{s.value ?? "—"}</div>
                      <div className="text-[10px] text-t3 mt-1 uppercase tracking-widest">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CONFIDENCE ───────────────────────────────────────────────── */}
        {!loading && tab === "confidence" && (
          <div className="space-y-5">
            <div className="card">
              <div className="flex items-center justify-between mb-1">
                <div className="sect">Semantic Confidence Heatmap</div>
                <div className="text-[10px] text-t3">entity × pipeline layer · from per-file kg_scorecards</div>
              </div>
              <div className="text-[10px] text-t3 mb-4">Each cell is the computed score for that file at that pipeline layer. Green ≥ 0.8 · Orange ≥ 0.6 · Red &lt; 0.6</div>
              {edaFiles.length === 0 ? (
                <p className="text-[11px] text-t3 py-6 text-center">No scorecard data found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="text-[10px] w-full">
                    <thead>
                      <tr className="text-t3">
                        <th className="text-left py-1 px-2 font-semibold">File</th>
                        {["Overall", "Completeness", "Consistency", "Confidence", "Graph Trust", "Retrieval", "Semantic Coh.", "Canonical Res.", "Extraction"].map(h => (
                          <th key={h} className="py-1 px-1 font-semibold whitespace-nowrap" title={h}>{h.slice(0, 8)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {edaFiles.map(f => {
                        const sc = f.scorecard;
                        const vals = [
                          sc.overall_kg_quality_score, sc.completeness_score, sc.consistency_score,
                          sc.confidence_score, sc.graph_trust_score, sc.retrieval_readiness_score,
                          sc.semantic_coherence_score, sc.canonical_resolution_score, sc.extraction_reliability_score,
                        ];
                        return (
                          <tr key={f.file_id} className="border-t border-dborder/50 hover:bg-bg3">
                            <td className="py-1 px-2 text-t2 truncate max-w-[140px]" title={f.file_id}>{f.file_id}</td>
                            {vals.map((v, i) => {
                              const n2 = v ?? 0;
                              const bg = n2 >= 0.8 ? "#16a34a20" : n2 >= 0.6 ? "#d9770620" : "#e11d4820";
                              const tc = n2 >= 0.8 ? "#16a34a" : n2 >= 0.6 ? "#d97706" : "#e11d48";
                              return (
                                <td key={i} className="py-1 px-1 text-center font-mono rounded" style={{ background: bg, color: tc }}>
                                  {v != null ? n2.toFixed(2) : "—"}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {/* Averaged scorecard */}
            {scorecards.length > 0 && (
              <div className="card">
                <div className="sect mb-4">Averaged Quality Scorecard ({scorecards.length} files)</div>
                <div className="grid grid-cols-2 gap-x-8">
                  {[
                    { k: "overall_kg_quality_score",     l: "Overall KG Quality",       tip: "Composite score: completeness + consistency + confidence + trust + semantic coherence + canonical resolution + extraction reliability" },
                    { k: "completeness_score",           l: "Completeness",              tip: "Fraction of expected entities and relationships that were successfully extracted" },
                    { k: "consistency_score",            l: "Consistency",               tip: "How free the graph is from contradictions, duplicate relationships, and semantic inconsistencies" },
                    { k: "confidence_score",             l: "Extraction Confidence",     tip: "Average NER extraction confidence across all entities and relationships" },
                    { k: "graph_trust_score",            l: "Graph Trust",               tip: "Composite graph quality: density, connectivity, low-confidence edge ratio" },
                    { k: "retrieval_readiness_score",    l: "Retrieval Readiness",       tip: "How suitable the knowledge graph is for retrieval-augmented generation (RAG)" },
                    { k: "semantic_coherence_score",     l: "Semantic Coherence",        tip: "Alignment of extracted entities and relationships with the ontology and domain concepts" },
                    { k: "canonical_resolution_score",   l: "Canonical Resolution",      tip: "Fraction of extracted entities successfully resolved to canonical identifiers" },
                    { k: "extraction_reliability_score", l: "Extraction Reliability",    tip: "Parser reliability score (1.0 = all content extracted without errors or truncation)" },
                  ].map(({ k, l, tip }) => (
                    <ScoreBar key={k} label={l} value={avgScore[k] ?? 0} tooltip={tip} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── VALIDATION & TRUST ───────────────────────────────────────── */}
        {!loading && tab === "trust" && (
          <div className="space-y-5">
            <div className="card">
              <div className="sect mb-4">ML Validation</div>
              <div className="flex flex-wrap gap-8 mb-6">
                <Gauge value={avgScore.graph_trust_score ?? 0} label="Graph Trust" />
                <Gauge value={1 - (quality?.graph_metrics?.high_risk_edge_ratio ?? 0)} label="Hallucination Risk (inv.)" color={scoreColor(1 - (quality?.graph_metrics?.high_risk_edge_ratio ?? 0))} />
                <Gauge value={avgScore.overall_kg_quality_score ?? 0} label="Overall Quality" />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-[10px] font-bold text-t3 uppercase tracking-widest mb-3">Entity metrics · from EDA</div>
                  {edaFiles.slice(0, 5).map(f => {
                    const es = f.summary?.entity_statistics;
                    if (!es) return null;
                    const total = es.entity_count || 1;
                    return (
                      <div key={f.file_id} className="mb-2">
                        <div className="text-[10px] text-t2 mb-1 truncate">{f.file_id}</div>
                        <div className="flex gap-2 text-[9px] flex-wrap">
                          <span className="apill">Count: {es.entity_count}</span>
                          <span className="apill">Low-conf: {es.low_confidence_count}</span>
                          <span className="apill">Duplicates: {es.duplicate_entities?.length ?? 0}</span>
                          <span className="apill">Conf avg: {es.mean_confidence?.toFixed(3)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div>
                  <div className="text-[10px] font-bold text-t3 uppercase tracking-widest mb-3">Relationship metrics · from EDA</div>
                  {edaFiles.slice(0, 5).map(f => {
                    const rs = f.summary?.relationship_statistics;
                    if (!rs) return null;
                    return (
                      <div key={f.file_id} className="mb-2">
                        <div className="text-[10px] text-t2 mb-1 truncate">{f.file_id}</div>
                        <div className="flex gap-2 text-[9px] flex-wrap">
                          <span className="apill">Count: {rs.relationship_count}</span>
                          <span className="apill">Low-conf: {rs.low_confidence_count}</span>
                          <span className="apill">Weak: {rs.weak_edges?.length ?? 0}</span>
                          <span className="apill">Conf avg: {rs.mean_confidence?.toFixed(3)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="sect mb-4">AI Trust Command Center</div>
              <div className="grid grid-cols-4 gap-4 mb-4">
                <Gauge value={avgScore.graph_trust_score ?? 0} label="Graph Trust" />
                <Gauge value={avgScore.canonical_resolution_score ?? 0} label="Canonical Resolution" />
                <Gauge value={1 - (quality?.graph_metrics?.high_risk_edge_ratio ?? 0)} label="Edge Safety" />
                <Gauge value={avgScore.extraction_reliability_score ?? 0} label="Extraction Reliability" color="#16a34a" />
              </div>
              <div className="text-center border-t border-dborder pt-4">
                <div className="text-[10px] text-t3 uppercase tracking-widest mb-1">Enterprise AI Readiness</div>
                {(() => {
                  const score = Math.round(((avgScore.overall_kg_quality_score ?? 0) * 100));
                  const label = score >= 80 ? "Production Ready" : score >= 60 ? "Review Recommended" : "Improvements Needed";
                  const color = score >= 80 ? "#16a34a" : score >= 60 ? "#d97706" : "#e11d48";
                  return (
                    <>
                      <div className="text-[28px] font-bold font-sora" style={{ color }}>{score}</div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full border font-semibold" style={{ color, borderColor: color, background: color + "18" }}>{label}</span>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ── GOVERNANCE & ONTOLOGY ────────────────────────────────────── */}
        {!loading && tab === "ontology" && (
          <div className="space-y-5">
            <div className="card">
              <div className="sect mb-4">Governance Verdicts · from graph_consistency.json</div>
              {ontology?.graph_consistency ? (
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-[10px] text-t3 mb-3">Verdict distribution</div>
                    <div className="space-y-2">
                      {[
                        { label: "Referential integrity OK", value: ontology.graph_consistency.referential_integrity.valid ? "✓" : "✗", color: ontology.graph_consistency.referential_integrity.valid ? "#16a34a" : "#e11d48", tip: "All edge source/target IDs exist as node IDs" },
                        { label: "Dangling edges",     value: ontology.graph_consistency.dangling_edges, color: ontology.graph_consistency.dangling_edges > 0 ? "#e11d48" : "#16a34a", tip: "Edges whose source or target node was removed during canonicalization" },
                        { label: "Self loops",         value: ontology.graph_consistency.self_loops, color: ontology.graph_consistency.self_loops > 0 ? "#d97706" : "#16a34a", tip: "Edges where source and target are the same entity" },
                        { label: "Ontology violations", value: ontology.graph_consistency.ontology_nonconformant_edges, color: ontology.graph_consistency.ontology_nonconformant_edges > 0 ? "#e11d48" : "#16a34a", tip: "Edges that violate the declared relation type constraints (e.g. wrong domain/range)" },
                        { label: "Orphan nodes",       value: ontology.graph_consistency.orphan_node_count, color: ontology.graph_consistency.orphan_node_count > 0 ? "#d97706" : "#16a34a", tip: "Nodes with no edges — isolated entities not connected to any other entity" },
                      ].map(x => (
                        <div key={x.label} className="flex justify-between items-center px-3 py-2 rounded bg-bg3 border border-dborder">
                          <span className="text-[11px] text-t2 flex items-center gap-1">{x.label} <span className="text-t3 cursor-help" title={x.tip}>ⓘ</span></span>
                          <span className="font-semibold text-[12px] font-mono" style={{ color: x.color }}>{x.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-t3 mb-3">Cross-source links · from links/{selectedJob.slice(0,8)}/metrics</div>
                    {links ? (
                      <div className="space-y-2">
                        {[
                          { label: "Source artifacts",  value: links.source_artifact_count, color: "#4f46e5", tip: "Number of source files evaluated for cross-source linking" },
                          { label: "Accepted links",    value: links.accepted_links,  color: "#16a34a", tip: "Cross-source entity links accepted by the lexical+embedding gate" },
                          { label: "Rejected links",    value: links.rejected_links,  color: "#e11d48", tip: "Cross-source links rejected (below accept threshold)" },
                          { label: "Pending review",    value: links.pending_links,   color: "#d97706", tip: "Links in the review queue (between review_threshold and accept_threshold)" },
                        ].map(x => (
                          <div key={x.label} className="flex justify-between items-center px-3 py-2 rounded bg-bg3 border border-dborder">
                            <span className="text-[11px] text-t2 flex items-center gap-1">{x.label} <span className="text-t3 cursor-help" title={x.tip}>ⓘ</span></span>
                            <span className="font-semibold text-[12px] font-mono" style={{ color: x.color }}>{x.value}</span>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-[11px] text-t3">No links metrics available.</p>}
                  </div>
                </div>
              ) : <p className="text-[11px] text-t3">No graph consistency data found.</p>}
            </div>

            {ontology?.ontology && (
              <div className="card">
                <div className="sect mb-4">Ontology (Taxonomy + Relationship Constraints) · from ontology.json</div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-[10px] font-bold text-t3 uppercase tracking-widest mb-3">Entity taxonomy</div>
                    <div className="flex flex-wrap gap-1.5">
                      {ontology.ontology.entity_types.map(et => (
                        <span key={et} className="text-[10px] px-2 py-1 rounded border font-mono"
                          style={{ background: nodeColor(et.toLowerCase()) + "18", color: nodeColor(et.toLowerCase()), borderColor: nodeColor(et.toLowerCase()) + "50" }}>
                          {et}
                        </span>
                      ))}
                    </div>
                    {Object.keys(ontology.ontology.proposed_entity_types ?? {}).length > 0 && (
                      <div className="mt-3">
                        <div className="text-[10px] text-t3 mb-1">Proposed new types (from pipeline)</div>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(ontology.ontology.proposed_entity_types).map(([t, cnt]) => (
                            <span key={t} className="text-[10px] px-2 py-1 rounded border border-amber/30 bg-amber/5 text-amber font-mono">
                              {t} ({cnt}×)
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-t3 uppercase tracking-widest mb-3">Relationship constraints</div>
                    <div className="flex flex-wrap gap-1.5">
                      {ontology.ontology.allowed_relations.map(r => (
                        <span key={r} className="text-[10px] px-2 py-1 rounded bg-accent/5 border border-accent/20 text-accent font-mono">{r}</span>
                      ))}
                    </div>
                    {Object.keys(ontology.ontology.proposed_relations ?? {}).length > 0 && (
                      <div className="mt-3">
                        <div className="text-[10px] text-t3 mb-1">Proposed new relations (from pipeline)</div>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(ontology.ontology.proposed_relations).map(([r, cnt]) => (
                            <span key={r} className="text-[10px] px-2 py-1 rounded border border-gg/30 bg-gg/5 text-gg font-mono">
                              {r} ({cnt}×)
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="text-[10px] text-t3 mt-3">Domain: <span className="text-t2 font-mono">{ontology.ontology.domain_label}</span></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── WIKI ─────────────────────────────────────────────────────── */}
        {!loading && tab === "wiki" && (
          <div className="space-y-4">
            {/* Stats bar */}
            {wikiStats && (
              <div className="grid grid-cols-4 gap-3">
                <StatCard label="Wiki Articles"      value={wikiStats.total_articles}     color="#4f46e5" tooltip="Total wiki articles generated, one per canonical entity" />
                <StatCard label="Graph Articles"     value={wikiStats.graphify_articles}  color="#0d9488" tooltip="Articles generated from knowledge graph entity data" />
                <StatCard label="Schema Articles"    value={wikiStats.schema_articles}    color="#7c3aed" tooltip="Articles generated from structured schema/column metadata" />
                <StatCard label="Pipeline Status"    value={wiki?.pipeline_status === "graph_done" ? "Complete" : (wiki?.pipeline_status ?? "—")} color="#16a34a" tooltip="Current status of the wiki generation pipeline" />
              </div>
            )}
            {/* Article cards */}
            {wiki?.articles && wiki.articles.length > 0 ? (
              <>
                <div className="text-[11px] text-t3">
                  Showing {wiki.articles.length} articles · one per canonical entity · from wiki_pages/ directory
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {wiki.articles.slice(0, 120).map((a, i) => (
                    <div key={i} className="bg-bg3 border border-dborder rounded-card p-3 hover:border-accent/30 transition-colors">
                      <div className="text-[12px] font-semibold text-t1 truncate" title={a.title}>{a.title}</div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md"
                          style={{ background: nodeColor(a.entity_type) + "18", color: nodeColor(a.entity_type), border: `1px solid ${nodeColor(a.entity_type)}50` }}>
                          {a.entity_type}
                        </span>
                        {a.community_id >= 0 && (
                          <span className="text-[9px] font-mono px-1 py-0.5 rounded text-t3">comm {a.community_id}</span>
                        )}
                        {a.aliases?.length > 1 && (
                          <span className="text-[9px] text-t3">+{a.aliases.length - 1} alias</span>
                        )}
                      </div>
                      {a.content && a.content.length > 50 && (
                        <p className="text-[10px] text-t3 mt-1.5 line-clamp-2 leading-relaxed">{a.content.slice(0, 120)}…</p>
                      )}
                      {a.sources && a.sources.length > 0 && (
                        <div className="text-[9px] text-t3 mt-1">Sources: {a.sources.length}</div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="card py-10 text-center"><p className="text-[12px] text-t3">No wiki articles found. Run the full ingest pipeline to generate wiki content.</p></div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
