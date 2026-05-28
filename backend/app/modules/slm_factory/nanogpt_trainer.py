"""
Karpathy-style nanoGPT trainer — from-scratch GPT in pure PyTorch.

Architecture exactly follows nanoGPT/model.py (MIT license, Andrej Karpathy).
Reads train.bin / val.bin produced by WikiSerializer (uint16, cl100k_base).
Streams loss events to an asyncio.Queue so the API can SSE them to the frontend.
Saves best checkpoint on val loss improvement.
Supports inline text generation from a loaded checkpoint.
"""
from __future__ import annotations

import asyncio
import math
import struct
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import AsyncGenerator

import numpy as np

# ── Config ─────────────────────────────────────────────────────────────────────

@dataclass
class NanoGPTConfig:
    n_layer:   int   = 4
    n_head:    int   = 4
    n_embd:    int   = 256
    block_size: int  = 512
    vocab_size: int  = 100352  # cl100k_base n_vocab (100277) rounded up to next multiple of 64
    dropout:   float = 0.1
    bias:      bool  = True

    # Training
    max_iters:     int   = 1000
    eval_interval: int   = 100
    eval_iters:    int   = 20
    learning_rate: float = 3e-4
    weight_decay:  float = 0.1
    beta1:         float = 0.9
    beta2:         float = 0.95
    grad_clip:     float = 1.0
    warmup_iters:  int   = 50
    lr_decay_iters: int  = 1000
    min_lr:        float = 3e-5
    batch_size:    int   = 8


# ── Model ──────────────────────────────────────────────────────────────────────

def _new_gelu(x):
    import torch, math
    return 0.5 * x * (1.0 + torch.tanh(math.sqrt(2.0 / math.pi) * (x + 0.044715 * torch.pow(x, 3.0))))


