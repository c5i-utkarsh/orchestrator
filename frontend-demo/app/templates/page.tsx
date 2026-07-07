"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  type CustomTemplate, type CustomStep,
  loadCustomTemplates, saveCustomTemplates, deleteCustomTemplate,
  newTemplateId, newStepId,
  STEP_ICON_OPTIONS, STEP_VARIABLE_HINTS,
} from "../lib/customTemplates";

const DEFAULT_PROMPT = `From the {domain} knowledge base, address the following goal:

"{query}"

{prevOutput ? "Building on the previous step:\\n\\n{prevOutput}\\n\\n---\\n\\n" : ""}

Provide a structured, thorough response grounded in the corpus.`;

function emptyStep(): CustomStep {
  return {
    id: newStepId(),
    label: "",
    icon: "🔬",
    purpose: "",
    promptTemplate: `From the {domain} knowledge base, address:\n\n"{query}"\n\n{prevOutput}\n\nProvide a structured, thorough response.`,
  };
}

function emptyTemplate(): Omit<CustomTemplate, "id" | "createdAt" | "updatedAt"> {
  return {
    name: "",
    description: "",
    intent: "CUSTOM",
    steps: [emptyStep()],
  };
}

// ─── Variable hint pill ────────────────────────────────────────────────────
function VarPill({ variable, onClick }: { variable: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
    >
      {variable}
    </button>
  );
}

