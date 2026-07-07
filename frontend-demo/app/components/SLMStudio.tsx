"use client";

import { useState } from "react";

interface AvailableModel {
  name: string;
  provider: string;
  is_available_locally: boolean;
}

const STUDENT_MODELS = [
  { id: "auto",          label: "Auto Select",       desc: "System picks based on available memory", icon: "⚡", vram: "auto" },
  { id: "SmolLM2-1.7B",  label: "SmolLM2 1.7B",      desc: "Fast, great for most tasks",             icon: "🚀", vram: "1.5 GB" },
  { id: "Qwen2.5-0.5B",  label: "Qwen2.5 0.5B",      desc: "Lightest, runs on any hardware",          icon: "🪶", vram: "0.6 GB" },
];

const TRAINING_PRESETS = [
  {
    id: "careful",
    label: "Careful",
    desc: "Conservative — fewer errors, takes longer",
    icon: "🐢",
    params: { learning_rate: 5e-5, num_epochs: 2, lora_r: 8 },
  },
  {
    id: "balanced",
    label: "Balanced",
    desc: "Best for most workspaces — recommended",
    icon: "⚖️",
    params: { learning_rate: 2e-4, num_epochs: 3, lora_r: 16 },
    recommended: true,
  },
  {
    id: "aggressive",
    label: "Aggressive",
    desc: "Learn fast — best for large datasets",
    icon: "🔥",
    params: { learning_rate: 5e-4, num_epochs: 5, lora_r: 32 },
  },
];

const QA_VOLUMES = [
  { id: "quick",    label: "Quick",    pairs: 3000,  time: "~5 min",  icon: "⚡" },
  { id: "standard", label: "Standard", pairs: 8000,  time: "~15 min", icon: "✅", recommended: true },
  { id: "deep",     label: "Deep",     pairs: 15000, time: "~40 min", icon: "🎯" },
];

export interface SLMConfig {
  teacher_model: string;
  advisor_model: string | null;
  student_model: string;
  qa_pairs_target: number;
  learning_rate: number;
  num_epochs: number;
  lora_r: number;
  curriculum_stages: number;
}

interface SLMStudioProps {
  availableModels: AvailableModel[];
  onStart: (config: SLMConfig) => void;
  onSkip: () => void;
}