def _build_model(cfg: NanoGPTConfig):
    """Build GPT model. Returns the nn.Module. Deferred import keeps startup fast."""
    import torch
    import torch.nn as nn
    from torch.nn import functional as F

    class LayerNorm(nn.Module):
        def __init__(self, ndim, bias):
            super().__init__()
            self.weight = nn.Parameter(torch.ones(ndim))
            self.bias = nn.Parameter(torch.zeros(ndim)) if bias else None

        def forward(self, x):
            return F.layer_norm(x, self.weight.shape, self.weight, self.bias, 1e-5)

    class CausalSelfAttention(nn.Module):
        def __init__(self, c: NanoGPTConfig):
            super().__init__()
            assert c.n_embd % c.n_head == 0
            self.c_attn  = nn.Linear(c.n_embd, 3 * c.n_embd, bias=c.bias)
            self.c_proj  = nn.Linear(c.n_embd, c.n_embd, bias=c.bias)
            self.attn_drop = nn.Dropout(c.dropout)
            self.resid_drop = nn.Dropout(c.dropout)
            self.n_head  = c.n_head
            self.n_embd  = c.n_embd
            self.dropout = c.dropout
            self.register_buffer(
                "bias",
                torch.tril(torch.ones(c.block_size, c.block_size))
                     .view(1, 1, c.block_size, c.block_size),
            )

        def forward(self, x):
            B, T, C = x.size()
            q, k, v = self.c_attn(x).split(self.n_embd, dim=2)
            k = k.view(B, T, self.n_head, C // self.n_head).transpose(1, 2)
            q = q.view(B, T, self.n_head, C // self.n_head).transpose(1, 2)
            v = v.view(B, T, self.n_head, C // self.n_head).transpose(1, 2)
            att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))
            att = att.masked_fill(self.bias[:, :, :T, :T] == 0, float("-inf"))
            att = F.softmax(att, dim=-1)
            att = self.attn_drop(att)
            y = att @ v
            y = y.transpose(1, 2).contiguous().view(B, T, C)
            return self.resid_drop(self.c_proj(y))

    class MLP(nn.Module):
        def __init__(self, c: NanoGPTConfig):
            super().__init__()
            self.c_fc   = nn.Linear(c.n_embd, 4 * c.n_embd, bias=c.bias)
            self.c_proj = nn.Linear(4 * c.n_embd, c.n_embd, bias=c.bias)
            self.drop   = nn.Dropout(c.dropout)

        def forward(self, x):
            return self.drop(self.c_proj(_new_gelu(self.c_fc(x))))

    class Block(nn.Module):
        def __init__(self, c: NanoGPTConfig):
            super().__init__()
            self.ln_1 = LayerNorm(c.n_embd, bias=c.bias)
            self.attn = CausalSelfAttention(c)
            self.ln_2 = LayerNorm(c.n_embd, bias=c.bias)
            self.mlp  = MLP(c)

        def forward(self, x):
            x = x + self.attn(self.ln_2(self.ln_1(x)))
            x = x + self.mlp(self.ln_2(x))
            return x

    class GPT(nn.Module):
        def __init__(self, c: NanoGPTConfig):
            super().__init__()
            self.config = c
            self.transformer = nn.ModuleDict(dict(
                wte  = nn.Embedding(c.vocab_size, c.n_embd),
                wpe  = nn.Embedding(c.block_size, c.n_embd),
                drop = nn.Dropout(c.dropout),
                h    = nn.ModuleList([Block(c) for _ in range(c.n_layer)]),
                ln_f = LayerNorm(c.n_embd, bias=c.bias),
            ))
            self.lm_head = nn.Linear(c.n_embd, c.vocab_size, bias=False)
            self.transformer.wte.weight = self.lm_head.weight  # weight tying
            self._init_weights()

        def _init_weights(self):
            for module in self.modules():
                if isinstance(module, nn.Linear):
                    nn.init.normal_(module.weight, mean=0.0, std=0.02)
                    if module.bias is not None:
                        nn.init.zeros_(module.bias)
                elif isinstance(module, nn.Embedding):
                    nn.init.normal_(module.weight, mean=0.0, std=0.02)

        def forward(self, idx, targets=None):
            device = idx.device
            B, T = idx.size()
            pos = torch.arange(0, T, dtype=torch.long, device=device)
            x = self.transformer.drop(
                self.transformer.wte(idx) + self.transformer.wpe(pos)
            )
            for block in self.transformer.h:
                x = block(x)
            x = self.transformer.ln_f(x)
            if targets is not None:
                logits = self.lm_head(x)
                loss = F.cross_entropy(
                    logits.view(-1, logits.size(-1)), targets.view(-1), ignore_index=-1
                )
                return logits, loss
            logits = self.lm_head(x[:, [-1], :])
            return logits, None

        @torch.no_grad()
        def generate(self, idx, max_new_tokens: int, temperature: float = 1.0, top_k: int = 40):
            for _ in range(max_new_tokens):
                idx_cond = idx if idx.size(1) <= self.config.block_size else idx[:, -self.config.block_size:]
                logits, _ = self(idx_cond)
                logits = logits[:, -1, :] / temperature
                if top_k is not None:
                    v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
                    logits[logits < v[:, [-1]]] = float("-inf")
                probs = F.softmax(logits, dim=-1)
                idx_next = torch.multinomial(probs, num_samples=1)
                idx = torch.cat((idx, idx_next), dim=1)
            return idx

    return GPT(cfg)


# ── Training job state (in-process store) ─────────────────────────────────────

_JOBS: dict[str, "TrainJob"] = {}


class TrainJob:
    def __init__(self, train_job_id: str, ckpt_path: Path):
        self.train_job_id = train_job_id
        self.ckpt_path = ckpt_path
        self.status: str = "queued"   # queued | running | done | error
        self.error: str = ""
        self.queue: asyncio.Queue = asyncio.Queue()
        self._model = None
        self._cfg: NanoGPTConfig | None = None
        self._device: str = "cpu"

    def load_model_for_inference(self):
        import torch
        if not self.ckpt_path.exists():
            raise FileNotFoundError(f"Checkpoint not found: {self.ckpt_path}")
        ckpt = torch.load(self.ckpt_path, map_location="cpu", weights_only=False)
        cfg = ckpt["config"]
        model = _build_model(cfg)
        model.load_state_dict(ckpt["model"])
        model.eval()
        self._model = model
        self._cfg = cfg

    def generate_text(self, prompt_tokens: list[int], max_new_tokens: int, temperature: float) -> list[int]:
        import torch
        if self._model is None:
            self.load_model_for_inference()
        idx = torch.tensor([prompt_tokens], dtype=torch.long)
        with torch.no_grad():
            out = self._model.generate(idx, max_new_tokens, temperature=temperature, top_k=40)
        return out[0].tolist()


def get_job(train_job_id: str) -> TrainJob | None:
    return _JOBS.get(train_job_id)


def create_job(train_job_id: str, ckpt_path: Path) -> TrainJob:
    job = TrainJob(train_job_id, ckpt_path)
    _JOBS[train_job_id] = job
    return job


# ── Training loop (runs in thread) ────────────────────────────────────────────

def _run_training_sync(job: TrainJob, cfg: NanoGPTConfig, train_path: Path, val_path: Path):
    """Synchronous training loop. Runs in asyncio.to_thread."""
    import torch
    import torch.nn as nn

    loop = asyncio.new_event_loop()

    def emit(event: dict):
        asyncio.run_coroutine_threadsafe(job.queue.put(event), loop).result(timeout=5)

    # We run the loop in a separate thread but need the queue accessible from the main loop.
    # Instead, use a simple list as a shared buffer (thread-safe append).
    # The SSE endpoint drains the buffer.
    # Re-design: job.queue will be put from the training thread but read from the async SSE handler.
    # asyncio.Queue is NOT thread-safe for put from a non-async context.
    # Use a list buffer + asyncio.Queue.put_nowait via call_soon_threadsafe on the running loop.

    import threading
    _main_loop = job._main_loop  # set before this thread starts

    def _put(event):
        _main_loop.call_soon_threadsafe(job.queue.put_nowait, event)

    try:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        job._device = device

        # Load data
        if not train_path.exists():
            raise FileNotFoundError(f"train.bin not found: {train_path}")
        train_data = np.memmap(str(train_path), dtype=np.uint16, mode="r")
        val_data = np.memmap(str(val_path), dtype=np.uint16, mode="r") if val_path.exists() else train_data

        def get_batch(split):
            data = train_data if split == "train" else val_data
            ix = np.random.randint(0, max(1, len(data) - cfg.block_size), size=(cfg.batch_size,))
            x = np.stack([data[i : i + cfg.block_size].astype(np.int64) for i in ix])
            y = np.stack([data[i + 1 : i + 1 + cfg.block_size].astype(np.int64) for i in ix])
            x_t = torch.from_numpy(x).to(device)
            y_t = torch.from_numpy(y).to(device)
            return x_t, y_t

        @torch.no_grad()
        def estimate_loss():
            model.eval()
            out = {}
            for split in ("train", "val"):
                losses = []
                for _ in range(cfg.eval_iters):
                    X, Y = get_batch(split)
                    _, loss = model(X, Y)
                    losses.append(loss.item())
                out[split] = float(np.mean(losses))
            model.train()
            return out

        def get_lr(it: int) -> float:
            if it < cfg.warmup_iters:
                return cfg.learning_rate * it / max(1, cfg.warmup_iters)
            if it > cfg.lr_decay_iters:
                return cfg.min_lr
            decay_ratio = (it - cfg.warmup_iters) / max(1, cfg.lr_decay_iters - cfg.warmup_iters)
            coeff = 0.5 * (1.0 + math.cos(math.pi * decay_ratio))
            return cfg.min_lr + coeff * (cfg.learning_rate - cfg.min_lr)

        model = _build_model(cfg).to(device)
        job._model = model
        job._cfg = cfg

        optimizer = model.configure_optimizers(cfg.weight_decay, cfg.learning_rate, (cfg.beta1, cfg.beta2)) \
            if hasattr(model, "configure_optimizers") \
            else torch.optim.AdamW(
                model.parameters(),
                lr=cfg.learning_rate,
                weight_decay=cfg.weight_decay,
                betas=(cfg.beta1, cfg.beta2),
            )

        best_val_loss = float("inf")
        t0 = time.time()

        for it in range(cfg.max_iters):
            # LR decay
            lr = get_lr(it)
            for param_group in optimizer.param_groups:
                param_group["lr"] = lr

            # Eval
            if it % cfg.eval_interval == 0:
                losses = estimate_loss()
                val_loss = losses["val"]
                train_loss = losses["train"]

                dt = time.time() - t0
                tokens_per_sec = int(cfg.batch_size * cfg.block_size * cfg.eval_interval / max(dt, 1e-6))
                t0 = time.time()

                _put({
                    "type": "loss",
                    "iter": it,
                    "train_loss": round(train_loss, 4),
                    "val_loss": round(val_loss, 4),
                    "lr": round(lr, 6),
                    "tokens_per_sec": tokens_per_sec,
                })

                if val_loss < best_val_loss:
                    best_val_loss = val_loss
                    torch.save(
                        {"model": model.state_dict(), "config": cfg, "iter": it, "val_loss": val_loss},
                        str(job.ckpt_path),
                    )

            # Forward + backward
            X, Y = get_batch("train")
            _, loss = model(X, Y)
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), cfg.grad_clip)
            optimizer.step()

        _put({"type": "done", "best_val_loss": round(best_val_loss, 4)})
        job.status = "done"

    except Exception as exc:
        _put({"type": "error", "message": str(exc)})
        job.status = "error"
        job.error = str(exc)


async def start_training(
    job: TrainJob,
    cfg: NanoGPTConfig,
    train_path: Path,
    val_path: Path,
):
    """Launch training in a thread, storing the running loop on the job."""
    job.status = "running"
    job._main_loop = asyncio.get_running_loop()
    await asyncio.to_thread(_run_training_sync, job, cfg, train_path, val_path)
