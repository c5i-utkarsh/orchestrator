"""
GET /api/v1/models — list all available models across all adapters.
"""
from fastapi import APIRouter
from app.adapters.registry import get_adapter_registry

router = APIRouter(prefix="/models", tags=["models"])


@router.get("")
async def list_models():
    registry = get_adapter_registry()
    models = await registry.list_all_models()
    return {
        "models": [m.model_dump() for m in models],
        "count": len(models),
    }
