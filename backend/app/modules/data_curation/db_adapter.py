import json
from dataclasses import dataclass, field
from typing import Any

from app.modules.data_curation.ingester import CanonicalDocument
from app.config import get_settings

settings = get_settings()


@dataclass
class DBEdge:
    source_table: str
    source_col: str
    target_table: str
    target_col: str
    edge_type: str = "foreign_key"


@dataclass
class DBSchemaGraph:
    entities: list[CanonicalDocument] = field(default_factory=list)
    edges: list[DBEdge] = field(default_factory=list)
    table_names: list[str] = field(default_factory=list)


class DBAdapter:
    """
    Connects to a user's database, extracts schema and row stubs,
    and converts them into CanonicalDocuments + FK edges.
    """

    SUPPORTED_DRIVERS = {
        "postgresql": "postgresql+asyncpg",
        "mysql":      "mysql+aiomysql",
        "sqlite":     "sqlite+aiosqlite",
        "mongodb":    "mongodb",
    }

    async def extract(self, db_config: dict) -> DBSchemaGraph:
        db_type = db_config.get("type", "postgresql").lower()
        if db_type == "mongodb":
            return await self._extract_mongodb(db_config)
        return await self._extract_sql(db_config, db_type)

    async def _extract_sql(self, db_config: dict, db_type: str) -> DBSchemaGraph:
        from sqlalchemy.ext.asyncio import create_async_engine
        from sqlalchemy import inspect, text

        driver = self.SUPPORTED_DRIVERS.get(db_type, "postgresql+asyncpg")
        url = db_config.get("connection_string") or self._build_url(driver, db_config)

        engine = create_async_engine(url, echo=False)
        graph = DBSchemaGraph()

        async with engine.connect() as conn:
            def do_inspect(sync_conn):
                inspector = inspect(sync_conn)
                tables = inspector.get_table_names()
                schema_info = {}
                for table in tables:
                    columns = inspector.get_columns(table)
                    fks = inspector.get_foreign_keys(table)
                    schema_info[table] = {"columns": columns, "fks": fks}
                return tables, schema_info

            tables, schema_info = await conn.run_sync(do_inspect)
            graph.table_names = tables

            for table in tables:
                info = schema_info[table]
                cols = info["columns"]
                fks = info["fks"]

                # Table as entity type doc
                col_summary = ", ".join(
                    f"{c['name']}({c['type']})" for c in cols
                )
                graph.entities.append(CanonicalDocument(
                    title=f"Schema: {table}",
                    text=f"Table '{table}' has columns: {col_summary}",
                    source=f"db://{table}",
                    metadata={"entity_type": "table_schema", "table": table},
                ))

                # FK edges
                for fk in fks:
                    graph.edges.append(DBEdge(
                        source_table=table,
                        source_col=fk["constrained_columns"][0] if fk["constrained_columns"] else "",
                        target_table=fk["referred_table"],
                        target_col=fk["referred_columns"][0] if fk["referred_columns"] else "",
                    ))

                # Sample rows as entity instance stubs
                try:
                    result = await conn.execute(text(f'SELECT * FROM "{table}" LIMIT 50'))
                    rows = result.mappings().all()
                    for i, row in enumerate(rows):
                        row_text = " | ".join(
                            f"{k}: {v}" for k, v in row.items() if v is not None
                        )
                        graph.entities.append(CanonicalDocument(
                            title=f"{table} row {i}",
                            text=row_text,
                            source=f"db://{table}/row/{i}",
                            metadata={"entity_type": "row", "table": table},
                        ))
                except Exception:
                    pass

        await engine.dispose()
        return graph

    async def _extract_mongodb(self, db_config: dict) -> DBSchemaGraph:
        """Sample collections for pseudo-schema."""
        try:
            from motor.motor_asyncio import AsyncIOMotorClient
            client = AsyncIOMotorClient(db_config.get("connection_string", ""))
            db_name = db_config.get("database", "")
            db = client[db_name]
            graph = DBSchemaGraph()

            collection_names = await db.list_collection_names()
            for coll_name in collection_names:
                coll = db[coll_name]
                sample = await coll.find({}).limit(50).to_list(50)
                if sample:
                    # Infer pseudo-schema from first document
                    keys = list(sample[0].keys())
                    graph.entities.append(CanonicalDocument(
                        title=f"Collection: {coll_name}",
                        text=f"MongoDB collection '{coll_name}' fields: {', '.join(keys)}",
                        source=f"mongodb://{coll_name}",
                        metadata={"entity_type": "collection_schema", "collection": coll_name},
                    ))
                    for i, doc in enumerate(sample):
                        text = " | ".join(
                            f"{k}: {v}" for k, v in doc.items()
                            if k != "_id" and v is not None
                        )
                        graph.entities.append(CanonicalDocument(
                            title=f"{coll_name} doc {i}",
                            text=text,
                            source=f"mongodb://{coll_name}/{i}",
                            metadata={"entity_type": "document", "collection": coll_name},
                        ))
            client.close()
            return graph
        except Exception as e:
            return DBSchemaGraph()

    def _build_url(self, driver: str, config: dict) -> str:
        host = config.get("host", "localhost")
        port = config.get("port", 5432)
        user = config.get("user", "")
        password = config.get("password", "")
        database = config.get("database", "")
        return f"{driver}://{user}:{password}@{host}:{port}/{database}"

    async def test_connection(self, db_config: dict) -> dict:
        """Test DB connection and return schema preview."""
        try:
            db_type = db_config.get("type", "postgresql").lower()
            if db_type == "mongodb":
                from motor.motor_asyncio import AsyncIOMotorClient
                client = AsyncIOMotorClient(
                    db_config.get("connection_string", ""), serverSelectionTimeoutMS=3000
                )
                await client.server_info()
                db = client[db_config.get("database", "")]
                colls = await db.list_collection_names()
                client.close()
                return {"success": True, "tables": colls, "row_counts": {}}

            from sqlalchemy.ext.asyncio import create_async_engine
            from sqlalchemy import inspect, text

            driver = self.SUPPORTED_DRIVERS.get(db_type, "postgresql+asyncpg")
            url = db_config.get("connection_string") or self._build_url(driver, db_config)
            engine = create_async_engine(url, echo=False)

            async with engine.connect() as conn:
                def get_tables(sync_conn):
                    inspector = inspect(sync_conn)
                    return inspector.get_table_names()

                tables = await conn.run_sync(get_tables)
                row_counts = {}
                for table in tables[:20]:  # preview first 20
                    try:
                        r = await conn.execute(text(f'SELECT COUNT(*) FROM "{table}"'))
                        row_counts[table] = r.scalar()
                    except Exception:
                        row_counts[table] = "?"

            await engine.dispose()
            return {"success": True, "tables": tables, "row_counts": row_counts}
        except Exception as e:
            return {"success": False, "error": str(e)}
