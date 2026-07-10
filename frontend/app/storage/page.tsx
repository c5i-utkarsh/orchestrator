"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface SLMInfo {
  model_id: string;
  display_name: string | null;
  ollama_model_name: string | null;
  size_bytes: number;
  created_at: string;
  last_used_at: string;
}

interface ProjectStorage {
  job_id: string;
  project_name: string;
  domain_label: string;
  file_count: number;
  corpus_size_bytes: number;
  slm_size_bytes: number;
  total_size_bytes: number;
  slms: SLMInfo[];
  created_at: string;
}

interface StorageOverview {
  projects: ProjectStorage[];
  totals: { corpus_bytes: number; slm_bytes: number; total_bytes: number };
}

type SortKey = "name" | "total" | "corpus" | "slm" | "updated" | "display_name";
type FilterKey = "all" | "projects" | "models" | "large" | "orphaned";

function fmtBytes(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtDate(iso: string): string {
  if (!iso || iso === "None") return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}

const LARGE_THRESHOLD = 500 * 1024 * 1024;

export default function StoragePage() {
  const router = useRouter();
  const [data, setData] = useState<StorageOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmMultiDelete, setConfirmMultiDelete] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");

  const API = process.env.NEXT_PUBLIC_API_URL ?? "";

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/api/v1/data/storage`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      setData(await res.json());
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (jobId: string) => {
    setDeleting(prev => new Set([...prev, jobId]));
    setConfirmDelete(null);
    try {
      await fetch(`${API}/api/v1/data/project/${jobId}`, { method: "DELETE" });
      setSelected(prev => { const n = new Set(prev); n.delete(jobId); return n; });
      await load();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setDeleting(prev => { const n = new Set(prev); n.delete(jobId); return n; });
    }
  };

  const handleMultiDelete = async () => {
    setConfirmMultiDelete(false);
    const ids = [...selected];
    for (const id of ids) {
      setDeleting(prev => new Set([...prev, id]));
      try { await fetch(`${API}/api/v1/data/project/${id}`, { method: "DELETE" }); } catch { /**/ }
      setDeleting(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
    setSelected(new Set());
    await load();
  };

  const toggleExpand = (jobId: string) => {
    setExpanded(prev => { const n = new Set(prev); n.has(jobId) ? n.delete(jobId) : n.add(jobId); return n; });
  };
  const toggleSelect = (jobId: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(jobId) ? n.delete(jobId) : n.add(jobId); return n; });
  };
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a); else { setSortKey(key); setSortAsc(true); }
  };

  const projects = data?.projects ?? [];
  const filtered = projects.filter(p => {
    const q = search.toLowerCase();
    if (q && !p.project_name.toLowerCase().includes(q) &&
        !p.domain_label.toLowerCase().includes(q) &&
        !p.slms.some(s => (s.display_name ?? "").toLowerCase().includes(q) || s.model_id.toLowerCase().includes(q)))
      return false;
    if (filter === "models") return p.slms.length > 0;
    if (filter === "large") return p.total_size_bytes >= LARGE_THRESHOLD;
    if (filter === "orphaned") return p.slms.length === 0 && p.corpus_size_bytes === 0;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "name") cmp = a.project_name.localeCompare(b.project_name);
    else if (sortKey === "total") cmp = a.total_size_bytes - b.total_size_bytes;
    else if (sortKey === "corpus") cmp = a.corpus_size_bytes - b.corpus_size_bytes;
    else if (sortKey === "slm") cmp = a.slm_size_bytes - b.slm_size_bytes;
    else if (sortKey === "updated") cmp = (a.created_at ?? "").localeCompare(b.created_at ?? "");
    else if (sortKey === "display_name") {
      const dn = (p: ProjectStorage) => p.slms[0]?.display_name ?? "";
      cmp = dn(a).localeCompare(dn(b));
    }
    return sortAsc ? cmp : -cmp;
  });

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button onClick={() => toggleSort(k)}
      className={`flex items-center gap-1 text-[11px] font-semibold transition-colors ${sortKey === k ? "text-accent" : "text-t3 hover:text-t2"}`}>
      {label}{sortKey === k && <span className="text-[9px]">{sortAsc ? "↑" : "↓"}</span>}
    </button>
  );

  const FILTER_CHIPS: { key: FilterKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "projects", label: "Projects" },
    { key: "models", label: "With Models" },
    { key: "large", label: "Large (>500 MB)" },
    { key: "orphaned", label: "Orphaned" },
  ];

  return (
    <div className="min-h-screen bg-bg text-t1">
      <div className="max-w-6xl mx-auto px-8 py-10">

        {/* Header */}
        <div className="bg-white border-b border-dborder px-8 py-5 mb-6 -mx-6 -mt-10">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[11px] font-semibold text-t3 uppercase tracking-widest">System</span>
              </div>
              <h1 className="text-[20px] font-semibold text-t1 tracking-tight">Storage Manager</h1>
              <p className="text-[13px] text-t3 mt-0.5">Disk usage per project — corpus files, GGUF models, and Ollama deployments.</p>
            </div>
            <button onClick={load} className="btn btn-sm" disabled={loading}>
              {loading ? "Loading…" : "↺ Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-[12px] text-red-400">{error}</div>
        )}

        {/* Disk Usage Summary */}
        <div className="bg-card border border-dborder rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] font-bold uppercase tracking-widest text-t3">Disk Usage Summary</div>
            <div className="text-[11px] text-t3">Capacity: <span className="text-t2 font-medium">Unknown Capacity</span></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Corpus", bytes: data?.totals.corpus_bytes ?? 0, icon: "📁", color: "text-accent" },
              { label: "Total SLM/GGUF", bytes: data?.totals.slm_bytes ?? 0, icon: "🧠", color: "text-emerald-400" },
              { label: "Grand Total Used", bytes: data?.totals.total_bytes ?? 0, icon: "💾", color: "text-t1" },
            ].map(t => (
              <div key={t.label} className="bg-bg3 border border-dborder rounded-lg px-4 py-3">
                <div className="text-lg mb-1">{t.icon}</div>
                <div className={`text-[18px] font-bold ${t.color}`}>{fmtBytes(t.bytes)}</div>
                <div className="text-[10px] text-t3 uppercase tracking-wider">{t.label}</div>
              </div>
            ))}
          </div>
          {data && (data.totals.corpus_bytes + data.totals.slm_bytes) > 0 && (
            <div className="mt-4">
              <div className="h-2 rounded-full bg-bg3 overflow-hidden flex">
                <div className="h-full bg-accent/70 transition-all"
                  style={{ width: `${(data.totals.corpus_bytes / (data.totals.corpus_bytes + data.totals.slm_bytes)) * 100}%` }} />
                <div className="h-full bg-emerald-400/70 transition-all"
                  style={{ width: `${(data.totals.slm_bytes / (data.totals.corpus_bytes + data.totals.slm_bytes)) * 100}%` }} />
              </div>
              <div className="flex gap-4 mt-1.5 text-[10px] text-t3">
                <span><span className="inline-block w-2 h-2 rounded-sm bg-accent/70 mr-1" />Corpus</span>
                <span><span className="inline-block w-2 h-2 rounded-sm bg-emerald-400/70 mr-1" />SLM/GGUF</span>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-t3 text-[11px]">🔍</span>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search projects or models…"
              className="w-full bg-bg3 border border-dborder rounded-lg pl-8 pr-3 py-1.5 text-[12px] text-t1 placeholder:text-t3 outline-none focus:border-accent transition-colors" />
            {search && <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-t3 hover:text-t1 text-[11px]">✕</button>}
          </div>
          {selected.size > 0 && (
            <button onClick={() => setConfirmMultiDelete(true)}
              className="text-[11px] px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors font-semibold">
              🗑 Delete {selected.size} Selected
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          {FILTER_CHIPS.map(chip => (
            <button key={chip.key} onClick={() => setFilter(chip.key)}
              className={`text-[11px] px-3 py-1 rounded-full border transition-colors font-medium ${
                filter === chip.key ? "bg-accent/15 border-accent/50 text-accent" : "bg-bg3 border-dborder text-t3 hover:border-accent/30 hover:text-t2"
              }`}>
              {chip.label}
            </button>
          ))}
          <span className="text-[10px] text-t3 ml-auto">{sorted.length} project{sorted.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Multi-delete confirm */}
        {confirmMultiDelete && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-card border border-red-500/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
              <div className="text-[15px] font-semibold text-t1 mb-2">Delete {selected.size} projects?</div>
              <div className="text-[12px] text-t3 mb-4">This permanently removes all selected projects, their corpora, SLM models, and Ollama deployments. This cannot be undone.</div>
              <div className="flex gap-3">
                <button onClick={() => setConfirmMultiDelete(false)} className="btn flex-1 border border-dborder2 text-t2">Cancel</button>
                <button onClick={handleMultiDelete} className="flex-1 px-4 py-2 rounded-xl bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 transition-colors">Delete All</button>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => <div key={i} className="h-16 bg-card border border-dborder rounded-xl animate-pulse" />)}
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16 text-t3 text-[13px]">No projects found.</div>
        ) : (
          <>
            <div className="hidden sm:flex items-center gap-3 px-4 py-2 text-t3 border-b border-dborder mb-1">
              <div className="w-4 flex-shrink-0" />
              <div className="w-4 flex-shrink-0" />
              <div className="flex-1"><SortBtn k="name" label="Project" /></div>
              <div className="w-24 text-right"><SortBtn k="corpus" label="Corpus" /></div>
              <div className="w-20 text-right"><SortBtn k="slm" label="GGUF" /></div>
              <div className="w-20 text-right"><SortBtn k="total" label="Total" /></div>
              <div className="w-28 text-right"><SortBtn k="updated" label="Created" /></div>
              <div className="w-28" />
            </div>

            <div className="space-y-2">
              {sorted.map(proj => (
                <div key={proj.job_id} className={`bg-card border rounded-xl overflow-hidden transition-colors ${selected.has(proj.job_id) ? "border-accent/50" : "border-dborder"}`}>
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <input type="checkbox" checked={selected.has(proj.job_id)} onChange={() => toggleSelect(proj.job_id)}
                      className="w-4 h-4 accent-accent flex-shrink-0 cursor-pointer" />
                    <button onClick={() => toggleExpand(proj.job_id)} className="text-t3 hover:text-accent text-sm flex-shrink-0 w-4">
                      {expanded.has(proj.job_id) ? "▾" : "▸"}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-t1 truncate">{proj.project_name}</div>
                      <div className="text-[10px] text-t3 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{proj.domain_label}</span>
                        <span>·</span>
                        <span>{proj.file_count} file{proj.file_count !== 1 ? "s" : ""}</span>
                        {proj.slms.length > 0 && <><span>·</span><span className="text-emerald-400">🧠 {proj.slms.length} SLM{proj.slms.length !== 1 ? "s" : ""}</span></>}
                        {proj.slms[0]?.display_name && <><span>·</span><span className="text-accent font-medium">{proj.slms[0].display_name}</span></>}
                      </div>
                    </div>
                    <div className="hidden sm:flex gap-4 text-right flex-shrink-0 items-center">
                      <div>
                        <div className="text-[12px] font-semibold text-t1">{fmtBytes(proj.corpus_size_bytes)}</div>
                        <div className="text-[9px] text-t3 uppercase tracking-wider">Corpus</div>
                      </div>
                      <div>
                        <div className="text-[12px] font-semibold text-t1">{fmtBytes(proj.slm_size_bytes)}</div>
                        <div className="text-[9px] text-t3 uppercase tracking-wider">GGUF</div>
                      </div>
                      <div>
                        <div className="text-[12px] font-bold text-accent">{fmtBytes(proj.total_size_bytes)}</div>
                        <div className="text-[9px] text-t3 uppercase tracking-wider">Total</div>
                      </div>
                      <div className="hidden md:block w-24 text-right">
                        <div className="text-[11px] text-t3">{fmtDate(proj.created_at)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => { sessionStorage.setItem("job_id", proj.job_id); router.push("/query"); }}
                        className="text-[10px] px-2.5 py-1 border border-dborder rounded-lg text-t3 hover:text-accent hover:border-accent/30 transition-colors">
                        Query
                      </button>
                      {confirmDelete === proj.job_id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleDelete(proj.job_id)} disabled={deleting.has(proj.job_id)}
                            className="text-[10px] px-2.5 py-1 bg-red-500/10 border border-red-500/40 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors">
                            {deleting.has(proj.job_id) ? "…" : "Confirm"}
                          </button>
                          <button onClick={() => setConfirmDelete(null)} className="text-[10px] px-2 py-1 text-t3 hover:text-t1">✕</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDelete(proj.job_id)} disabled={deleting.has(proj.job_id)}
                          className="text-[10px] px-2.5 py-1 border border-red-500/20 text-red-400/70 rounded-lg hover:border-red-500/50 hover:text-red-400 transition-colors disabled:opacity-40">
                          {deleting.has(proj.job_id) ? "Deleting…" : "Delete"}
                        </button>
                      )}
                    </div>
                  </div>

                  {expanded.has(proj.job_id) && (
                    <div className="border-t border-dborder px-5 py-3 bg-bg3">
                      {proj.slms.length === 0 ? (
                        <div className="text-[11px] text-t3">No SLM built for this project.</div>
                      ) : (
                        <div className="space-y-2">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-2">SLM Models</div>
                          {proj.slms.map(slm => (
                            <div key={slm.model_id} className="flex items-center gap-3 text-[11px]">
                              <span className="text-lg">🧠</span>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-t1">{slm.display_name || slm.model_id}</div>
                                {slm.ollama_model_name && <div className="text-t3 font-mono text-[10px]">ollama: {slm.ollama_model_name}</div>}
                                <div className="text-t3 text-[10px]">
                                  Created {fmtDate(slm.created_at)}
                                  {slm.last_used_at && slm.last_used_at !== "None" && ` · Last used ${fmtDate(slm.last_used_at)}`}
                                </div>
                              </div>
                              <div className="text-[12px] font-semibold text-t1 flex-shrink-0">{fmtBytes(slm.size_bytes)}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
