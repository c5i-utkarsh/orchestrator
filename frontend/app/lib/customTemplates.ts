// Custom user-defined process templates — stored in localStorage under "orch_custom_templates"

export interface CustomStep {
  id: string;
  label: string;
  icon: string;
  purpose: string;
  // Prompt template with interpolation variables:
  // {query}      — the user's original question/goal
  // {topic}      — the resolved topic string
  // {domain}     — the corpus domain label
  // {prevOutput} — the output from the previous step (empty for step 1)
  // {topics}     — comma-joined list of selected wiki topic pills
  promptTemplate: string;
}

export interface CustomTemplate {
  id: string;            // uuid
  name: string;
  description: string;
  intent: string;        // free label e.g. "CUSTOM" or maps to PathType for analytics
  steps: CustomStep[];
  createdAt: string;
  updatedAt: string;
}

export const STORAGE_KEY = "orch_custom_templates";

export function loadCustomTemplates(): CustomTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveCustomTemplates(templates: CustomTemplate[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function deleteCustomTemplate(id: string): void {
  const existing = loadCustomTemplates();
  saveCustomTemplates(existing.filter(t => t.id !== id));
}

export function buildStepPrompt(
  step: CustomStep,
  baseQuery: string,
  topic: string,
  domain: string,
  prevOutput: string,
  contextTopics: string[],
): string {
  const topicsStr = contextTopics.length > 0 ? contextTopics.join(", ") : topic;
  return step.promptTemplate
    .replace(/\{query\}/g, baseQuery)
    .replace(/\{topic\}/g, topic)
    .replace(/\{domain\}/g, domain)
    .replace(/\{prevOutput\}/g, prevOutput || "(no previous output)")
    .replace(/\{topics\}/g, topicsStr);
}

// Convert a CustomTemplate into the ProcessStep[] shape that processing/page.tsx expects
export function customTemplateToProcessSteps(
  template: CustomTemplate,
): import("./processTemplates").ProcessStep[] {
  return template.steps.map(step => ({
    id: step.id,
    label: step.label,
    icon: step.icon,
    purpose: step.purpose,
    buildPrompt: (
      baseQuery: string,
      topic: string,
      domain: string,
      prevOutput: string,
      contextTopics?: string[],
    ) => buildStepPrompt(step, baseQuery, topic, domain, prevOutput, contextTopics ?? []),
  }));
}

export function newTemplateId(): string {
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function newStepId(): string {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export const STEP_VARIABLE_HINTS = [
  { variable: "{query}", description: "The user's original question / goal" },
  { variable: "{topic}", description: "Resolved topic string from the prompt builder" },
  { variable: "{domain}", description: "Corpus domain label (e.g. \"engineering docs\")" },
  { variable: "{prevOutput}", description: "Full output from the previous step" },
  { variable: "{topics}", description: "Comma-joined wiki topic pills selected by user" },
];

export const STEP_ICON_OPTIONS = [
  "🔬","🏗️","💻","📥","🧠","✅","📊","🔍","📋","📄","🎯","⚙️",
  "📝","🔧","🧪","📡","🗂️","💡","🔐","📈","🔁","🧩","🗺️","⚡",
];
