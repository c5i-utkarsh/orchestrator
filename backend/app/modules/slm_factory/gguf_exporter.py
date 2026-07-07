"""
GGUF Exporter — converts a trained PEFT LoRA adapter into a deployable GGUF file.

Why this module exists
======================
Ollama 0.20.0 cannot load HuggingFace PEFT adapters directly.
The ADAPTER directive in Ollama's Modelfile format requires GGUF-format adapters
(produced by llama.cpp's finetune tool), NOT HuggingFace .safetensors files.
Three tests confirmed this: even when the .safetensors file and adapter_config.json
are in the same directory and Ollama's internal code reaches "converting adapter",
it fails with "open adapter_config.json: no such file or directory" because it
looks in its own internal blob staging path, not in the original source path.

Therefore, the full pipeline is:
  1. peft.PeftModel.merge_and_unload()        → merged HuggingFace model (fp16)
  2. _write_phi3_gguf()                       → F16 GGUF (7.6 GB)
  3. llama_cpp.llama_model_quantize()         → Q4_K_M GGUF (~2.3 GB)
  4. Modelfile: FROM /absolute/path/model.gguf
  5. ollama create model_id -f Modelfile

Architecture notes for Phi-3.5-mini-instruct
=============================================
  model_type                : phi3
  hidden_size               : 3072
  num_hidden_layers         : 32
  num_attention_heads       : 32
  num_key_value_heads       : 32  (full MHA, NOT GQA)
  intermediate_size         : 8192
  vocab_size                : 32064
  rope_theta                : 10000.0
  max_position_embeddings   : 131072
  activation                : silu (via gate_up_proj / down_proj)
  tokenizer                 : LlamaTokenizer (SentencePiece)

Weight mapping (HuggingFace tensor name → GGUF tensor name)
============================================================
  model.embed_tokens.weight                          → token_embd.weight
  model.norm.weight                                  → output_norm.weight
  lm_head.weight                                     → output.weight
  model.layers.N.input_layernorm.weight              → blk.N.attn_norm.weight
  model.layers.N.self_attn.qkv_proj.weight           → blk.N.attn_qkv.weight
  model.layers.N.self_attn.o_proj.weight             → blk.N.attn_output.weight
  model.layers.N.post_attention_layernorm.weight     → blk.N.ffn_norm.weight
  model.layers.N.mlp.gate_up_proj.weight[:IS]        → blk.N.ffn_gate.weight
  model.layers.N.mlp.gate_up_proj.weight[IS:]        → blk.N.ffn_up.weight
  model.layers.N.mlp.down_proj.weight                → blk.N.ffn_down.weight

  IS = intermediate_size = 8192
  gate_up_proj is a single [2*IS, hidden] tensor; it must be split for GGUF.
"""
import asyncio
import json
import logging
import os
import struct
from pathlib import Path
from typing import Callable, Optional

import numpy as np
import torch

logger = logging.getLogger(__name__)


# ── Constants ─────────────────────────────────────────────────────────────────

# HuggingFace snapshot path for Phi-3.5-mini-instruct (locally cached)
_PHI35_SNAPSHOT = Path(
    "/home/kumar1/.cache/huggingface/hub/"
    "models--microsoft--Phi-3.5-mini-instruct/snapshots/"
    "2fe192450127e6a83f7441aef6e3ca586c338b77"
)

# Phi-3.5-mini architecture constants (from config.json)
_PHI35_ARCH = {
    "hidden_size":             3072,
    "num_hidden_layers":       32,
    "num_attention_heads":     32,
    "num_key_value_heads":     32,
    "intermediate_size":       8192,
    "vocab_size":              32064,
    "rope_theta":              10000.0,
    "max_position_embeddings": 131072,
    "rms_norm_eps":            1e-5,
    "head_dim":                96,   # hidden_size / num_attention_heads
}

# Q4_K_M ftype constant from llama.cpp
_LLAMA_FTYPE_Q4_K_M = 15
_LLAMA_FTYPE_F16    = 1


# ── Public API ────────────────────────────────────────────────────────────────

