"use client";

import { useState, useEffect, useRef } from "react";
import { getProcessPlan, getProcessMeta, type ProcessStep, type ProcessStepMeta, type PathType as ProcessPathType } from "../lib/processTemplates";
import { loadCustomTemplates, customTemplateToProcessSteps, type CustomTemplate } from "../lib/customTemplates";

interface StoredCorpus {
  job_id: string; domain_label: string; file_count: number; entity_count: number; created_at: string;
}
interface WikiArticle {
  title: string; passages?: string[]; content?: string; entities?: string[];
}
type PathType = "BUILDER" | "RESEARCHER" | "ANALYST" | "AUDITOR" | "SUMMARIZER";
interface SuggestionCard {
  id: string; label: string; desc: string; icon: string; badge?: string; intent: PathType; topicHint: string;
  skipQuestions?: string[];           // follow-up question IDs to skip (already answered by card choice)
  preAnswers?: Record<string, string>; // pre-filled answers for skipped questions
  prefillQuery?: string; // directly use this query in phase 2 when provided
}
interface QOpt { id: string; label: string; icon: string; }
interface ChatQuestion { id: string; question: string; opts: QOpt[]; allowOther?: boolean; }
interface ChatMsg { role: "ai"|"user"; text: string; questionId?: string; options?: QOpt[]; allowOther?: boolean; }
interface ProcessInfo {
  intent: ProcessPathType;
  topic: string;
  steps: ProcessStepMeta[];
  selectedTopics: string[];
  customTemplateId?: string;
}
interface PromptBuilderProps {
  corpus: StoredCorpus | null;
  onUsePrompt: (query: string, systemPrompt: string, processInfo?: ProcessInfo) => void;
  onManual: () => void;
}

const INTENT_META: Record<PathType, { label: string; icon: string; color: string }> = {
  BUILDER:    { label: "Project Builder",  icon: "🏗️", color: "#6c5cf7" },
  RESEARCHER: { label: "Research Q&A",     icon: "🔬", color: "#0d9e74" },
  ANALYST:    { label: "Data Analysis",    icon: "📊", color: "#d97706" },
  AUDITOR:    { label: "Compliance Audit", icon: "✅", color: "#e63755" },
  SUMMARIZER: { label: "Smart Summary",    icon: "📝", color: "#60a5fa" },
};

function topicIcon(title: string): string {
  const t = title.toLowerCase();
  if (/architect|design|system|structur/.test(t)) return "🏗️";
  if (/neural|model|gpt|llm|transformer|attention|embed|train/.test(t)) return "🧠";
  if (/data|dataset|corpus|statistic|metric|analys/.test(t)) return "📊";
  if (/code|implement|algorithm|function|class|api|endpoint/.test(t)) return "💻";
  if (/policy|compliance|regulation|security|gdpr|hipaa|audit/.test(t)) return "⚖️";
  if (/token|vocab|bpe|encode|decode/.test(t)) return "🔤";
  if (/loss|optim|gradient|backprop|epoch|batch/.test(t)) return "⚡";
  if (/infer|generat|output|predict|sample/.test(t)) return "🎯";
  return "📄";
}

function detectPath(query: string): PathType {
  const q = query.toLowerCase();
  if (/\b(build|create|develop|design|architect|make|implement|set up|application|app|platform|system|tool)\b/.test(q)) return "BUILDER";
  if (/\b(analyz|compar|pattern|trend|investigat|discover)\b/.test(q)) return "ANALYST";
  if (/\b(compliance|policy|check|gap|regulation|verify|conform|adhere)\b/.test(q)) return "AUDITOR";
  if (/\b(summar|overview|brief|report|digest|condense|abstract)\b/.test(q)) return "SUMMARIZER";
  return "RESEARCHER";
}

// SLM suggestions can be bare strings or {label, desc, prompt} objects from the backend
type SlmSuggestionRaw = string | { label?: string; desc?: string; prompt?: string };

function cardsFromSlmSuggestions(items: SlmSuggestionRaw[], domain: string): SuggestionCard[] {
  return items.slice(0, 10).map((item, idx) => {
    // Normalise to plain text — handle both string and object format
    const text    = typeof item === "string" ? item : String(item?.label ?? item?.prompt ?? "");
    const descTxt = typeof item === "string"
      ? `Suggested by your custom AI for ${domain}`
      : String(item?.desc ?? `Suggested by your custom AI for ${domain}`);
    const prefill = typeof item === "string" ? item : String(item?.prompt ?? item?.label ?? text);
    if (!text) return null;
    const intent = detectPath(text);
    const icon = INTENT_META[intent].icon;
    return {
      id: `slm_${idx}`,
      label: text,
      desc: descTxt,
      icon,
      badge: "Custom AI",
      intent,
      topicHint: text,
      prefillQuery: prefill,
    };
  }).filter((c): c is NonNullable<typeof c> => c !== null) as SuggestionCard[];
}

/** Maps wizard use-case IDs to the PathType they represent, so PromptBuilder
 *  can avoid showing a duplicate intent card. */
const USE_CASE_INTENT_MAP: Record<string, PathType> = {
  build_app:       "BUILDER",
  code_qa:         "RESEARCHER",
  product_qa:      "RESEARCHER",
  document_qa:     "RESEARCHER",
  tracking_qa:     "RESEARCHER",
  supplier_qa:     "RESEARCHER",
  clinical_qa:     "RESEARCHER",
  contract_review: "RESEARCHER",
  incident:        "ANALYST",
  quality:         "ANALYST",
  risk:            "ANALYST",
  catalog_search:  "ANALYST",
  compliance:      "AUDITOR",
  summarize:       "SUMMARIZER",
};

/** Generates specific sub-option cards for an intent that was already chosen in the wizard.
 *  These replace the generic "Build a system around X" style card with concrete output-focused options. */
function buildSpecificCards(intent: PathType, t0: string, t1: string, domain: string): SuggestionCard[] {
  if (intent === "BUILDER") return [
    { id:"build_arch",  icon:"🗺️", intent:"BUILDER", topicHint:t0,
      skipQuestions:["purpose","output_format"], preAnswers:{purpose:"production", output_format:"architecture"},
      label:`Design the architecture for ${t0}`,
      desc:`Component breakdown, data flow, and interfaces for a production-ready ${t0} system` },
    { id:"build_code",  icon:"💻", intent:"BUILDER", topicHint:t0,
      skipQuestions:["purpose","output_format"], preAnswers:{purpose:"prototype", output_format:"code"},
      label:`Generate implementation code for ${t0}`,
      desc:`Working, commented code covering the key components of ${t0}${t1?` and ${t1}`:""}` },
    { id:"build_guide", icon:"📋", intent:"BUILDER", topicHint:t0,
      skipQuestions:["purpose","output_format"], preAnswers:{purpose:"production", output_format:"guide"},
      label:`Step-by-step build guide for ${t0}`,
      desc:`Numbered implementation guide to build ${t0} from scratch` },
  ];
  if (intent === "RESEARCHER") return [
    { id:"res_deep",     icon:"🔬", intent:"RESEARCHER", topicHint:t0,
      skipQuestions:["depth","include"], preAnswers:{depth:"deep", include:"all"},
      label:`Deep dive: how ${t0} works`,
      desc:`Internals, design decisions, and trade-offs of ${t0}${t1?` vs ${t1}`:""}` },
    { id:"res_examples", icon:"💻", intent:"RESEARCHER", topicHint:t0,
      skipQuestions:["depth","include"], preAnswers:{depth:"detailed", include:"code"},
      label:`${t0} explained with code examples`,
      desc:`Detailed explanation of ${t0} backed by concrete working code snippets` },
  ];
  if (intent === "AUDITOR") return [
    { id:"audit_gaps",  icon:"🔍", intent:"AUDITOR", topicHint:t0,
      skipQuestions:["scope"], preAnswers:{scope:"gaps"},
      label:`Find coverage gaps in ${t0}`,
      desc:`Identify what's missing or not adequately addressed in ${domain}` },
    { id:"audit_risks", icon:"⚠️", intent:"AUDITOR", topicHint:t0,
      skipQuestions:["scope"], preAnswers:{scope:"risks"},
      label:`Risk assessment of ${t0}`,
      desc:`Surface risks and vulnerabilities based on your ${domain} documents` },
  ];
  if (intent === "ANALYST") return [
    { id:"analyst_themes", icon:"🧩", intent:"ANALYST", topicHint:t0,
      skipQuestions:["discover"], preAnswers:{discover:"themes"},
      label:`Identify recurring themes in ${t0}`,
      desc:`Map patterns across ${[t0,t1].filter(Boolean).join(" and ")}` },
    { id:"analyst_gaps",   icon:"🔍", intent:"ANALYST", topicHint:t0,
      skipQuestions:["discover"], preAnswers:{discover:"gaps"},
      label:`Find gaps and anomalies in ${t0}`,
      desc:`Discover inconsistencies and missing coverage in ${domain}` },
  ];
  if (intent === "SUMMARIZER") return [
    { id:"sum_exec", icon:"👔", intent:"SUMMARIZER", topicHint:t0,
      skipQuestions:["scope","audience"], preAnswers:{scope:"key", audience:"executive"},
      label:`Executive summary of ${t0}`,
      desc:`Key findings from ${domain}, structured for leadership` },
    { id:"sum_tech", icon:"💻", intent:"SUMMARIZER", topicHint:t0,
      skipQuestions:["scope","audience"], preAnswers:{scope:"full", audience:"technical"},
      label:`Technical summary of ${t0}`,
      desc:`Full structured summary of ${domain} for a technical audience` },
  ];
  return [];
}

