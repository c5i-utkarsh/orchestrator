"""
Celery task: build a domain SLM from scratch.
"""
import asyncio
from app.tasks import celery_app


@celery_app.task(name="run_slm_build", bind=True, max_retries=1)
def run_slm_build(
    self,
    domain_label: str,
    coverage_topics: list,
    corpus_hash: str,
    trigger_query: str,
):
    asyncio.run(_build(domain_label, coverage_topics, corpus_hash, trigger_query))


async def _build(domain_label: str, coverage_topics: list, corpus_hash: str, trigger_query: str):
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy.pool import NullPool
    from app.config import get_settings
    from app.adapters.registry import get_adapter_registry
    from app.modules.slm_factory.slm_registry import SLMRegistry
    from app.modules.slm_factory.slm_store import SLMStore
    from app.modules.slm_factory.slm_builder import SLMBuilder

    settings = get_settings()
    _task_engine = create_async_engine(
        settings.database_url,
        echo=False,
        poolclass=NullPool,
    )
    async_session_factory = async_sessionmaker(
        _task_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    registry = get_adapter_registry()

    async with async_session_factory() as db:
        slm_registry = SLMRegistry(db)
        slm_store = SLMStore(settings.slm_store_path)
        builder = SLMBuilder(slm_registry, registry, slm_store, settings.slm_store_path)

        embed = [0.0] * settings.embedding_dim  # placeholder — real embedding via Ollama

        # Build with empty wiki articles (meant for manual trigger without corpus)
        async for event in builder.build(
            domain_label=domain_label,
            wiki_articles=[],
            domain_embedding=embed,
            coverage_topics=coverage_topics,
            corpus_hash=corpus_hash,
            trigger_query=trigger_query,
        ):
            pass  # events not streamed in background task