async def merge_and_export(
    adapter_dir: Path,
    output_dir: Path,
    model_id: str,
    progress_cb: Optional[Callable[[str], None]] = None,
    quantize: bool = True,
) -> Path:
    """
    Full pipeline: merge LoRA adapter into base model, convert to GGUF,
    optionally quantize to Q4_K_M.

    Parameters
    ----------
    adapter_dir   : Directory containing adapter_model.safetensors and adapter_config.json
    output_dir    : Parent directory for the merged/ subdir and .gguf output
    model_id      : Name for the output GGUF file (without extension)
    progress_cb   : Optional callback for progress messages
    quantize      : If True, produce Q4_K_M GGUF (~2.3GB); else F16 (~7.6GB)

    Returns
    -------
    Path to the final GGUF file (Q4_K_M or F16)
    """
    def _log(msg: str) -> None:
        logger.info("gguf_exporter: %s", msg)
        if progress_cb:
            progress_cb(msg)

    _log(f"Starting LoRA→GGUF pipeline for {model_id}")

    # ── Step 1: Merge ─────────────────────────────────────────────────────────
    merged_dir = output_dir / "merged"
    if merged_dir.exists() and (merged_dir / "config.json").exists():
        _log(f"Merged model already exists at {merged_dir} — skipping merge step")
    else:
        _log("Merging LoRA adapter into Phi-3.5-mini base model (CPU, ~5 min)…")
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _merge_lora, adapter_dir, merged_dir, _log)

    # ── Step 2: Convert to F16 GGUF ──────────────────────────────────────────
    f16_path = output_dir / f"{model_id}.f16.gguf"
    if f16_path.exists():
        _log(f"F16 GGUF already exists at {f16_path} — skipping conversion")
    else:
        _log("Converting merged model to F16 GGUF (~7.6 GB)…")
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _write_phi3_gguf, merged_dir, f16_path, _log)

    if not quantize:
        _log(f"Skipping quantization — using F16 GGUF: {f16_path}")
        return f16_path

    # ── Step 3: Quantize to Q4_K_M ───────────────────────────────────────────
    q4_path = output_dir / f"{model_id}.q4_k_m.gguf"
    if q4_path.exists():
        _log(f"Q4_K_M GGUF already exists at {q4_path} — skipping quantization")
        return q4_path

    _log("Quantizing F16 GGUF to Q4_K_M (~2.3 GB, CUDA if available)…")
    loop = asyncio.get_event_loop()
    ok = await loop.run_in_executor(None, _quantize_gguf, f16_path, q4_path, _log)

    if ok:
        # Remove the large F16 to save ~5.3 GB of disk space
        try:
            f16_path.unlink()
            _log("Removed F16 GGUF after successful quantization")
        except Exception:
            pass
        return q4_path
    else:
        _log("Quantization failed — falling back to F16 GGUF")
        return f16_path


# ── Step 1: Merge ─────────────────────────────────────────────────────────────

def _merge_lora(adapter_dir: Path, merged_dir: Path, log: Callable) -> None:
    """Load Phi-3.5-mini + LoRA adapter, merge weights, save to merged_dir."""
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel

    merged_dir.mkdir(parents=True, exist_ok=True)

    log("Loading base model (Phi-3.5-mini, ~8 GB RAM, CPU only)…")
    base = AutoModelForCausalLM.from_pretrained(
        str(_PHI35_SNAPSHOT),
        torch_dtype=torch.float16,
        device_map="cpu",           # CPU merge avoids VRAM competition with Ollama
        local_files_only=True,
    )

    log("Loading LoRA adapter…")
    peft_model = PeftModel.from_pretrained(
        base,
        str(adapter_dir),
        local_files_only=True,
    )

    log("Merging LoRA weights into base model (merge_and_unload)…")
    merged = peft_model.merge_and_unload()
    del peft_model  # free memory before saving

    log(f"Saving merged model to {merged_dir}…")
    merged.save_pretrained(str(merged_dir), safe_serialization=True)
    del merged
    torch.cuda.empty_cache()

    tokenizer = AutoTokenizer.from_pretrained(str(_PHI35_SNAPSHOT), local_files_only=True)
    tokenizer.save_pretrained(str(merged_dir))
    log("Merge complete")


