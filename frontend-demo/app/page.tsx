"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { setSession as saveSession, goToStage, nextStageAfterInformation } from "./lib/session";

const DOMAIN_PRESETS = [
  { id: "manufacturing",  label: "Manufacturing",   icon: "🏭", desc: "Production, supply chain, quality control" },
  { id: "it-industry",    label: "IT Industry",     icon: "💻", desc: "Software, infrastructure, DevOps" },
  { id: "healthcare",     label: "Healthcare",      icon: "🏥", desc: "Clinical, patient care, medical devices" },
  { id: "finance",        label: "Finance",         icon: "💹", desc: "Banking, investment, risk management" },
  { id: "legal",          label: "Legal",           icon: "⚖️",  desc: "Contracts, compliance, case research" },
  { id: "retail",         label: "Retail",          icon: "🛍️",  desc: "E-commerce, inventory, customer data" },
  { id: "logistics",      label: "Logistics",       icon: "🚚", desc: "Supply chain, fleet, warehouse ops" },
  { id: "energy",         label: "Energy",          icon: "⚡", desc: "Oil & gas, renewables, grid management" },
  { id: "pharma",         label: "Pharma",          icon: "💊", desc: "Drug development, regulatory, trials" },
  { id: "research",       label: "Research",        icon: "🔬", desc: "Scientific analysis, literature review" },
  { id: "custom",         label: "Other / Custom",  icon: "🗂️",  desc: "Enter your own domain below" },
];

interface DBCredentials {
  db_type: string; host: string; port: number;
  database: string; username: string; password: string;
}

interface StoredCorpus {
  job_id: string; domain_label: string;
  project_name?: string;
  file_count: number; entity_count: number;
  community_count?: number; version?: number;
  file_list?: Array<{name: string; size: number; added_at: string}>;
  created_at: string | null;
}

