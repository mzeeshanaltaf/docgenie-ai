"""Background ingestion: parse -> (OCR) -> chunk -> embed -> index, with refund on failure.

`ingest_document` runs as a FastAPI BackgroundTasks job after `POST /v1/documents` returned
202. It owns the temp file it is handed and deletes it when done.

Failure handling is centralised in `fail_document`. It flips the row `processing -> failed`
with a single conditional UPDATE; only the caller that wins that flip deletes partial data,
refunds the credit and removes the stored object, so a refund can never happen twice (e.g.
a late failure racing the stale-document sweep).
"""

import asyncio
import contextlib
import logging
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy import delete, insert, null, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_sessionmaker
from app.errors import IngestionError, IngestionErrorCode
from app.models.documents import Document, DocumentChunk, DocumentRow
from app.services import credits, parsing, storage
from app.services.chunking import Chunk, chunk_csv, chunk_pages
from app.services.embeddings import embed_texts
from app.services.ocr import ocr_pdf
from app.services.usage import Usage, log_usage

log = logging.getLogger("docgenie.ingestion")

INSERT_BATCH = 500


async def ingest_document(document_id: uuid.UUID, user_id: str, kind: str, path: Path) -> None:
    """Never raises: every outcome ends with the document `ready` or `failed`."""
    try:
        await _ingest(document_id, user_id, kind, path)
    except IngestionError as exc:
        log.warning("ingestion failed for %s: %s (%s)", document_id, exc.code, exc)
        await fail_document(document_id, user_id, exc.code)
    except Exception:
        log.exception("unexpected ingestion error for %s", document_id)
        await fail_document(document_id, user_id, IngestionErrorCode.INTERNAL_ERROR)
    finally:
        with contextlib.suppress(OSError):
            path.unlink()


async def _ingest(document_id: uuid.UUID, user_id: str, kind: str, path: Path) -> None:
    s = get_settings()
    sm = get_sessionmaker()
    async with sm() as session:
        doc = await session.get(Document, document_id)
    if doc is None or doc.user_id != user_id or doc.status != "processing":
        return  # deleted (or swept) while queued: nothing to do

    ocr_used = False
    csv_schema: dict[str, Any] | None = None
    csv_data: parsing.CsvData | None = None
    ocr_usage = Usage()
    chunks: list[Chunk]

    try:
        if kind == parsing.CSV:
            csv_data = await asyncio.to_thread(parsing.parse_csv, path)
            if not csv_data.rows:
                raise IngestionError(IngestionErrorCode.NO_TEXT_FOUND, "CSV has no data rows")
            csv_schema = csv_data.schema
            chunks = chunk_csv(doc.file_name, csv_data)
        else:
            pages, ocr_used, ocr_usage = await _extract_pages(kind, path, doc.num_pages or 1)
            if sum(len(p.text) for p in pages) > s.max_extracted_chars:
                raise IngestionError(IngestionErrorCode.TEXT_TOO_LARGE)
            chunks = chunk_pages(pages)
            if not chunks:
                raise IngestionError(IngestionErrorCode.NO_TEXT_FOUND)
    except IngestionError:
        raise
    except ValueError as exc:  # parser could not read the file
        raise IngestionError(IngestionErrorCode.PARSE_FAILED, str(exc)) from exc
    except OSError as exc:
        raise IngestionError(IngestionErrorCode.PARSE_FAILED, str(exc)) from exc

    try:
        vectors, embed_usage = await embed_texts([c.content for c in chunks])
    except Exception as exc:
        raise IngestionError(IngestionErrorCode.EMBEDDING_FAILED, repr(exc)) from exc

    async with sm() as session, session.begin():
        # Still ours? (A delete or sweep may have raced us.) Lock the row for the writes below.
        status = (
            await session.execute(
                text("SELECT status FROM documents WHERE id = :id FOR UPDATE"), {"id": document_id}
            )
        ).scalar_one_or_none()
        if status != "processing":
            return
        await session.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document_id))
        await session.execute(delete(DocumentRow).where(DocumentRow.document_id == document_id))
        await _insert_chunks(session, document_id, user_id, chunks, vectors)
        if csv_data is not None:
            await _insert_rows(session, document_id, user_id, csv_data)
        if ocr_used:
            await log_usage(
                session, user_id=user_id, kind="ocr", model=s.ocr_model, usage=ocr_usage
            )
        await log_usage(
            session,
            user_id=user_id,
            kind="embedding",
            model=s.embedding_model,
            usage=embed_usage,
            service_tier="default",
        )
        await session.execute(
            update(Document)
            .where(Document.id == document_id)
            .values(
                status="ready",
                error_code=None,
                ocr_used=ocr_used,
                csv_schema=csv_schema if csv_schema is not None else null(),  # SQL NULL, not JSON null
            )
        )
    log.info("document %s ready: %d chunks, ocr=%s", document_id, len(chunks), ocr_used)