# ── Step 2: HuggingFace → GGUF (F16) ─────────────────────────────────────────

def _write_phi3_gguf(merged_dir: Path, output_path: Path, log: Callable) -> None:
    """
    Convert a merged Phi-3.5-mini HuggingFace model to an F16 GGUF file.

    This implements the subset of llama.cpp's convert_hf_to_gguf.py that is
    specific to the phi3 architecture.  Tensor names follow the GGUF_TENSOR_MAPPING
    defined in transformers.modeling_gguf_pytorch_utils (verified for phi3).
    """
    from gguf import GGUFWriter, GGMLQuantizationType
    log(f"Opening GGUF writer → {output_path}")
    writer = GGUFWriter(str(output_path), arch="phi3")

    # ── Metadata ──────────────────────────────────────────────────────────────
    a = _PHI35_ARCH
    writer.add_architecture()
    writer.add_name(output_path.stem)
    writer.add_context_length(a["max_position_embeddings"])
    writer.add_embedding_length(a["hidden_size"])
    writer.add_feed_forward_length(a["intermediate_size"])
    writer.add_block_count(a["num_hidden_layers"])
    writer.add_head_count(a["num_attention_heads"])
    writer.add_head_count_kv(a["num_key_value_heads"])
    writer.add_layer_norm_rms_eps(a["rms_norm_eps"])
    writer.add_rope_freq_base(a["rope_theta"])
    writer.add_vocab_size(a["vocab_size"])
    writer.add_file_type(GGMLQuantizationType.F16)

    # ── Tokenizer ─────────────────────────────────────────────────────────────
    log("Embedding tokenizer vocabulary…")
    _embed_llama_tokenizer(writer, merged_dir)

    # ── Weights ───────────────────────────────────────────────────────────────
    log("Loading merged model weights (fp16, CPU)…")
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

    from transformers import AutoModelForCausalLM
    model = AutoModelForCausalLM.from_pretrained(
        str(merged_dir),
        torch_dtype=torch.float16,
        device_map="cpu",
        local_files_only=True,
    )
    state = model.state_dict()
    del model
    torch.cuda.empty_cache()

    IS = a["intermediate_size"]
    n_layers = a["num_hidden_layers"]

    log(f"Writing {len(state)} weight tensors to GGUF…")
    _add_f16(writer, "token_embd.weight", state, "model.embed_tokens.weight")
    _add_f32(writer, "output_norm.weight", state, "model.norm.weight")
    _add_f16(writer, "output.weight",      state, "lm_head.weight")

    for i in range(n_layers):
        pfx = f"model.layers.{i}."
        _add_f32(writer, f"blk.{i}.attn_norm.weight",
                 state, pfx + "input_layernorm.weight")
        _add_f16(writer, f"blk.{i}.attn_qkv.weight",
                 state, pfx + "self_attn.qkv_proj.weight")
        _add_f16(writer, f"blk.{i}.attn_output.weight",
                 state, pfx + "self_attn.o_proj.weight")
        _add_f32(writer, f"blk.{i}.ffn_norm.weight",
                 state, pfx + "post_attention_layernorm.weight")

        # gate_up_proj is [2*IS, hidden] — split into gate and up halves
        gu = state[pfx + "mlp.gate_up_proj.weight"]
        _add_np(writer, f"blk.{i}.ffn_gate.weight",
                gu[:IS, :].numpy().astype(np.float16))
        _add_np(writer, f"blk.{i}.ffn_up.weight",
                gu[IS:, :].numpy().astype(np.float16))
        del gu

        _add_f16(writer, f"blk.{i}.ffn_down.weight",
                 state, pfx + "mlp.down_proj.weight")

        if i % 8 == 0:
            log(f"  Wrote layer {i}/{n_layers}")

    del state

    log("Flushing GGUF file…")
    writer.write_header_to_file()
    writer.write_kv_data_to_file()
    writer.write_tensors_to_file()
    writer.close()

    size_gb = output_path.stat().st_size / 1e9
    log(f"F16 GGUF written: {output_path} ({size_gb:.1f} GB)")