const DOMAIN_ICONS: Record<string, string> = {
  manufacturing: "\u{1F3ED}", "it-industry": "\u{1F4BB}", "it industry": "\u{1F4BB}",
  software: "\u{1F4BB}", healthcare: "\u{1F3E5}", medical: "\u{1F3E5}",
  finance: "\u{1F4C9}", banking: "\u{1F4C9}", legal: "\u2696\uFE0F",
  law: "\u2696\uFE0F", retail: "\u{1F6CD}\uFE0F", education: "\u{1F393}",
  logistics: "\u{1F69A}", supply: "\u{1F69A}", energy: "\u26A1",
  pharma: "\u{1F48A}", pharmaceutical: "\u{1F48A}", research: "\u{1F52C}",
  science: "\u{1F52C}",
};
function domainIcon(label: string): string {
  const key = label.toLowerCase();
  for (const [k, v] of Object.entries(DOMAIN_ICONS)) { if (key.includes(k)) return v; }
  return "\u{1F5C2}\uFE0F";
}
function domainLabel(label: string): string {
  return label.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function WorkspacePage() {
  const router = useRouter();
  const [selectedDomain, setSelectedDomain] = useState("");
  const [customDomain, setCustomDomain]     = useState("");
  const [projectName, setProjectName]       = useState("");
  const [projectNameEdited, setProjectNameEdited] = useState(false);
  const [session, setSession]               = useState({ business_unit: "", description: "", industry: "", tags: "" });
  const [files, setFiles]                   = useState<File[]>([]);
  const [dbOpen, setDbOpen]                 = useState(false);
  const [dbCreds, setDbCreds]               = useState<DBCredentials>({
    db_type: "", host: "localhost", port: 5432,
    database: "", username: "", password: "",
  });
  const [schemaPreview, setSchemaPreview]   = useState<string | null>(null);
  const [isConnecting, setIsConnecting]     = useState(false);
  const [isSubmitting, setIsSubmitting]     = useState(false);
  const [error, setError]                   = useState("");
  const [savedCorpora, setSavedCorpora]     = useState<StoredCorpus[]>([]);
  const [corporaLoading, setCorporaLoading] = useState(true);
  // Update-project state
  const [updateTarget, setUpdateTarget]     = useState<StoredCorpus | null>(null);
  const [updateFiles, setUpdateFiles]       = useState<File[]>([]);
  const [isUpdating, setIsUpdating]         = useState(false);

  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_API_URL ?? "";
    fetch(`${API}/api/v1/data/corpora`)
      .then(r => r.ok ? r.json() : [])
      .then((d: StoredCorpus[]) => setSavedCorpora(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setCorporaLoading(false));
  }, []);

  // Auto-fill project name when domain or files change (unless user has edited it)
  useEffect(() => {
    if (projectNameEdited) return;
    const domain = (selectedDomain === "custom" ? customDomain : selectedDomain).trim();
    if (!domain) { setProjectName(""); return; }
    const domainTitle = domain.replace(/-/g, " ").replace(/_/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());
    if (files.length === 0) {
      setProjectName(`${domainTitle} Knowledge Base`);
    } else if (files.length === 1) {
      const stem = files[0].name.replace(/\.[^.]+$/, "").replace(/[_\-]+/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase()).slice(0, 40);
      setProjectName(`${domainTitle} – ${stem}`);
    } else {
      const yrMatch = files.map(f => f.name).join(" ").match(/\b(20\d{2}|Q[1-4]|FY\d{2,4})\b/i);
      if (yrMatch) setProjectName(`${domainTitle} ${yrMatch[1].toUpperCase()} Corpus`);
      else setProjectName(`${domainTitle} Knowledge Base`);
    }
  }, [selectedDomain, customDomain, files, projectNameEdited]);

  const openExistingCorpus = (c: StoredCorpus) => {
    sessionStorage.setItem("job_id",        c.job_id);
    sessionStorage.setItem("domain_label",  c.domain_label);
    sessionStorage.setItem("project_name",  c.project_name || domainLabel(c.domain_label));
    sessionStorage.setItem("reuse_corpus",  "true");
    sessionStorage.removeItem("query");
    router.push("/query");
  };

  // ── Update Project: add new files to existing project ──────────────────────
  const startUpdateProject = (c: StoredCorpus) => {
    setUpdateTarget(c);
    setUpdateFiles([]);
  };

  const handleUpdateProject = async () => {
    if (!updateTarget || updateFiles.length === 0) return;
    setIsUpdating(true);
    setError("");
    try {
      const API = process.env.NEXT_PUBLIC_API_URL ?? "";
      const form = new FormData();
      for (const f of updateFiles) form.append("files", f);
      const res = await fetch(`${API}/api/v1/data/ingest-update/${updateTarget.job_id}`, {
        method: "POST", body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Update failed");

      // Navigate to processing page so user can watch the re-run
      sessionStorage.setItem("job_id",       data.job_id);
      sessionStorage.setItem("domain_label", data.domain_label || updateTarget.domain_label);
      sessionStorage.setItem("project_name", data.project_name || updateTarget.project_name || "");
      sessionStorage.removeItem("reuse_corpus");
      sessionStorage.removeItem("query");
      setUpdateTarget(null);
      router.push("/processing");
    } catch (e: any) {
      setError(e.message ?? "Failed to update project");
    } finally {
      setIsUpdating(false);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name));
      return [...prev, ...Array.from(e.dataTransfer.files).filter(f => !existing.has(f.name))];
    });
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files ?? []);
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name));
      return [...prev, ...incoming.filter(f => !existing.has(f.name))];
    });
  };

  const testConnection = async () => {
    if (!dbCreds.db_type) return;
    setIsConnecting(true);
    setSchemaPreview(null);
    try {
      const API = process.env.NEXT_PUBLIC_API_URL ?? "";
      const res = await fetch(`${API}/api/v1/data/test-connection`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dbCreds),
      });
      const data = await res.json();
      setSchemaPreview(JSON.stringify(data.schema ?? data, null, 2));
    } catch {
      setSchemaPreview("Connection failed");
    } finally {
      setIsConnecting(false);
    }
  };

  const effectiveDomain = selectedDomain === "custom"
    ? customDomain.trim()
    : selectedDomain;

  const existingForDomain = savedCorpora.find(c => c.domain_label === effectiveDomain);

  const handleSubmit = async () => {
    if (!effectiveDomain) { setError("Please select a domain"); return; }
    const uploadedNew = files.length > 0 || !!dbCreds.db_type;
    if (!uploadedNew && !existingForDomain) {
      setError("Upload files, connect a database, or pick a domain that already has a corpus");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const API = process.env.NEXT_PUBLIC_API_URL ?? "";
      const form = new FormData();
      for (const f of files) form.append("files", f);
      form.append("domain_label", effectiveDomain);
      form.append("project_name", projectName.trim());
      form.append("business_unit", session.business_unit);
      form.append("description",   session.description);
      form.append("industry",      session.industry);
      form.append("tags",          session.tags);
      form.append("force_reingest", String(uploadedNew));
      if (dbCreds.db_type) {
        form.append("db_type",  dbCreds.db_type);
        form.append("host",     dbCreds.host);
        form.append("port",     String(dbCreds.port));
        form.append("database", dbCreds.database);
        form.append("username", dbCreds.username);
        form.append("password", dbCreds.password);
      }
      const res  = await fetch(`${API}/api/v1/data/ingest`, { method: "POST", body: form });
      const data = await res.json();

      // Persist project name for downstream pages
      const resolvedProjectName = data.project_name || projectName.trim() || domainLabel(effectiveDomain);
      sessionStorage.setItem("project_name", resolvedProjectName);

      // CHECK_KNOWLEDGE: is there already an SLM for this corpus?
      let slmExists = false, slmId: string | null = null;
      try {
        const fc = await fetch(`${API}/api/v1/slm/for-corpus?job_id=${data.job_id}`).then(r => r.json());
        slmExists = !!fc.exists; slmId = fc.model_id ?? null;
      } catch { /* treat as no SLM */ }

      const { stage, knowledge_changed } = nextStageAfterInformation({
        reused: !!data.reused, uploadedNew, slmExists,
      });

      saveSession({
        session_id: data.job_id, domain: effectiveDomain,
        data_sources: [...files.map(f => f.name), ...(dbCreds.db_type ? [`db:${dbCreds.database}`] : [])],
        knowledge_changed, last_ingested_at: new Date().toISOString(),
        slm_version: slmExists ? slmId : null, kg_version: data.reused ? data.job_id : null,
        business_unit: session.business_unit, description: session.description,
        industry: session.industry, tags: session.tags,
      });
      sessionStorage.removeItem("query");
      // reuse flag only for the skip-rebuild → inference path
      if (stage === "INFERENCE") sessionStorage.setItem("reuse_corpus", "true");
      else sessionStorage.removeItem("reuse_corpus");

      goToStage(router, stage);
    } catch (e: any) {
      setError(e.message ?? "Failed to start ingestion");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="bg-card border-b border-dborder px-0 py-7 mb-7">
        <div className="w-full px-8">
          <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-t3 mb-1.5 flex items-center gap-2">
            <span className="inline-block w-4 h-px bg-accent" />
            Step 1 · Information Harnessing
          </div>
          <div className="font-sora text-2xl font-semibold text-t1">Start a new DHS session</div>
          <div className="text-[12px] text-t2 mt-1">Describe your domain, then upload your knowledge corpus to ingest</div>
        </div>
      </div>

      <div className="w-full px-8">

        {/* ── Update Project modal ──────────────────────────────── */}
        {updateTarget && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" style={{backdropFilter:"blur(4px)"}}>
            <div className="bg-card border border-dborder rounded-2xl overflow-hidden max-w-md w-full shadow-2xl">
              <div className="px-6 pt-5 pb-4 border-b border-dborder">
                <div className="text-[9px] font-bold uppercase tracking-widest text-t3 mb-1">Update Project</div>
                <div className="text-[15px] font-semibold text-t1 font-sora">{updateTarget.project_name || domainLabel(updateTarget.domain_label)}</div>
                <div className="text-[11px] text-t3 mt-1">
                  Upload additional files. Existing knowledge is preserved — the pipeline re-runs on all files combined.
                </div>
              </div>
              <div className="px-6 py-4 space-y-4">
                {/* Current files summary */}
                <div className="bg-bg2 border border-dborder rounded-xl p-3">
                  <div className="text-[10px] font-semibold text-t3 uppercase tracking-wider mb-1.5">Current project</div>
                  <div className="text-[12px] text-t1">{updateTarget.file_count} file{updateTarget.file_count !== 1 ? "s" : ""} · {(updateTarget.entity_count || 0).toLocaleString()} entities · v{updateTarget.version || 1}</div>
                  {updateTarget.file_list && updateTarget.file_list.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {updateTarget.file_list.slice(0, 5).map(f => (
                        <span key={f.name} className="text-[10px] bg-bg3 border border-dborder rounded px-1.5 py-0.5 text-t3">{f.name}</span>
                      ))}
                      {updateTarget.file_list.length > 5 && <span className="text-[10px] text-t3">+{updateTarget.file_list.length - 5} more</span>}
                    </div>
                  )}
                </div>
                {/* New files picker */}
                <div>
                  <div className="text-[10px] font-semibold text-t3 uppercase tracking-wider mb-2">Add new files</div>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-dborder2 rounded-xl p-5 cursor-pointer hover:border-accent/50 hover:bg-accent/3 transition-colors">
                    <span className="text-2xl mb-1">📎</span>
                    <span className="text-[12px] text-t2 font-medium">Click to select files</span>
                    <span className="text-[10px] text-t3 mt-0.5">PDF · DOCX · CSV · TXT</span>
                    <input type="file" multiple accept=".pdf,.docx,.doc,.csv,.txt,.jsonl,.json,.xlsx"
                      className="hidden"
                      onChange={e => {
                        const incoming = Array.from(e.target.files ?? []);
                        const existing = new Set(updateTarget.file_list?.map(f => f.name) ?? []);
                        const newOnes = incoming.filter(f => !existing.has(f.name));
                        setUpdateFiles(prev => {
                          const curNames = new Set(prev.map(f => f.name));
                          return [...prev, ...newOnes.filter(f => !curNames.has(f.name))];
                        });
                      }}
                    />
                  </label>
                  {updateFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {updateFiles.map((f, i) => (
                        <div key={i} className="flex items-center justify-between text-[11px] px-3 py-1.5 bg-bg2 border border-dborder rounded-lg">
                          <span className="text-t1 truncate">{f.name}</span>
                          <button onClick={() => setUpdateFiles(p => p.filter((_, j) => j !== i))} className="text-t3 hover:text-coral ml-2">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {error && <div className="text-[11px] text-coral bg-coral/8 border border-coral/20 rounded-lg px-3 py-2">{error}</div>}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setUpdateTarget(null); setUpdateFiles([]); setError(""); }}
                    className="btn btn-sm border border-dborder2 text-t3 hover:text-t2 flex-1">Cancel</button>
                  <button
                    onClick={handleUpdateProject}
                    disabled={updateFiles.length === 0 || isUpdating}
                    className="btn btn-p flex-1 text-[13px] font-semibold disabled:opacity-50"
                  >{isUpdating ? "Uploading…" : `Add ${updateFiles.length} file${updateFiles.length !== 1 ? "s" : ""} →`}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Previous workspaces ─────────────────────────────── */}
        {(corporaLoading || savedCorpora.length > 0) && (
          <div className="mb-7">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-t3 mb-3">
              Previous workspaces
            </div>
            {corporaLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-14 bg-card2 border border-dborder rounded-card animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {savedCorpora.map(c => (
                  <div key={c.job_id}
                    className="w-full flex items-center gap-4 px-4 py-3.5 rounded-card border border-dborder bg-card2 hover:border-accent/30 transition-all text-left"
                  >
                    <div className="text-2xl flex-shrink-0 w-8 text-center">{domainIcon(c.domain_label)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-t1 leading-tight">
                        {c.project_name || domainLabel(c.domain_label)}
                      </div>
                      <div className="text-[10px] text-t3 mt-0.5">
                        {c.file_count > 0 ? `${c.file_count} file${c.file_count !== 1 ? "s" : ""}` : "Corpus ready"}
                        {c.entity_count > 0 && ` · ${c.entity_count.toLocaleString()} entities`}
                        {(c.version && c.version > 1) && ` · v${c.version}`}
                        {c.created_at && ` · ${new Date(c.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => startUpdateProject(c)}
                        className="text-[11px] px-2.5 py-1 border border-dborder2 text-t3 hover:border-accent/40 hover:text-accent rounded-lg transition-colors">
                        + Update
                      </button>
                      <button onClick={() => openExistingCorpus(c)}
                        className="text-[11px] px-2.5 py-1 bg-accent/10 border border-accent/25 text-accent hover:bg-accent/20 rounded-lg transition-colors font-semibold">
                        Open →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-dborder mt-6 mb-2" />
          </div>
        )}

        {/* ── Domain selector ─────────────────────────────────── */}
        <div className="text-[10px] font-semibold uppercase tracking-wider text-t3 mb-3">Select domain</div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {DOMAIN_PRESETS.map(d => (
            <button
              key={d.id}
              onClick={() => setSelectedDomain(d.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-card border text-left transition-all ${
                selectedDomain === d.id
                  ? "bg-accent/10 border-accent/50 shadow-sm"
                  : "bg-card2 border-dborder hover:border-accent/30 hover:bg-accent/5"
              }`}
            >
              <span className="text-xl flex-shrink-0">{d.icon}</span>
              <div className="min-w-0">
                <div className={`text-[12px] font-semibold leading-tight ${
                  selectedDomain === d.id ? "text-accent" : "text-t1"
                }`}>{d.label}</div>
                <div className="text-[10px] text-t3 mt-0.5 leading-snug line-clamp-1">{d.desc}</div>
              </div>
              {selectedDomain === d.id && (
                <span className="ml-auto text-accent font-bold flex-shrink-0">✓</span>
              )}
            </button>
          ))}
        </div>

        {/* Custom domain text field */}
        {selectedDomain === "custom" && (
          <div className="mb-4">
            <input
              autoFocus
              className="w-full bg-bg3 border border-dborder2 rounded-card px-4 py-2.5 text-[12px] text-t1 outline-none transition-colors focus:border-accent font-dm"
              placeholder="e.g. aerospace, telecom, government-procurement…"
              value={customDomain}
              onChange={e => setCustomDomain(e.target.value)}
            />
          </div>
        )}

        {/* ── Session details ─────────────────────────────────── */}
        <div className="text-[10px] font-semibold uppercase tracking-wider text-t3 mb-3 mt-1">
          Session details <span className="font-normal normal-case">(optional)</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <input
            className="bg-bg3 border border-dborder2 rounded-card px-4 py-2.5 text-[12px] text-t1 outline-none transition-colors focus:border-accent font-dm"
            placeholder="Business unit"
            value={session.business_unit}
            onChange={e => setSession(p => ({ ...p, business_unit: e.target.value }))}
          />
          <input
            className="bg-bg3 border border-dborder2 rounded-card px-4 py-2.5 text-[12px] text-t1 outline-none transition-colors focus:border-accent font-dm"
            placeholder="Industry"
            value={session.industry}
            onChange={e => setSession(p => ({ ...p, industry: e.target.value }))}
          />
          <input
            className="col-span-2 bg-bg3 border border-dborder2 rounded-card px-4 py-2.5 text-[12px] text-t1 outline-none transition-colors focus:border-accent font-dm"
            placeholder="Description"
            value={session.description}
            onChange={e => setSession(p => ({ ...p, description: e.target.value }))}
          />
          <input
            className="col-span-2 bg-bg3 border border-dborder2 rounded-card px-4 py-2.5 text-[12px] text-t1 outline-none transition-colors focus:border-accent font-dm"
            placeholder="Tags (comma-separated)"
            value={session.tags}
            onChange={e => setSession(p => ({ ...p, tags: e.target.value }))}
          />
        </div>

        <div className="border-t border-dborder my-5" />

        {/* ── Project name ─────────────────────────────────────── */}
        <div className="mb-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-t3 mb-2 flex items-center gap-2">
            Project name
            {!projectNameEdited && <span className="text-[9px] font-normal text-t3 normal-case">(auto-generated · click to edit)</span>}
          </div>
          <input
            className="w-full bg-bg3 border border-dborder2 rounded-card px-4 py-2.5 text-[13px] text-t1 outline-none transition-colors focus:border-accent font-sora font-semibold"
            placeholder="e.g. Finance Risk Analysis – Q3 Reports"
            value={projectName}
            onChange={e => { setProjectName(e.target.value); setProjectNameEdited(true); }}
          />
        </div>

        {/* ── File upload ─────────────────────────────────────── */}
        <div className="text-[10px] font-semibold uppercase tracking-wider text-t3 mb-3">
          Upload corpus{" "}
          <span className="font-normal normal-case">— PDF, DOCX, CSV, JSON, Parquet, TXT</span>
        </div>

        <div
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => document.getElementById("ws-file-input")?.click()}
          className="border-2 border-dashed border-dborder rounded-card p-6 text-center cursor-pointer hover:border-accent/50 transition-all mb-4"
        >
          <input
            id="ws-file-input" type="file" multiple className="hidden"
            accept=".pdf,.docx,.doc,.csv,.json,.parquet,.txt,.md"
            onChange={onFileChange}
          />
          {files.length === 0 ? (
            <div>
              <div className="text-3xl mb-2">📂</div>
              <div className="text-[13px] text-t2 font-medium">Drop files here or click to browse</div>
              <div className="text-[10px] text-t3 mt-1">Multiple files supported</div>
            </div>
          ) : (
            <div className="text-left space-y-1.5" onClick={e => e.stopPropagation()}>
              {files.map(f => (
                <div key={f.name} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[14px]">📄</span>
                    <span className="text-[11px] text-t2 truncate">{f.name}</span>
                  </div>
                  <span className="text-[10px] text-t3 flex-shrink-0">
                    {(f.size / 1024).toFixed(0)} KB
                  </span>
                </div>
              ))}
              <div className="pt-2 border-t border-dborder mt-2 flex items-center justify-between">
                <span className="text-[10px] text-t3">{files.length} file{files.length !== 1 ? "s" : ""} selected</span>
                <button
                  onClick={() => setFiles([])}
                  className="text-[10px] text-t3 hover:text-coral transition-colors"
                >
                  Clear all
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── DB connection (collapsible) ──────────────────────── */}
        <div className="border border-dborder2 rounded-card mb-6">
          <button
            className="w-full flex items-center justify-between px-4 py-3 text-left"
            onClick={() => setDbOpen(o => !o)}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-t3">
              Database connection{" "}
              <span className="font-normal normal-case">(optional)</span>
            </span>
            <span className="text-[10px] text-t3">{dbOpen ? "▲ hide" : "▼ connect"}</span>
          </button>

          {dbOpen && (
            <div className="px-4 pb-4 border-t border-dborder2 pt-3 space-y-3">
              <select
                className="w-full bg-bg3 border border-dborder2 rounded-card px-3 py-2 text-[12px] text-t1 outline-none focus:border-accent"
                value={dbCreds.db_type}
                onChange={e => setDbCreds(p => ({ ...p, db_type: e.target.value }))}
              >
                <option value="">-- Select database type --</option>
                <option value="postgresql">PostgreSQL</option>
                <option value="mysql">MySQL</option>
                <option value="sqlite">SQLite</option>
                <option value="mongodb">MongoDB</option>
              </select>

              {dbCreds.db_type && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {(["host", "port", "database", "username"] as const).map(k => (
                      <input
                        key={k}
                        placeholder={k.charAt(0).toUpperCase() + k.slice(1)}
                        className="bg-bg3 border border-dborder2 rounded-card px-3 py-2 text-[12px] text-t1 outline-none focus:border-accent"
                        value={(dbCreds as any)[k]}
                        onChange={e => setDbCreds(p => ({ ...p, [k]: e.target.value }))}
                      />
                    ))}
                    <input
                      type="password" placeholder="Password"
                      className="col-span-2 bg-bg3 border border-dborder2 rounded-card px-3 py-2 text-[12px] text-t1 outline-none focus:border-accent"
                      value={dbCreds.password}
                      onChange={e => setDbCreds(p => ({ ...p, password: e.target.value }))}
                    />
                    <button
                      onClick={testConnection} disabled={isConnecting}
                      className="col-span-2 btn py-2 text-[12px] disabled:opacity-50"
                    >
                      {isConnecting ? "Connecting…" : "Test Connection & Preview Schema"}
                    </button>
                  </div>
                  {schemaPreview && (
                    <pre className="bg-bg3 rounded-card p-3 text-[10px] text-gg overflow-auto max-h-40 font-mono">
                      {schemaPreview}
                    </pre>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-coral/10 border border-coral/30 rounded-sm text-[12px] text-coral mb-4">
            ⚠ {error}
          </div>
        )}

        {/* Skip-upload hint when the domain already has a corpus */}
        {effectiveDomain && existingForDomain && files.length === 0 && !dbCreds.db_type && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-accent/5 border border-accent/20 rounded-sm text-[11px] text-t2 mb-3">
            ℹ️ Existing knowledge found for <b>{domainLabel(effectiveDomain)}</b> — you can skip upload and go straight to inference (no rebuild).
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !effectiveDomain || (files.length === 0 && !dbCreds.db_type && !existingForDomain)}
          className="btn btn-p btn-full py-3 text-sm disabled:opacity-40 mb-8"
        >
          {isSubmitting ? "Working…"
            : (files.length === 0 && !dbCreds.db_type && existingForDomain) ? "Continue with existing knowledge →"
            : "Start Ingestion →"}
        </button>

      </div>
    </div>
  );
}
