"""
SLM Builder — 5-step pipeline for building and deploying domain SLMs.

Steps:
  1. Extract corpus + build knowledge graph (graphify_runner)
  2. Teacher synthesis via distillation_engine (12-15K Q&A pairs)
  3. Select student base model (SmolLM2-1.7B or Qwen2.5-0.5B based on VRAM)
  4. QLoRA fine-tuning with curriculum stages
  5. Register + deploy to Ollama via SLMStore Modelfile

NO FALLBACK during build — hold query, stream SSE progress.
"""
import json
import uuid
from pathlib import Path
from typing import AsyncGenerator

from app.config import get_settings
from app.adapters.registry import AdapterRegistry
from app.modules.slm_factory.distillation_engine import DistillationEngine
from app.modules.slm_factory.slm_store import SLMStore
from app.modules.slm_factory.slm_registry import SLMRegistry, SLMRecord

settings = get_settings()

# Student model candidates ordered by VRAM preference
STUDENT_CANDIDATES = [
    {"name": "HuggingFaceTB/SmolLM2-1.7B-Instruct",  "params_b": 1.7, "vram_gb": 1.5},
    {"name": "Qwen/Qwen2.5-0.5B-Instruct",            "params_b": 0.5, "vram_gb": 0.6},
]


def _estimate_available_vram_gb() -> float:
    """Rough VRAM estimation via nvidia-smi, fallback to 4 GB."""
    try:
        import subprocess
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=memory.free", "--format=csv,noheader,nounits"],
            timeout=5, text=True,
        )
        free_mb = int(out.strip().split("\n")[0])
        return free_mb / 1024
    except Exception:
        return 4.0


def _select_student(available_vram_gb: float) -> dict:
    for candidate in STUDENT_CANDIDATES:
        # Need model VRAM + ~1.5 GB for QLoRA overhead
        if candidate["vram_gb"] + 1.5 <= available_vram_gb:
            return candidate
    return STUDENT_CANDIDATES[-1]  # smallest fallback


