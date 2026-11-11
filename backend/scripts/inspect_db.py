"""Read-only look at the database: column defs for chosen tables, extension schema."""

import asyncio
import sys

import asyncpg

from app.config import get_settings


async def main(tables: list[str]) -> None:
    url = get_settings().async_database_url.replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(url)
    try:
        print("vector ext schema:", await conn.fetchval(
            "select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace "
            "where e.extname='vector'"))
        for t in tables:
            print(f"-- document_genie.{t}")
            for r in await conn.fetch(
                "select column_name, data_type, is_nullable, column_default from information_schema.columns "
                "where table_schema='document_genie' and table_name=$1 order by ordinal_position", t):
                print("  ", r["column_name"], r["data_type"], r["is_nullable"], r["column_default"])
        print("user.id type:", await conn.fetchval(
            "select data_type from information_schema.columns where table_schema='document_genie' "
            "and table_name='user' and column_name='id'"))
    finally:
        await conn.close()


asyncio.run(main(sys.argv[1:] or ["user_credit_accounts", "user_credit_transactions"]))
