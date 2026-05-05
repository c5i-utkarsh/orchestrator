from app.routes.orchestrator import router as orchestrator_router
from app.routes.data import router as data_router
from app.routes.models import router as models_router
from app.routes.slm import router as slm_router
from app.routes.evaluation import router as evaluation_router

__all__ = [
    "orchestrator_router",
    "data_router",
    "models_router",
    "slm_router",
    "evaluation_router",
]
