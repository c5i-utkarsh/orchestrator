import subprocess
from typing import AsyncGenerator
import httpx
import json
import re

from app.adapters.base import ModelAdapter, ModelInfo
from app.config import get_settings

settings = get_settings()


def _parse_param_size_to_gb(param_size: str) -> float:
    """Estimate VRAM from parameter size string like '7B', '70B', '0.5B'."""
    if not param_size:
        return 0.0
    match = re.search(r"([\d.]+)\s*([BM])", param_size.upper())
    if not match:
        return 0.0
    value = float(match.group(1))
    unit = match.group(2)
    params_b = value if unit == "B" else value / 1000
    # Q4 quantization: ~0.6 GB per billion params
    return round(params_b * 0.6, 1)


class OllamaAdapter(ModelAdapter):
    def __init__(self):
        self.base_url = settings.ollama_base_url
        self._client = httpx.AsyncClient(base_url=self.base_url, timeout=300)

    async def is_available(self) -> bool:
        try:
            r = await self._client.get("/api/tags")
            return r.status_code == 200
        except Exception:
            return False

    async def list_models(self) -> list[ModelInfo]:
        try:
            r = await self._client.get("/api/tags")
            r.raise_for_status()
            data = r.json()
            models = []
            for m in data.get("models", []):
                details = m.get("details", {})
                param_size = details.get("parameter_size", "")
                quant = details.get("quantization_level", "")
                models.append(ModelInfo(
                    model_id=m["name"],
                    parameter_size=param_size,
                    quantization=quant,
                    vram_gb=_parse_param_size_to_gb(param_size),
                    status="local",
                    provider="ollama",
                ))
            return models
        except Exception:
            return []

    async def is_model_installed(self, model_id: str) -> bool:
        """Return True if the model is already present in Ollama."""
        try:
            models = await self.list_models()
            return any(m.model_id == model_id for m in models)
        except Exception:
            return False

    async def pull_model(self, model_id: str) -> bool:
        """Pull a model from the Ollama registry. Returns True on success."""
        try:
            async with self._client.stream(
                "POST", "/api/pull", json={"name": model_id, "stream": True}
            ) as resp:
                async for _ in resp.aiter_lines():
                    pass  # consume stream; pull completes when stream closes
            return True
        except Exception:
            return False

    async def ensure_model(self, model_id: str) -> bool:
        """Install model_id if not already present. Returns True when ready."""
        if await self.is_model_installed(model_id):
            return True
        return await self.pull_model(model_id)

    async def get_model_info(self, model_id: str) -> ModelInfo | None:
        try:
            r = await self._client.post("/api/show", json={"name": model_id})
            r.raise_for_status()
            data = r.json()
            details = data.get("details", {})
            param_size = details.get("parameter_size", "")
            quant = details.get("quantization_level", "")
            return ModelInfo(
                model_id=model_id,
                parameter_size=param_size,
                quantization=quant,
                vram_gb=_parse_param_size_to_gb(param_size),
                status="local",
                provider="ollama",
                context_window=data.get("model_info", {}).get("context_length", 4096),
            )
        except Exception:
            return None

    async def chat(
        self,
        model_id: str,
        messages: list[dict],
        stream: bool = True,
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> AsyncGenerator[str, None]:
        payload = {
            "model": model_id,
            "messages": messages,
            "stream": stream,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        async with self._client.stream("POST", "/api/chat", json=payload) as response:
            async for line in response.aiter_lines():
                if line.strip():
                    try:
                        chunk = json.loads(line)
                        content = chunk.get("message", {}).get("content", "")
                        if content:
                            yield content
                        if chunk.get("done"):
                            break
                    except json.JSONDecodeError:
                        continue

    async def generate(
        self,
        model_id: str,
        prompt: str,
        stream: bool = False,
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> str:
        payload = {
            "model": model_id,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        r = await self._client.post("/api/generate", json=payload)
        r.raise_for_status()
        return r.json().get("response", "")

    async def create_model(self, model_id: str, modelfile_path: str) -> bool:
        """Deploy a trained SLM to Ollama via Modelfile."""
        try:
            result = subprocess.run(
                ["ollama", "create", model_id, "-f", modelfile_path],
                capture_output=True, text=True, timeout=120
            )
            return result.returncode == 0
        except Exception:
            return False

    async def get_running_models(self) -> list[dict]:
        try:
            r = await self._client.get("/api/ps")
            r.raise_for_status()
            return r.json().get("models", [])
        except Exception:
            return []

    async def close(self):
        await self._client.aclose()
