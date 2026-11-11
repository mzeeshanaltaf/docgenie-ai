"""Async Alembic environment.

The database is shared with other apps and with Better Auth, so:
- the version table lives in the `document_genie` schema (other schemas have their own),
- autogenerate only ever considers objects in `document_genie` that our models own,
  so the Better Auth tables (user, session, account, verification) are never touched.
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

import app.models  # noqa: F401  (register models on Base.metadata)
from app.config import get_settings
from app.db import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

settings = get_settings()
SCHEMA = settings.db_schema
target_metadata = Base.metadata


def include_object(obj, name, type_, reflected, compare_to):  # noqa: ANN001
    if type_ == "table" and reflected:
        # Only compare tables that our models declare; ignore Better Auth tables etc.
        return name in target_metadata.tables or f"{SCHEMA}.{name}" in target_metadata.tables
    return True


def _configure(connection: Connection | None = None, url: str | None = None) -> None:
    context.configure(
        connection=connection,
        url=url,
        target_metadata=target_metadata,
        version_table_schema=SCHEMA,
        include_schemas=False,
        include_object=include_object,
        compare_type=True,
        literal_binds=connection is None,
    )


def run_migrations_offline() -> None:
    _configure(url=settings.async_database_url)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    _configure(connection=connection)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = create_async_engine(
        settings.async_database_url,
        poolclass=pool.NullPool,
        connect_args={"server_settings": {"search_path": f"{SCHEMA},public"}},
    )
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