function generateSuggestions(articles: WikiArticle[], domain: string, hasSLM: boolean, selectedUseCase = "", seed = 0): SuggestionCard[] {
  const allText = articles.slice(0,8).map(a => a.title+" "+(a.passages?.[0]??a.content??"").slice(0,200)).join(" ").toLowerCase();
  const t0=articles[0]?.title??domain, t1=articles[1]?.title??"", t2=articles[2]?.title??"", t3=articles[3]?.title??"";
  const t4=articles[4]?.title??"", t5=articles[5]?.title??"";

  const isML   = /model|neural|transformer|embedding|train|gradient|gpt|llm|bert|attention|tokeniz|backprop/.test(allText);
  const isCode = /function|class|import|def |api|endpoint|schema|database|rest|graphql|interface/.test(allText);
  const isDoc  = /policy|compliance|regulation|procedure|guideline|hipaa|gdpr|iso|soc/.test(allText);
  const isData = /data|metric|kpi|report|dashboard|trend|analytic|measure|statistic/.test(allText);
  const isProc = /process|workflow|automat|pipeline|schedule|trigger|batch|task/.test(allText);

  // ── Category 1: Research & Q&A (RESEARCHER) ─────────────────────────────
  const researchCards: SuggestionCard[] = [
    { id:"r1", icon:"🔬", intent:"RESEARCHER", topicHint:t0,
      label:`Deep dive: how ${t0} works`,
      desc:`Detailed explanation of ${t0}${t1?` and ${t1}`:""}  — internals, trade-offs, and design decisions` },
    { id:"r2", icon:"📚", intent:"RESEARCHER", topicHint:t1||t0,
      label:`Compare ${t0}${t1?` vs ${t1}`:" approaches"} in detail`,
      desc:`Side-by-side analysis of ${t0}${t1?` and ${t1}`:" techniques"} from your knowledge base` },
    { id:"r3", icon:"❓", intent:"RESEARCHER", topicHint:t2||t0,
      label:`Answer: what are the key principles behind ${t2||t0}?`,
      desc:`Sourced Q&A from your corpus about ${t2||t0} and its core concepts` },
    { id:"r4", icon:"🧠", intent:"RESEARCHER", topicHint:t0,
      label:`Explain ${t0} as if teaching a team`,
      desc:`Structured explanation of ${t0} concepts with examples suitable for team onboarding` },
    { id:"r5", icon:"🔗", intent:"RESEARCHER", topicHint:t1||t0,
      label:`How do ${t0}${t3?` and ${t3}`:""} relate to each other?`,
      desc:`Map the connections and dependencies between ${[t0,t1,t3].filter(Boolean).join(", ")}` },
    { id:"r6", icon:"📖", intent:"RESEARCHER", topicHint:t4||t0,
      label:`What does your corpus say about ${t4||t0}?`,
      desc:`Extract key insights and facts about ${t4||t0} from your uploaded documents` },
  ];

  // ── Category 2: Application Development (BUILDER) ────────────────────────
  const builderCards: SuggestionCard[] = [
    { id:"b1", icon:"🏗️", intent:"BUILDER", topicHint:t0,
      label:`Design a production system based on ${t0}`,
      desc:`Full architecture, components, data flow, and interfaces — production-ready` },
    { id:"b2", icon:"💻", intent:"BUILDER", topicHint:t1||t0,
      label:`Generate implementation code for ${t1||t0}`,
      desc:`Working, commented code covering the core implementation of ${t1||t0}` },
    { id:"b3", icon:"🧪", intent:"BUILDER", topicHint:t2||t0,
      label:`Build a prototype API for ${t2||t0}`,
      desc:`API design, endpoint structure, and example payloads based on your ${domain} corpus` },
    { id:"b4", icon:"📋", intent:"BUILDER", topicHint:t0,
      label:`Step-by-step build guide: ${t0}`,
      desc:`Numbered implementation plan I can follow to build ${t0} from scratch` },
    { id:"b5", icon:"🔧", intent:"BUILDER", topicHint:t3||t0,
      label:`Extend the ${t3||t0} system with new capabilities`,
      desc:`Design additions and integrations to an existing ${domain} system` },
    { id:"b6", icon:"🚀", intent:"BUILDER", topicHint:t0,
      label:`Production deployment plan for ${t0}`,
      desc:`Infrastructure, error handling, monitoring, and scaling for ${t0} in production` },
  ];

  // ── Category 3: Automation & Workflow (ANALYST → process-flavoured) ───────
  const automationCards: SuggestionCard[] = [
    { id:"a1", icon:"⚙️", intent:"ANALYST", topicHint:t0,
      label:`Identify automation opportunities in ${t0}`,
      desc:`Find manual steps, repetitive processes, and bottlenecks in ${domain} workflows that can be automated` },
    { id:"a2", icon:"🔄", intent:"ANALYST", topicHint:t1||t0,
      label:`Design a pipeline for ${t1||t0}`,
      desc:`End-to-end workflow with triggers, steps, error handling, and output specification` },
    { id:"a3", icon:"📊", intent:"ANALYST", topicHint:t0,
      label:`Analyze efficiency gaps in ${domain} processes`,
      desc:`Map current ${domain} processes and identify where automation or optimisation would have the most impact` },
    { id:"a4", icon:"🧩", intent:"ANALYST", topicHint:t2||t0,
      label:`Break down the ${t2||t0} workflow into automatable steps`,
      desc:`Decompose ${t2||t0} into discrete tasks suitable for automation or scripting` },
    { id:"a5", icon:"📈", intent:"ANALYST", topicHint:t0,
      label:`Identify recurring patterns and trends in ${domain}`,
      desc:`Surface repeating patterns, cycles, and predictable behaviours in your ${domain} data` },
    { id:"a6", icon:"⚡", intent:"ANALYST", topicHint:t3||t0,
      label:`Optimise the ${t3||t0} process for speed`,
      desc:`Analyse the current process and propose concrete performance improvements` },
  ];

  // ── Category 4: Business Intelligence & Analytics (ANALYST → BI-flavoured) ─
  const biCards: SuggestionCard[] = [
    { id:"bi1", icon:"📊", intent:"ANALYST", topicHint:t0,
      label:`Key metrics dashboard for ${domain}`,
      desc:`Define KPIs, metrics, and what a ${domain} dashboard should track based on your corpus` },
    { id:"bi2", icon:"🔍", intent:"ANALYST", topicHint:t1||t0,
      label:`Discover hidden insights in ${t1||t0}`,
      desc:`Surface non-obvious patterns, anomalies, and insights across your ${domain} knowledge base` },
    { id:"bi3", icon:"📉", intent:"ANALYST", topicHint:t0,
      label:`Risk analysis of ${domain}`,
      desc:`Identify risks, failure modes, and vulnerabilities based on ${t0}${t1?` and ${t1}`:""}` },
    { id:"bi4", icon:"🏆", intent:"ANALYST", topicHint:t2||t0,
      label:`Benchmark ${t2||t0} against best practices`,
      desc:`Compare your ${domain} practices against the standards described in your corpus` },
    { id:"bi5", icon:"💡", intent:"ANALYST", topicHint:t0,
      label:`What are the strategic implications of ${t0}?`,
      desc:`Translate technical findings about ${t0} into business impact and strategic recommendations` },
    { id:"bi6", icon:"🗺️", intent:"ANALYST", topicHint:t4||t0,
      label:`Map dependencies and relationships in ${t4||t0}`,
      desc:`Produce a dependency map and relationship analysis for ${t4||t0} from your knowledge graph` },
  ];

  // ── Category 5: Compliance & Audit (AUDITOR) + Summary (SUMMARIZER) ───────
  const complianceCards: SuggestionCard[] = [
    { id:"c1", icon:"✅", intent:"AUDITOR", topicHint:t0,
      label:`Compliance audit: ${t0}`,
      desc:`Check ${t0} against relevant regulations, policies, and best practices from your corpus` },
    { id:"c2", icon:"🔍", intent:"AUDITOR", topicHint:t1||t0,
      label:`Find coverage gaps in ${t1||t0}`,
      desc:`Identify what is missing, under-specified, or not covered in ${domain}` },
    { id:"c3", icon:"⚠️", intent:"AUDITOR", topicHint:t0,
      label:`Risk register for ${domain}`,
      desc:`Generate a risk register with identified risks, likelihood, and mitigations from ${domain} documents` },
    { id:"c4", icon:"📝", intent:"SUMMARIZER", topicHint:t0,
      label:`Executive summary of ${domain}`,
      desc:`Structured one-page summary of key findings from ${[t0,t1,t2].filter(Boolean).join(", ")} for leadership` },
    { id:"c5", icon:"📄", intent:"SUMMARIZER", topicHint:t5||t0,
      label:`Summarize ${t5||t0} for a non-technical audience`,
      desc:`Plain-language summary of ${t5||t0} that anyone in the organisation can understand` },
    { id:"c6", icon:"👔", intent:"SUMMARIZER", topicHint:t2||t0,
      label:`What is the current state of ${t2||t0}?`,
      desc:`Status summary of ${t2||t0} — what is working, what needs attention, and next steps` },
  ];

  // ── Domain-specific boosting: replace generic cards with domain-relevant ones ──
  if (isDoc) {
    // Policy/compliance corpora — front-load compliance
    complianceCards.unshift({ id:"doc_c0", icon:"⚖️", intent:"AUDITOR", topicHint:t0,
      label:`Full compliance assessment of ${t0}`,
      desc:`Complete pass/fail compliance check against all relevant standards in your corpus` });
  }
  if (isCode) {
    // Code corpora — front-load builder
    builderCards.unshift({ id:"code_b0", icon:"🧪", intent:"BUILDER", topicHint:t0,
      label:`Write a test suite for ${t0}`,
      desc:`Unit tests, integration tests, and test strategy for the ${t0} codebase` });
  }
  if (isML) {
    // ML corpora — enrich research
    researchCards.unshift({ id:"ml_r0", icon:"🧠", intent:"RESEARCHER", topicHint:t0,
      label:`How does ${t0} achieve its performance?`,
      desc:`Technical deep-dive into the ${t0} architecture, training approach, and benchmark results` });
  }

  // ── Build the balanced pool: 5 from each category ────────────────────────
  // Use a seeded deterministic shuffle so Refresh produces genuinely different cards
  const seededShuffle = <T,>(arr: T[], s: number): T[] => {
    const a = [...arr];
    let sv = (s + 1) * 2654435761;
    for (let i = a.length - 1; i > 0; i--) {
      sv = (sv * 1664525 + 1013904223) >>> 0;
      const j = sv % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const pick5 = <T,>(arr: T[], offset: number): T[] =>
    seededShuffle(arr, seed + offset).slice(0, 5);

  const balanced: SuggestionCard[] = [
    ...pick5(researchCards, 0),
    ...pick5(builderCards, 1),
    ...pick5(automationCards, 2),
    ...pick5(biCards, 3),
    ...pick5(complianceCards, 4),
  ];

  // ── Dynamic deduplication: if a use-case was already chosen in the wizard,
  //    replace its category with specific sub-cards ──────────────────────────
  const alreadyChosen = USE_CASE_INTENT_MAP[selectedUseCase];
  if (alreadyChosen) {
    const specific = buildSpecificCards(alreadyChosen, t0, t1, domain);
    const others = balanced.filter(c => c.intent !== alreadyChosen).slice(0, 20 - specific.length);
    return [...specific, ...others];
  }

  return balanced;
}

function buildTopicQuestion(articles: WikiArticle[], intent: PathType): ChatQuestion {
  const verbMap: Record<PathType,string> = {
    BUILDER:"What specific part do you want to build around?",
    RESEARCHER:"What specifically do you want to understand?",
    ANALYST:"What do you want to analyze?",
    AUDITOR:"What area do you want to audit?",
    SUMMARIZER:"What do you want summarized?",
  };
  const opts = articles.slice(0,4).map(a => ({
    id:"wiki__"+a.title.toLowerCase().replace(/[^a-z0-9]/g,"_").slice(0,30),
    label:a.title,
    icon:topicIcon(a.title),
  }));
  return { id:"topic", question:verbMap[intent], opts, allowOther:true };
}

const FOLLOW_UPS: Record<PathType, ChatQuestion[]> = {
  BUILDER: [
    { id:"purpose", question:"What's the primary goal for this?", opts:[
      {id:"learn",label:"Learn by building",icon:"📚"},
      {id:"prototype",label:"Working prototype",icon:"🧪"},
      {id:"production",label:"Production deployment",icon:"🚀"},
      {id:"demo",label:"Demo / showcase",icon:"🎯"},
    ]},
    { id:"constraint", question:"What's your top constraint?", opts:[
      {id:"simplicity",label:"Keep it simple",icon:"✂️"},
      {id:"performance",label:"Maximum performance",icon:"⚡"},
      {id:"extensibility",label:"Easy to extend later",icon:"🔧"},
      {id:"cost",label:"Minimize cost / resources",icon:"💰"},
    ]},
    { id:"output_format", question:"What should the response look like?", opts:[
      {id:"code",label:"Working code with comments",icon:"💻"},
      {id:"architecture",label:"Architecture overview + explanation",icon:"🗺️"},
      {id:"guide",label:"Step-by-step implementation guide",icon:"📋"},
      {id:"full",label:"Full spec + code + test cases",icon:"📦"},
    ]},
    { id:"tech_stack", question:"Any tech stack preference?", opts:[
      {id:"python",label:"Python",icon:"🐍"},
      {id:"typescript",label:"TypeScript / Node.js",icon:"🟦"},
      {id:"agnostic",label:"Language-agnostic",icon:"🌐"},
      {id:"same_as_corpus",label:"Match the corpus stack",icon:"📂"},
    ]},
  ],
  RESEARCHER: [
    { id:"depth", question:"How deep should the explanation go?", opts:[
      {id:"overview",label:"High-level overview",icon:"🗺️"},
      {id:"detailed",label:"Detailed with examples",icon:"📖"},
      {id:"deep",label:"Deep dive into internals",icon:"🔬"},
      {id:"eli5",label:"Simple enough for beginners",icon:"👶"},
    ]},
    { id:"include", question:"What should the answer include?", opts:[
      {id:"explanation",label:"Explanation only",icon:"💬"},
      {id:"code",label:"Code examples",icon:"💻"},
      {id:"analogy",label:"Analogies and mental models",icon:"🧠"},
      {id:"all",label:"Everything — full picture",icon:"📦"},
    ]},
    { id:"audience", question:"Who is this for?", opts:[
      {id:"me",label:"Just me",icon:"👤"},
      {id:"team",label:"My team",icon:"👥"},
      {id:"client",label:"Client / stakeholder",icon:"🤝"},
      {id:"public",label:"Public documentation",icon:"🌐"},
    ]},
  ],
  ANALYST: [
    { id:"discover", question:"What patterns are you looking for?", opts:[
      {id:"themes",label:"Recurring themes",icon:"🧩"},
      {id:"gaps",label:"Gaps or missing pieces",icon:"🔍"},
      {id:"trends",label:"Changes over time",icon:"📈"},
      {id:"compare",label:"Comparison across topics",icon:"⚖️"},
    ]},
    { id:"audience", question:"Who sees the analysis?", opts:[
      {id:"me",label:"Just me",icon:"👤"},
      {id:"team",label:"Technical team",icon:"👥"},
      {id:"manager",label:"Manager / leadership",icon:"🏢"},
      {id:"client",label:"Client / external",icon:"🤝"},
    ]},
    { id:"format", question:"Output format?", opts:[
      {id:"report",label:"Structured report",icon:"📋"},
      {id:"bullets",label:"Bullet summary",icon:"•"},
      {id:"table",label:"Comparison table",icon:"📊"},
      {id:"narrative",label:"Narrative prose",icon:"📝"},
    ]},
  ],
  AUDITOR: [
    { id:"ref", question:"What are you checking against?", opts:[
      {id:"policy",label:"Internal policy / guidelines",icon:"📜"},
      {id:"regulation",label:"External regulation (GDPR, HIPAA…)",icon:"⚖️"},
      {id:"contract",label:"Contract or SLA",icon:"🤝"},
      {id:"best_practice",label:"Industry best practices",icon:"✅"},
    ]},
    { id:"scope", question:"What should the audit output?", opts:[
      {id:"gaps",label:"Gaps and missing coverage",icon:"🔍"},
      {id:"risks",label:"Risks and vulnerabilities",icon:"⚠️"},
      {id:"full",label:"Full compliance status",icon:"📊"},
      {id:"remediation",label:"Issues + remediation steps",icon:"🔧"},
    ]},
    { id:"audience", question:"Who receives this audit?", opts:[
      {id:"team",label:"Internal team",icon:"👥"},
      {id:"management",label:"Management",icon:"🏢"},
      {id:"regulator",label:"External regulator",icon:"⚖️"},
      {id:"client",label:"Client",icon:"🤝"},
    ]},
  ],
  SUMMARIZER: [
    { id:"scope", question:"What scope should the summary cover?", opts:[
      {id:"full",label:"Entire corpus",icon:"📚"},
      {id:"key",label:"Key findings only",icon:"⭐"},
      {id:"section",label:"A specific section / topic",icon:"📂"},
      {id:"changes",label:"What's new or changed",icon:"🆕"},
    ]},
    { id:"audience", question:"Who's reading this?", opts:[
      {id:"technical",label:"Technical team",icon:"💻"},
      {id:"manager",label:"Non-technical manager",icon:"🏢"},
      {id:"executive",label:"Executive / board",icon:"👔"},
      {id:"general",label:"General audience",icon:"🌐"},
    ]},
    { id:"length", question:"How long?", opts:[
      {id:"oneliner",label:"One sentence",icon:"✏️"},
      {id:"paragraph",label:"One paragraph (~100w)",icon:"📝"},
      {id:"page",label:"One page (~400w)",icon:"📄"},
      {id:"full",label:"Full summary + sections",icon:"📚"},
    ]},
  ],
};

function assembleDetailedQuery(
  intent: PathType,
  topicAnswer: string,
  answers: Record<string,string>,
  selectedTopics: string[],
  domain: string,
): string {
  const topicStr  = topicAnswer || domain;
  const topicList = selectedTopics.length > 0 ? selectedTopics.join(", ") : "";

  if (intent === "BUILDER") {
    const purposeMap: Record<string,string> = {
      learn:      "as a learning exercise — walk through each component with clear explanations",
      prototype:  "as a working prototype — include core functionality with clear extension points",
      production: "for production deployment — include error handling, scalability, and security considerations",
      demo:       "as a polished demonstration — focus on the most impactful features",
    };
    const constraintMap: Record<string,string> = {
      simplicity:    "Keep the design simple and easy to understand — favour clarity over cleverness.",
      performance:   "Prioritize performance and computational efficiency at every architectural decision.",
      extensibility: "Design for extensibility — use clean interfaces, modularity, and separation of concerns.",
      cost:          "Minimize resource usage and operational cost — avoid over-engineering.",
    };
    const outputMap: Record<string,string> = {
      code:         "Provide working, well-commented code with inline explanations for key decisions.",
      architecture: "Describe the full architecture (components, data flow, interfaces), then provide implementation details.",
      guide:        "Structure the output as a numbered, step-by-step implementation guide I can follow sequentially.",
      full:         "Provide: (1) architecture overview, (2) full implementation code, (3) test cases, (4) deployment notes.",
    };
    const stackMap: Record<string,string> = {
      python:         "Use Python.",
      typescript:     "Use TypeScript / Node.js.",
      agnostic:       "Use language-agnostic pseudocode where appropriate — focus on concepts.",
      same_as_corpus: "Use the same technology stack described in the knowledge base.",
    };
    const parts = [`Design and build ${topicStr} ${purposeMap[answers.purpose]??"for practical use"}.`];
    if (topicList) parts.push(`Focus on these specific areas from the knowledge base: ${topicList}.`);
    if (constraintMap[answers.constraint]) parts.push(constraintMap[answers.constraint]);
    if (outputMap[answers.output_format])  parts.push(outputMap[answers.output_format]);
    if (stackMap[answers.tech_stack])      parts.push(stackMap[answers.tech_stack]);
    parts.push(`Draw all technical context from the ${domain} knowledge base provided.`);
    return parts.join(" ");
  }

  if (intent === "RESEARCHER") {
    const depthMap: Record<string,string> = {
      overview: "Provide a high-level overview — explain the key concepts and how they fit together.",
      detailed: "Provide a detailed explanation with concrete examples and edge cases.",
      deep:     "Provide a deep dive — include implementation details, design decisions, trade-offs, and edge cases.",
      eli5:     "Explain this simply, as if to someone with no prior background — use analogies and plain language.",
    };
    const includeMap: Record<string,string> = {
      explanation: "Focus on a clear, thorough explanation without code.",
      code:        "Include code examples illustrating the key concepts.",
      analogy:     "Use analogies and mental models to make the concepts intuitive.",
      all:         "Include: thorough explanation, code examples, analogies, and practical applications.",
    };
    const audienceMap: Record<string,string> = {
      me:     "",
      team:   "This will be shared with my team — be thorough and include relevant caveats.",
      client: "This is for a client — be professional, structured, and avoid unnecessary jargon.",
      public: "This is for public documentation — be clear, self-contained, and comprehensive.",
    };
    const parts = [`Research and explain: ${topicStr}.`];
    if (depthMap[answers.depth])       parts.push(depthMap[answers.depth]);
    if (includeMap[answers.include])   parts.push(includeMap[answers.include]);
    if (topicList)                     parts.push(`Specifically cover: ${topicList}.`);
    if (audienceMap[answers.audience]) parts.push(audienceMap[answers.audience]);
    parts.push(`Base your answer entirely on the ${domain} knowledge base.`);
    return parts.join(" ");
  }

  if (intent === "ANALYST") {
    const discoverMap: Record<string,string> = {
      themes:  "Identify and explain the recurring themes and patterns.",
      gaps:    "Identify gaps, inconsistencies, and missing pieces.",
      trends:  "Track how concepts or values evolve or change across the corpus.",
      compare: "Compare and contrast the different approaches or topics covered.",
    };
    const formatMap: Record<string,string> = {
      report:    "Structure the output as a report with clear headers and sections.",
      bullets:   "Present all key findings as bullet points.",
      table:     "Use a comparison table to present findings where applicable.",
      narrative: "Write as a flowing narrative analysis.",
    };
    const parts = [`Analyze ${topicStr} from the ${domain} knowledge base.`];
    if (discoverMap[answers.discover]) parts.push(discoverMap[answers.discover]);
    if (topicList)                     parts.push(`Focus your analysis on: ${topicList}.`);
    if (formatMap[answers.format])     parts.push(formatMap[answers.format]);
    return parts.join(" ");
  }

  if (intent === "AUDITOR") {
    const refMap: Record<string,string> = {
      policy:        "Check against internal policies and guidelines.",
      regulation:    "Check against relevant external regulations (GDPR, HIPAA, SOC2, ISO 27001) as applicable.",
      contract:      "Check against contractual terms and SLA requirements.",
      best_practice: "Check against recognised industry best practices.",
    };
    const scopeMap: Record<string,string> = {
      gaps:        "Identify and explain all gaps and areas not adequately covered.",
      risks:       "Identify risks and potential vulnerabilities.",
      full:        "Provide a full compliance assessment — what passes, what fails, and why.",
      remediation: "For each issue found, provide specific, actionable remediation steps.",
    };
    const parts = [`Audit ${topicStr} from the ${domain} knowledge base.`];
    if (refMap[answers.ref])     parts.push(refMap[answers.ref]);
    if (topicList)               parts.push(`Focus the audit on: ${topicList}.`);
    if (scopeMap[answers.scope]) parts.push(scopeMap[answers.scope]);
    return parts.join(" ");
  }

  if (intent === "SUMMARIZER") {
    const scopeMap: Record<string,string> = {
      full:    `Summarize the entire ${domain} knowledge base, covering all major topics.`,
      key:     `Extract and summarize only the most important findings from ${topicStr}.`,
      section: `Summarize the ${topicStr} section of the knowledge base in depth.`,
      changes: `Summarize what is new, changed, or most notable in ${topicStr}.`,
    };
    const lengthMap: Record<string,string> = {
      oneliner:  "Respond in a single, well-crafted sentence.",
      paragraph: "Respond in one paragraph of approximately 100 words.",
      page:      "Respond in approximately 400 words with clear sections.",
      full:      "Provide a full, detailed summary with a structured outline and sub-sections.",
    };
    const parts = [scopeMap[answers.scope] ?? `Summarize ${topicStr}.`];
    if (topicList)                 parts.push(`Include these specific topics: ${topicList}.`);
    if (lengthMap[answers.length]) parts.push(lengthMap[answers.length]);
    return parts.join(" ");
  }

  return `${topicStr} — provide a detailed, well-structured response based on the ${domain} knowledge base.`;
}

function assembleSystemPrompt(intent: PathType, answers: Record<string,string>): string {
  const parts: string[] = [];
  if (answers.audience==="technical"||answers.audience==="team")
    parts.push("Write for a technical audience. Use precise language and include implementation details.");
  if (answers.audience==="manager"||answers.audience==="management")
    parts.push("Write for a non-technical manager. Use plain English and focus on impact.");
  if (answers.audience==="executive")
    parts.push("Write for an executive. Be strategic and high-level — lead with the key takeaway.");
  if (answers.audience==="client")
    parts.push("Write for an external client. Be professional, polished, and clear.");
  if (answers.audience==="public")
    parts.push("Write for a public audience. Be clear, structured, and self-contained.");
  if (answers.audience==="general")
    parts.push("Write for a general audience — accessible and jargon-free.");
  if (answers.length==="oneliner")  parts.push("Respond in exactly one sentence.");
  if (answers.length==="paragraph") parts.push("Keep the total response under 150 words.");
  if (answers.length==="page")      parts.push("Keep the response between 300–500 words.");
  if (answers.format==="bullets")   parts.push("Use bullet points for all key information.");
  if (answers.format==="table")     parts.push("Use tables to present comparisons and structured data.");
  if (answers.output_format==="guide")
    parts.push("Number all steps. Begin each step with an action verb.");
  if (answers.output_format==="full")
    parts.push("Use clear headers for each section: Architecture, Implementation, Tests, Deployment.");
  if (answers.depth==="eli5") parts.push("Use simple language, analogies, and avoid jargon.");
  if (answers.depth==="deep") parts.push("Include implementation details, edge cases, and design rationale.");
  return parts.join(" ").trim();
}

export default function PromptBuilder({ corpus, onUsePrompt, onManual }: PromptBuilderProps) {
  const API = process.env.NEXT_PUBLIC_API_URL ?? "";
  const [wikiArticles, setWikiArticles] = useState<WikiArticle[]>([]);
  const [hasSLM, setHasSLM]             = useState(false);
  const [slmSuggestionItems, setSlmSuggestionItems] = useState<SlmSuggestionRaw[]>([]);
  const [slmSuggestionSource, setSlmSuggestionSource] = useState<"none"|"slm"|"fallback">("none");
  const [loadingData, setLoadingData]    = useState(false);
  const [industry, setIndustry]          = useState("general");
  const [useCase, setUseCase]            = useState("");
  const [phase, setPhase]               = useState<0|1|2|3>(0);
  const [phaseThreeSteps, setPhaseThreeSteps] = useState<ProcessStep[]>([]);
  const [skippedSteps, setSkippedSteps]       = useState<Set<string>>(new Set());
  const [selectedIntent, setSelectedIntent] = useState<PathType|null>(null);
  const [topicAnswer, setTopicAnswer]        = useState("");
  const [answers, setAnswers]                = useState<Record<string,string>>({});
  const [freeInput, setFreeInput]   = useState("");
  const [otherInput, setOtherInput] = useState("");
  const [showOther, setShowOther]   = useState(false);
  const [chatMsgs, setChatMsgs]               = useState<ChatMsg[]>([]);
  const [queuedQuestions, setQueuedQuestions] = useState<ChatQuestion[]>([]);
  const [currentQIdx, setCurrentQIdx]         = useState(0);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [editableQuery, setEditableQuery]   = useState("");
  const [editableSys, setEditableSys]       = useState("");
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [activeCustomTemplateId, setActiveCustomTemplateId] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);
  const [displaySeed, setDisplaySeed] = useState(() => Math.floor(Math.random() * 10000));
  // Per-category collapsed state — persisted in sessionStorage
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem("pb_collapsed_cats") ?? "[]")); }
    catch { return new Set(); }
  });
  const toggleCategory = (label: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      try { sessionStorage.setItem("pb_collapsed_cats", JSON.stringify([...next])); } catch { /**/ }
      return next;
    });
  };

  useEffect(() => {
    try { const p=JSON.parse(localStorage.getItem("orch_persona")??"{}"); if(p.industry) setIndustry(p.industry); if(p.useCase) setUseCase(p.useCase); } catch{/**/}
    setCustomTemplates(loadCustomTemplates());
  }, []);

  useEffect(() => {
    if (!corpus) return;
    setLoadingData(true);
    const jobParam = corpus.job_id ? `&job_id=${encodeURIComponent(corpus.job_id)}` : "";
    Promise.all([
      fetch(`${API}/api/v1/data/wiki/${corpus.job_id}`)
        .then(r=>r.ok?r.json():{articles:[]})
        .then((d:{articles:WikiArticle[]})=>setWikiArticles(d.articles?.slice(0,12)??[]))
        .catch(()=>{}),
      fetch(`${API}/api/v1/slm/registry`)
        .then(r=>r.ok?r.json():{slms:[]})
        .then((d:{slms:{domain_label:string}[]})=>
          setHasSLM((d.slms??[]).some(s=>s.domain_label===corpus.domain_label))
        )
        .catch(()=>{}),
      fetch(`${API}/api/v1/slm/suggestions?domain_label=${encodeURIComponent(corpus.domain_label)}${jobParam}`)
        .then(r => r.ok ? r.json() : Promise.resolve({ suggestions: [], source: "fallback" }))
        .then((d: {suggestions?: SlmSuggestionRaw[]; source?: string}) => {
          const items = Array.isArray(d.suggestions) ? d.suggestions : [];
          setSlmSuggestionItems(items.slice(0, 10));
          setSlmSuggestionSource(d.source === "slm" ? "slm" : "fallback");
        })
        .catch(() => {
          setSlmSuggestionItems([]);
          setSlmSuggestionSource("none");
        }),
    ]).finally(()=>setLoadingData(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corpus?.job_id, fetchKey]);

  useEffect(()=>{chatBottomRef.current?.scrollIntoView({behavior:"smooth",block:"nearest"});},[chatMsgs,showOther]);

  const domain      = corpus?.domain_label ?? industry;
  // Balanced suggestions — seed changes on Refresh for variety
  const fallbackSuggestions = generateSuggestions(wikiArticles, domain, hasSLM, useCase, displaySeed);
  const allSuggestions = (slmSuggestionSource === "slm" && slmSuggestionItems.length > 0)
    ? [...cardsFromSlmSuggestions(slmSuggestionItems, domain), ...fallbackSuggestions.slice(0, 15)]
    : fallbackSuggestions;
  // No extra shuffle needed — generateSuggestions is already seeded for variety
  const suggestions = allSuggestions;
  const intentMeta  = selectedIntent ? INTENT_META[selectedIntent] : null;
  const totalQs     = queuedQuestions.length;

  const startSuggestion = (card: SuggestionCard) => {
    if (card.prefillQuery) {
      // SLM-powered card: run immediately, no edit screen
      onUsePrompt(card.prefillQuery, "");
      return;
    }
    const initialAnswers = { topic: card.topicHint, ...(card.preAnswers ?? {}) };
    setSelectedIntent(card.intent); setTopicAnswer(card.topicHint); setAnswers(initialAnswers);
    setSelectedTopics([]); setShowOther(false); setOtherInput("");
    const skipSet = new Set(card.skipQuestions ?? []);
    const followUps = FOLLOW_UPS[card.intent].filter(q => !skipSet.has(q.id));
    setQueuedQuestions(followUps); setCurrentQIdx(0);
    if (followUps.length===0) {
      const q   = assembleDetailedQuery(card.intent, card.topicHint, initialAnswers, [], domain);
      const sys = assembleSystemPrompt(card.intent, initialAnswers);
      onUsePrompt(q, sys);
    } else {
      const first=followUps[0];
      setChatMsgs([{role:"ai",text:first.question,questionId:first.id,options:first.opts,allowOther:first.allowOther}]);
      setPhase(1);
    }
  };

  const startFreeText = (text: string) => {
    if (!text.trim()) return;
    const intent=detectPath(text); setSelectedIntent(intent); setTopicAnswer(text.trim()); setAnswers({});
    setSelectedTopics([]); setShowOther(false); setOtherInput("");
    const topicQ = wikiArticles.length>0 ? buildTopicQuestion(wikiArticles,intent) : null;
    const allQs  = topicQ ? [topicQ,...FOLLOW_UPS[intent]] : FOLLOW_UPS[intent];
    setQueuedQuestions(allQs); setCurrentQIdx(0);
    if (allQs.length===0) {
      const q   = assembleDetailedQuery(intent, text.trim(), {}, [], domain);
      const sys = assembleSystemPrompt(intent, {});
      onUsePrompt(q, sys);
    } else {
      const first=allQs[0];
      setChatMsgs([{role:"ai",text:first.question,questionId:first.id,options:first.opts,allowOther:first.allowOther}]);
      setPhase(1);
    }
  };

  const handleAnswer = (questionId: string, answerId: string, answerLabel: string, isOther=false) => {
    const actualLabel  = isOther ? (otherInput.trim()||"Other") : answerLabel;
    const actualAnswer = isOther ? (otherInput.trim()||"other") : answerId;
    const newAnswers   = {...answers,[questionId]:actualAnswer};
    setAnswers(newAnswers);
    if (questionId==="topic") setTopicAnswer(actualLabel);
    setShowOther(false); setOtherInput("");
    const nextIdx=currentQIdx+1;
    const userBubble: ChatMsg = {role:"user",text:actualLabel};
    if (nextIdx<queuedQuestions.length) {
      const nextQ=queuedQuestions[nextIdx];
      setChatMsgs(prev=>[...prev,userBubble,
        {role:"ai",text:nextQ.question,questionId:nextQ.id,options:nextQ.opts,allowOther:nextQ.allowOther}]);
      setCurrentQIdx(nextIdx);
    } else {
      const resolvedTopic = questionId==="topic" ? actualLabel : topicAnswer;
      const q   = assembleDetailedQuery(selectedIntent!,resolvedTopic,newAnswers,[],domain);
      const sys = assembleSystemPrompt(selectedIntent!,newAnswers);
      setChatMsgs(prev=>[...prev,userBubble]);
      // Run immediately — no edit screen
      onUsePrompt(q, sys);
    }
  };

  const toggleTopic = (title: string) => {
    const next=selectedTopics.includes(title)?selectedTopics.filter(t=>t!==title):[...selectedTopics,title];
    setSelectedTopics(next);
    if (selectedIntent) setEditableQuery(assembleDetailedQuery(selectedIntent,topicAnswer,answers,next,domain));
  };

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-t3 mb-0.5">Prompt Builder</div>
          {phase===0 && !loadingData && (
            <div className="text-[11px] text-t3">
              Based on your <span className="text-t2 font-medium">{domain}</span> corpus
              {wikiArticles.length>0 && <span> · {wikiArticles.length} topics analysed</span>}
              {hasSLM && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 bg-accent/10 text-accent border border-accent/20 rounded-md font-bold">✦ Custom AI ready</span>}
            </div>
          )}
        </div>
<div className="flex items-center gap-3">
        {phase === 0 && !loadingData && (
          <button
            onClick={() => { setDisplaySeed(Math.floor(Math.random() * 10000)); setFetchKey(k => k + 1); }}
            className="text-[10px] text-t3 hover:text-accent transition-colors"
            title="Load different suggestions"
          >
            ↺ Refresh
          </button>
        )}
        <button onClick={onManual} className="text-[10px] text-t3 hover:text-t1 transition-colors">Write manually →</button>
      </div>
      </div>

      {phase===0 && (
        <>
          {loadingData ? (
            <div className="space-y-2 mb-3">{[0,1,2,3].map(i=><div key={i} className="h-16 bg-bg3 border border-dborder rounded-card animate-pulse"/>)}</div>
          ) : (
            <div className="space-y-4 mb-3">
              {(() => {
                // Group cards by category based on intent
                const CATEGORY_GROUPS: { label: string; icon: string; intents: PathType[] }[] = [
                  { label: "Research",                   icon: "🔬", intents: ["RESEARCHER"] },
                  { label: "Application Development",    icon: "🏗️", intents: ["BUILDER"] },
                  { label: "Automation & Analysis",      icon: "⚙️", intents: ["ANALYST"] },
                  { label: "Business Intelligence",      icon: "📊", intents: [] },           // SLM badge cards
                  { label: "Insights & Summaries",       icon: "📝", intents: ["SUMMARIZER"] },
                  { label: "Compliance & Audit",         icon: "✅", intents: ["AUDITOR"] },
                ];
                // Assign SLM-badged cards to Business Intelligence group
                const slmCards   = suggestions.filter(c => c.badge === "Custom AI");
                const nonSlmMap  = new Map<PathType, SuggestionCard[]>();
                suggestions.filter(c => !c.badge).forEach(c => {
                  if (!nonSlmMap.has(c.intent)) nonSlmMap.set(c.intent, []);
                  nonSlmMap.get(c.intent)!.push(c);
                });
                const groups: { label: string; icon: string; cards: SuggestionCard[] }[] = [];
                CATEGORY_GROUPS.forEach(g => {
                  const cards = g.intents.length > 0
                    ? g.intents.flatMap(i => nonSlmMap.get(i) ?? [])
                    : slmCards;
                  if (cards.length > 0) groups.push({ label: g.label, icon: g.icon, cards });
                });
                if (groups.length === 0) {
                  // Fallback: flat list
                  return suggestions.map(card => (
                    <button key={card.id} onClick={()=>startSuggestion(card)}
                      className="w-full flex items-start gap-3 px-4 py-3 rounded-card border border-dborder bg-card2 hover:border-accent/50 hover:bg-accent/5 transition-all text-left group">
                      <span className="text-xl mt-0.5 flex-shrink-0">{card.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[12px] font-semibold text-t1 group-hover:text-accent leading-tight">{card.label}</span>
                          {card.badge && <span className="text-[8px] px-1.5 py-0.5 bg-accent/10 text-accent border border-accent/20 rounded-full font-bold">{card.badge}</span>}
                        </div>
                        <div className="text-[10px] text-t3 leading-snug mt-0.5 line-clamp-2">{card.desc}</div>
                      </div>
                    </button>
                  ));
                }
                return groups.map(group => {
                  const isCollapsed = collapsedCategories.has(group.label);
                  return (
                  <div key={group.label}>
                    <button
                      onClick={() => toggleCategory(group.label)}
                      className="w-full flex items-center gap-1.5 mb-1.5 group/cat"
                    >
                      <span className="text-[9px] text-t3 group-hover/cat:text-accent transition-colors">{isCollapsed ? "▸" : "▾"}</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-t3 group-hover/cat:text-accent transition-colors">{group.icon} {group.label}</span>
                      <span className="text-[9px] text-t3 ml-1">({group.cards.length})</span>
                    </button>
                    {!isCollapsed && (
                      <div className="space-y-1.5 mb-1">
                        {group.cards.map(card => (
                          <button key={card.id} onClick={()=>startSuggestion(card)}
                            className="w-full flex items-start gap-3 px-4 py-3 rounded-card border border-dborder bg-card2 hover:border-accent/50 hover:bg-accent/5 transition-all text-left group">
                            <span className="text-xl mt-0.5 flex-shrink-0">{card.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[12px] font-semibold text-t1 group-hover:text-accent leading-tight">{card.label}</span>
                                {card.badge && <span className="text-[8px] px-1.5 py-0.5 bg-accent/10 text-accent border border-accent/20 rounded-full font-bold">{card.badge}</span>}
                                <span className="ml-auto text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0"
                                  style={{background:`${INTENT_META[card.intent].color}15`,color:INTENT_META[card.intent].color}}>
                                  {INTENT_META[card.intent].label}
                                </span>
                              </div>
                              <div className="text-[10px] text-t3 leading-snug mt-0.5 line-clamp-2">{card.desc}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  );
                });
              })()}
            </div>
          )}
          {/* Custom templates section */}
          {customTemplates.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-t3">Your process templates</div>
                <a href="/templates" className="text-[10px] text-accent hover:text-accent/70 transition-colors">Manage →</a>
              </div>
              <div className="space-y-1.5">
                {customTemplates.map(ct => (
                  <button key={ct.id}
                    onClick={() => {
                      // Launch custom template directly into process mode
                      setSelectedIntent("RESEARCHER");
                      setTopicAnswer(domain);
                      setSelectedTopics([]);
                      const steps = customTemplateToProcessSteps(ct);
                      setPhaseThreeSteps(steps);
                      setSkippedSteps(new Set());
                      setActiveCustomTemplateId(ct.id);
                      setEditableQuery(`Run the "${ct.name}" process`);
                      setEditableSys("");
                      sessionStorage.setItem("use_custom_template", ct.id);
                      setPhase(3);
                    }}
                    className="w-full flex items-start gap-3 px-3 py-2.5 rounded-card border border-purple-600/25 bg-purple-600/5 hover:border-purple-600/50 hover:bg-purple-600/10 transition-all text-left group">
                    <span className="w-7 h-7 rounded-md bg-purple-600/15 border border-purple-600/25 flex items-center justify-center text-[10px] font-bold text-purple-400 flex-shrink-0 mt-0.5">{ct.steps.length}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-semibold text-t1 group-hover:text-purple-300 leading-tight">{ct.name}</span>
                        <span className="text-[8px] px-1.5 py-0.5 bg-purple-600/15 text-purple-400 border border-purple-600/25 rounded-full font-bold">Custom</span>
                      </div>
                      {ct.description && <div className="text-[10px] text-t3 mt-0.5 line-clamp-1">{ct.description}</div>}
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {ct.steps.map((s,i) => (
                          <span key={s.id} className="text-[9px] text-t3">{s.icon}{i < ct.steps.length-1 ? " →" : ""}</span>
                        ))}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {customTemplates.length === 0 && (
            <div className="mb-3">
              <a href="/templates" className="flex items-center gap-2 px-3 py-2 rounded-card border border-dashed border-dborder text-t3 hover:border-accent/30 hover:text-t2 transition-colors text-[10px]">
                <span>🗂️</span><span>Build a reusable process template →</span>
              </a>
            </div>
          )}
          <div className="relative">
            <input type="text"
              className="w-full bg-bg3 border border-dborder2 rounded-card px-4 py-2.5 text-[12px] text-t1 outline-none focus:border-accent pr-10 font-dm transition-colors"
              placeholder="Or describe your own goal — e.g. 'Implement a BPE tokenizer from scratch'"
              value={freeInput} onChange={e=>setFreeInput(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter") startFreeText(freeInput);}}/>
            <button onClick={()=>startFreeText(freeInput)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-accent hover:text-accent/70 px-2 py-1 font-semibold">→</button>
          </div>
        </>
      )}

      {phase===1 && selectedIntent && (
        <div className="bg-card2 border border-dborder rounded-card overflow-hidden">
          <div className="px-4 pt-3 pb-2 border-b border-dborder flex items-center gap-2 flex-wrap">
            <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{background:`${intentMeta!.color}18`,color:intentMeta!.color,border:`1px solid ${intentMeta!.color}35`}}>
              {intentMeta!.icon} {intentMeta!.label}
            </span>
            {totalQs>1 && (
              <div className="flex items-center gap-1 ml-1">
                {Array.from({length:totalQs}).map((_,i)=>(
                  <div key={i} className="rounded-full transition-all"
                    style={{width:i<=currentQIdx?10:6,height:6,
                      background:i<currentQIdx?"#2dd4a0":i===currentQIdx?intentMeta!.color:"#d1d5db"}}/>
                ))}
                <span className="text-[9px] text-t3 ml-0.5">{currentQIdx+1}/{totalQs}</span>
              </div>
            )}
            <button onClick={()=>setPhase(0)} className="ml-auto text-[10px] text-t3 hover:text-t1">← Back</button>
          </div>
          <div className="px-4 py-3 space-y-3 max-h-80 overflow-y-auto">
            {chatMsgs.map((msg,idx)=>(
              <div key={idx} className={`flex ${msg.role==="user"?"justify-end":"justify-start"}`}>
                {msg.role==="ai" ? (
                  <div className="max-w-[92%] w-full">
                    <div className="text-[12px] font-medium text-t1 bg-bg3 border border-dborder rounded-lg rounded-tl-none px-3 py-2 mb-2">{msg.text}</div>
                    {msg.options && idx===chatMsgs.length-1 && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {msg.options.map(opt=>(
                            <button key={opt.id} onClick={()=>handleAnswer(msg.questionId!,opt.id,opt.label)}
                              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border border-dborder bg-card hover:border-accent hover:bg-accent/5 transition-all text-t2 hover:text-accent">
                              <span>{opt.icon}</span><span>{opt.label}</span>
                            </button>
                          ))}
                          {msg.allowOther && (
                            <button onClick={()=>setShowOther(true)}
                              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border border-dborder bg-card hover:border-accent hover:bg-accent/5 transition-all text-t2 hover:text-accent">
                              <span>✏️</span><span>Something else…</span>
                            </button>
                          )}
                        </div>
                        {showOther && (
                          <div className="flex gap-2">
                            <input autoFocus type="text"
                              className="flex-1 bg-bg3 border border-accent/40 rounded-lg px-3 py-1.5 text-[11px] text-t1 outline-none font-dm"
                              placeholder="Describe it…" value={otherInput} onChange={e=>setOtherInput(e.target.value)}
                              onKeyDown={e=>{if(e.key==="Enter"&&otherInput.trim()) handleAnswer(msg.questionId!,"other",otherInput.trim(),true);}}/>
                            <button onClick={()=>{if(otherInput.trim()) handleAnswer(msg.questionId!,"other",otherInput.trim(),true);}}
                              className="text-[11px] px-3 py-1.5 bg-accent text-white rounded-lg font-semibold">→</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-[11px] font-medium text-white bg-accent rounded-lg rounded-tr-none px-3 py-2 max-w-[75%]">{msg.text}</div>
                )}
              </div>
            ))}
            <div ref={chatBottomRef}/>
          </div>
        </div>
      )}

      {phase===2 && selectedIntent && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{background:`${intentMeta!.color}18`,color:intentMeta!.color,border:`1px solid ${intentMeta!.color}35`}}>
              {intentMeta!.icon} {intentMeta!.label}
            </span>
            <button onClick={()=>{if(queuedQuestions.length>0) setPhase(1); else setPhase(0);}}
              className="ml-auto text-[10px] text-t3 hover:text-t1">← Back</button>
          </div>
          {wikiArticles.length>0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-t3 mb-1.5">Refine — tap topics from your corpus to inject into the prompt</div>
              <div className="flex flex-wrap gap-1.5">
                {wikiArticles.map(a=>(
                  <button key={a.title} onClick={()=>toggleTopic(a.title)}
                    className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-md border transition-colors ${
                      selectedTopics.includes(a.title)?"bg-accent/15 border-accent/50 text-accent font-medium":"bg-bg3 border-dborder text-t3 hover:border-accent/30 hover:text-t2"}`}>
                    <span>{topicIcon(a.title)}</span>
                    <span>{selectedTopics.includes(a.title)&&"✓ "}{a.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-t3 mb-1.5">
              Your assembled prompt <span className="text-t3 font-normal normal-case">(editable)</span>
            </div>
            <textarea className="w-full bg-bg3 border border-dborder2 rounded-card px-3 py-2.5 text-[12px] text-t1 outline-none focus:border-accent font-dm resize-none transition-colors"
              rows={5} value={editableQuery} onChange={e=>setEditableQuery(e.target.value)}
              placeholder="Your assembled question will appear here…"/>
          </div>
          {editableSys.trim() && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-t3 mb-1.5">
                System prompt additions <span className="text-t3 font-normal normal-case">(from your answers)</span>
              </div>
              <textarea className="w-full bg-bg3 border border-dborder2 rounded-card px-3 py-2 text-[11px] text-t2 outline-none focus:border-accent font-dm resize-none transition-colors"
                rows={2} value={editableSys} onChange={e=>setEditableSys(e.target.value)}/>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <button onClick={()=>onUsePrompt(editableQuery.trim(),editableSys.trim())} disabled={!editableQuery.trim()}
              className="btn btn-p w-full py-2.5 text-sm disabled:opacity-40">Use this prompt →</button>
            <button onClick={()=>{
              if(!selectedIntent) return;
              const steps=getProcessPlan(selectedIntent);
              setPhaseThreeSteps(steps);
              setSkippedSteps(new Set());
              setActiveCustomTemplateId(null);
              setPhase(3);
            }} disabled={!editableQuery.trim()}
              className="w-full py-2.5 text-sm font-semibold rounded-card border border-accent text-accent hover:bg-accent/10 transition-all disabled:opacity-40">
              ✦ Run as Process ({selectedIntent ? getProcessPlan(selectedIntent).length : 3} steps) →
            </button>
          </div>
        </div>
      )}
      {phase===3 && selectedIntent && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{background:`${intentMeta!.color}18`,color:intentMeta!.color,border:`1px solid ${intentMeta!.color}35`}}>
              {intentMeta!.icon} {intentMeta!.label}
            </span>
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 font-bold">✦ Process Mode</span>
            {activeCustomTemplateId && (
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-600/15 text-purple-400 border border-purple-600/25 font-bold">Custom</span>
            )}
            <button onClick={() => { setActiveCustomTemplateId(null); setPhase(activeCustomTemplateId ? 0 : 2); }} className="ml-auto text-[10px] text-t3 hover:text-t1">← Back</button>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-t3 mb-1">Your Process Plan</div>
            <div className="text-[11px] text-t2 mb-3">
              Instead of one response, the AI will work through {phaseThreeSteps.length} focused steps.
              You review and approve each step before it continues.
            </div>
          <div className="space-y-2">
              {phaseThreeSteps.map((step, i) => {
                const skipped = skippedSteps.has(step.id);
                return (
                  <div key={step.id} className={`flex items-start gap-3 px-3 py-2.5 rounded-card border transition-all ${skipped ? "border-dborder bg-bg3 opacity-50" : "border-dborder bg-card2"}`}>
                    <button
                      onClick={()=>setSkippedSteps(prev=>{ const n=new Set(prev); n.has(step.id)?n.delete(step.id):n.add(step.id); return n; })}
                      className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                        skipped ? "border-dborder bg-bg3" : "border-accent/50 bg-accent/10 text-accent"
                      }`}
                    >
                      {!skipped && <span className="text-[10px] font-bold">✓</span>}
                    </button>
                    <div className="w-6 h-6 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-[10px] font-bold text-accent flex-shrink-0 mt-0.5">{i+1}</div>
                    <div>
                      <div className={`text-[12px] font-semibold ${skipped ? "text-t3 line-through" : "text-t1"}`}>{step.icon} {step.label}</div>
                      <div className="text-[10px] text-t3 mt-0.5 leading-snug">{step.purpose}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <button
            onClick={()=>{
              const activeSteps = phaseThreeSteps
                .filter(s => !skippedSteps.has(s.id))
                .map(s => ({ id: s.id, label: s.label, icon: s.icon, purpose: s.purpose }));
              onUsePrompt(
                editableQuery.trim(),
                editableSys.trim(),
                {
                  intent: selectedIntent,
                  topic: topicAnswer,
                  steps: activeSteps,
                  selectedTopics,
                  customTemplateId: activeCustomTemplateId ?? undefined,
                }
              );
            }}
            disabled={!editableQuery.trim() || phaseThreeSteps.every(s=>skippedSteps.has(s.id))}
            className="btn btn-p w-full py-2.5 text-sm disabled:opacity-40">
            Start Process →
          </button>
          <button onClick={()=>onUsePrompt(editableQuery.trim(),editableSys.trim())} className="w-full text-[10px] text-t3 hover:text-t1 py-1 transition-colors">
            ← Use single-shot instead
          </button>
        </div>
      )}
    </div>
  );
}
