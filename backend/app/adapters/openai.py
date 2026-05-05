from typing import AsyncGenerator
from openai import AsyncOpenAI

from app.adapters.base import ModelAdapter, ModelInfo
from app.config import get_settings

settings = get_settings()


class OpenAIAdapter(ModelAdapter):
    """Covers OpenAI, Groq, vLLM, LM Studio — any OpenAI-compatible endpoint."""

    PROVIDER_CONFIGS = {
        "openai": {
            "base_url": "https://api.openai.com/v1",
            "api_key_attr": "openai_api_key",
            "models": [
                ModelInfo(model_id="gpt-4o", parameter_size="unknown", status="cloud_api",
                          provider="openai", context_window=128000),
                ModelInfo(model_id="gpt-4o-mini", parameter_size="unknown", status="cloud_api",
                          provider="openai", context_window=128000),
            ],
        },
        "groq": {
            "base_url": "https://api.groq.com/openai/v1",
            "api_key_attr": "groq_api_key",
            "models": [
                ModelInfo(model_id="llama-3.1-70b-versatile", parameter_size="70B",
                          status="cloud_api", provider="groq", context_window=131072),
                ModelInfo(model_id="mixtral-8x7b-32768", parameter_size="56B",
                          status="cloud_api", provider="groq", context_window=32768),
                ModelInfo(model_id="gemma2-9b-it", parameter_size="9B",
                          status="cloud_api", provider="groq", context_window=8192),
            ],
        },
    }

    def __init__(self, provider: str = "openai"):
        self.provider = provider
        config = self.PROVIDER_CONFIGS.get(provider, self.PROVIDER_CONFIGS["openai"])
        api_key = getattr(settings, config["api_key_attr"], "")
        self._client = AsyncOpenAI(
            api_key=api_key or "no-key",
            base_url=config["base_url"],
        )
        self._available_models = config["models"]

    async def is_available(self) -> bool:
        config = self.PROVIDER_CONFIGS.get(self.provider, {})
        api_key = getattr(settings, config.get("api_key_attr", ""), "")
        return bool(api_key)

    async def list_models(self) -> list[ModelInfo]:
        if not await self.is_available():
            return []
        return self._available_models

    async def get_model_info(self, model_id: str) -> ModelInfo | None:
        return next((m for m in self._available_models if m.model_id == model_id), None)

    async def chat(
        self,
        model_id: str,
        messages: list[dict],
        stream: bool = True,
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> AsyncGenerator[str, None]:
        response = await self._client.chat.completions.create(
            model=model_id,
            messages=messages,
            stream=stream,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        if stream:
            async for chunk in response:
                content = chunk.choices[0].delta.content or ""
                if content:
                    yield content
        else:
            yield response.choices[0].message.content or ""

    async def generate(
        self,
        model_id: str,
        prompt: str,
        stream: bool = False,
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> str:
        response = await self._client.chat.completions.create(
            model=model_id,
            messages=[{"role": "user", "content": prompt}],
            stream=False,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""
