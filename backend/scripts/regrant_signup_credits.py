"""One-off: give every existing Better Auth user the signup credits.

Phase 1 dropped the n8n-era credit tables, so accounts created before the rebuild have no
`credit_accounts` row. This grants each of them the standard signup credits. It is idempotent:
users who already have an account row are left untouched.

Run from backend/:   PYTHONPATH=. uv run python scripts/regrant_signup_credits.py
Dry run (no writes): PYTHONPATH=. uv run python scripts/regrant_signup_credits.py --dry-run

Only reads `document_genie."user"` (Better Auth) and writes `credit_accounts` /
`credit_transactions`.
"""

import asyncio
import sys

from sqlalchemy import text

from app.db import dispose_engine, get_sessionmaker
from app.services import credits


async def main(dry_run: bool) -> None:
    async with get_sessionmaker()() as session:
        user_ids = [r[0] for r in await session.execute(text('SELECT id FROM "user" ORDER BY id'))]
        missing = [
            r[0]
            for r in await session.execute(
                text(
                    'SELECT u.id FROM "user" u LEFT JOIN credit_accounts c ON c.user_id = u.id '
                    "WHERE c.user_id IS NULL ORDER BY u.id"
                )
            )
        ]
    print(f"{len(user_ids)} users, {len(missing)} without a credit account")
    if dry_run:
        print("dry run: nothing written")
        return
    granted = 0
    for user_id in missing:
        async with get_sessionmaker()() as session, session.begin():
            if await credits.grant_signup(session, user_id):
                granted += 1
    print(f"granted signup credits to {granted} user(s)")
    await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main("--dry-run" in sys.argv))
