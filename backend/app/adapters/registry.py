from app.adapters.base import ModelAdapter, ModelInfo
from app.adapters.ollama import OllamaAdapter
from app.adapters.openai import OpenAIAdapter
from app.config import get_settings

settings = get_settings()


class AdapterRegistry:
    """Aggregates all adapters and returns a unified, deduplicated model list."""

    def __init__(self):
        self._adapters: list[ModelAdapter] = [
            OllamaAdapter(),
            OpenAIAdapter("openai"),
            OpenAIAdapter("groq"),
        ]

    async def list_all_models(self) -> list[ModelInfo]:
        seen = set()
        result = []
        for adapter in self._adapters:
            if await adapter.is_available():
                models = await adapter.list_models()
                for m in models:
                    if m.model_id not in seen:
                        seen.add(m.model_id)
                        result.append(m)
        return result

    async def get_best_local_model(self) -> ModelInfo | None:
        """Returns the best local Ollama model for teacher synthesis.
        Prefers capable mid-size models (7-8B) over the largest available,
        to keep distillation fast without sacrificing quality.
        """
        ollama = self._adapters[0]
        models = await ollama.list_models()
        if not models:
            return None
        # Preference order: capable 7-8B models first, then larger, then smaller
        TEACHER_PREFERENCE = [
            "llama3:8b", "qwen2.5:7b", "mistral:latest", "mistral:7b",
            "gemma3:latest", "gemma4:latest", "qwen2.5-coder:7b",
            "gpt-oss:20b", "qwen2.5:32b", "app_builder_v6:latest",
        ]
        model_ids = {m.model_id: m for m in models}
        for preferred in TEACHER_PREFERENCE:
            if preferred in model_ids:
                return model_ids[preferred]
        # Fallback: pick by mid-range VRAM (prefer 3-8 GB, then others)
        mid = [m for m in models if 3.0 <= m.vram_gb <= 9.0]
        if mid:
            return sorted(mid, key=lambda m: m.vram_gb, reverse=True)[0]
        return sorted(models, key=lambda m: m.vram_gb, reverse=True)[0]

    def get_ollama(self) -> OllamaAdapter:
        return self._adapters[0]  # type: ignore

    async def get_adapter_for_model(self, model_id: str) -> ModelAdapter | None:
        for adapter in self._adapters:
            if await adapter.is_available():
                info = await adapter.get_model_info(model_id)
                if info:
                    return adapter
        return None

    async def chat(self, model_id: str, messages: list[dict], **kwargs):
        adapter = await self.get_adapter_for_model(model_id)
        if adapter is None:
            raise ValueError(f"No adapter found for model: {model_id}")
        async for token in adapter.chat(model_id, messages, **kwargs):
            yield token

    async def generate(self, model_id: str, prompt: str, **kwargs) -> str:
        adapter = await self.get_adapter_for_model(model_id)
        if adapter is None:
            raise ValueError(f"No adapter found for model: {model_id}")
        return await adapter.generate(model_id, prompt, **kwargs)


# Singleton
_registry: AdapterRegistry | None = None


def get_adapter_registry() -> AdapterRegistry:
    global _registry
    if _registry is None:
        _registry = AdapterRegistry()
    return _registry
