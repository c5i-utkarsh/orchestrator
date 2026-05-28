"""
Celery tasks for background pipeline execution.
"""
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
def reset_db_engine(**kwargs):
    """Dispose the SQLAlchemy async engine pool after Celery forks a worker process.
    This prevents asyncpg connections created in the parent process event loop from
    being reused in the child process's new event loop."""
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
