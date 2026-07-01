// Single reusable orchestrator SSE client. Used by Inference Harnessing (in-place
// query) and the Outcome Harnessing chatbot — no duplicated fetch/parse logic.
// The backend orchestrator already does model selection + fallback internally;
// this just streams its events and returns the final output.

export interface OrchestratorEvent {
  type?: string;
  phase?: string;
  step?: number;
  step_name?: string;
  [k: string]: unknown;
}

export interface OrchestratorOutput {
  final_answer?: string;
  slm_model_id?: string | null;
  intent?: string;
  coverage_action?: string;
  hallucination_rate?: number;
  model_recommendations?: unknown;
  [k: string]: unknown;
}

// Streams /orchestrator/ask. Calls onEvent for every SSE event; resolves with the
// final `output` payload (or null if none arrived).
export async function runOrchestrator(
  apiBase: string,
  body: Record<string, unknown>,
  onEvent: (e: OrchestratorEvent) => void,
): Promise<OrchestratorOutput | null> {
  const res = await fetch(`${apiBase}/api/v1/orchestrator/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let output: OrchestratorOutput | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const ev = JSON.parse(line.slice(6)) as OrchestratorEvent;
        if (ev.type === "output") output = ev.data as OrchestratorOutput;
        onEvent(ev);
      } catch { /* skip malformed frame */ }
    }
  }
  return output;
}

// "Answered By" + confidence from a finished orchestrator output.
export function answeredBy(out: OrchestratorOutput | null): { label: string; confidence: number | null } {
  if (!out) return { label: "—", confidence: null };
  const conf = typeof out.hallucination_rate === "number" ? Math.max(0, 1 - out.hallucination_rate) : null;
  const label = out.slm_model_id ? `DHS Custom AI (${out.slm_model_id})` : "Ollama Fallback Model";
  return { label, confidence: conf };
}
