"use client";

import { useEffect, useRef, useState } from "react";
import { runOrchestrator, answeredBy, type OrchestratorOutput } from "../../lib/orchestrator";

// Persistent Outcome-Harnessing chatbot. Reuses the orchestrator (which already
// does Custom-AI-first + automatic Ollama fallback internally); this just shows
// who answered + confidence and persists history. No manual model selection,
// no rebuild — inference only. ponytail: reuses runOrchestrator + answeredBy.

interface ChatMsg {
  q: string;
  a: string;
  model: string;      // Answered By
  confidence: number | null;
  ts: number;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const histKey = (domain: string) => `dhs_chat_${domain || "general"}`;

export default function ChatBot({ domainLabel, jobId }: { domainLabel: string; jobId: string }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load persisted history for this domain
  useEffect(() => {
    try {
      const raw = localStorage.getItem(histKey(domainLabel));
      if (raw) setMsgs(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [domainLabel]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const persist = (next: ChatMsg[]) => {
    setMsgs(next);
    try { localStorage.setItem(histKey(domainLabel), JSON.stringify(next.slice(-50))); } catch { /* ignore */ }
  };

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput(""); setBusy(true);
    try {
      const out = await runOrchestrator(API, { query: q, domain_label: domainLabel, job_id: jobId }, () => {});
      const ab = answeredBy(out as OrchestratorOutput | null);
      persist([...msgs, {
        q, a: out?.final_answer ?? "No answer returned.",
        model: ab.label, confidence: ab.confidence, ts: Date.now(),
      }]);
    } catch (e: any) {
      persist([...msgs, { q, a: `⚠ ${e.message ?? "Query failed"}`, model: "—", confidence: null, ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-[520px] bg-card border border-dborder rounded-card overflow-hidden">
      <div className="px-4 py-3 border-b border-dborder flex items-center justify-between">
        <div className="text-[12px] font-semibold text-t1">AI Conversation · {domainLabel || "general"}</div>
        {msgs.length > 0 && (
          <button onClick={() => persist([])} className="text-[10px] text-t3 hover:text-coral">Clear</button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {msgs.length === 0 && !busy && (
          <div className="text-[11px] text-t3 text-center py-8">Ask anything about your {domainLabel || "domain"} knowledge.</div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-end">
              <div className="max-w-[80%] bg-accent/10 border border-accent/20 rounded-card px-3 py-2 text-[12px] text-t1">{m.q}</div>
            </div>
            <div className="flex justify-start">
              <div className="max-w-[85%] bg-bg3 border border-dborder rounded-card px-3 py-2">
                <div className="text-[12px] text-t1 whitespace-pre-wrap leading-relaxed">{m.a}</div>
                <div className="text-[9px] text-t3 mt-1.5">
                  Answered by <span className="font-semibold text-t2">{m.model}</span>
                  {m.confidence !== null && <span className="text-gg"> · {(m.confidence * 100).toFixed(0)}% conf</span>}
                </div>
              </div>
            </div>
          </div>
        ))}
        {busy && <div className="text-[11px] text-t3 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> thinking…</div>}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-dborder p-3 flex gap-2">
        <input
          className="flex-1 bg-bg3 border border-dborder2 rounded-card px-3 py-2 text-[12px] text-t1 outline-none focus:border-accent"
          placeholder="Ask a follow-up…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          disabled={busy}
        />
        <button onClick={send} disabled={busy || !input.trim()} className="btn btn-p px-4 text-[12px] disabled:opacity-40">Send</button>
      </div>
    </div>
  );
}
