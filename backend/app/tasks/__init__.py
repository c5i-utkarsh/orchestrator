"""
Celery tasks for background pipeline execution.
"""
from celery import Celery
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
