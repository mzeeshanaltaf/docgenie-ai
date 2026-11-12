"""Account export (a zip of everything the app holds for a user) and full account deletion.

Zip layout (also described in docs/plan/progress.md):

    account.json              user id, export time, current balances, files that could not be read
    documents.json            document metadata (no storage key, checksum or embeddings);
                              each entry has `file`, its path inside the zip (null if unreadable)
    sessions.json             chat sessions
    messages.json             every message with `parts` and `metrics`
    feedback.json             like / dislike ratings
    credit_transactions.json  the credit ledger
    files/{document_id}/{file name}   the original uploads, byte for byte

Deletion removes every row the app holds for the user (`ACCOUNT_TABLES`; a test fails if a new
table with a `user_id` column is added without being listed) and then every object under
`users/{user_id}/`. The Better Auth user row belongs to Next.js, which deletes it only after this
succeeds.
"""

import asyncio
import json
import logging
import tempfile
import zipfile
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import IO, Any
from uuid import UUID

from sqlalchemy import delete, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError, ErrorCode
from app.models.billing import CreditAccount, CreditTransaction, LlmUsage
from app.models.chat import ChatMessage, ChatSession, MessageFeedback
from app.models.documents import Document, DocumentChunk, DocumentRow
from app.services import credits, storage

log = logging.getLogger("docgenie.account")

# Deletion order is irrelevant to correctness (FKs cascade), but children go first so each
# statement stays cheap. Every model with a `user_id` column must be here.
ACCOUNT_TABLES: tuple[type, ...] = (
    MessageFeedback,
    ChatMessage,
    ChatSession,
    DocumentRow,
    DocumentChunk,
    Document,
    CreditTransaction,
    CreditAccount,
    LlmUsage,
)


@dataclass
class DeletionResult:
    documents: int
    sessions: int
    storage_objects: int


@dataclass
class ExportFile:
    """A finished zip on disk (an anonymous temp file, removed when closed)."""

    file: IO[bytes]
    size: int

    def close(self) -> None:
        self.file.close()


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(f"not JSON serialisable: {type(value).__name__}")


def _dump(payload: Any) -> bytes:
    return json.dumps(payload, default=_json_default, indent=2, ensure_ascii=False).encode()


def _row(obj: Any, *, exclude: frozenset[str] = frozenset()) -> dict[str, Any]:
    """Every mapped column of an ORM object except `user_id` (it is in account.json)."""
    skip = {"user_id", *exclude}
    return {
        attr.key: getattr(obj, attr.key)
        for attr in inspect(type(obj)).mapper.column_attrs
        if attr.key not in skip
    }


# --- export ------------------------------------------------------------------------------


async def _rows(
    session: AsyncSession,
    model: Any,
    user_id: str,
    *order: Any,
    exclude: frozenset[str] = frozenset(),
) -> list[dict[str, Any]]:
    result = await session.execute(select(model).where(model.user_id == user_id).order_by(*order))
    return [_row(obj, exclude=exclude) for obj in result.scalars()]


async def build_export(session: AsyncSession, user_id: str) -> ExportFile:
    """Collect the user's data and originals into a zip on disk.

    Raises 503 STORAGE_UNAVAILABLE if storage is unreachable: a silently partial export would
    be dangerous right before an account deletion. An original that is simply missing from
    storage does not fail the export; it is listed in `account.json` under `missing_files`.
    """
    # Plain dicts, built before the transaction ends (a rollback expires ORM objects).
    documents = await _rows(
        session, Document, user_id, Document.created_at, exclude=frozenset({"checksum"})
    )
    sessions = await _rows(session, ChatSession, user_id, ChatSession.created_at)
    messages = await _rows(
        session, ChatMessage, user_id, ChatMessage.session_id, ChatMessage.created_at, ChatMessage.id
    )
    feedback = await _rows(session, MessageFeedback, user_id, MessageFeedback.message_id)
    transactions = await _rows(
        session, CreditTransaction, user_id, CreditTransaction.created_at, CreditTransaction.transaction_id
    )
    balances = await credits.get_balances(session, user_id)
    await session.rollback()  # reads are done: do not hold a connection while downloading files

    tmp = tempfile.TemporaryFile()  # noqa: SIM115 (ownership passes to the caller on success)
    try:
        missing: list[str] = []
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zf:
            for entry in documents:
                key = entry.pop("storage_key")  # internal: never exported
                entry["file"] = None
                if key:
                    path = f"files/{entry['id']}/{key.rsplit('/', 1)[-1]}"
                    try:
                        await _copy_object_into_zip(zf, key, path)
                        entry["file"] = path
                    except storage.ObjectNotFound:
                        log.warning("export: object missing for document %s", entry["id"])
                        missing.append(str(entry["id"]))
                    except storage.StorageError as exc:
                        log.error("export: storage failed for user %s: %s", user_id, exc)
                        raise ApiError(ErrorCode.STORAGE_UNAVAILABLE) from exc

            sections: dict[str, Any] = {
                "account.json": {
                    "user_id": user_id,
                    "exported_at": datetime.now(UTC),
                    "balances": (
                        {"documents": balances.credit_balance, "messages": balances.message_balance}
                        if balances
                        else None
                    ),
                    "missing_files": missing,
                },
                "documents.json": documents,
                "sessions.json": sessions,
                "messages.json": messages,
                "feedback.json": feedback,
                "credit_transactions.json": transactions,
            }
            for name, payload in sections.items():
                zf.writestr(name, _dump(payload))
        size = tmp.tell()
        tmp.seek(0)
        return ExportFile(file=tmp, size=size)
    except BaseException:
        tmp.close()
        raise


async def _copy_object_into_zip(zf: zipfile.ZipFile, key: str, path: str) -> None:
    """Stream one object into the zip without holding it in memory. The zip writes are blocking
    file I/O, so each chunk goes through a worker thread like the download does."""
    obj = await storage.open_object(key)
    # Originals (PDF, DOCX) are already compressed: store them as they are.
    with zf.open(zipfile.ZipInfo(path, datetime.now(UTC).timetuple()[:6]), "w", force_zip64=True) as out:
        async for chunk in storage.iter_object(obj):
            await asyncio.to_thread(out.write, chunk)


# --- deletion ----------------------------------------------------------------------------


async def delete_account(session: AsyncSession, user_id: str) -> DeletionResult:
    """Delete every app row for the user in one transaction, then every stored object.

    Rows go first so that, once the transaction commits, nothing in the app references the
    files. If storage then fails the call returns 503; calling it again is safe (the rows are
    gone and the object cleanup is simply retried), and Next.js only deletes the auth user after
    a success.
    """
    counts: dict[type, int] = {}
    async with session.begin():
        for model in ACCOUNT_TABLES:
            result = await session.execute(delete(model).where(model.user_id == user_id))  # type: ignore[attr-defined]
            counts[model] = max(result.rowcount or 0, 0)  # type: ignore[attr-defined]
    try:
        objects = await storage.delete_prefix(storage.user_prefix(user_id))
    except storage.StorageError as exc:
        log.error("account deletion: could not clear storage for user %s: %s", user_id, exc)
        raise ApiError(ErrorCode.STORAGE_UNAVAILABLE) from exc
    return DeletionResult(
        documents=counts[Document], sessions=counts[ChatSession], storage_objects=objects
    )