export default function SLMStudio({ availableModels = [], onStart, onSkip }: SLMStudioProps) {
  const [step, setStep] = useState(0);
  const [teacherModel, setTeacherModel] = useState(
    availableModels.find(m => m.provider !== "custom_slm" && m.name?.includes("mistral"))?.name ??
    availableModels.find(m => m.provider !== "custom_slm" && m.is_available_locally)?.name ??
    "mistral:latest"
  );
  const [advisorEnabled, setAdvisorEnabled] = useState(false);
  const [advisorModel, setAdvisorModel] = useState<string | null>(null);
  const [qaVolume, setQaVolume] = useState("standard");
  const [studentModel, setStudentModel] = useState("auto");
  const [curriculumStages, setCurriculumStages] = useState(3);
  const [trainingPreset, setTrainingPreset] = useState("balanced");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customLoraR, setCustomLoraR] = useState(16);
  const [customEpochs, setCustomEpochs] = useState(3);
  const [customLr, setCustomLr] = useState("2e-4");

  const qaVol = QA_VOLUMES.find(q => q.id === qaVolume)!;
  const preset = TRAINING_PRESETS.find(p => p.id === trainingPreset)!;
  const student = STUDENT_MODELS.find(s => s.id === studentModel)!;

  const handleStart = () => {
    const presetParams = showAdvanced
      ? { learning_rate: parseFloat(customLr), num_epochs: customEpochs, lora_r: customLoraR }
      : preset.params;
    onStart({
      teacher_model: teacherModel,
      advisor_model: advisorEnabled ? advisorModel : null,
      student_model: studentModel === "auto" ? "" : studentModel,
      qa_pairs_target: qaVol.pairs,
      ...presetParams,
      curriculum_stages: curriculumStages,
    });
  };

  // Teacher/advisor must be large Ollama models — custom SLMs are student outputs (0.5–1.7B)
  // and would generate poor training data if used as teacher.
  // Also exclude embedding-only and vision-only models (nomic, llava, clip) — they can't generate text.
  const _EMBED_VISION_RE = /nomic|llava|clip|embed|vision/i;
  const localModels = (availableModels ?? []).filter(m => m.is_available_locally);
  const teacherCandidates = localModels.filter(
    m => m.provider !== "custom_slm" && !_EMBED_VISION_RE.test(m.name ?? "")
  );

  return (
    <div className="fixed inset-0 z-[160] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-7 pt-7 pb-5 border-b border-dborder flex-shrink-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-center text-xl">🧠</div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-t3">AI Model Builder</div>
              <div className="text-[16px] font-bold text-t1 font-sora">Configure Your Custom AI</div>
            </div>
          </div>
          {/* Step dots */}
          <div className="flex items-center gap-2">
            {["Teaching", "Student", "Training", "Review"].map((label, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className={`flex items-center gap-1 ${i <= step ? "opacity-100" : "opacity-40"}`}>
                  <div className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    i < step ? "bg-gg text-white" : i === step ? "bg-accent text-white" : "bg-bg4 text-t3"
                  }`}>{i < step ? "✓" : i + 1}</div>
                  <span className={`text-[11px] font-semibold hidden sm:block ${i === step ? "text-accent" : "text-t3"}`}>{label}</span>
                </div>
                {i < 3 && <div className="w-4 h-px bg-dborder" />}
              </div>
            ))}
          </div>
        </div>

        <div className="px-7 py-5 overflow-y-auto flex-1">

          {/* Step 0 — Teaching Setup */}
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <div className="text-[13px] font-bold text-t1 mb-1">Who teaches your AI?</div>
                <div className="text-[11px] text-t3 mb-2">This model generates the training questions and answers from your documents</div>
                {/* Recommendation tip */}
                <div className="bg-accent/8 border border-accent/20 rounded-xl px-3 py-2.5 mb-3 text-[11px] text-t2 flex gap-2">
                  <span className="text-accent flex-shrink-0">💡</span>
                  <span>
                    <b className="text-t1">Knowledge distillation — 3 roles:</b>{" "}
                    <b>Teacher</b> (large Ollama model) generates domain Q&A pairs →{" "}
                    <b>Advisor</b> (optional) filters the best 80% →{" "}
                    <b>Student</b> (SmolLM2-1.7B / Qwen2.5-0.5B) is QLoRA fine-tuned and becomes your custom SLM.
                    Pick the largest teacher you have — avoid anything under 3B.
                  </span>
                </div>
                <div className="space-y-2">
                  {teacherCandidates.map(m => (
                    <button key={m.name}
                      onClick={() => setTeacherModel(m.name)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-left ${
                        teacherModel === m.name ? "border-accent bg-accent/8" : "border-dborder bg-bg2 hover:border-accent/40"
                      }`}>
                      <div>
                        <span className="text-[12px] font-semibold text-t1">{m.name}</span>
                        {(m.name.includes("mistral") || m.name.includes("llama")) && (
                          <span className="ml-2 text-[9px] px-1.5 py-0.5 bg-gg/10 text-gg border border-gg/20 rounded">Recommended</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {m.provider === "custom_slm"
                          ? <span className="text-[9px] px-2 py-0.5 bg-accent/10 text-accent border border-accent/20 rounded">Custom SLM</span>
                          : <span className="text-[9px] px-2 py-0.5 bg-gg/10 text-gg border border-gg/20 rounded">Local</span>
                        }
                        {teacherModel === m.name && <span className="text-accent text-[11px]">✓</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-dborder rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-[12px] font-bold text-t1">Add quality reviewer? <span className="text-[10px] font-normal text-t3">(optional)</span></div>
                    <div className="text-[11px] text-t3 mt-0.5">A second model reviews each Q&A pair — only the best 80% make it into training</div>
                  </div>
                  <button
                    onClick={() => setAdvisorEnabled(p => !p)}
                    className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 ml-3 ${advisorEnabled ? "bg-accent" : "bg-bg4"}`}
                    style={{ position: "relative" }}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${advisorEnabled ? "left-5" : "left-0.5"}`} />
                  </button>
                </div>
                {advisorEnabled ? (
                  <>
                    <div className="bg-amber/8 border border-amber/20 rounded-lg px-3 py-2 mb-2 text-[10px] text-amber">
                      ⏱ Adds ~50% to data generation time, but improves training quality significantly. Best when you have &lt;500 documents.
                    </div>
                    <select
                      className="w-full bg-bg3 border border-dborder2 rounded-lg px-3 py-2 text-[12px] text-t1 outline-none focus:border-accent"
                      value={advisorModel ?? ""}
                      onChange={e => setAdvisorModel(e.target.value || null)}
                    >
                      <option value="">— Select reviewer model —</option>
                      {teacherCandidates.filter(m => m.name !== teacherModel).map(m => (
                        <option key={m.name} value={m.name}>{m.name}</option>
                      ))}
                    </select>
                  </>
                ) : null}
              </div>

              <div>
                <div className="text-[12px] font-bold text-t1 mb-1">How much training data?</div>
                <div className="text-[11px] text-t3 mb-2">More pairs = better model, but takes longer</div>
                <div className="grid grid-cols-3 gap-2">
                  {QA_VOLUMES.map(v => (
                    <button key={v.id}
                      onClick={() => setQaVolume(v.id)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                        qaVolume === v.id ? "border-accent bg-accent/8" : "border-dborder bg-bg2 hover:border-accent/40"
                      }`}>
                      <span className="text-xl">{v.icon}</span>
                      <span className="text-[12px] font-bold text-t1">{v.label}</span>
                      <span className="text-[10px] text-t3">{v.pairs.toLocaleString()} Q&As</span>
                      <span className="text-[10px] text-t3">{v.time}</span>
                      {v.recommended && <span className="text-[9px] px-1.5 py-0.5 bg-accent/10 text-accent border border-accent/20 rounded">Recommended</span>}
                    </button>
                  ))}
                </div>
                <div className="mt-2 text-[10px] text-t3">
                  💡 <b>Quick</b> is great for testing. <b>Standard</b> is production-ready. <b>Deep</b> for mission-critical deployments.
                </div>
              </div>
            </div>
          )}

          {/* Step 1 — Student Model */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <div className="text-[13px] font-bold text-t1 mb-1">Which AI will be trained?</div>
                <div className="text-[11px] text-t3 mb-2">This small model learns from your data. It runs on your machine permanently.</div>
                <div className="bg-accent/8 border border-accent/20 rounded-xl px-3 py-2.5 mb-3 text-[11px] text-t2 flex gap-2">
                  <span className="text-accent flex-shrink-0">💡</span>
                  <span>
                    <b className="text-t1">Not sure? Choose Auto Select.</b> For most workspaces (documents, Q&A, policies), <b>SmolLM2 1.7B</b> is the best balance of speed and accuracy. Choose <b>Qwen2.5 0.5B</b> only if you have very limited RAM.
                  </span>
                </div>
                <div className="space-y-2">
                  {STUDENT_MODELS.map(m => (
                    <button key={m.id}
                      onClick={() => setStudentModel(m.id)}
                      className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl border transition-all text-left ${
                        studentModel === m.id ? "border-accent bg-accent/8" : "border-dborder bg-bg2 hover:border-accent/40"
                      }`}>
                      <span className="text-2xl">{m.icon}</span>
                      <div className="flex-1">
                        <div className="text-[13px] font-bold text-t1">{m.label}</div>
                        <div className="text-[11px] text-t3">{m.desc}</div>
                      </div>
                      <div className="text-[10px] font-semibold text-t3 flex-shrink-0">{m.vram} VRAM</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[12px] font-bold text-t1 mb-2">
                  <span>Curriculum stages</span>
                  <span className="text-accent">{curriculumStages}</span>
                </div>
                <input type="range" min={2} max={5} value={curriculumStages}
                  onChange={e => setCurriculumStages(Number(e.target.value))}
                  className="w-full accent-accent cursor-pointer" />
                <div className="text-[10px] text-t3 mt-1">
                  Train in {curriculumStages} difficulty levels (easy → hard). 
                  {curriculumStages <= 2 ? " Good for small datasets." : curriculumStages >= 4 ? " Best for diverse, large document sets." : " Balanced — works for most cases."}
                </div>
              </div>
            </div>
          )}

          {/* Step 2 — Training Parameters */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <div className="text-[13px] font-bold text-t1 mb-1">How should it learn?</div>
                <div className="text-[11px] text-t3 mb-2">Controls the speed and thoroughness of learning</div>
                <div className="bg-accent/8 border border-accent/20 rounded-xl px-3 py-2.5 mb-3 text-[11px] text-t2 flex gap-2">
                  <span className="text-accent flex-shrink-0">💡</span>
                  <span>
                    <b className="text-t1">Balanced is right for most cases.</b> Use <b>Careful</b> if your documents are highly technical (medical, legal, financial). 
                    Use <b>Aggressive</b> only if you have 1,000+ documents and want quick results.
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {TRAINING_PRESETS.map(p => (
                    <button key={p.id}
                      onClick={() => setTrainingPreset(p.id)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                        trainingPreset === p.id ? "border-accent bg-accent/8" : "border-dborder bg-bg2 hover:border-accent/40"
                      }`}>
                      <span className="text-2xl">{p.icon}</span>
                      <span className="text-[12px] font-bold text-t1">{p.label}</span>
                      <span className="text-[10px] text-t3 text-center">{p.desc}</span>
                      {p.recommended && <span className="text-[9px] px-1.5 py-0.5 bg-accent/10 text-accent border border-accent/20 rounded">Recommended</span>}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setShowAdvanced(p => !p)}
                className="text-[11px] text-accent font-semibold flex items-center gap-1"
              >
                {showAdvanced ? "▼" : "►"} Advanced settings (LoRA / epochs / learning rate)
              </button>
              {showAdvanced && (
                <div className="bg-bg3 rounded-xl p-4 space-y-3">
                  <div className="text-[10px] text-t3 mb-2 leading-relaxed">
                    ⚙️ These settings control the fine-tuning process directly. Only change them if you understand LoRA training.
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-1">LoRA rank (r)</div>
                      <select className="w-full bg-white border border-dborder2 rounded-lg px-3 py-2 text-[12px] text-t1 outline-none focus:border-accent"
                        value={customLoraR} onChange={e => setCustomLoraR(Number(e.target.value))}>
                        {[8, 16, 32, 64].map(v => <option key={v} value={v}>{v}{v === 8 ? " (fastest)" : v === 16 ? " (balanced ✓)" : v === 32 ? " (accurate)" : " (max)"}</option>)}
                      </select>
                      <div className="text-[9px] text-t3 mt-1">Higher = more expressive but slower. 16 is the sweet spot.</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-1">Epochs</div>
                      <input type="number" min={1} max={10} value={customEpochs}
                        onChange={e => setCustomEpochs(Number(e.target.value))}
                        className="w-full bg-white border border-dborder2 rounded-lg px-3 py-2 text-[12px] text-t1 outline-none focus:border-accent" />
                      <div className="text-[9px] text-t3 mt-1">Passes through data. 2–3 prevents overfitting.</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-1">Learning rate</div>
                    <select className="w-full bg-white border border-dborder2 rounded-lg px-3 py-2 text-[12px] text-t1 outline-none focus:border-accent"
                      value={customLr} onChange={e => setCustomLr(e.target.value)}>
                      {[
                        { v: "5e-5", l: "5e-5 (very careful)" },
                        { v: "1e-4", l: "1e-4 (careful)" },
                        { v: "2e-4", l: "2e-4 (balanced ✓)" },
                        { v: "5e-4", l: "5e-4 (aggressive)" },
                        { v: "1e-3", l: "1e-3 (very aggressive)" },
                      ].map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                    <div className="text-[9px] text-t3 mt-1">Too high → unstable training. Too low → slow. 2e-4 is proven safe.</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3 — Review */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="text-[13px] font-bold text-t1 mb-3">Review your AI configuration</div>
              {[
                { label: "Teacher model",   value: teacherModel },
                { label: "Quality reviewer", value: advisorEnabled && advisorModel ? advisorModel : "None" },
                { label: "Training data",   value: `${qaVol.pairs.toLocaleString()} Q&A pairs (${qaVol.time})` },
                { label: "Student model",   value: student.label },
                { label: "Learning style",  value: preset.label },
                { label: "Curriculum",      value: `${curriculumStages} stages` },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-center py-2 border-b border-dborder last:border-0">
                  <span className="text-[12px] text-t3">{row.label}</span>
                  <span className="text-[12px] font-semibold text-t1">{row.value}</span>
                </div>
              ))}
              <div className="bg-accent/8 border border-accent/20 rounded-xl p-4 mt-2">
                <div className="text-[12px] font-bold text-accent mb-1">⚡ Estimated time</div>
                <div className="text-[11px] text-t2">
                  {qaVol.time} to generate training data
                  {preset.id === "careful" ? " + ~20 min to train" : preset.id === "balanced" ? " + ~30 min to train" : " + ~50 min to train"}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-7 pb-7 pt-4 border-t border-dborder flex-shrink-0">
          {step < 3 ? (
            <div className="flex gap-3">
              {step > 0 && (
                <button onClick={() => setStep(s => s - 1)}
                  className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-t3 border border-dborder hover:border-t2">
                  ← Back
                </button>
              )}
              <button onClick={() => setStep(s => s + 1)}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white bg-accent hover:bg-accent/90 transition-colors">
                Continue →
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button onClick={() => setStep(s => s - 1)}
                className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-t3 border border-dborder hover:border-t2">
                ← Back
              </button>
              <button onClick={handleStart}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white bg-accent hover:bg-accent/90 transition-colors">
                🧠 Start Building My AI
              </button>
              <button onClick={onSkip}
                className="px-5 py-2.5 rounded-xl text-[12px] font-semibold text-t3 border border-dborder hover:border-t2">
                Skip
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