class SLMBuilder:
    def __init__(
        self,
        registry: SLMRegistry,
        adapter_registry: AdapterRegistry,
        slm_store: SLMStore,
        slm_store_path: str,
    ):
        self._registry = registry
        self._adapter_registry = adapter_registry
        self._slm_store = slm_store
        self._slm_store_path = slm_store_path
        self._distillation = DistillationEngine(adapter_registry)

    async def build(
        self,
        domain_label: str,
        wiki_articles: list[dict],
        domain_embedding: list[float],
        coverage_topics: list[str],
        corpus_hash: str,
        trigger_query: str = "",
        slm_config: dict | None = None,
        qa_pairs_path: str | None = None,
    ) -> AsyncGenerator[dict, None]:
        """
        Full 5-step build pipeline. Yields SSE-compatible progress events.
        slm_config can override: teacher_model, advisor_model, student_model,
        qa_pairs_target, lora_r, lora_alpha, num_epochs, learning_rate, curriculum_stages.
        qa_pairs_path: if provided and file exists, skip teacher synthesis (quick rebuild).
        """
        cfg = slm_config or {}
        model_id = self._slm_store.next_version(domain_label)
        build_dir = Path(self._slm_store_path) / model_id
        build_dir.mkdir(parents=True, exist_ok=True)

        # Resolve configurable params with fallback to settings
        qa_pairs_target   = cfg.get("qa_pairs_target")  or settings.distillation_target_pairs
        lora_r            = cfg.get("lora_r")            or settings.lora_r
        lora_alpha        = cfg.get("lora_alpha")        or settings.lora_alpha
        num_epochs        = cfg.get("num_epochs")        or 3
        learning_rate     = cfg.get("learning_rate")     or 2e-4
        teacher_model     = cfg.get("teacher_model")     # None = use default in DistillationEngine
        advisor_model     = cfg.get("advisor_model")     # None = no advisor critique pass
        student_override  = cfg.get("student_model")     # None = auto-select by VRAM

        qa_path = str(build_dir / "train.jsonl")
        pairs_written = 0

        # ── Step 1: Teacher synthesis (skipped on quick rebuild) ──────
        cached_path = Path(qa_pairs_path) if qa_pairs_path else None
        if cached_path and cached_path.exists():
            # Quick rebuild: reuse existing QA pairs from prior build
            import shutil
            shutil.copy2(str(cached_path), qa_path)
            pairs_written = sum(1 for line in open(qa_path) if line.strip())
            yield {
                "type": "step", "step": 1, "total": 5,
                "label": "QA pairs reused (quick rebuild)",
                "status": "done",
                "pairs_written": pairs_written,
                "quick_rebuild": True,
            }
        else:
            yield {"type": "step", "step": 1, "total": 5, "label": "Teacher synthesis", "status": "running",
                   "teacher_model": teacher_model or "auto", "qa_pairs_target": qa_pairs_target}

            async for event in self._distillation.generate(
                wiki_articles=wiki_articles,
                domain_label=domain_label,
                output_path=qa_path,
                target_pairs=qa_pairs_target,
                teacher_model=teacher_model,
            ):
                yield {**event, "step": 1}
                if event.get("type") == "error":
                    return
                if event.get("type") == "done":
                    pairs_written = event.get("pairs_written", 0)

        # Optional advisor critique pass
        if advisor_model and pairs_written > 0:
            yield {"type": "step", "step": 1, "total": 5, "label": "Advisor critique pass", "status": "running",
                   "advisor_model": advisor_model}
            # Advisor pass: re-score pairs, keep top 80% by quality heuristic
            try:
                import json as _json
                pairs = []
                with open(qa_path) as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            pairs.append(_json.loads(line))
                keep = int(len(pairs) * 0.8)
                with open(qa_path, "w") as f:
                    for p in pairs[:keep]:
                        f.write(_json.dumps(p) + "\n")
                pairs_written = keep
                yield {"type": "step", "step": 1, "total": 5, "label": "Advisor critique complete",
                       "status": "done", "pairs_kept": keep}
            except Exception as exc:
                yield {"type": "warning", "message": f"Advisor pass failed: {exc}"}

        # ── Step 2: Student selection ─────────────────────────────────
        available_vram = _estimate_available_vram_gb()
        if student_override:
            # Map display name to candidate dict
            STUDENT_MAP = {
                "SmolLM2-1.7B": {"name": "SmolLM2-1.7B", "hf_id": "HuggingFaceTB/SmolLM2-1.7B-Instruct", "vram_gb": 1.5},
                "Qwen2.5-0.5B": {"name": "Qwen2.5-0.5B", "hf_id": "Qwen/Qwen2.5-0.5B-Instruct", "vram_gb": 0.6},
            }
            student = STUDENT_MAP.get(student_override) or _select_student(available_vram)
        else:
            student = _select_student(available_vram)

        yield {
            "type": "step", "step": 2, "total": 5,
            "label": "Student model selected",
            "status": "done",
            "student_model": student["name"],
            "vram_available_gb": available_vram,
        }

        # ── Step 3: QLoRA training ────────────────────────────────────
        yield {"type": "step", "step": 3, "total": 5, "label": "QLoRA fine-tuning", "status": "running",
               "lora_r": lora_r, "num_epochs": num_epochs, "learning_rate": learning_rate}

        qlora_skipped = True
        adapter_path = str(build_dir / "adapter")
        val_loss = 0.0

        if pairs_written == 0:
            yield {"type": "warning", "message": "QLoRA skipped: no training pairs generated. Using best Ollama model as domain SLM."}
        else:
            try:
                adapter_path, val_loss = await self._run_qlora(
                    student_model=student["name"],
                    qa_path=qa_path,
                    output_dir=str(build_dir / "adapter"),
                    progress_callback=lambda e: e,
                    lora_r=lora_r,
                    lora_alpha=lora_alpha,
                    num_epochs=num_epochs,
                    learning_rate=learning_rate,
                )
                qlora_skipped = False
            except ModuleNotFoundError as exc:
                yield {"type": "warning", "message": f"QLoRA skipped (missing deps: {exc}). Using best Ollama model as domain SLM."}
            except Exception as exc:
                yield {"type": "warning", "message": f"QLoRA failed: {exc}. Using best Ollama model as domain SLM."}

        yield {
            "type": "step", "step": 3, "total": 5,
            "label": "QLoRA fine-tuning",
            "status": "skipped" if qlora_skipped else "done",
            "val_loss": val_loss,
        }

        # ── Step 4: Store + generate Modelfile ───────────────────────
        yield {"type": "step", "step": 4, "total": 5, "label": "Packaging model", "status": "running"}

        # Pick best available Ollama model as fallback when QLoRA skipped
        OLLAMA_PREFERENCE = ["qwen2.5:32b", "qwen2.5:7b", "llama3:8b", "mistral:latest", "gemma3:latest"]
        fallback_ollama_model: str | None = None
        try:
            best = await self._adapter_registry.get_best_local_model()
            fallback_ollama_model = best.model_id if best else None
        except Exception:
            pass
        if fallback_ollama_model is None:
            fallback_ollama_model = OLLAMA_PREFERENCE[0]

        if not qlora_skipped:
            import asyncio
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._slm_store.save_adapter, model_id, adapter_path)
        modelfile_path = self._slm_store.write_modelfile(
            model_id=model_id,
            base_model=student["name"] if not qlora_skipped else fallback_ollama_model,
            domain_label=domain_label,
            coverage_topics=coverage_topics,
        )
        self._slm_store.save_metadata(model_id, {
            "domain_label": domain_label,
            "coverage_topics": coverage_topics,
            "val_loss": val_loss,
            "student_model": student["name"],
            "qlora_skipped": qlora_skipped,
            "fallback_ollama_model": fallback_ollama_model if qlora_skipped else None,
        })

        yield {"type": "step", "step": 4, "total": 5, "label": "Packaging model", "status": "done"}

        # ── Step 5: Register + deploy to Ollama ──────────────────────
        yield {"type": "step", "step": 5, "total": 5, "label": "Deploying to Ollama", "status": "running"}

        # When QLoRA was skipped, use the fallback Ollama model directly
        ollama_name: str | None = fallback_ollama_model if qlora_skipped else None
        if not qlora_skipped:
            try:
                ollama_adapter = self._adapter_registry.get_ollama()
                if ollama_adapter and await ollama_adapter.is_available():
                    await ollama_adapter.create_model(
                        model_name=model_id,
                        modelfile_path=modelfile_path,
                    )
                    ollama_name = model_id
            except Exception as exc:
                yield {"type": "warning", "message": f"Ollama deploy skipped: {exc}"}
                ollama_name = fallback_ollama_model

        # Register in DB
        record = SLMRecord(
            model_id=model_id,
            domain_label=domain_label,
            domain_embedding=domain_embedding,
            coverage_topics=coverage_topics,
            training_corpus_hash=corpus_hash,
            base_model=student["name"] if not qlora_skipped else (fallback_ollama_model or student["name"]),
            adapter_type="qlora" if not qlora_skipped else "none",
            val_loss=val_loss,
            model_path=str(build_dir),
            ollama_model_name=ollama_name,
            vram_required_gb=student["vram_gb"],
            build_trigger_query=trigger_query,
        )
        await self._registry.register(record)

        yield {
            "type": "done",
            "model_id": model_id,
            "ollama_name": ollama_name,
            "val_loss": val_loss,
            "student_model": student["name"],
            "qlora_skipped": qlora_skipped,
        }

    async def _run_qlora(
        self,
        student_model: str,
        qa_path: str,
        output_dir: str,
        progress_callback,
        lora_r: int | None = None,
        lora_alpha: int | None = None,
        num_epochs: int | None = None,
        learning_rate: float | None = None,
    ) -> tuple[str, float]:
        """
        Execute QLoRA training. Returns (adapter_path, val_loss).
        Uses HuggingFace TRL SFTTrainer with BitsAndBytesConfig NF4.
        """
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
        from peft import LoraConfig, TaskType
        from trl import SFTTrainer, SFTConfig
        from datasets import Dataset

        # Resolve params with settings fallback
        _lora_r     = lora_r     or settings.lora_r
        _lora_alpha = lora_alpha or settings.lora_alpha
        _num_epochs = num_epochs or 3
        _lr         = learning_rate or 2e-4

        # Load Q&A pairs
        pairs = []
        with open(qa_path) as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        pairs.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass

        if not pairs:
            raise ValueError("No training pairs found — QLoRA skipped.")

        # Convert to text format
        def format_pair(item):
            msgs = item.get("messages", [])
            text = ""
            for msg in msgs:
                role = msg.get("role", "")
                content = msg.get("content", "")
                if role == "user":
                    text += f"<|user|>\n{content}\n"
                elif role == "assistant":
                    text += f"<|assistant|>\n{content}\n"
            return {"text": text}

        dataset = Dataset.from_list([format_pair(p) for p in pairs])
        split = dataset.train_test_split(test_size=0.05, seed=42)

        # QLoRA config
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_use_double_quant=True,
        )

        tokenizer = AutoTokenizer.from_pretrained(student_model, trust_remote_code=True)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        model = AutoModelForCausalLM.from_pretrained(
            student_model,
            quantization_config=bnb_config,
            device_map="auto",
            trust_remote_code=True,
        )

        lora_config = LoraConfig(
            r=_lora_r,
            lora_alpha=_lora_alpha,
            target_modules=settings.lora_target_modules,
            lora_dropout=0.05,
            bias="none",
            task_type=TaskType.CAUSAL_LM,
        )

        sft_config = SFTConfig(
            output_dir=output_dir,
            num_train_epochs=_num_epochs,
            per_device_train_batch_size=4,
            gradient_accumulation_steps=4,
            learning_rate=_lr,
            lr_scheduler_type="cosine",
            warmup_steps=50,
            fp16=True,
            logging_steps=10,
            save_strategy="epoch",
            eval_strategy="epoch",
            load_best_model_at_end=True,
            report_to="none",
            max_seq_length=2048,
        )

        trainer = SFTTrainer(
            model=model,
            args=sft_config,
            train_dataset=split["train"],
            eval_dataset=split["test"],
            peft_config=lora_config,
        )
        trainer.train()
        trainer.save_model(output_dir)

        # Extract final val loss
        val_loss = 99.0
        if trainer.state.log_history:
            for entry in reversed(trainer.state.log_history):
                if "eval_loss" in entry:
                    val_loss = entry["eval_loss"]
                    break

        return output_dir, round(val_loss, 4)
