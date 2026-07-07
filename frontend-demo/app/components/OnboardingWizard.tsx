"use client";

import { useState } from "react";

const INDUSTRIES = [
  { id: "retail",        label: "Retail & E-commerce",   icon: "🛒", color: "#6c5cf7" },
  { id: "manufacturing", label: "Manufacturing",          icon: "🏭", color: "#0d9e74" },
  { id: "healthcare",    label: "Healthcare",             icon: "🏥", color: "#e63755" },
  { id: "finance",       label: "Finance & Banking",      icon: "🏦", color: "#d97706" },
  { id: "logistics",     label: "Logistics & Supply",     icon: "🚚", color: "#60a5fa" },
  { id: "it",            label: "IT & Technology",        icon: "💻", color: "#2563eb" },
  { id: "general",       label: "General / Other",        icon: "📦", color: "#9898b0" },
];

const USE_CASES: Record<string, { id: string; label: string; desc: string; icon: string }[]> = {
  it: [
    { id: "build_app",      label: "Build an Application",   desc: "Design architecture and tech stack for a new app",     icon: "🏗️" },
    { id: "code_qa",        label: "Code & Tech Q&A",         desc: "Ask questions about codebases, APIs, docs",             icon: "💬" },
    { id: "incident",       label: "Incident Analysis",       desc: "Analyze logs, errors, and system events",              icon: "⚠️" },
    { id: "compliance",     label: "Security & Compliance",   desc: "Check against OWASP, SOC2, ISO 27001",                 icon: "🔒" },
  ],
  retail: [
    { id: "build_app",      label: "Build an Application",   desc: "Design and build a retail or e-commerce platform",    icon: "🏗️" },
    { id: "product_qa",     label: "Answer Product Questions",  desc: "Customers ask, AI answers from your catalog", icon: "💬" },
    { id: "catalog_search", label: "Smart Catalog Search",      desc: "Find products by description or attributes",  icon: "🔍" },
    { id: "compliance",     label: "Compliance Check",          desc: "Audit listings against regulations",           icon: "✅" },
  ],
  manufacturing: [
    { id: "build_app",      label: "Build an Application",   desc: "Design tools for production, QC, or supply chain",    icon: "🏗️" },
    { id: "supplier_audit", label: "Supplier Document Audit",   desc: "Review contracts and compliance docs",         icon: "📋" },
    { id: "quality",        label: "Quality Reports",           desc: "Summarize defect and QA reports",              icon: "📊" },
    { id: "compliance",     label: "Regulatory Compliance",     desc: "Check against ISO, CE, or industry standards", icon: "✅" },
  ],
  healthcare: [
    { id: "build_app",      label: "Build an Application",   desc: "Design clinical, admin, or patient-facing tools",     icon: "🏗️" },
    { id: "clinical_qa",    label: "Clinical Document Q&A",     desc: "Query patient protocols and guidelines",       icon: "🩺" },
    { id: "compliance",     label: "Compliance Check",          desc: "Audit against HIPAA, FDA, or local rules",     icon: "✅" },
    { id: "summarize",      label: "Report Summarization",      desc: "Summarize clinical trial or lab reports",      icon: "📝" },
  ],
  finance: [
    { id: "build_app",      label: "Build an Application",   desc: "Design fintech, reporting, or compliance tools",      icon: "🏗️" },
    { id: "contract_review", label: "Contract Review",         desc: "Analyze terms in agreements and contracts",    icon: "📑" },
    { id: "compliance",      label: "Compliance Audit",        desc: "Check against GDPR, AML, KYC policies",        icon: "✅" },
    { id: "risk",            label: "Risk Analysis",           desc: "Identify risk factors across documents",       icon: "⚠️" },
  ],
  logistics: [
    { id: "build_app",      label: "Build an Application",   desc: "Design tracking, dispatch, or routing tools",         icon: "🏗️" },
    { id: "tracking_qa",    label: "Shipment Q&A",             desc: "Answer questions from tracking and manifests", icon: "📦" },
    { id: "compliance",     label: "Customs Compliance",       desc: "Audit documents against customs requirements", icon: "✅" },
    { id: "supplier_qa",    label: "Supplier Q&A",             desc: "Query supplier agreements and SLAs",           icon: "🤝" },
  ],
  general: [
    { id: "build_app",      label: "Build an Application",   desc: "Design and plan a new software project",       icon: "🏗️" },
    { id: "document_qa",    label: "Document Q&A",             desc: "Ask questions about any uploaded documents",   icon: "💬" },
    { id: "summarize",      label: "Summarize Documents",      desc: "Get concise summaries of long documents",      icon: "📝" },
    { id: "compliance",     label: "Compliance Check",         desc: "Check documents against policies or rules",    icon: "✅" },
  ],
};

