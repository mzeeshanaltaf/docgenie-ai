"""Document rows: the transactional create used by upload, ownership-checked lookups, delete."""

import logging
import uuid

from sqlalchemy import delete, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError, ErrorCode
from app.models.documents import Document
from app.services import credits, storage

log = logging.getLogger("docgenie.documents")


async def create_processing_document(
    session: AsyncSession,
    *,
    user_id: str,
    document_id: uuid.UUID,
    file_name: str,
    mime_type: str,
    file_size: int,
    num_pages: int | None,
    storage_key: str,
    checksum: str,
) -> Document:
    """In ONE transaction: insert the `processing` row, reserve 1 document credit and write the
    usage ledger row. Either everything is committed or nothing is.

    - A same-checksum document that previously *failed* is replaced, so a failed upload can be
      retried (its credit was already refunded).
    - A same-checksum document in any other state -> 409 DUPLICATE_DOCUMENT.
    - No credit -> 402 INSUFFICIENT_CREDITS and no row is written.
    """
    try:
        async with session.begin():
            await session.execute(
                text(
                    "DELETE FROM documents WHERE user_id = :u AND checksum = :c AND status = 'failed'"
                ),
                {"u": user_id, "c": checksum},
            )
            doc = Document(
                id=document_id,
                user_id=user_id,
                file_name=file_name,
                mime_type=mime_type,
                file_size=file_size,
                num_pages=num_pages,
                storage_key=storage_key,
                checksum=checksum,
                status="processing",
            )
            session.add(doc)
            await session.flush()  # unique (user_id, checksum) is enforced here
            await credits.reserve(
                session,
                user_id,
                "document",
                reference_id=document_id,
                file_name=file_name,
                description="Document upload",
            )
    except IntegrityError as exc:
        if "uq_documents_user_checksum" in str(exc.orig):
            raise ApiError(ErrorCode.DUPLICATE_DOCUMENT) from exc
        raise
    await session.refresh(doc)  # load server defaults (created_at)
    await session.commit()  # end the read transaction refresh() opened; attributes stay loaded
    return doc


async def abort_upload(session: AsyncSession, user_id: str, document_id: uuid.UUID) -> None:
    """The original file could not be stored after the row was created: undo it.

    Deletes the row (so the same file can be uploaded again) and writes the refund.
    """
    async with session.begin():
        row = (
            await session.execute(
                text(
                    "DELETE FROM documents WHERE id = :id AND user_id = :u "
                    "AND status = 'processing' RETURNING file_name"
                ),
                {"id": document_id, "u": user_id},
            )
        ).first()
        if row is not None:
            await credits.refund(
                session,
                user_id,
                "document",
                reference_id=document_id,
                file_name=row.file_name,
                description="Refund: upload could not be stored",
            )


async def list_documents(session: AsyncSession, user_id: str) -> list[Document]:
    result = await session.execute(
        select(Document).where(Document.user_id == user_id).order_by(Document.created_at.desc())
    )
    return list(result.scalars())


async def get_owned_document(
    session: AsyncSession, user_id: str, document_id: uuid.UUID
) -> Document:
    """The document, or 404. Another user's document is indistinguishable from a missing one."""
    doc = (
        await session.execute(
            select(Document).where(Document.id == document_id, Document.user_id == user_id)
        )
    ).scalar_one_or_none()
    if doc is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Document not found.")
    return doc


async def delete_document(session: AsyncSession, user_id: str, document_id: uuid.UUID) -> None:
    """Delete the stored object, then the row (chunks and CSV rows go by FK cascade).

    The object goes first so a storage failure leaves the row in place and the delete can be
    retried, instead of orphaning an object nobody references any more.
    """
    doc = await get_owned_document(session, user_id, document_id)
    prefix = f"{storage.user_prefix(user_id)}{doc.id}/"
    try:
        for key in await storage.list_keys(prefix):
            await storage.delete_object(key)
    except storage.StorageError as exc:
        log.error("could not delete objects for document %s: %s", document_id, exc)
        raise ApiError(ErrorCode.STORAGE_UNAVAILABLE) from exc
    await session.execute(
        delete(Document).where(Document.id == document_id, Document.user_id == user_id)
    )
    await session.commit()
