import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db.database import engine, Base

logger = logging.getLogger("orchestrator.startup")
from app.routes import (
    orchestrator_router,
    data_router,
    models_router,
    slm_router,
    evaluation_router,
    feedback_router,
)
from app.routes.pipeline import router as pipeline_router
from app.routes.wiki import router as wiki_router
from app.routes.links import router as links_router
from app.routes.quality import router as quality_router
from app.routes.repair import router as repair_router
from app.routes.db import router as db_router
from app.routes.eda import router as eda_router
from app.routes.benchmark import router as benchmark_router

settings = get_settings()


EMBEDDING_MODEL = "nomic-embed-text"


async def _ensure_embedding_model() -> None:
    """Pull nomic-embed-text in the background if Ollama is up but the model is missing."""
    try:
        from app.adapters.registry import get_adapter_registry
        registry = get_adapter_registry()
        adapter = registry.get_ollama()
        if adapter is None:
            return
        if not await adapter.is_available():
            return
        if await adapter.is_model_installed(EMBEDDING_MODEL):
            logger.info("Embedding model '%s' already installed.", EMBEDDING_MODEL)
            return
        logger.info("Embedding model '%s' not found — pulling now (this may take a minute)…", EMBEDDING_MODEL)
        ok = await adapter.pull_model(EMBEDDING_MODEL)
        if ok:
            logger.info("Embedding model '%s' installed successfully.", EMBEDDING_MODEL)
        else:
            logger.warning("Failed to pull '%s' — semantic similarity will be unavailable.", EMBEDDING_MODEL)
    except Exception as exc:
        logger.warning("Auto-install of embedding model failed: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_storage_dirs()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Fire-and-forget: install nomic-embed-text if missing, without blocking startup
    asyncio.create_task(_ensure_embedding_model())
    yield


app = FastAPI(
    title="AI Orchestrator",
    description="Self-improving AI orchestrator with domain SLM distillation",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(orchestrator_router, prefix="/api/v1")
app.include_router(data_router,         prefix="/api/v1")
app.include_router(models_router,       prefix="/api/v1")
app.include_router(slm_router,          prefix="/api/v1")
app.include_router(evaluation_router,   prefix="/api/v1")
app.include_router(feedback_router,     prefix="/api/v1")
app.include_router(pipeline_router,     prefix="/api/v1")
app.include_router(wiki_router,         prefix="/api/v1")
app.include_router(links_router,        prefix="/api/v1")
app.include_router(quality_router,      prefix="/api/v1")
app.include_router(repair_router,       prefix="/api/v1")
app.include_router(db_router,           prefix="/api/v1")
app.include_router(eda_router,          prefix="/api/v1")
app.include_router(benchmark_router,    prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok"}