async def _extract_pages(
    kind: str, path: Path, num_pages: int
) -> tuple[list[parsing.PageText], bool, Usage]:
    """Return (pages, ocr_used, ocr_usage)."""
    if kind == parsing.PDF:
        try:
            pages = await asyncio.to_thread(parsing.extract_pdf_pages, path)
        except ValueError as exc:
            raise IngestionError(IngestionErrorCode.PARSE_FAILED, str(exc)) from exc
        if not parsing.pdf_needs_ocr(pages):
            return pages, False, Usage()
        try:
            ocr_pages, usage = await ocr_pdf(path, num_pages)
        except Exception as exc:
            raise IngestionError(IngestionErrorCode.OCR_FAILED, repr(exc)) from exc
        if not any(p.text.strip() for p in ocr_pages):
            raise IngestionError(IngestionErrorCode.NO_TEXT_FOUND, "OCR found no text")
        return ocr_pages, True, usage
    if kind == parsing.DOCX:
        pages = await asyncio.to_thread(parsing.extract_docx_pages, path, num_pages)
    else:
        pages = await asyncio.to_thread(parsing.extract_txt_pages, path)
    return pages, False, Usage()


async def _insert_chunks(
    session: AsyncSession,
    document_id: uuid.UUID,
    user_id: str,
    chunks: list[Chunk],
    vectors: list[list[float]],
) -> None:
    rows = [
        {
            "document_id": document_id,
            "user_id": user_id,
            "chunk_index": i,
            "page_start": c.page_start,
            "page_end": c.page_end,
            "content": c.content,
            "embedding": v,
        }
        for i, (c, v) in enumerate(zip(chunks, vectors, strict=True))
    ]
    for i in range(0, len(rows), INSERT_BATCH):
        await session.execute(insert(DocumentChunk), rows[i : i + INSERT_BATCH])


async def _insert_rows(
    session: AsyncSession, document_id: uuid.UUID, user_id: str, data: parsing.CsvData
) -> None:
    """Bulk insert CSV rows. Values are bound parameters (JSONB), never string-built SQL."""
    rows = [
        {"document_id": document_id, "user_id": user_id, "row_index": i, "row_data": row}
        for i, row in enumerate(data.rows, start=1)
    ]
    for i in range(0, len(rows), INSERT_BATCH):
        await session.execute(insert(DocumentRow), rows[i : i + INSERT_BATCH])


async def fail_document(
    document_id: uuid.UUID, user_id: str, code: IngestionErrorCode | str
) -> bool:
    """Mark a `processing` document failed, drop partial data, refund, delete the object.

    Returns True if this call performed the failure (and therefore the refund).
    """
    code_value = str(code)
    claimed = False
    async with get_sessionmaker()() as session, session.begin():
        row = (
            await session.execute(
                text(
                    "UPDATE documents SET status = 'failed', error_code = :c, storage_key = NULL "
                    "WHERE id = :id AND user_id = :u AND status = 'processing' "
                    "RETURNING file_name"
                ),
                {"c": code_value, "id": document_id, "u": user_id},
            )
        ).first()
        if row is not None:
            claimed = True
            await session.execute(
                delete(DocumentChunk).where(DocumentChunk.document_id == document_id)
            )
            await session.execute(delete(DocumentRow).where(DocumentRow.document_id == document_id))
            await credits.refund(
                session,
                user_id,
                "document",
                reference_id=document_id,
                file_name=row.file_name,
                description=f"Refund: processing failed ({code_value})",
            )
    if claimed:
        # storage_key was just cleared; the object lives under the document's key prefix.
        try:
            await _delete_stored_object(document_id, user_id)
        except Exception:
            log.exception("could not delete stored object for failed document %s", document_id)
    return claimed


async def _delete_stored_object(document_id: uuid.UUID, user_id: str) -> None:
    prefix = f"{storage.user_prefix(user_id)}{document_id}/"
    for key in await storage.list_keys(prefix):
        await storage.delete_object(key)


async def sweep_stale_processing(min_age_minutes: int | None = None) -> int:
    """Fail and refund `processing` documents older than the stale threshold.

    Covers a crash or restart mid-ingest (background tasks die with the process). Returns the
    number of documents failed.
    """
    age = (
        get_settings().ingestion_stale_minutes if min_age_minutes is None else min_age_minutes
    )
    async with get_sessionmaker()() as session:
        stale = (
            await session.execute(
                text(
                    "SELECT id, user_id FROM documents WHERE status = 'processing' "
                    "AND created_at < now() - make_interval(mins => :age)"
                ),
                {"age": age},
            )
        ).all()
    failed = 0
    for row in stale:
        if await fail_document(row.id, row.user_id, IngestionErrorCode.PROCESSING_INTERRUPTED):
            failed += 1
    if failed:
        log.warning("sweep failed and refunded %d stale document(s)", failed)
    return failed


async def sweep_loop() -> None:
    """Run the sweep now and then every INGESTION_SWEEP_INTERVAL_S until cancelled."""
    interval = get_settings().ingestion_sweep_interval_s
    while True:
        try:
            await sweep_stale_processing()
        except Exception:
            log.exception("stale-document sweep failed")
        await asyncio.sleep(interval)
