from abc import ABC, abstractmethod
from typing import AsyncGenerator
from pydantic import BaseModel


class ModelInfo(BaseModel):
    model_id: str
    parameter_size: str = ""
    quantization: str = ""
    vram_gb: float = 0.0
    status: str = "local"          # local | installable | cloud_api
    adapter_type: str = "base"
    task_types: list[str] = []
    context_window: int = 4096
    provider: str = "ollama"


class ModelAdapter(ABC):
    @abstractmethod
    async def list_models(self) -> list[ModelInfo]:
        pass

    @abstractmethod
    async def get_model_info(self, model_id: str) -> ModelInfo | None:
        pass

    @abstractmethod
    async def chat(
        self,
        model_id: str,
        messages: list[dict],
        stream: bool = True,
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> AsyncGenerator[str, None]:
        pass

    @abstractmethod
    async def generate(
        self,
        model_id: str,
        prompt: str,
        stream: bool = False,
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> str:
        pass

    @abstractmethod
    async def is_available(self) -> bool:
        pass
