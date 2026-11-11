import asyncio
import logging
import uuid
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import CurrentUserId
from app.errors import ApiError, ErrorCode
from app.schemas.documents import DocumentListOut, DocumentOut
from app.services import documents as docs
from app.services import ingestion, parsing, storage
from app.services.uploads import receive_upload

log = logging.getLogger("docgenie.documents")

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("", response_model=DocumentOut, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    request: Request,
    background: BackgroundTasks,
    user_id: CurrentUserId,
    session: AsyncSession = Depends(get_session),
) -> DocumentOut:
    """Validate, charge and store the upload, then ingest it in the background.

    Everything before the 202 is quick and rejects bad uploads immediately:
    size cap (413) -> type sniffing (415) -> page/row limits (400) -> duplicate (409) ->
    credit reservation (402) -> object storage. Parsing, OCR, chunking and embedding happen
    afterwards; poll `GET /v1/documents/{id}` until `status` leaves `processing`.
    """
    upload = await receive_upload(request)  # 413 / 422
    handed_off = False
    try:
        detected = await asyncio.to_thread(parsing.detect_type, upload.path, upload.file_name)
        counts = await asyncio.to_thread(parsing.count_document, detected.kind, upload.path)

        document_id = uuid.uuid4()
        key = storage.object_key(user_id, document_id, upload.file_name)
        doc = await docs.create_processing_document(  # 409 / 402
            session,
            user_id=user_id,
            document_id=document_id,
            file_name=upload.file_name,
            mime_type=detected.mime_type,
            file_size=upload.size,
            num_pages=counts.num_pages,
            storage_key=key,
            checksum=upload.sha256,
        )
        try:
            await storage.put_file(key, upload.path, detected.mime_type)
        except storage.StorageError as exc:
            log.error("object upload failed for %s: %s", document_id, exc)
            await docs.abort_upload(session, user_id, document_id)  # row removed, credit refunded
            raise ApiError(ErrorCode.STORAGE_UNAVAILABLE) from exc

        out = DocumentOut.model_validate(doc)
        background.add_task(ingestion.ingest_document, document_id, user_id, detected.kind, upload.path)
        handed_off = True  # ingestion now owns (and deletes) the temp file
        return out
    finally:
        if not handed_off:
            upload.cleanup()


@router.get("", response_model=DocumentListOut)
async def list_documents(
    user_id: CurrentUserId, session: AsyncSession = Depends(get_session)
) -> DocumentListOut:
    """The caller's documents, newest first. Metadata only, never file bytes."""
    rows = await docs.list_documents(session, user_id)
    return DocumentListOut(documents=[DocumentOut.model_validate(d) for d in rows])


@router.get("/{document_id}", response_model=DocumentOut)
async def get_document(
    document_id: uuid.UUID, user_id: CurrentUserId, session: AsyncSession = Depends(get_session)
) -> DocumentOut:
    """Document status. The frontend polls this while `status == "processing"`."""
    return DocumentOut.model_validate(await docs.get_owned_document(session, user_id, document_id))


@router.get("/{document_id}/content")
async def get_document_content(
    document_id: uuid.UUID,
    user_id: CurrentUserId,
    download: Annotated[bool, Query()] = False,
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    """Stream the original file from object storage (preview inline, or `?download=true`)."""
    doc = await docs.get_owned_document(session, user_id, document_id)
    await session.close()  # don't hold a pooled connection for the length of the stream
    if not doc.storage_key:  # failed documents have their object removed
        raise ApiError(ErrorCode.NOT_FOUND, "The original file is not available.")
    try:
        obj = await storage.open_object(doc.storage_key)
    except storage.StorageError as exc:
        log.error("could not open object for document %s: %s", document_id, exc)
        raise ApiError(ErrorCode.STORAGE_UNAVAILABLE) from exc
    disposition = "attachment" if download else "inline"
    return StreamingResponse(
        storage.iter_object(obj),
        media_type=doc.mime_type,
        headers={
            "Content-Length": str(obj.content_length),
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(doc.file_name)}",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID, user_id: CurrentUserId, session: AsyncSession = Depends(get_session)
) -> Response:
    """Remove the stored object and the document; chunks and CSV rows go by FK cascade."""
    await docs.delete_document(session, user_id, document_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
