"use client";

const INDUSTRY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  retail:        { bg: "rgba(108,92,247,.1)",  text: "#6c5cf7", border: "rgba(108,92,247,.25)" },
  manufacturing: { bg: "rgba(13,158,116,.1)",  text: "#0d9e74", border: "rgba(13,158,116,.25)" },
  healthcare:    { bg: "rgba(230,55,85,.1)",   text: "#e63755", border: "rgba(230,55,85,.25)"  },
  finance:       { bg: "rgba(217,119,6,.1)",   text: "#d97706", border: "rgba(217,119,6,.25)"  },
  logistics:     { bg: "rgba(96,165,250,.1)",  text: "#60a5fa", border: "rgba(96,165,250,.25)" },
  general:       { bg: "rgba(152,152,176,.1)", text: "#9898b0", border: "rgba(152,152,176,.25)" },
};

const INDUSTRY_ICONS: Record<string, string> = {
  retail: "🛒", manufacturing: "🏭", healthcare: "🏥",
  finance: "🏦", logistics: "🚚", general: "📦",
};

const HEALTH_COLORS = {
  green: { dot: "#16a34a", label: "Ready" },
  amber: { dot: "#d97706", label: "Stale" },
  red:   { dot: "#e63755", label: "Empty" },
};

export interface WorkspaceData {
  job_id: string;
  domain_label: string;
  file_count: number;
  entity_count: number;
  community_count?: number;
  created_at: string;
  file_names?: string[];
  industry?: string;
}

function getHealth(w: WorkspaceData): "green" | "amber" | "red" {
  if (!w.entity_count || w.entity_count === 0) return "red";
  const created = w.created_at ? new Date(w.created_at).getTime() : 0;
  const ageMs = Date.now() - created;
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  if (ageMs > thirtyDaysMs) return "amber";
  return "green";
}

function timeAgo(isoString: string): string {
  if (!isoString) return "";
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface WorkspaceCardProps {
  workspace: WorkspaceData;
  onOpen: (w: WorkspaceData) => void;
  onDelete: (job_id: string) => void;
  onRetry?: () => void;
  onRepair?: () => void;
  onExplore?: () => void;
}

export function WorkspaceCard({ workspace: w, onOpen, onDelete, onRetry, onRepair, onExplore }: WorkspaceCardProps) {
  const industry = w.industry ?? "general";
  const clr = INDUSTRY_COLORS[industry] ?? INDUSTRY_COLORS.general;
  const icon = INDUSTRY_ICONS[industry] ?? "📦";
  const health = getHealth(w);
  const hc = HEALTH_COLORS[health];

  return (
    <div className="group relative bg-white border border-dborder rounded-2xl p-5 hover:border-accent/50 hover:shadow-md transition-all duration-200 flex flex-col gap-3">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
            style={{ background: clr.bg, border: `1px solid ${clr.border}` }}>
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-bold text-t1 truncate">{w.domain_label}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: clr.bg, color: clr.text, border: `1px solid ${clr.border}` }}>
                {industry.charAt(0).toUpperCase() + industry.slice(1)}
              </span>
              <span className="flex items-center gap-1 text-[10px] font-semibold"
                style={{ color: hc.dot }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: hc.dot }} />
                {hc.label}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete(w.job_id); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-t3 hover:text-coral text-[11px] p-1 flex-shrink-0"
          title="Delete workspace"
        >✕</button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Documents", value: w.file_count ?? 0 },
          { label: "Entities",  value: w.entity_count ?? 0 },
          { label: "Communities", value: w.community_count ?? 0 },
        ].map(stat => (
          <div key={stat.label} className="bg-bg2 rounded-lg px-2 py-2 text-center">
            <div className="text-[15px] font-bold text-t1">{stat.value.toLocaleString()}</div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-t3">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-1.5">
          <div className="text-[11px] text-t3">{timeAgo(w.created_at)}</div>
          {onExplore && (
            <button onClick={e => { e.stopPropagation(); onExplore(); }}
              className="text-[10px] text-t3 hover:text-accent border border-dborder2 rounded px-1.5 py-0.5 transition-colors"
              title="Explore graph & search corpus">🔍</button>
          )}
          {onRetry && (
            <button onClick={e => { e.stopPropagation(); onRetry(); }}
              className="text-[10px] text-t3 hover:text-amber border border-dborder2 rounded px-1.5 py-0.5 transition-colors"
              title="Retry (re-embed only if graph exists)">↺</button>
          )}
          {onRepair && (
            <button onClick={e => { e.stopPropagation(); onRepair(); }}
              className="text-[10px] text-t3 hover:text-coral border border-dborder2 rounded px-1.5 py-0.5 transition-colors"
              title="Repair (full reprocess)">⚙</button>
          )}
        </div>
        <button
          onClick={() => onOpen(w)}
          className="text-[12px] font-bold text-accent border border-accent/30 rounded-lg px-4 py-1.5 hover:bg-accent hover:text-white transition-all"
        >
          Open →
        </button>
      </div>
    </div>
  );
}

interface NewWorkspaceCardProps {
  onClick: () => void;
}

export function NewWorkspaceCard({ onClick }: NewWorkspaceCardProps) {
  return (
    <button
      onClick={onClick}
      className="bg-bg2 border-2 border-dashed border-dborder2 rounded-2xl p-5 hover:border-accent hover:bg-accent/5 transition-all duration-200 flex flex-col items-center justify-center gap-3 min-h-[160px] group"
    >
      <div className="w-10 h-10 rounded-xl bg-bg4 border border-dborder flex items-center justify-center text-xl group-hover:bg-accent/10 group-hover:border-accent/30 transition-colors">
        +
      </div>
      <div>
        <div className="text-[13px] font-bold text-t2 group-hover:text-accent">New Workspace</div>
        <div className="text-[11px] text-t3 mt-0.5">Import data & build knowledge base</div>
      </div>
    </button>
  );
}