const WORKSPACE_SUGGESTIONS: Record<string, Record<string, string>> = {
  retail:        { build_app: "retail-app", product_qa: "product-support", catalog_search: "product-catalog", compliance: "compliance-check" },
  manufacturing: { build_app: "mfg-app", supplier_audit: "supplier-docs", quality: "quality-reports", compliance: "regulatory-docs" },
  healthcare:    { build_app: "health-app", clinical_qa: "clinical-protocols", compliance: "hipaa-compliance", summarize: "clinical-reports" },
  finance:       { build_app: "fintech-app", contract_review: "contracts", compliance: "compliance-audit", risk: "risk-analysis" },
  logistics:     { build_app: "logistics-app", tracking_qa: "shipment-data", compliance: "customs-docs", supplier_qa: "supplier-agreements" },
  it:            { build_app: "app-builder", code_qa: "tech-docs", incident: "incident-analysis", compliance: "security-audit" },
  general:       { build_app: "app-builder", document_qa: "my-documents", summarize: "document-summaries", compliance: "policy-review" },
};

const PIPELINE_CONFIGS: Record<string, Record<string, { quality_threshold: number; dedup_sensitivity: number; suggested_model: string }>> = {
  retail:        { build_app: { quality_threshold: 0.70, dedup_sensitivity: 3, suggested_model: "llama3.2:latest" }, product_qa: { quality_threshold: 0.7, dedup_sensitivity: 3, suggested_model: "mistral:latest" }, catalog_search: { quality_threshold: 0.6, dedup_sensitivity: 2, suggested_model: "nomic-embed-text:latest" }, compliance: { quality_threshold: 0.85, dedup_sensitivity: 4, suggested_model: "mistral:latest" } },
  manufacturing: { build_app: { quality_threshold: 0.70, dedup_sensitivity: 3, suggested_model: "llama3.2:latest" }, supplier_audit: { quality_threshold: 0.85, dedup_sensitivity: 4, suggested_model: "mistral:latest" }, quality: { quality_threshold: 0.75, dedup_sensitivity: 3, suggested_model: "mistral:latest" }, compliance: { quality_threshold: 0.90, dedup_sensitivity: 5, suggested_model: "mistral:latest" } },
  healthcare:    { build_app: { quality_threshold: 0.75, dedup_sensitivity: 3, suggested_model: "llama3.2:latest" }, clinical_qa: { quality_threshold: 0.90, dedup_sensitivity: 5, suggested_model: "mistral:latest" }, compliance: { quality_threshold: 0.95, dedup_sensitivity: 5, suggested_model: "mistral:latest" }, summarize: { quality_threshold: 0.80, dedup_sensitivity: 3, suggested_model: "llama3.2:latest" } },
  finance:       { build_app: { quality_threshold: 0.75, dedup_sensitivity: 3, suggested_model: "llama3.2:latest" }, contract_review: { quality_threshold: 0.90, dedup_sensitivity: 4, suggested_model: "mistral:latest" }, compliance: { quality_threshold: 0.90, dedup_sensitivity: 5, suggested_model: "mistral:latest" }, risk: { quality_threshold: 0.85, dedup_sensitivity: 4, suggested_model: "mistral:latest" } },
  logistics:     { build_app: { quality_threshold: 0.70, dedup_sensitivity: 3, suggested_model: "llama3.2:latest" }, tracking_qa: { quality_threshold: 0.70, dedup_sensitivity: 2, suggested_model: "llama3.2:latest" }, compliance: { quality_threshold: 0.85, dedup_sensitivity: 4, suggested_model: "mistral:latest" }, supplier_qa: { quality_threshold: 0.80, dedup_sensitivity: 3, suggested_model: "mistral:latest" } },
  it:            { build_app: { quality_threshold: 0.75, dedup_sensitivity: 3, suggested_model: "llama3.2:latest" }, code_qa: { quality_threshold: 0.70, dedup_sensitivity: 2, suggested_model: "llama3.2:latest" }, incident: { quality_threshold: 0.80, dedup_sensitivity: 4, suggested_model: "mistral:latest" }, compliance: { quality_threshold: 0.90, dedup_sensitivity: 5, suggested_model: "mistral:latest" } },
  general:       { build_app: { quality_threshold: 0.70, dedup_sensitivity: 3, suggested_model: "llama3.2:latest" }, document_qa: { quality_threshold: 0.65, dedup_sensitivity: 2, suggested_model: "mistral:latest" }, summarize: { quality_threshold: 0.65, dedup_sensitivity: 2, suggested_model: "llama3.2:latest" }, compliance: { quality_threshold: 0.80, dedup_sensitivity: 3, suggested_model: "mistral:latest" } },
};

interface OnboardingWizardProps {
  onComplete: (workspaceName: string) => void;
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [industry, setIndustry] = useState("");
  const [useCase, setUseCase] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");

  const useCases = industry ? (USE_CASES[industry] ?? USE_CASES.general) : [];

  const handleIndustry = (id: string) => {
    setIndustry(id);
    setUseCase("");
    setWorkspaceName("");
    setStep(1);
  };

  const handleUseCase = (id: string) => {
    setUseCase(id);
    const suggested = WORKSPACE_SUGGESTIONS[industry]?.[id] ?? "my-workspace";
    setWorkspaceName(suggested);
    setStep(2);
  };

