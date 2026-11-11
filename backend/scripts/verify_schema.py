"""Read-only: list document_genie tables, row counts for Better Auth tables, key indexes."""

import asyncio

import asyncpg

from app.config import get_settings


async def main() -> None:
    url = get_settings().async_database_url.replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(url)
    try:
        for r in await conn.fetch(
            "select table_name from information_schema.tables where table_schema='document_genie' order by 1"
        ):
            n = await conn.fetchval(f'select count(*) from document_genie."{r["table_name"]}"')
            print(f"  {r['table_name']}: {n} rows")
        print("hnsw/gin indexes:")
        for r in await conn.fetch(
            "select indexname, indexdef from pg_indexes where schemaname='document_genie' "
            "and (indexdef ilike '%hnsw%' or indexdef ilike '%gin%')"
        ):
            print("  ", r["indexdef"])
        print("generated tsv:", await conn.fetchval(
            "select is_generated from information_schema.columns where table_schema='document_genie' "
            "and table_name='document_chunks' and column_name='tsv'"))
    finally:
        await conn.close()


asyncio.run(main())
