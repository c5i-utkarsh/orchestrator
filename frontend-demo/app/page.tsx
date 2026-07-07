"use client";

import React, { useState, useCallback, useEffect } from "react";
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

/**
 * Derive a project-group name from a domain_label by stripping auto-generated
 * numeric/timestamp/version suffixes that are appended at ingestion time.
 * Examples:
 *   "supply-chain-1783408718" → "Supply Chain"
 *   "cpg-beverages-v2"        → "Cpg Beverages"
 *   "it-industry"             → "It Industry"
 *   "phase-d-diff-domain-test" → "Phase D Diff Domain Test" (no suffix to strip)
 */
function deriveGroup(c: StoredCorpus): string {
  const raw = c.domain_label;
  const cleaned = raw
    .replace(/-\d{7,}$/, "")          // remove long timestamp suffix  e.g. -1783408718
    .replace(/[-_]v\d+$/i, "")         // remove version suffix         e.g. -v1, _V2
    .replace(/[-_]\d{1,4}$/, "")       // remove short numeric suffix   e.g. -123
    .replace(/-+$/, "");               // trim trailing dashes
  return domainLabel(cleaned || raw);
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
  // Set of group names that are COLLAPSED.
  // Initialised to ALL groups after corpora load so everything starts collapsed.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  // Track whether we've applied the "collapse all on first load" initialisation
  const collapsedInitRef = React.useRef(false);

  // ── Delete Project state ──────────────────────────────────────────────────
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<StoredCorpus | null>(null);
  const [isDeletingProject, setIsDeletingProject]     = useState(false);
  const [deleteProjectError, setDeleteProjectError]   = useState("");

  // ── Delete File state ─────────────────────────────────────────────────────
  interface DeleteFileTarget { corpus: StoredCorpus; fileName: string; }
  const [deleteFileTarget, setDeleteFileTarget]     = useState<DeleteFileTarget | null>(null);
  const [isDeletingFile, setIsDeletingFile]         = useState(false);
  const [deleteFileError, setDeleteFileError]       = useState("");
  // Track which jobs need regeneration after a file was deleted
  const [needsRegen, setNeedsRegen]                 = useState<Set<string>>(new Set());

  // ── New Project modal state ──────────────────────────────────────────────────
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName]           = useState("");
  const [newProjectDesc, setNewProjectDesc]           = useState("");
  // UI-only projects (no backend yet); stored in sessionStorage so they survive
  // navigation within the session but reset on page reload.
  const [uiProjects, setUiProjects] = useState<{ name: string; desc: string }[]>(() => {
    try { return JSON.parse(sessionStorage.getItem("dhs_ui_projects") ?? "[]"); }
    catch { return []; }
  });

  // ── Add Files modal state ────────────────────────────────────────────────────
  const [showAddFilesModal, setShowAddFilesModal]         = useState(false);
  const [addFilesMode, setAddFilesMode]                   = useState<"existing" | "new">("existing");
  const [addFilesTargetGroup, setAddFilesTargetGroup]     = useState("");
  const [addFilesNewProject, setAddFilesNewProject]       = useState("");
  const [addFilesFiles, setAddFilesFiles]                 = useState<File[]>([]);
  const [addFilesSubmitting, setAddFilesSubmitting]       = useState(false);
  const [addFilesError, setAddFilesError]                 = useState("");

  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_API_URL ?? "";
    fetch(`${API}/api/v1/data/corpora`)
      .then(r => r.ok ? r.json() : [])
      .then((d: StoredCorpus[]) => {
        const corpora = Array.isArray(d) ? d : [];
        setSavedCorpora(corpora);
        // Collapse all groups on initial load (user expands only what they need)
        if (!collapsedInitRef.current && corpora.length > 0) {
          collapsedInitRef.current = true;
          const allGroups = new Set(corpora.map(c => deriveGroup(c)));
          setCollapsedGroups(allGroups);
        }
      })
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

  // Derive grouped workspace list — computed from savedCorpora, no state needed
  const groupedCorpora = savedCorpora.reduce<Map<string, StoredCorpus[]>>((map, c) => {
    const key = deriveGroup(c);
    const arr = map.get(key) ?? [];
    arr.push(c);
    map.set(key, arr);
    return map;
  }, new Map<string, StoredCorpus[]>());
  // Sort groups alphabetically; within each group newest first
  const groups = [...groupedCorpora.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, items]) => [
      name,
      [...items].sort((a, b) =>
        (b.created_at ?? "").localeCompare(a.created_at ?? "")
      ),
    ] as [string, StoredCorpus[]]);

  const toggleGroup = (name: string) =>
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  // ── Create UI-only project (no backend) ──────────────────────────────────
  const handleCreateUiProject = () => {
    const name = newProjectName.trim();
    if (!name) return;
    const updated = [...uiProjects, { name, desc: newProjectDesc.trim() }];
    setUiProjects(updated);
    try { sessionStorage.setItem("dhs_ui_projects", JSON.stringify(updated)); } catch { /* */ }
    // Expand the new project immediately
    setCollapsedGroups(prev => { const n = new Set(prev); n.delete(name); return n; });
    setShowNewProjectModal(false);
    setNewProjectName("");
    setNewProjectDesc("");
  };

  // ── Add Files: submit using existing ingest/update flow ──────────────────
  const handleAddFilesSubmit = async () => {
    if (addFilesFiles.length === 0) { setAddFilesError("Please select at least one file."); return; }
    const targetProject = addFilesMode === "existing" ? addFilesTargetGroup : addFilesNewProject.trim();
    if (!targetProject) { setAddFilesError("Please specify a project."); return; }
    setAddFilesSubmitting(true);
    setAddFilesError("");
    try {
      const API = process.env.NEXT_PUBLIC_API_URL ?? "";
      // Derive a domain from the project name for the ingest call
      const domainForIngest = targetProject.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      // Check if an existing corpus for this group already exists
      const existingCorpus = savedCorpora.find(c => deriveGroup(c) === targetProject);
      let jobId: string;
      if (existingCorpus) {
        // Add files to existing corpus
        const form = new FormData();
        for (const f of addFilesFiles) form.append("files", f);
        const res = await fetch(`${API}/api/v1/data/ingest-update/${existingCorpus.job_id}`, { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Update failed");
        jobId = data.job_id;
        sessionStorage.setItem("job_id",       data.job_id);
        sessionStorage.setItem("domain_label", data.domain_label || existingCorpus.domain_label);
        sessionStorage.setItem("project_name", data.project_name || targetProject);
      } else {
        // New ingestion
        const form = new FormData();
        for (const f of addFilesFiles) form.append("files", f);
        form.append("domain_label",  domainForIngest);
        form.append("project_name",  targetProject);
        form.append("force_reingest", "true");
        const res = await fetch(`${API}/api/v1/data/ingest`, { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Ingest failed");
        jobId = data.job_id;
        sessionStorage.setItem("job_id",       data.job_id);
        sessionStorage.setItem("domain_label", data.domain_label || domainForIngest);
        sessionStorage.setItem("project_name", data.project_name || targetProject);
      }
      sessionStorage.removeItem("reuse_corpus");
      sessionStorage.removeItem("query");
      setShowAddFilesModal(false);
      setAddFilesFiles([]);
      router.push("/processing");
    } catch (e: any) {
      setAddFilesError(e.message ?? "Failed to start ingestion");
    } finally {
      setAddFilesSubmitting(false);
    }
  };

  // ── Delete Project ─────────────────────────────────────────────────────────
  const handleDeleteProject = async () => {
    if (!deleteProjectTarget) return;
    setIsDeletingProject(true);
    setDeleteProjectError("");
    try {
      const API = process.env.NEXT_PUBLIC_API_URL ?? "";
      const res = await fetch(`${API}/api/v1/data/project/${deleteProjectTarget.job_id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? `HTTP ${res.status}`);
      }
      // Remove from local state immediately
      setSavedCorpora(prev => prev.filter(c => c.job_id !== deleteProjectTarget.job_id));
      setDeleteProjectTarget(null);
    } catch (e: any) {
      setDeleteProjectError(e.message ?? "Failed to delete project");
    } finally {
      setIsDeletingProject(false);
    }
  };

  // ── Delete File ────────────────────────────────────────────────────────────
  const handleDeleteFile = async () => {
    if (!deleteFileTarget) return;
    setIsDeletingFile(true);
    setDeleteFileError("");
    try {
      const API = process.env.NEXT_PUBLIC_API_URL ?? "";
      const encoded = encodeURIComponent(deleteFileTarget.fileName);
      const res = await fetch(
        `${API}/api/v1/data/project/${deleteFileTarget.corpus.job_id}/file/${encoded}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? `HTTP ${res.status}`);
      }
      // Update local file_list
      setSavedCorpora(prev => prev.map(c => {
        if (c.job_id !== deleteFileTarget.corpus.job_id) return c;
        const newList = (c.file_list ?? []).filter(f => f.name !== deleteFileTarget.fileName);
        return { ...c, file_list: newList, file_count: newList.length };
      }));
      setNeedsRegen(prev => new Set([...prev, deleteFileTarget.corpus.job_id]));
      setDeleteFileTarget(null);
    } catch (e: any) {
      setDeleteFileError(e.message ?? "Failed to delete file");
    } finally {
      setIsDeletingFile(false);
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

        {/* ── New Project modal ─────────────────────────────────── */}
        {showNewProjectModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" style={{backdropFilter:"blur(4px)"}}>
            <div className="bg-card border border-dborder rounded-2xl overflow-hidden max-w-sm w-full shadow-2xl">
              <div className="px-6 pt-5 pb-4 border-b border-dborder">
                <div className="text-[9px] font-bold uppercase tracking-widest text-t3 mb-1">New Project</div>
                <div className="text-[15px] font-semibold text-t1 font-sora">Create a Project</div>
                <div className="text-[11px] text-t3 mt-1">Group related workspaces under a project name.</div>
              </div>
              <div className="px-6 py-4 space-y-3">
                <div>
                  <label className="text-[10px] font-semibold text-t3 uppercase tracking-wider mb-1.5 block">Project Name</label>
                  <input autoFocus
                    className="w-full bg-bg3 border border-dborder2 rounded-xl px-4 py-2.5 text-[13px] text-t1 outline-none focus:border-accent transition-colors font-sora"
                    placeholder="e.g. Carbonated Drinks, Financial Risk Q4"
                    value={newProjectName}
                    onChange={e => setNewProjectName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleCreateUiProject(); }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-t3 uppercase tracking-wider mb-1.5 block">
                    Description <span className="font-normal normal-case">(optional)</span>
                  </label>
                  <input
                    className="w-full bg-bg3 border border-dborder2 rounded-xl px-4 py-2.5 text-[12px] text-t1 outline-none focus:border-accent transition-colors"
                    placeholder="Brief description of this project…"
                    value={newProjectDesc}
                    onChange={e => setNewProjectDesc(e.target.value)}
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setShowNewProjectModal(false); setNewProjectName(""); setNewProjectDesc(""); }}
                    className="btn btn-sm border border-dborder2 text-t3 hover:text-t2 flex-1">Cancel</button>
                  <button onClick={handleCreateUiProject} disabled={!newProjectName.trim()}
                    className="btn btn-p flex-1 text-[13px] font-semibold disabled:opacity-40">Create Project</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Add Files modal ────────────────────────────────────── */}
        {showAddFilesModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" style={{backdropFilter:"blur(4px)"}}>
            <div className="bg-card border border-dborder rounded-2xl overflow-hidden max-w-md w-full shadow-2xl">
              <div className="px-6 pt-5 pb-4 border-b border-dborder">
                <div className="text-[9px] font-bold uppercase tracking-widest text-t3 mb-1">Add Files</div>
                <div className="text-[15px] font-semibold text-t1 font-sora">Where should these files go?</div>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div className="space-y-2">
                  <label className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${addFilesMode === "existing" ? "border-accent/50 bg-accent/5" : "border-dborder hover:border-dborder2"}`}>
                    <input type="radio" name="addFilesMode" value="existing" checked={addFilesMode === "existing"}
                      onChange={() => setAddFilesMode("existing")} className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-t1">Existing Project</div>
                      {addFilesMode === "existing" && (
                        <select className="mt-2 w-full bg-bg3 border border-dborder2 rounded-lg px-3 py-2 text-[12px] text-t1 outline-none focus:border-accent"
                          value={addFilesTargetGroup} onChange={e => setAddFilesTargetGroup(e.target.value)}>
                          <option value="">— Choose a project —</option>
                          {uiProjects.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                          {groups.map(([g]) => <option key={g} value={g}>{g}</option>)}
                        </select>
                      )}
                    </div>
                  </label>
                  <label className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${addFilesMode === "new" ? "border-accent/50 bg-accent/5" : "border-dborder hover:border-dborder2"}`}>
                    <input type="radio" name="addFilesMode" value="new" checked={addFilesMode === "new"}
                      onChange={() => setAddFilesMode("new")} className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-t1">Create New Project</div>
                      {addFilesMode === "new" && (
                        <input autoFocus
                          className="mt-2 w-full bg-bg3 border border-dborder2 rounded-lg px-3 py-2 text-[12px] text-t1 outline-none focus:border-accent"
                          placeholder="Project name…" value={addFilesNewProject}
                          onChange={e => setAddFilesNewProject(e.target.value)} />
                      )}
                    </div>
                  </label>
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-t3 uppercase tracking-wider mb-2">Select Files</div>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-dborder2 rounded-xl p-4 cursor-pointer hover:border-accent/50 hover:bg-accent/3 transition-colors">
                    <span className="text-xl mb-1">📂</span>
                    <span className="text-[12px] text-t2 font-medium">Click to browse</span>
                    <span className="text-[10px] text-t3 mt-0.5">PDF · DOCX · CSV · TXT · JSON</span>
                    <input type="file" multiple accept=".pdf,.docx,.doc,.csv,.txt,.jsonl,.json,.xlsx" className="hidden"
                      onChange={e => {
                        const incoming = Array.from(e.target.files ?? []);
                        setAddFilesFiles(prev => { const ex = new Set(prev.map(f => f.name)); return [...prev, ...incoming.filter(f => !ex.has(f.name))]; });
                      }} />
                  </label>
                  {addFilesFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {addFilesFiles.map((f, i) => (
                        <div key={i} className="flex items-center justify-between text-[11px] px-3 py-1.5 bg-bg2 border border-dborder rounded-lg">
                          <span className="text-t1 truncate">{f.name}</span>
                          <button onClick={() => setAddFilesFiles(p => p.filter((_, j) => j !== i))} className="text-t3 hover:text-coral ml-2">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {addFilesError && <div className="text-[11px] text-coral bg-coral/8 border border-coral/20 rounded-lg px-3 py-2">{addFilesError}</div>}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setShowAddFilesModal(false); setAddFilesFiles([]); setAddFilesError(""); setAddFilesNewProject(""); setAddFilesTargetGroup(""); }}
                    className="btn btn-sm border border-dborder2 text-t3 hover:text-t2 flex-1">Cancel</button>
                  <button onClick={handleAddFilesSubmit}
                    disabled={addFilesFiles.length === 0 || addFilesSubmitting || (addFilesMode === "existing" && !addFilesTargetGroup) || (addFilesMode === "new" && !addFilesNewProject.trim())}
                    className="btn btn-p flex-1 text-[13px] font-semibold disabled:opacity-40">
                    {addFilesSubmitting ? "Starting…" : `Add ${addFilesFiles.length || ""} File${addFilesFiles.length !== 1 ? "s" : ""} →`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Delete Project confirmation dialog ───────────────── */}
        {deleteProjectTarget && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6" style={{backdropFilter:"blur(4px)"}}>
            <div className="bg-card border border-coral/30 rounded-2xl overflow-hidden max-w-md w-full shadow-2xl">
              <div className="px-6 pt-5 pb-4 border-b border-coral/20 bg-coral/5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-coral text-lg">⚠</span>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-coral">Destructive Action</div>
                </div>
                <div className="text-[15px] font-semibold text-t1 font-sora">
                  Delete "{deleteProjectTarget.project_name || domainLabel(deleteProjectTarget.domain_label)}"?
                </div>
              </div>
              <div className="px-6 py-4 space-y-4">
                <p className="text-[12px] text-t2 leading-relaxed">
                  This will <strong className="text-t1">permanently delete</strong> the following for this project:
                </p>
                <div className="bg-coral/5 border border-coral/20 rounded-xl px-4 py-3 space-y-1 text-[11px] text-t2">
                  {["Uploaded documents", "Generated knowledge graph", "Extracted entities and relationships",
                    "Wiki articles and summaries", "Vector embeddings (FAISS index)",
                    "Associated domain SLM (if trained)", "All project artifacts and metadata",
                  ].map(item => (
                    <div key={item} className="flex items-center gap-2">
                      <span className="text-coral flex-shrink-0">✕</span> {item}
                    </div>
                  ))}
                </div>
                <div className="bg-amber/8 border border-amber/30 rounded-xl px-4 py-2.5 text-[11px] text-amber font-semibold">
                  ⚠ This action cannot be undone.
                </div>
                {deleteProjectError && (
                  <div className="text-[11px] text-coral bg-coral/8 border border-coral/20 rounded-lg px-3 py-2">{deleteProjectError}</div>
                )}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setDeleteProjectTarget(null); setDeleteProjectError(""); }}
                    className="btn flex-1 border border-dborder2 text-t2 hover:text-t1">Keep Project</button>
                  <button onClick={handleDeleteProject} disabled={isDeletingProject}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-coral text-white text-[13px] font-semibold hover:bg-coral/90 disabled:opacity-50 transition-colors">
                    {isDeletingProject ? "Deleting…" : "Delete Project"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Delete File confirmation dialog ───────────────────── */}
        {deleteFileTarget && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" style={{backdropFilter:"blur(4px)"}}>
            <div className="bg-card border border-dborder rounded-2xl overflow-hidden max-w-sm w-full shadow-2xl">
              <div className="px-6 pt-5 pb-4 border-b border-dborder">
                <div className="text-[9px] font-bold uppercase tracking-widest text-t3 mb-1">Remove File</div>
                <div className="text-[14px] font-semibold text-t1 font-sora truncate">{deleteFileTarget.fileName}</div>
              </div>
              <div className="px-6 py-4 space-y-3">
                <p className="text-[12px] text-t2 leading-relaxed">
                  The file will be removed from this project. Remaining documents are preserved.
                </p>
                <div className="bg-amber/8 border border-amber/30 rounded-xl px-4 py-2.5 text-[11px] text-amber">
                  <strong>Knowledge regeneration required</strong> — future queries will not reflect this change until you regenerate the knowledge graph.
                </div>
                {deleteFileError && (
                  <div className="text-[11px] text-coral bg-coral/8 border border-coral/20 rounded-lg px-3 py-2">{deleteFileError}</div>
                )}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setDeleteFileTarget(null); setDeleteFileError(""); }}
                    className="btn btn-sm border border-dborder2 text-t3 hover:text-t2 flex-1">Cancel</button>
                  <button onClick={handleDeleteFile} disabled={isDeletingFile}
                    className="flex-1 px-4 py-2 rounded-xl bg-coral text-white text-[12px] font-semibold hover:bg-coral/90 disabled:opacity-50 transition-colors">
                    {isDeletingFile ? "Removing…" : "Remove File"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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

        {/* ── Projects section ──────────────────────────────────── */}
        {(corporaLoading || savedCorpora.length > 0 || uiProjects.length > 0) && (
          <div className="mb-7">
            {/* Header row: label + primary action buttons */}
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-t3">
                Projects
              </div>
              <div className="flex items-center gap-2">
                {groups.length > 1 && (
                  <>
                    <button className="text-[10px] text-t3 hover:text-t2 transition-colors"
                      onClick={() => setCollapsedGroups(new Set())}>Expand all</button>
                    <span className="text-t3 text-[10px]">·</span>
                    <button className="text-[10px] text-t3 hover:text-t2 transition-colors"
                      onClick={() => setCollapsedGroups(new Set(groups.map(([g]) => g)))}>Collapse all</button>
                    <span className="text-dborder text-[10px]">|</span>
                  </>
                )}
                {/* Primary CTAs */}
                <button
                  onClick={() => setShowAddFilesModal(true)}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 border border-dborder2 text-t2 hover:border-accent/40 hover:text-accent rounded-lg transition-colors font-medium"
                >
                  <span>+</span> Add Files
                </button>
                <button
                  onClick={() => setShowNewProjectModal(true)}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 rounded-lg transition-colors font-semibold"
                >
                  <span>⊕</span> New Project
                </button>
              </div>
            </div>

            {/* UI-only projects (no corpora yet) */}
            {uiProjects.filter(p => !groups.find(([g]) => g === p.name)).map(p => {
              const isExpanded = !collapsedGroups.has(p.name);
              return (
                <div key={p.name} className="border border-dborder border-dashed rounded-xl overflow-hidden bg-card2 mb-2">
                  <button
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-bg3/50 transition-colors"
                    onClick={() => toggleGroup(p.name)}
                  >
                    <span className="text-t3 text-[10px] flex-shrink-0 transition-transform duration-200 inline-block"
                      style={{ transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)" }}>▼</span>
                    <span className="text-[18px] flex-shrink-0 leading-none">📁</span>
                    <span className="text-[13px] font-semibold text-t1 flex-1 min-w-0 truncate">{p.name}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-bg3 border border-dborder text-t3 flex-shrink-0">empty</span>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-dborder px-4 py-4 text-center text-[11px] text-t3 italic">
                      No workspaces yet — click <b>Add Files</b> to populate this project.
                    </div>
                  )}
                </div>
              );
            })}

            {corporaLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-14 bg-card2 border border-dborder rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {groups.map(([groupName, corpora]) => {
                  const isExpanded = !collapsedGroups.has(groupName);
                  const latestDate = corpora[0]?.created_at
                    ? new Date(corpora[0].created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                    : null;

                  return (
                    <div key={groupName} className="border border-dborder rounded-xl overflow-hidden bg-card2">
                      {/* ── Group header ── */}
                      <div className="flex items-center">
                        <button
                          className="flex-1 flex items-center gap-2.5 px-4 py-3 text-left hover:bg-bg3/50 transition-colors min-w-0"
                          onClick={() => toggleGroup(groupName)}
                          aria-expanded={isExpanded}
                        >
                          <span className="text-t3 text-[10px] flex-shrink-0 transition-transform duration-200 inline-block"
                            style={{ transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)" }}>▼</span>
                          <span className="text-[18px] flex-shrink-0 leading-none">{domainIcon(corpora[0].domain_label)}</span>
                          <span className="text-[13px] font-semibold text-t1 flex-1 min-w-0 truncate">{groupName}</span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-bg3 border border-dborder text-t3 flex-shrink-0">
                            {corpora.length} workspace{corpora.length !== 1 ? "s" : ""}
                          </span>
                          {latestDate && (
                            <span className="text-[10px] text-t3 flex-shrink-0 ml-1 hidden sm:block">{latestDate}</span>
                          )}
                        </button>
                        {/* Delete group — only when single workspace in the group */}
                        {corpora.length === 1 && (
                          <button
                            onClick={() => setDeleteProjectTarget(corpora[0])}
                            title="Delete project"
                            className="px-3 py-3 text-t3 hover:text-coral transition-colors flex-shrink-0 text-[13px]"
                          >🗑</button>
                        )}
                      </div>

                      {/* ── Workspace cards — animated expand/collapse ── */}
                      <div
                        className="overflow-hidden transition-all duration-300 ease-in-out"
                        style={{ maxHeight: isExpanded ? `${corpora.length * 200}px` : "0px" }}
                      >
                        <div className="border-t border-dborder divide-y divide-dborder/60">
                          {corpora.map(c => {
                            const showRegenWarning = needsRegen.has(c.job_id);
                            return (
                              <div key={c.job_id} className="px-4 pl-11 py-3 bg-card">
                                <div className="flex items-center gap-4 mb-1">
                                  <div className="w-px h-7 bg-dborder flex-shrink-0 -ml-7 mr-3" />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[13px] font-semibold text-t1 leading-tight">
                                      {c.project_name || domainLabel(c.domain_label)}
                                    </div>
                                    <div className="text-[10px] text-t3 mt-0.5 flex items-center gap-1 flex-wrap">
                                      {c.file_count > 0 ? `${c.file_count} file${c.file_count !== 1 ? "s" : ""}` : "Corpus ready"}
                                      {c.entity_count > 0 && ` · ${c.entity_count.toLocaleString()} entities`}
                                      {(c.version && c.version > 1) && ` · v${c.version}`}
                                      {c.created_at && ` · ${new Date(c.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`}
                                      {showRegenWarning && (
                                        <span className="text-amber font-semibold">· ⚠ regeneration needed</span>
                                      )}
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
                                    <button onClick={() => setDeleteProjectTarget(c)}
                                      title="Delete workspace"
                                      className="text-[12px] text-t3 hover:text-coral px-1.5 py-1 rounded transition-colors">🗑</button>
                                  </div>
                                </div>
                                {/* Per-file list with delete buttons */}
                                {c.file_list && c.file_list.length > 0 && (
                                  <div className="ml-2 mt-2 space-y-1">
                                    {c.file_list.map(f => (
                                      <div key={f.name} className="flex items-center gap-2 text-[10px] text-t3 group">
                                        <span className="text-[10px]">📄</span>
                                        <span className="flex-1 truncate text-t2">{f.name}</span>
                                        <span className="text-t3 flex-shrink-0">{f.size > 0 ? `${(f.size / 1024).toFixed(0)} KB` : ""}</span>
                                        <button
                                          onClick={() => setDeleteFileTarget({ corpus: c, fileName: f.name })}
                                          title="Remove file"
                                          className="opacity-0 group-hover:opacity-100 text-t3 hover:text-coral transition-all flex-shrink-0 px-1"
                                        >✕</button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
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