  const handleComplete = () => {
    if (!workspaceName.trim()) return;
    // Save persona to localStorage
    const persona = { industry, useCase, workspaceName: workspaceName.trim() };
    localStorage.setItem("orch_persona", JSON.stringify(persona));
    // Save pipeline config
    const cfg = PIPELINE_CONFIGS[industry]?.[useCase] ?? { quality_threshold: 0.70, dedup_sensitivity: 3, suggested_model: "mistral:latest" };
    localStorage.setItem("orch_pipeline_config", JSON.stringify({ ...cfg, gates_enabled: true }));
    // Mark wizard done
    localStorage.setItem("orch_persona_done", "1");
    onComplete(workspaceName.trim());
  };

  const industryData = INDUSTRIES.find(i => i.id === industry);

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-8 pb-0">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center gap-1">
              <img src="/c5i-logo.png" alt="C5i" width={40} height={22} className="object-contain" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest text-t3">Welcome to Domain Harnessing System</div>
              <div className="text-lg font-bold text-t1 font-sora">Let's set up your workspace</div>
            </div>
          </div>
          {/* Step dots */}
          <div className="flex items-center gap-2 mb-8">
            {["Your industry", "Your goal", "Name it"].map((label, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 ${i <= step ? "opacity-100" : "opacity-40"}`}>
                  <div className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center transition-colors ${
                    i < step ? "bg-gg text-white" : i === step ? "bg-accent text-white" : "bg-bg4 text-t3"
                  }`}>{i < step ? "✓" : i + 1}</div>
                  <span className={`text-[11px] font-semibold ${i === step ? "text-accent" : "text-t3"}`}>{label}</span>
                </div>
                {i < 2 && <div className="w-6 h-px bg-dborder" />}
              </div>
            ))}
          </div>
        </div>

        <div className="px-8 pb-8">
          {/* Step 0 — Industry */}
          {step === 0 && (
            <div>
              <div className="text-[13px] font-semibold text-t1 mb-4">Which industry are you in?</div>
              <div className="grid grid-cols-2 gap-3">
                {INDUSTRIES.map(ind => (
                  <button
                    key={ind.id}
                    onClick={() => handleIndustry(ind.id)}
                    className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-dborder bg-bg2 hover:border-accent hover:bg-accent/5 transition-all text-left group"
                  >
                    <span className="text-2xl">{ind.icon}</span>
                    <span className="text-[13px] font-semibold text-t1 group-hover:text-accent">{ind.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 1 — Use Case */}
          {step === 1 && industry && (
            <div>
              <button onClick={() => setStep(0)} className="text-[11px] text-t3 hover:text-t1 mb-4 flex items-center gap-1">
                ← Back
              </button>
              <div className="text-[13px] font-semibold text-t1 mb-1">What's your main goal?</div>
              <div className="text-[11px] text-t3 mb-4">For your {industryData?.label} workspace</div>
              <div className="space-y-2">
                {useCases.map(uc => (
                  <button
                    key={uc.id}
                    onClick={() => handleUseCase(uc.id)}
                    className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border border-dborder bg-bg2 hover:border-accent hover:bg-accent/5 transition-all text-left group"
                  >
                    <span className="text-xl w-8 flex-shrink-0">{uc.icon}</span>
                    <div>
                      <div className="text-[13px] font-semibold text-t1 group-hover:text-accent">{uc.label}</div>
                      <div className="text-[11px] text-t3">{uc.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2 — Name workspace */}
          {step === 2 && (
            <div>
              <button onClick={() => setStep(1)} className="text-[11px] text-t3 hover:text-t1 mb-4 flex items-center gap-1">
                ← Back
              </button>
              <div className="text-[13px] font-semibold text-t1 mb-1">Name your workspace</div>
              <div className="text-[11px] text-t3 mb-4">You can always change this later</div>
              <input
                className="w-full bg-bg3 border border-dborder2 rounded-xl px-4 py-3 text-[14px] text-t1 outline-none focus:border-accent transition-colors font-dm mb-4"
                placeholder="e.g. product-catalog"
                value={workspaceName}
                onChange={e => setWorkspaceName(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                onKeyDown={e => e.key === "Enter" && handleComplete()}
                autoFocus
              />
              <div className="bg-bg3 border border-dborder rounded-xl px-4 py-3 mb-6 space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-widest text-t3 mb-2">Your workspace will be configured for</div>
                <div className="flex items-center gap-2 text-[12px] text-t2">
                  <span className="text-accent">✓</span> Industry: <span className="font-semibold text-t1">{industryData?.label}</span>
                </div>
                <div className="flex items-center gap-2 text-[12px] text-t2">
                  <span className="text-accent">✓</span> Goal: <span className="font-semibold text-t1">{useCases.find(u => u.id === useCase)?.label}</span>
                </div>
                <div className="flex items-center gap-2 text-[12px] text-t2">
                  <span className="text-accent">✓</span> Smart defaults: quality thresholds, model selection, pipeline gates
                </div>
              </div>
              <button
                onClick={handleComplete}
                disabled={!workspaceName.trim()}
                className="w-full py-3 rounded-xl bg-accent text-white font-bold text-[14px] hover:bg-accent/90 transition-colors disabled:opacity-40"
              >
                Create Workspace →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
