// DHS session state machine — single source of truth for the enterprise workflow.
// Replaces scattered sessionStorage keys + ad-hoc router.push with one persisted
// Session object and stage-driven navigation. Legacy keys (job_id, domain_label,
// query, reuse_corpus) are mirrored on write so existing pages keep reading them.
// ponytail: one module, no store library — sessionStorage is the persistence.

import type { useRouter } from "next/navigation";

export type Stage =
  | "NEW_SESSION"
  | "INFORMATION_HARNESSING"
  | "CHECK_KNOWLEDGE"
  | "OPTIONAL_REBUILD"
  | "INFERENCE"
  | "OUTCOME"
  | "BENCHMARK";

// State machine → route. The stage IS the navigation driver.
export const STAGE_ROUTE: Record<Stage, string> = {
  NEW_SESSION:            "/",
  INFORMATION_HARNESSING: "/",
  CHECK_KNOWLEDGE:        "/",
  OPTIONAL_REBUILD:       "/processing",
  INFERENCE:              "/query",
  OUTCOME:                "/recommendations",
  BENCHMARK:              "/benchmarking",
};

export interface Session {
  session_id: string | null;         // = ingest job_id
  domain: string | null;             // = domain_label
  data_sources: string[];            // uploaded file names / "db:<name>"
  kg_version: string | null;         // knowledge graph version (job_id of last graph_done)
  wiki_version: string | null;
  slm_version: string | null;        // current SLM model_id
  last_ingested_at: string | null;
  knowledge_changed: boolean;
  stage: Stage;
  // Information-Harnessing wizard fields (carried for benchmarking/context)
  business_unit?: string;
  description?: string;
  industry?: string;
  tags?: string;
}

const KEY = "dhs_session";

const DEFAULT: Session = {
  session_id: null, domain: null, data_sources: [],
  kg_version: null, wiki_version: null, slm_version: null,
  last_ingested_at: null, knowledge_changed: false, stage: "NEW_SESSION",
};

export function getSession(): Session {
  if (typeof window === "undefined") return { ...DEFAULT };
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...JSON.parse(raw) } : { ...DEFAULT };
  } catch {
    return { ...DEFAULT };
  }
}

export function setSession(patch: Partial<Session>): Session {
  const next = { ...getSession(), ...patch };
  if (typeof window !== "undefined") {
    sessionStorage.setItem(KEY, JSON.stringify(next));
    // Mirror legacy keys so existing pages (that read these directly) keep working.
    if (next.session_id) sessionStorage.setItem("job_id", next.session_id);
    if (next.domain)     sessionStorage.setItem("domain_label", next.domain);
  }
  return next;
}

type Router = ReturnType<typeof useRouter>;

// State-driven navigation: set the stage, then route to it. Pages call this
// instead of raw router.push so navigation always follows the state machine.
export function goToStage(router: Router, stage: Stage, patch: Partial<Session> = {}): Session {
  const s = setSession({ ...patch, stage });
  router.push(STAGE_ROUTE[stage]);
  return s;
}

// CHECK_KNOWLEDGE decision (pure): given whether the corpus was reused (no new
// ingest), whether the user added new data, and whether an SLM already exists,
// decide the next stage. Knowledge unchanged + SLM present → skip rebuild,
// go straight to inference. Otherwise rebuild.
export function nextStageAfterInformation(opts: {
  reused: boolean; uploadedNew: boolean; slmExists: boolean;
}): { stage: Stage; knowledge_changed: boolean } {
  const knowledge_changed = opts.uploadedNew || !opts.reused;
  if (!knowledge_changed && opts.slmExists) {
    return { stage: "INFERENCE", knowledge_changed: false };
  }
  return { stage: "OPTIONAL_REBUILD", knowledge_changed };
}
