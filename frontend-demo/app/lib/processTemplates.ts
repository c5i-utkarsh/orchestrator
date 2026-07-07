export type PathType = "BUILDER" | "RESEARCHER" | "ANALYST" | "AUDITOR" | "SUMMARIZER";

export interface ProcessStepMeta {
  id: string;
  label: string;
  icon: string;
  purpose: string;
}

export interface ProcessStep extends ProcessStepMeta {
  buildPrompt: (
    baseQuery: string,
    topic: string,
    domain: string,
    prevOutput: string,
    contextTopics?: string[],
  ) => string;
}

const PLANS: Record<PathType, ProcessStep[]> = {
  BUILDER: [
    {
      id: "builder_research",
      label: "Research foundations",
      icon: "🔬",
      purpose: "Extract relevant concepts, patterns and requirements from the knowledge base",
      buildPrompt: (_base, _topic, domain, _prev, ctx) => {
        const focus = ctx?.length ? `\n\nFocus specifically on these corpus topics: ${ctx.join(", ")}.` : "";
        return `Research the following goal from the ${domain} knowledge base: "${_base}"${focus}\n\nExtract and document:\n1. Relevant concepts, components, and prior art found in the corpus\n2. Existing implementations or patterns described\n3. Key technical requirements and constraints\n4. Potential approaches and their trade-offs\n\nProvide structured, factual findings based only on the knowledge base.`;
      },
    },
    {
      id: "builder_design",
      label: "Design architecture",
      icon: "🏗️",
      purpose: "Produce a concrete architecture and component design based on the research",
      buildPrompt: (_base, _topic, domain, prev, ctx) => {
        const focus = ctx?.length ? `\n\nEnsure the design incorporates insights from: ${ctx.join(", ")}.` : "";
        return `Based on the following research findings from the ${domain} knowledge base:\n\n${prev}\n\n---\n\nNow design the architecture for: "${_base}"${focus}\n\nDefine:\n1. Main components and their responsibilities\n2. Data flow and interfaces between components\n3. Technology choices with rationale drawn from the research\n4. Key design decisions and their trade-offs\n\nBe specific and reference the research findings above.`;
      },
    },
    {
      id: "builder_implement",
      label: "Write implementation",
      icon: "💻",
      purpose: "Implement working code grounded in the architecture design",
      buildPrompt: (_base, _topic, domain, prev, ctx) => {
        const focus = ctx?.length ? `\n\nApply patterns and details from: ${ctx.join(", ")}.` : "";
        return `Based on the following architecture design:\n\n${prev}\n\n---\n\nImplement: "${_base}"${focus}\n\nProvide:\n1. Complete, working code for all defined components\n2. Clear inline comments explaining key decisions\n3. A usage example demonstrating the implementation\n4. Notes on limitations or obvious next steps\n\nThe implementation must be consistent with the architecture above.`;
      },
    },
  ],

  RESEARCHER: [
    {
      id: "researcher_extract",
      label: "Extract relevant content",
      icon: "📥",
      purpose: "Pull all relevant facts, definitions and relationships from the corpus",
      buildPrompt: (_base, _topic, domain, _prev, ctx) => {
        const focus = ctx?.length ? `\n\nPrioritise these specific corpus topics: ${ctx.join(", ")}.` : "";
        return `From the ${domain} knowledge base, extract all information relevant to: "${_base}"${focus}\n\nDocument:\n1. Key facts, definitions, and core concepts\n2. Relationships between concepts\n3. Specific examples or evidence from the corpus\n4. Any contradictions or nuances found\n\nBe thorough and cite specific passages where possible.`;
      },
    },
    {
      id: "researcher_synthesize",
      label: "Synthesize into explanation",
      icon: "🧠",
      purpose: "Connect extracted facts into a coherent, complete explanation",
      buildPrompt: (_base, _topic, domain, prev, ctx) => {
        const focus = ctx?.length ? `\n\nEnsure the synthesis covers: ${ctx.join(", ")}.` : "";
        return `You have extracted the following information from the ${domain} knowledge base:\n\n${prev}\n\n---\n\nSynthesize this into a coherent explanation of: "${_base}"${focus}\n\n1. Connect the concepts and explain their relationships\n2. Build a complete, logical picture from the extracted facts\n3. Resolve any contradictions found in the extraction\n4. Add context that aids understanding\n\nReference specific points from the extracted content above.`;
      },
    },
    {
      id: "researcher_finalize",
      label: "Finalize response",
      icon: "✅",
      purpose: "Refine and polish the explanation for clarity and completeness",
      buildPrompt: (_base, _topic, domain, prev, _ctx) =>
        `Here is a synthesized explanation:\n\n${prev}\n\n---\n\nRefine this into the final response for: "${_base}"\n\n1. Ensure the explanation is clear and accessible\n2. Fill any remaining gaps using the ${domain} knowledge base\n3. Structure it logically with good flow\n4. Make it complete and self-contained\n\nThe final response should fully answer the original question.`,
    },
  ],

  ANALYST: [
    {
      id: "analyst_extract",
      label: "Extract data and patterns",
      icon: "📊",
      purpose: "Gather all evidence, metrics and observations from the corpus",
      buildPrompt: (_base, _topic, domain, _prev, ctx) => {
        const focus = ctx?.length ? `\n\nFocus extraction on these corpus areas: ${ctx.join(", ")}.` : "";
        return `From the ${domain} knowledge base, extract all data, patterns and observations relevant to: "${_base}"${focus}\n\nDocument:\n1. Specific data points, metrics and measurements\n2. Recurring patterns or themes\n3. Concrete examples and evidence\n4. Outliers or unexpected findings\n\nBe specific and evidence-based — this is a raw extraction, not an analysis.`;
      },
    },
    {
      id: "analyst_analyze",
      label: "Analyze and find insights",
      icon: "🔍",
      purpose: "Identify significant patterns, trends and relationships in the data",
      buildPrompt: (_base, _topic, domain, prev, _ctx) =>
        `Based on the following extracted data from the ${domain} knowledge base:\n\n${prev}\n\n---\n\nAnalyze this for: "${_base}"\n\n1. Identify the most significant patterns and what they indicate\n2. Note trends, correlations, and causal relationships\n3. Highlight contradictions or tensions in the data\n4. Assess the strength of evidence for each finding\n\nGround every insight in the data extracted above.`,
    },
    {
      id: "analyst_report",
      label: "Produce final report",
      icon: "📋",
      purpose: "Compile findings into a structured, actionable report",
      buildPrompt: (_base, _topic, domain, prev, _ctx) =>
        `Based on the following analysis:\n\n${prev}\n\n---\n\nProduce a final structured report for: "${_base}"\n\nInclude:\n1. Executive summary (2–3 sentences)\n2. Key findings ranked by significance\n3. Supporting evidence for each finding\n4. Actionable recommendations\n\nMake it clear, specific, and directly useful.`,
    },
  ],

  AUDITOR: [
    {
      id: "auditor_inventory",
      label: "Inventory coverage",
      icon: "📋",
      purpose: "Map what the corpus covers and what standards it references",
      buildPrompt: (_base, _topic, domain, _prev, ctx) => {
        const focus = ctx?.length ? `\n\nPay particular attention to these areas: ${ctx.join(", ")}.` : "";
        return `From the ${domain} knowledge base, inventory all content relevant to: "${_base}"${focus}\n\nDocument:\n1. What topics and areas are covered\n2. What standards, regulations or requirements are referenced\n3. What processes or controls are described\n4. Specific policies, procedures or rules found\n\nBe exhaustive — this inventory will be used for gap analysis.`;
      },
    },
    {
      id: "auditor_check",
      label: "Identify gaps and risks",
      icon: "🔍",
      purpose: "Compare coverage against requirements to find gaps and risks",
      buildPrompt: (_base, _topic, domain, prev, _ctx) =>
        `Given this inventory of coverage from the ${domain} knowledge base:\n\n${prev}\n\n---\n\nPerform a gap analysis for: "${_base}"\n\nIdentify:\n1. What requirements are fully met — with specific evidence\n2. What is partially covered — exactly what is missing\n3. What is completely absent — critical gaps\n4. Risk level for each gap (critical / high / medium / low)\n\nBe specific about what is missing and why it matters.`,
    },
    {
      id: "auditor_report",
      label: "Write audit report",
      icon: "📄",
      purpose: "Compile a formal audit report with gaps and remediation steps",
      buildPrompt: (_base, _topic, domain, prev, _ctx) =>
        `Based on the following gap analysis:\n\n${prev}\n\n---\n\nProduce a final audit report for: "${_base}"\n\nInclude:\n1. Overall compliance assessment\n2. Critical gaps requiring immediate action\n3. Non-critical gaps for planned remediation\n4. Specific, actionable remediation steps for each gap\n5. Priority order for addressing findings\n\nMake it formal, specific and immediately actionable.`,
    },
  ],

  SUMMARIZER: [
    {
      id: "summarizer_extract",
      label: "Extract key content",
      icon: "📥",
      purpose: "Identify and group the most important content from the corpus",
      buildPrompt: (_base, _topic, domain, _prev, ctx) => {
        const focus = ctx?.length ? `\n\nPrioritise these specific topics: ${ctx.join(", ")}.` : "";
        return `From the ${domain} knowledge base, extract all key information for: "${_base}"${focus}\n\nOrganize by:\n1. Main topics and themes\n2. Critical facts and figures\n3. Important relationships and dependencies\n4. Notable developments or changes\n\nCapture everything significant — this stage prioritizes completeness over brevity.`;
      },
    },
    {
      id: "summarizer_draft",
      label: "Draft the summary",
      icon: "✏️",
      purpose: "Write a comprehensive draft covering all extracted content",
      buildPrompt: (_base, _topic, domain, prev) =>
        `Based on the following extracted content from the ${domain} knowledge base:\n\n${prev}\n\n---\n\nWrite a comprehensive draft summary for: "${_base}"\n\n1. Cover all major topics from the extraction\n2. Present information in logical order\n3. Ensure completeness — every key point must appear\n4. Use clear, direct language\n\nThis is a draft — prioritize completeness over conciseness.`,
    },
    {
      id: "summarizer_tune",
      label: "Tune for audience",
      icon: "🎯",
      purpose: "Refine the draft to the right length, clarity and audience",
      buildPrompt: (_base, _topic, domain, prev) =>
        `Here is a comprehensive draft summary:\n\n${prev}\n\n---\n\nRefine this for: "${_base}"\n\n1. Cut redundancy while preserving all key information\n2. Improve flow and readability\n3. Ensure the opening sentence captures the most important point\n4. Make it appropriately concise for the intended audience\n\nThe final summary should be complete, clear and well-structured.`,
    },
  ],
};

export function getProcessPlan(intent: PathType): ProcessStep[] {
  return PLANS[intent] ?? PLANS.RESEARCHER;
}

export function getProcessMeta(intent: PathType): ProcessStepMeta[] {
  return getProcessPlan(intent).map(({ id, label, icon, purpose }) => ({
    id, label, icon, purpose,
  }));
}
