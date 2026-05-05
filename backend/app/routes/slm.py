"""
SLM registry management routes.
GET  /api/v1/slm/registry — list all registered SLMs
POST /api/v1/slm/build — trigger manual SLM build
POST /api/v1/slm/approve-install — approve Ollama deployment after review
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.modules.slm_factory.slm_registry import SLMRegistry
from app.adapters.registry import get_adapter_registry
from app.config import get_settings

settings = get_settings()
router = APIRouter(prefix="/slm", tags=["slm"])


class BuildRequest(BaseModel):
    domain_label: str
    coverage_topics: list[str] = Field(default_factory=list)
    corpus_hash: str = ""
    trigger_query: str = ""


class ApproveInstallRequest(BaseModel):
    model_id: str


@router.get("/registry")
async def list_registry(db: AsyncSession = Depends(get_db)):
    registry = SLMRegistry(db)
    records = await registry.list_all()
    return {"slms": records, "count": len(records)}


@router.post("/build")
async def trigger_build(request: BuildRequest, db: AsyncSession = Depends(get_db)):
    """Queue an SLM build via Celery."""
    try:
        from app.tasks.slm_build_task import run_slm_build
        job = run_slm_build.delay(
            request.domain_label,
            request.coverage_topics,
            request.corpus_hash,
            request.trigger_query,
        )
        return {"task_id": job.id, "status": "queued"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/approve-install")
async def approve_install(request: ApproveInstallRequest, db: AsyncSession = Depends(get_db)):
    """
    After user reviews the SLM, approve deployment to Ollama.
    Triggers `ollama create` with the stored Modelfile.
    """
    registry = SLMRegistry(db)
    record = await registry.get(request.model_id)
    if not record:
        raise HTTPException(status_code=404, detail="SLM not found")

    adapter_registry = get_adapter_registry()
    adapter = adapter_registry.get_ollama()
    if not await adapter.is_available():
        raise HTTPException(status_code=503, detail="Ollama not available")

    from pathlib import Path
    from app.modules.slm_factory.slm_store import SLMStore
    store = SLMStore(settings.slm_store_path)
    modelfile_path = Path(store.model_dir(request.model_id)) / "Modelfile"

    if not modelfile_path.exists():
        raise HTTPException(status_code=404, detail="Modelfile not found")

    try:
        await adapter.create_model(request.model_id, str(modelfile_path))
        return {"status": "deployed", "model_id": request.model_id, "ollama_name": request.model_id}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
