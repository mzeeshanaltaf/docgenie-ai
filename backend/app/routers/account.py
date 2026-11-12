import asyncio
from collections.abc import AsyncIterator
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import CurrentUserId
from app.schemas.account import AccountDeletedOut, DeletedOut
from app.services import account as account_service
from app.services.account import ExportFile

router = APIRouter(prefix="/account", tags=["account"])

_CHUNK = 256 * 1024


async def _stream_and_close(export: ExportFile) -> AsyncIterator[bytes]:
    try:
        while True:
            chunk = await asyncio.to_thread(export.file.read, _CHUNK)
            if not chunk:
                return
            yield chunk
    finally:
        export.close()  # the temp file disappears with it


@router.get("/export")
async def export_account(
    user_id: CurrentUserId, session: AsyncSession = Depends(get_session)
) -> StreamingResponse:
    """A zip with the user's data as JSON plus every original file. Layout: see
    `app/services/account.py`."""
    export = await account_service.build_export(session, user_id)
    name = f"docgenie-export-{datetime.now(UTC):%Y-%m-%d}.zip"
    return StreamingResponse(
        _stream_and_close(export),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            "Content-Length": str(export.size),
            "Cache-Control": "no-store",
        },
    )


@router.delete("", response_model=AccountDeletedOut)
async def delete_account(
    user_id: CurrentUserId, session: AsyncSession = Depends(get_session)
) -> AccountDeletedOut:
    """Irreversibly delete every row and stored file the app holds for the user. Idempotent.
    Next.js deletes the Better Auth user afterwards, only if this returned 200."""
    result = await account_service.delete_account(session, user_id)
    return AccountDeletedOut(
        deleted=DeletedOut(
            documents=result.documents,
            sessions=result.sessions,
            storage_objects=result.storage_objects,
        )
    )
