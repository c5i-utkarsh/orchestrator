"""
Celery tasks for background pipeline execution.
"""
import os
from celery import Celery
from celery.signals import worker_process_init, task_prerun
from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "orchestrator",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.ingest_task", "app.tasks.slm_build_task"],
)
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content = ["json"]


@worker_process_init.connect
def configure_worker_environment(**kwargs):
    """Set HuggingFace offline mode and dispose DB pool after Celery forks.

    HF_HUB_OFFLINE / TRANSFORMERS_OFFLINE prevent transformers from making
    outbound HTTPS requests to huggingface.co even when the model is already
    fully cached locally.  Without these flags, AutoModelForCausalLM.from_
    pretrained() attempts an SSL handshake that fails on this server (untrusted
    issuer certificate), causing QLoRA to silently fall back to the Ollama
    Modelfile path on every build.
    """
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
    # Dispose asyncpg connections that were created in the parent process event
    # loop — they cannot be reused in the child's new event loop.
    from app.db.database import engine
    engine.sync_engine.dispose(close=False)


@task_prerun.connect
def reset_db_engine_before_task(task_id, task, *args, **kwargs):
    """Dispose the engine pool before every task.
    Each Celery task calls asyncio.run() which creates a NEW event loop.
    Any asyncpg connections cached in the pool belong to the PREVIOUS loop
    and will raise 'Future attached to a different loop' if reused.
    Disposing before each task forces fresh connections on the new loop."""
    from app.db.database import engine
    engine.sync_engine.dispose(close=False)