def _embed_llama_tokenizer(writer: "GGUFWriter", model_dir: Path) -> None:
    """Read the LlamaTokenizer and embed vocab/scores in GGUF metadata."""
    import json
    from pathlib import Path as _P

    # Use tokenizer.json (BPE JSON format — includes full vocab with scores)
    tok_json_path = model_dir / "tokenizer.json"
    tok_cfg_path  = model_dir / "tokenizer_config.json"

    # Fallback to original snapshot if not in merged_dir
    if not tok_json_path.exists():
        tok_json_path = _PHI35_SNAPSHOT / "tokenizer.json"
    if not tok_cfg_path.exists():
        tok_cfg_path = _PHI35_SNAPSHOT / "tokenizer_config.json"

    with open(tok_json_path) as f:
        tok_json = json.load(f)
    with open(tok_cfg_path) as f:
        tok_cfg = json.load(f)

    # Build vocab list (sorted by token ID)
    vocab_items = tok_json.get("model", {}).get("vocab", {})
    # Also collect added tokens
    added = {t["id"]: t["content"] for t in tok_json.get("added_tokens", [])}

    vocab_size = _PHI35_ARCH["vocab_size"]
    tokens  = [""] * vocab_size
    scores  = [0.0] * vocab_size
    t_types = [0] * vocab_size   # 0=normal, 3=control, 6=byte

    for token_str, token_id in vocab_items.items():
        if token_id < vocab_size:
            tokens[token_id] = token_str
            # SentencePiece unigram scores not available in JSON — use 0.0

    # Overlay added/special tokens
    for token_id, token_str in added.items():
        if token_id < vocab_size:
            tokens[token_id] = token_str
            t_types[token_id] = 3   # control token

    # Special token IDs from tokenizer_config
    bos_id = 1    # <s>
    eos_id = 32000  # <|endoftext|>
    unk_id = 0    # <unk>

    writer.add_token_list(tokens)
    writer.add_token_scores(scores)
    writer.add_token_types(t_types)
    writer.add_bos_token_id(bos_id)
    writer.add_eos_token_id(eos_id)
    writer.add_unk_token_id(unk_id)
    writer.add_pad_token_id(eos_id)
    writer.add_tokenizer_model("llama")


# ── Step 3: Quantize to Q4_K_M ────────────────────────────────────────────────

def _quantize_gguf(f16_path: Path, q4_path: Path, log: Callable) -> bool:
    """
    Quantize an F16 GGUF to Q4_K_M using llama-cpp-python's built-in quantizer.

    Q4_K_M reduces 7.6 GB → ~2.3 GB — fits comfortably in 10.6 GB VRAM.
    Falls back gracefully if quantization fails (caller uses F16 GGUF instead).
    """
    try:
        from llama_cpp.llama_cpp import (
            llama_model_quantize,
            llama_model_quantize_default_params,
        )
        import ctypes

        params = llama_model_quantize_default_params()
        params.ftype   = ctypes.c_int(_LLAMA_FTYPE_Q4_K_M)
        params.nthreads = ctypes.c_int(4)

        log(f"Quantizing {f16_path.name} → Q4_K_M…")
        ret = llama_model_quantize(
            str(f16_path).encode(),
            str(q4_path).encode(),
            ctypes.byref(params),
        )
        if ret == 0:
            size_gb = q4_path.stat().st_size / 1e9
            log(f"Q4_K_M GGUF written: {q4_path} ({size_gb:.1f} GB)")
            return True
        else:
            log(f"llama_model_quantize returned error code {ret}")
            return False
    except Exception as exc:
        log(f"Quantization error: {exc}")
        return False


# ── Tensor write helpers ──────────────────────────────────────────────────────

def _add_f16(writer, gguf_name: str, state: dict, hf_name: str) -> None:
    t = state[hf_name].numpy().astype(np.float16)
    writer.add_tensor(gguf_name, t)


def _add_f32(writer, gguf_name: str, state: dict, hf_name: str) -> None:
    t = state[hf_name].numpy().astype(np.float32)
    writer.add_tensor(gguf_name, t)


def _add_np(writer, gguf_name: str, arr: np.ndarray) -> None:
    writer.add_tensor(gguf_name, arr)
