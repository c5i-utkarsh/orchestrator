from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db.database import engine, Base
from app.routes import (
    orchestrator_router,
    data_router,
    models_router,
    slm_router,
    evaluation_router,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_storage_dirs()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title="AI Orchestrator",
    description="Self-improving AI orchestrator with domain SLM distillation",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://frontend:3000",
        "http://frontend:3001",
        "http://192.168.42.62:3000",
        "http://192.168.42.62:3001",
        "http://BTGBSAPP08:3000",
        "http://BTGBSAPP08:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(orchestrator_router, prefix="/api/v1")
app.include_router(data_router,         prefix="/api/v1")
app.include_router(models_router,       prefix="/api/v1")
app.include_router(slm_router,          prefix="/api/v1")
app.include_router(evaluation_router,   prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok"}
