from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool
from app.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=20,
    max_overflow=40,
    pool_timeout=30,
    pool_recycle=1800,
    connect_args={"timeout": 10},
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)
AsyncSessionLocal = async_session_factory  # backward-compat alias

# Separate engine for long-lived SSE streaming sessions.
# SSE connections hold a DB session open for the full response duration (10-90s).
# Using NullPool here means each SSE request gets its own connection that is
# immediately returned on close — avoids exhausting the shared pool under load.
_sse_engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    poolclass=NullPool,
    connect_args={"timeout": 30},
)
_sse_session_factory = async_sessionmaker(
    _sse_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)
AsyncSSESessionLocal = _sse_session_factory


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
