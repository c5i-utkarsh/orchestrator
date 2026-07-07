"use client";

export type NodeStatus = "pending" | "running" | "waiting-approval" | "done" | "error";

export interface PipelineNode {
  id: string;
  label: string;
  icon: string;
  status: NodeStatus;
  metric?: string;
}

const STATUS_STYLES: Record<NodeStatus, { ring: string; bg: string; text: string; dot: string }> = {
  pending:          { ring: "#e2e2ee", bg: "#f8f8fc", text: "#9898b0", dot: "#e2e2ee" },
  running:          { ring: "#d97706", bg: "rgba(217,119,6,.08)", text: "#d97706", dot: "#d97706" },
  "waiting-approval": { ring: "#6c5cf7", bg: "rgba(108,92,247,.08)", text: "#6c5cf7", dot: "#6c5cf7" },
  done:             { ring: "#16a34a", bg: "rgba(22,163,74,.08)", text: "#16a34a", dot: "#16a34a" },
  error:            { ring: "#e63755", bg: "rgba(230,55,85,.08)", text: "#e63755", dot: "#e63755" },
};

function NodeStatusDot({ status }: { status: NodeStatus }) {
  const s = STATUS_STYLES[status];
  if (status === "running") {
    return (
      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full animate-ping"
        style={{ background: s.dot, opacity: 0.6 }} />
    );
  }
  if (status === "waiting-approval") {
    return (
      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white"
        style={{ background: s.dot }} />
    );
  }
  if (status === "done") {
    return (
      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white flex items-center justify-center text-white"
        style={{ background: s.dot, fontSize: 7, lineHeight: 1 }}>✓</span>
    );
  }
  return null;
}

function EdgeLine({ from, to, active, done }: { from: NodeStatus; to: NodeStatus; active: boolean; done: boolean }) {
  const color = done ? "#16a34a" : active ? "#d97706" : "#e2e2ee";
  return (
    <div className="flex items-center w-full">
      <div className="relative w-full h-0.5 rounded-full overflow-hidden" style={{ background: "#e2e2ee" }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{ background: color, width: done ? "100%" : active ? "60%" : "0%" }}
        />
        {active && (
          <div className="absolute inset-0 rounded-full flow-pulse-anim"
            style={{ background: `linear-gradient(90deg, transparent, ${color}80, transparent)` }}
          />
        )}
      </div>
    </div>
  );
}

interface PipelineCanvasProps {
  nodes: PipelineNode[];
  onNodeClick?: (node: PipelineNode) => void;
}

export default function PipelineCanvas({ nodes, onNodeClick }: PipelineCanvasProps) {
  return (
    <div className="w-full overflow-x-auto">
      {/* Fixed 88px per node + flex edge lines prevents label overflow into edges */}
      <div className="flex items-start px-4 py-6" style={{ minWidth: nodes.length * 104 + 32 }}>
        {nodes.map((node, i) => {
          const s = STATUS_STYLES[node.status];
          const isClickable = node.status === "waiting-approval" && onNodeClick;
          const nextNode = nodes[i + 1];
          const edgeActive = node.status === "running" || node.status === "done";
          const edgeDone = node.status === "done" && nextNode?.status !== "pending";

          return (
            <div key={node.id} className="flex items-start" style={{ flex: "0 0 auto" }}>
              {/* Node — fixed width so labels can't bleed into neighbours */}
              <div
                className="flex flex-col items-center"
                style={{ width: 88 }}
              >
                {/* Icon circle */}
                <div
                  className={`relative w-11 h-11 rounded-2xl flex items-center justify-center text-lg border-2 transition-all duration-300 flex-shrink-0${isClickable ? " cursor-pointer hover:scale-110" : ""}${node.status === "waiting-approval" ? " animate-pulse" : ""}`}
                  style={{
                    background: s.bg,
                    borderColor: s.ring,
                    boxShadow: node.status !== "pending" ? `0 0 0 3px ${s.ring}22` : "none",
                  }}
                  onClick={() => isClickable && onNodeClick(node)}
                  title={node.status === "waiting-approval" ? "Click to review & approve" : undefined}
                >
                  {node.icon}
                  <NodeStatusDot status={node.status} />
                </div>

                {/* Label block — constrained to node width */}
                <div className="mt-2 text-center" style={{ width: 88 }}>
                  <div
                    className="text-[10px] font-semibold leading-snug"
                    style={{ color: node.status === "pending" ? "#9898b0" : s.text, overflowWrap: "break-word", wordBreak: "break-word" }}
                  >
                    {node.label}
                  </div>
                  {node.metric && (
                    <div className="text-[9px] font-semibold mt-0.5 truncate" style={{ color: s.text }}>{node.metric}</div>
                  )}
                  {node.status === "running" && (
                    <div className="text-[9px] font-semibold text-amber mt-0.5 animate-pulse">active</div>
                  )}
                  {node.status === "waiting-approval" && (
                    <div className="text-[9px] font-bold text-accent mt-0.5 animate-pulse">Tap to review</div>
                  )}
                  {node.status === "done" && (
                    <div className="text-[9px] font-semibold mt-0.5" style={{ color: "#16a34a" }}>✓ done</div>
                  )}
                </div>
              </div>

              {/* Edge connector — only between nodes, centred on the icon row */}
              {i < nodes.length - 1 && (
                <div className="flex items-center flex-shrink-0" style={{ width: 16, paddingTop: 22 }}>
                  <EdgeLine
                    from={node.status}
                    to={nodes[i + 1].status}
                    active={edgeActive}
                    done={edgeDone}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
