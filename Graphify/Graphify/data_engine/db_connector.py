"""Database connectivity — test, connect, and extract tables as documents."""

from __future__ import annotations

import csv
import logging
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# In-memory registry of active connections (demo-safe, single-process)
_connections: dict[str, "DBConnection"] = {}


@dataclass
class DBConnection:
    conn_id: str
    db_type: str
    host: str
    port: int
    database: str
    username: str
    schema: Optional[str]
    status: str              # disconnected | connected | ready | error
    error: Optional[str] = None
    tables: list[str] = field(default_factory=list)
    files_created: list[str] = field(default_factory=list)


# ── Public API ─────────────────────────────────────────────────────────────────

def test_connection(
    db_type: str,
    host: str,
    port: int,
    database: str,
    username: str,
    password: str,
    schema: Optional[str] = None,
) -> tuple[bool, str]:
    """Test a DB connection. Returns (success, message)."""
    try:
        engine = _make_engine(db_type, host, port, database, username, password)
        with engine.connect() as conn:
            from sqlalchemy import text
            conn.execute(text("SELECT 1"))
        return True, "Connection successful"
    except ImportError as exc:
        return False, str(exc)
    except Exception as exc:
        return False, f"Connection failed: {exc}"


def connect_and_extract(
    db_type: str,
    host: str,
    port: int,
    database: str,
    username: str,
    password: str,
    schema: Optional[str] = None,
    output_dir: str = "data/raw",
    max_tables: int = 20,
    rows_per_table: int = 500,
) -> tuple[str, list[str]]:
    """Connect to DB, extract tables as .txt files in output_dir.

    Returns (conn_id, list_of_created_filenames).
    """
    conn_id = str(uuid.uuid4())[:8]
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    engine = _make_engine(db_type, host, port, database, username, password)
    files_created: list[str] = []
    table_names: list[str] = []

    with engine.connect() as conn:
        from sqlalchemy import inspect as sa_inspect, text

        inspector = sa_inspect(engine)
        table_names = inspector.get_table_names(schema=schema or None)[:max_tables]

        for table in table_names:
            try:
                qualified = f"{schema}.{table}" if schema else table
                safe_table = qualified.replace('"', "")
                # Use ANSI LIMIT — works on PG + MySQL; MSSQL users should use SQLServer driver
                result = conn.execute(text(f'SELECT * FROM "{safe_table}" LIMIT {rows_per_table}'))
                cols = list(result.keys())
                rows = result.fetchall()

                lines = [f"Table: {table}", f"Database: {database}",
                         "Columns: " + ", ".join(cols), "---"]
                for row in rows:
                    lines.append("\t".join("" if v is None else str(v) for v in row))

                filename = f"db__{database}__{table}.txt"
                (out / filename).write_text("\n".join(lines), encoding="utf-8")
                files_created.append(filename)
                logger.info("Extracted table '%s' → %s (%d rows)", table, filename, len(rows))
            except Exception as exc:
                logger.warning("Skipped table '%s': %s", table, exc)

    db_conn = DBConnection(
        conn_id=conn_id,
        db_type=db_type,
        host=host,
        port=port,
        database=database,
        username=username,
        schema=schema,
        status="ready",
        tables=table_names,
        files_created=files_created,
    )
    _connections[conn_id] = db_conn
    return conn_id, files_created


def list_connections() -> list[dict]:
    return [
        {
            "conn_id": c.conn_id,
            "db_type": c.db_type,
            "host": c.host,
            "database": c.database,
            "status": c.status,
            "table_count": len(c.tables),
            "files_created": len(c.files_created),
            "error": c.error,
        }
        for c in _connections.values()
    ]


# ── Internals ──────────────────────────────────────────────────────────────────

def _make_engine(db_type: str, host: str, port: int, database: str,
                 username: str, password: str):
    try:
        from sqlalchemy import create_engine
    except ImportError as exc:
        raise ImportError("SQLAlchemy required: pip install sqlalchemy") from exc

    dt = db_type.lower()
    import urllib.parse
    pw = urllib.parse.quote_plus(password)

    if "postgres" in dt:
        url = f"postgresql+psycopg2://{username}:{pw}@{host}:{port}/{database}"
    elif "mysql" in dt:
        url = f"mysql+pymysql://{username}:{pw}@{host}:{port}/{database}"
    elif "sql server" in dt or "mssql" in dt:
        url = (f"mssql+pyodbc://{username}:{pw}@{host}:{port}/{database}"
               "?driver=ODBC+Driver+17+for+SQL+Server")
    elif "sqlite" in dt:
        url = f"sqlite:///{database}"
    else:
        raise ValueError(f"Unsupported DB type '{db_type}'. "
                         "Supported: PostgreSQL, MySQL, Microsoft SQL Server, SQLite.")

    return create_engine(url, connect_args={"connect_timeout": 8}, pool_pre_ping=True)