// ─── Icon picker ──────────────────────────────────────────────────────────
function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-10 h-10 text-xl rounded-card border border-dborder bg-bg3 hover:border-accent/50 transition-colors flex items-center justify-center"
      >
        {value}
      </button>
      {open && (
        <div className="absolute z-20 top-11 left-0 bg-card border border-dborder rounded-card p-2 grid grid-cols-6 gap-1 shadow-lg">
          {STEP_ICON_OPTIONS.map(icon => (
            <button
              key={icon}
              type="button"
              onClick={() => { onChange(icon); setOpen(false); }}
              className={`w-8 h-8 text-lg rounded flex items-center justify-center hover:bg-bg4 transition-colors ${icon === value ? "bg-accent/15 border border-accent/40" : ""}`}
            >
              {icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Step editor ─────────────────────────────────────────────────────────
function StepEditor({
  step, idx, total,
  onChange, onDelete, onMoveUp, onMoveDown,
}: {
  step: CustomStep; idx: number; total: number;
  onChange: (s: CustomStep) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const insertVar = (variable: string) => {
    onChange({ ...step, promptTemplate: step.promptTemplate + variable });
  };

  return (
    <div className="border border-dborder rounded-card p-4 bg-card2">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-[10px] font-bold text-accent flex-shrink-0">
          {idx + 1}
        </div>
        <IconPicker value={step.icon} onChange={icon => onChange({ ...step, icon })} />
        <input
          className="flex-1 bg-bg3 border border-dborder2 rounded-card px-3 py-1.5 text-[12px] text-t1 placeholder-t3 outline-none focus:border-accent/50"
          placeholder="Step label (e.g. Extract key requirements)"
          value={step.label}
          onChange={e => onChange({ ...step, label: e.target.value })}
        />
        <div className="flex gap-1 flex-shrink-0">
          <button type="button" onClick={onMoveUp} disabled={idx === 0}
            className="btn btn-sm px-2 py-1 disabled:opacity-30" title="Move up">↑</button>
          <button type="button" onClick={onMoveDown} disabled={idx === total - 1}
            className="btn btn-sm px-2 py-1 disabled:opacity-30" title="Move down">↓</button>
          <button type="button" onClick={onDelete}
            className="btn btn-sm text-coral border-coral/30 bg-coral/10 hover:bg-coral/20 px-2 py-1" title="Delete step">✕</button>
        </div>
      </div>

      <input
        className="w-full bg-bg3 border border-dborder2 rounded-card px-3 py-1.5 text-[11px] text-t2 placeholder-t3 outline-none focus:border-accent/50 mb-3"
        placeholder="Step purpose / description (shown to user before running)"
        value={step.purpose}
        onChange={e => onChange({ ...step, purpose: e.target.value })}
      />

      <div className="mb-1.5">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[10px] font-semibold text-t3 uppercase tracking-wider">Prompt template</div>
          <div className="flex items-center gap-1 flex-wrap">
            {STEP_VARIABLE_HINTS.map(h => (
              <VarPill key={h.variable} variable={h.variable} onClick={() => insertVar(h.variable)} />
            ))}
          </div>
        </div>
        <textarea
          className="w-full bg-bg3 border border-dborder2 rounded-card px-3 py-2.5 text-[11px] text-t1 placeholder-t3 outline-none focus:border-accent/50 font-mono resize-y min-h-[100px]"
          placeholder="Write the prompt for this step. Use {query}, {prevOutput}, {domain}, {topic}, {topics} as variables."
          value={step.promptTemplate}
          onChange={e => onChange({ ...step, promptTemplate: e.target.value })}
        />
        <div className="text-[9px] text-t3 mt-1">
          Click a variable pill to append it, or type it directly.
        </div>
      </div>
    </div>
  );
}

// ─── Template editor panel ────────────────────────────────────────────────
function TemplateEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial?: CustomTemplate;
  onSave: (t: CustomTemplate) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [steps, setSteps] = useState<CustomStep[]>(initial?.steps ?? [emptyStep()]);

  const updateStep = (idx: number, s: CustomStep) =>
    setSteps(prev => prev.map((x, i) => i === idx ? s : x));
  const deleteStep = (idx: number) =>
    setSteps(prev => prev.filter((_, i) => i !== idx));
  const moveStep = (idx: number, dir: -1 | 1) => {
    setSteps(prev => {
      const a = [...prev];
      const b = idx + dir;
      if (b < 0 || b >= a.length) return a;
      [a[idx], a[b]] = [a[b], a[idx]];
      return a;
    });
  };

  const valid = name.trim().length > 0 && steps.length > 0 &&
    steps.every(s => s.label.trim() && s.promptTemplate.trim());

  const handleSave = () => {
    if (!valid) return;
    const now = new Date().toISOString();
    onSave({
      id: initial?.id ?? newTemplateId(),
      name: name.trim(),
      description: description.trim(),
      intent: "CUSTOM",
      steps,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-semibold text-t1">
          {initial ? "Edit template" : "New process template"}
        </div>
        <button onClick={onCancel} className="btn btn-sm text-t3">✕ Cancel</button>
      </div>

      <div className="space-y-2">
        <input
          className="w-full bg-bg3 border border-dborder2 rounded-card px-4 py-2.5 text-[13px] text-t1 placeholder-t3 outline-none focus:border-accent/50"
          placeholder="Template name (e.g. Client Requirements Review)"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <input
          className="w-full bg-bg3 border border-dborder2 rounded-card px-4 py-2 text-[11px] text-t2 placeholder-t3 outline-none focus:border-accent/50"
          placeholder="Short description of what this process does"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-t3">
          Steps ({steps.length})
        </div>
        {steps.map((step, i) => (
          <StepEditor
            key={step.id}
            step={step}
            idx={i}
            total={steps.length}
            onChange={s => updateStep(i, s)}
            onDelete={() => deleteStep(i)}
            onMoveUp={() => moveStep(i, -1)}
            onMoveDown={() => moveStep(i, 1)}
          />
        ))}
        <button
          type="button"
          onClick={() => setSteps(prev => [...prev, emptyStep()])}
          className="btn w-full py-2 text-[11px] border-dashed border-accent/30 text-accent hover:bg-accent/5"
        >
          + Add step
        </button>
      </div>

      <button
        onClick={handleSave}
        disabled={!valid}
        className="btn btn-p btn-full py-2.5 text-[12px] disabled:opacity-40"
      >
        {initial ? "Save changes" : "Create template"} →
      </button>
    </div>
  );
}

// ─── Template card ─────────────────────────────────────────────────────────
function TemplateCard({
  template, onEdit, onDelete, onUse,
}: {
  template: CustomTemplate;
  onEdit: () => void;
  onDelete: () => void;
  onUse: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="card group">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-purple-600/15 border border-purple-600/30 flex items-center justify-center text-[11px] font-bold text-purple-400 flex-shrink-0">
          {template.steps.length}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-t1">{template.name}</div>
          {template.description && (
            <div className="text-[11px] text-t3 mt-0.5">{template.description}</div>
          )}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {template.steps.map((s, i) => (
              <span key={s.id} className="text-[10px] px-1.5 py-0.5 rounded border border-dborder bg-bg4 text-t3">
                {s.icon} {s.label || `Step ${i + 1}`}
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="btn btn-sm text-accent border-accent/30 bg-accent/10 hover:bg-accent/20">Edit</button>
          <button onClick={onDelete} className="btn btn-sm text-coral border-coral/30 bg-coral/10 hover:bg-coral/20">✕</button>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={onUse}
          className="btn btn-p btn-sm flex-1 text-[11px]"
        >
          Use this template →
        </button>
        <button
          onClick={() => setExpanded(o => !o)}
          className="btn btn-sm text-[10px] text-t3"
        >
          {expanded ? "Hide steps ▲" : "Preview steps ▼"}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          {template.steps.map((s, i) => (
            <div key={s.id} className="flex gap-2 items-start bg-bg3 border border-dborder rounded-card px-3 py-2">
              <span className="text-[11px] mt-0.5 flex-shrink-0">{s.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-t1">Step {i + 1}: {s.label}</div>
                {s.purpose && <div className="text-[10px] text-t3 mt-0.5">{s.purpose}</div>}
                <pre className="text-[9px] text-t3 mt-1.5 font-mono whitespace-pre-wrap line-clamp-3 leading-relaxed">
                  {s.promptTemplate}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────
export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<CustomTemplate[]>([]);
  const [editing, setEditing] = useState<CustomTemplate | null | "new">(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    setTemplates(loadCustomTemplates());
  }, []);

  const persist = (updated: CustomTemplate[]) => {
    setTemplates(updated);
    saveCustomTemplates(updated);
  };

  const handleSave = (t: CustomTemplate) => {
    const existing = templates.filter(x => x.id !== t.id);
    persist([t, ...existing]);
    setEditing(null);
  };

  const handleDelete = (id: string) => {
    persist(templates.filter(t => t.id !== id));
    setDeleteConfirm(null);
  };

  const handleUse = (t: CustomTemplate) => {
    sessionStorage.setItem("use_custom_template", t.id);
    router.push("/query");
  };

  return (
    <div className="min-h-screen bg-bg1">
      <div className="max-w-[680px] mx-auto px-5 py-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.push("/query")} className="btn btn-sm text-t3">← Back</button>
          <div className="flex-1">
            <div className="text-[18px] font-bold text-t1">Process Templates</div>
            <div className="text-[11px] text-t3 mt-0.5">Build and manage reusable multi-step process templates</div>
          </div>
          {editing === null && (
            <button onClick={() => setEditing("new")} className="btn btn-p btn-sm">
              + New template
            </button>
          )}
        </div>

        {/* Editor panel */}
        {editing !== null && (
          <div className="card mb-6">
            <TemplateEditor
              initial={editing === "new" ? undefined : (editing as CustomTemplate)}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
            />
          </div>
        )}

        {/* Empty state */}
        {editing === null && templates.length === 0 && (
          <div className="text-center py-16 text-t3">
            <div className="text-4xl mb-3">🗂️</div>
            <div className="text-[13px] font-semibold text-t2 mb-1">No custom templates yet</div>
            <div className="text-[11px] mb-4">
              Create a template to build repeatable, ownable processes tailored to your workflow.
            </div>
            <button onClick={() => setEditing("new")} className="btn btn-p btn-sm">
              Create your first template →
            </button>
          </div>
        )}

        {/* Template list */}
        {editing === null && templates.length > 0 && (
          <div className="space-y-3">
            {templates.map(t => (
              <TemplateCard
                key={t.id}
                template={t}
                onEdit={() => setEditing(t)}
                onDelete={() => setDeleteConfirm(t.id)}
                onUse={() => handleUse(t)}
              />
            ))}
          </div>
        )}

        {/* Variable reference */}
        {editing === null && (
          <div className="mt-8 card bg-bg3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-t3 mb-2">
              Available prompt variables
            </div>
            <div className="space-y-1.5">
              {STEP_VARIABLE_HINTS.map(h => (
                <div key={h.variable} className="flex items-start gap-2">
                  <code className="font-mono text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded border border-accent/20 flex-shrink-0">
                    {h.variable}
                  </code>
                  <span className="text-[11px] text-t3">{h.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation overlay */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-card border border-dborder rounded-card p-6 max-w-sm w-full shadow-xl">
            <div className="text-[13px] font-semibold text-t1 mb-2">Delete template?</div>
            <div className="text-[11px] text-t3 mb-5">
              "{templates.find(t => t.id === deleteConfirm)?.name}" will be permanently removed.
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleDelete(deleteConfirm)} className="btn btn-sm flex-1 text-coral border-coral/30 bg-coral/10 hover:bg-coral/20">
                Delete
              </button>
              <button onClick={() => setDeleteConfirm(null)} className="btn btn-sm flex-1">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
