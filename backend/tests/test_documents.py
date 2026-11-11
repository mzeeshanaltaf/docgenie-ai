"""Upload, ingestion and document endpoints against real Postgres + MinIO.

Embeddings and OCR are faked (`fake_openai`); everything else is real. The upload endpoint
runs ingestion as a background task, which httpx's ASGI transport completes before returning.
"""

import uuid

import pytest
from sqlalchemy import text

from app.config import get_settings
from app.db import get_sessionmaker
from app.services import credits, storage
from app.services.ingestion import fail_document, sweep_stale_processing
from tests import factories
from tests.conftest import headers_for


@pytest.fixture(autouse=True)
def _fake(fake_openai):
    return fake_openai


async def upload(client, uid, name, data, mime="application/octet-stream"):
    return await client.post(
        "/v1/documents", headers=headers_for(uid), files=factories.multipart(name, data, mime)
    )


async def get_balances(uid):
    async with get_sessionmaker()() as s:
        b = await credits.get_balances(s, uid)
    return (b.credit_balance, b.message_balance) if b else None


async def scalar(sql, **params):
    async with get_sessionmaker()() as s:
        return (await s.execute(text(sql), params)).scalar_one()


async def chunk_count(doc_id):
    return await scalar("SELECT count(*) FROM document_chunks WHERE document_id = :d", d=doc_id)


# --- happy paths: each type reaches `ready` with chunks and embeddings --------------------


async def test_text_pdf_reaches_ready(db_client, user_id):
    resp = await upload(db_client, user_id, "report.pdf", factories.text_pdf(pages=3), "application/pdf")
    assert resp.status_code == 202, resp.text
    body = resp.json()
    assert body["status"] == "processing" and body["num_pages"] == 3
    assert "storage_key" not in body and "checksum" not in body

    doc = (await db_client.get(f"/v1/documents/{body['id']}", headers=headers_for(user_id))).json()
    assert doc["status"] == "ready" and doc["ocr_used"] is False and doc["error_code"] is None
    assert await chunk_count(body["id"]) >= 1
    embedded = await scalar(
        "SELECT count(*) FROM document_chunks WHERE document_id = :d AND embedding IS NOT NULL",
        d=body["id"],
    )
    assert embedded == await chunk_count(body["id"])
    pages = await scalar(
        "SELECT max(page_end) FROM document_chunks WHERE document_id = :d", d=body["id"]
    )
    assert pages == 3
    assert await get_balances(user_id) == (4, 25)  # one document credit spent
    kinds = await scalar(
        "SELECT string_agg(kind, ',') FROM llm_usage WHERE user_id = :u", u=user_id
    )
    assert kinds == "embedding"


async def test_scanned_pdf_goes_through_ocr(db_client, user_id):
    resp = await upload(db_client, user_id, "scan.pdf", factories.scanned_pdf(pages=2), "application/pdf")
    assert resp.status_code == 202, resp.text
    doc = (await db_client.get(f"/v1/documents/{resp.json()['id']}", headers=headers_for(user_id))).json()
    assert doc["status"] == "ready" and doc["ocr_used"] is True
    content = await scalar(
        "SELECT string_agg(content, ' ') FROM document_chunks WHERE document_id = :d",
        d=resp.json()["id"],
    )
    assert "Scanned page text from OCR" in content
    kinds = await scalar(
        "SELECT string_agg(kind, ',' ORDER BY kind) FROM llm_usage WHERE user_id = :u", u=user_id
    )
    assert kinds == "embedding,ocr"


async def test_docx_reaches_ready(db_client, user_id):
    resp = await upload(db_client, user_id, "notes.docx", factories.docx_bytes())
    assert resp.status_code == 202, resp.text
    doc = (await db_client.get(f"/v1/documents/{resp.json()['id']}", headers=headers_for(user_id))).json()
    assert doc["status"] == "ready"
    assert doc["mime_type"].endswith("wordprocessingml.document")
    assert await chunk_count(resp.json()["id"]) >= 1


async def test_txt_reaches_ready(db_client, user_id):
    resp = await upload(db_client, user_id, "notes.txt", factories.txt_bytes(1200), "text/plain")
    assert resp.status_code == 202, resp.text
    assert resp.json()["num_pages"] == 3
    doc = (await db_client.get(f"/v1/documents/{resp.json()['id']}", headers=headers_for(user_id))).json()
    assert doc["status"] == "ready"


async def test_csv_reaches_ready_with_rows_schema_and_exact_values(db_client, user_id):
    # Windows browsers send CSVs as application/vnd.ms-excel: the sniffer must not care.
    resp = await upload(db_client, user_id, "data.csv", factories.csv_bytes(rows=5), "application/vnd.ms-excel")
    assert resp.status_code == 202, resp.text
    did = resp.json()["id"]
    doc = (await db_client.get(f"/v1/documents/{did}", headers=headers_for(user_id))).json()
    assert doc["status"] == "ready" and doc["mime_type"] == "text/csv" and doc["num_pages"] is None
    assert [c["name"] for c in doc["csv_schema"]["columns"]] == ["id", "name", "amount", "note"]
    assert await scalar("SELECT count(*) FROM document_rows WHERE document_id = :d", d=did) == 6
    # Quotes survive exactly (parameterised insert, no quote doubling).
    note = await scalar(
        "SELECT row_data->>'note' FROM document_rows WHERE document_id = :d AND row_index = 1", d=did
    )
    assert note == 'He said "hi", ok'
    assert await chunk_count(did) >= 2  # schema summary + at least one row batch


# --- upload rejections ----------------------------------------------------------------


async def test_duplicate_upload_is_409_and_costs_nothing(db_client, user_id):
    data = factories.text_pdf()
    assert (await upload(db_client, user_id, "a.pdf", data)).status_code == 202
    again = await upload(db_client, user_id, "renamed.pdf", data)
    assert again.status_code == 409
    assert again.json()["status"] == "DUPLICATE_DOCUMENT" and again.json()["success"] is False
    assert await get_balances(user_id) == (4, 25)
    # The same bytes for a *different* user are fine.
    assert (await upload(db_client, f"{user_id}_b", "a.pdf", data)).status_code == 202


async def test_oversize_upload_is_413_without_buffering(db_client, user_id, monkeypatch):
    monkeypatch.setenv("MAX_UPLOAD_MB", "1")
    get_settings.cache_clear()
    try:
        big = b"%PDF-1.4\n" + b"0" * (2 * 1024 * 1024)
        resp = await upload(db_client, user_id, "big.pdf", big)
        assert resp.status_code == 413 and resp.json()["status"] == "FILE_TOO_LARGE"
        # And when Content-Length is absent/understated the streaming cap still stops it.
        near = b"%PDF-1.4\n" + b"0" * (1024 * 1024 + 10)
        resp = await upload(db_client, user_id, "near.pdf", near)
        assert resp.status_code == 413
        assert await get_balances(user_id) is None  # never reached the credit step
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()


async def test_page_limit_is_400(db_client, user_id, monkeypatch):
    monkeypatch.setenv("MAX_PAGES", "2")
    get_settings.cache_clear()
    try:
        resp = await upload(db_client, user_id, "long.pdf", factories.text_pdf(pages=3))
        assert resp.status_code == 400 and resp.json()["status"] == "PAGE_LIMIT_EXCEEDED"
        assert await get_balances(user_id) is None  # rejected before any credit was touched
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()


async def test_row_limit_is_400(db_client, user_id, monkeypatch):
    monkeypatch.setenv("MAX_CSV_ROWS", "3")
    get_settings.cache_clear()
    try:
        resp = await upload(db_client, user_id, "rows.csv", factories.csv_bytes(rows=10))
        assert resp.status_code == 400 and resp.json()["status"] == "ROWS_LIMIT_EXCEEDED"
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()


async def test_renamed_binary_is_415(db_client, user_id):
    resp = await upload(db_client, user_id, "totally.csv", bytes(range(256)) * 50, "text/csv")
    assert resp.status_code == 415 and resp.json()["status"] == "UNSUPPORTED_TYPE"
    resp = await upload(db_client, user_id, "photo.png", b"\x89PNG\r\n\x1a\n" + b"x" * 100, "image/png")
    assert resp.status_code == 415


async def test_missing_file_field_is_422(db_client, user_id):
    resp = await db_client.post(
        "/v1/documents", headers=headers_for(user_id), files={"other": ("a.txt", b"hello")}
    )
    assert resp.status_code == 422


async def test_no_credits_is_402_and_writes_no_row(db_client, user_id):
    async with get_sessionmaker()() as s, s.begin():
        await credits.grant_signup(s, user_id)
        await s.execute(
            text("UPDATE credit_accounts SET credit_balance = 0 WHERE user_id = :u"), {"u": user_id}
        )
    resp = await upload(db_client, user_id, "a.pdf", factories.text_pdf())
    assert resp.status_code == 402 and resp.json()["status"] == "INSUFFICIENT_CREDITS"
    assert await scalar("SELECT count(*) FROM documents WHERE user_id = :u", u=user_id) == 0
    assert await storage.list_keys(storage.user_prefix(user_id)) == []  # nothing stored either


async def test_concurrent_uploads_cannot_overspend(db_client, user_id):
    import asyncio

    async with get_sessionmaker()() as s, s.begin():
        await credits.grant_signup(s, user_id)
        await s.execute(
            text("UPDATE credit_accounts SET credit_balance = 2 WHERE user_id = :u"), {"u": user_id}
        )
    files = [factories.text_pdf(pages=1) for _ in range(6)]
    results = await asyncio.gather(*[upload(db_client, user_id, f"{i}.pdf", f) for i, f in enumerate(files)])
    codes = sorted(r.status_code for r in results)
    assert codes == [202, 202, 402, 402, 402, 402]
    assert await get_balances(user_id) == (0, 25)


# --- failure -> refund --------------------------------------------------------------------


async def test_failed_ingestion_refunds_and_cleans_up(db_client, user_id, fake_openai):
    fake_openai.fail_embeddings = True
    resp = await upload(db_client, user_id, "a.pdf", factories.text_pdf())
    assert resp.status_code == 202  # accepted; the failure happens in the background
    did = resp.json()["id"]
    doc = (await db_client.get(f"/v1/documents/{did}", headers=headers_for(user_id))).json()
    assert doc["status"] == "failed" and doc["error_code"] == "EMBEDDING_FAILED"
    assert await get_balances(user_id) == (5, 25)  # refunded
    assert await chunk_count(did) == 0
    assert await storage.list_keys(f"{storage.user_prefix(user_id)}{did}/") == []
    types = await scalar(
        "SELECT string_agg(transaction_type, ',' ORDER BY transaction_type) FROM credit_transactions "
        "WHERE user_id = :u AND unit_type = 'document'",
        u=user_id,
    )
    assert types == "refund,signup,usage"


async def test_failed_document_can_be_reuploaded(db_client, user_id, fake_openai):
    data = factories.text_pdf()
    fake_openai.fail_embeddings = True
    assert (await upload(db_client, user_id, "a.pdf", data)).status_code == 202
    fake_openai.fail_embeddings = False
    retry = await upload(db_client, user_id, "a.pdf", data)
    assert retry.status_code == 202
    doc = (await db_client.get(f"/v1/documents/{retry.json()['id']}", headers=headers_for(user_id))).json()
    assert doc["status"] == "ready"
    assert await get_balances(user_id) == (4, 25)
    assert await scalar("SELECT count(*) FROM documents WHERE user_id = :u", u=user_id) == 1


async def test_no_text_found_fails_with_code_and_refund(db_client, user_id, monkeypatch):
    async def blank_ocr(png):
        from app.services.usage import Usage

        return "", Usage()

    monkeypatch.setattr("app.services.ocr._transcribe", blank_ocr)
    resp = await upload(db_client, user_id, "blank.pdf", factories.scanned_pdf(pages=1))
    doc = (await db_client.get(f"/v1/documents/{resp.json()['id']}", headers=headers_for(user_id))).json()
    assert doc["status"] == "failed" and doc["error_code"] == "NO_TEXT_FOUND"
    assert await get_balances(user_id) == (5, 25)


async def test_storage_outage_at_upload_refunds_and_removes_row(db_client, user_id, monkeypatch):
    async def boom(*a, **k):
        raise storage.StorageError("minio down")

    monkeypatch.setattr("app.services.storage.put_file", boom)
    resp = await upload(db_client, user_id, "a.pdf", factories.text_pdf())
    assert resp.status_code == 503 and resp.json()["status"] == "STORAGE_UNAVAILABLE"
    assert await get_balances(user_id) == (5, 25)
    assert await scalar("SELECT count(*) FROM documents WHERE user_id = :u", u=user_id) == 0


async def test_sweep_fails_and_refunds_stale_processing_documents(db_client, user_id):
    async with get_sessionmaker()() as s, s.begin():
        doc_id = uuid.uuid4()
        await credits.grant_signup(s, user_id)
        await credits.reserve(s, user_id, "document", reference_id=doc_id, file_name="stuck.pdf")
        await s.execute(
            text(
                "INSERT INTO documents (id, user_id, file_name, mime_type, file_size, checksum, "
                "status, created_at) VALUES (:id, :u, 'stuck.pdf', 'application/pdf', 1, :c, "
                "'processing', now() - interval '1 hour')"
            ),
            {"id": doc_id, "u": user_id, "c": uuid.uuid4().hex},
        )
    assert await get_balances(user_id) == (4, 25)
    assert await sweep_stale_processing(min_age_minutes=10) >= 1
    assert await scalar("SELECT status FROM documents WHERE id = :d", d=doc_id) == "failed"
    assert (
        await scalar("SELECT error_code FROM documents WHERE id = :d", d=doc_id)
        == "PROCESSING_INTERRUPTED"
    )
    assert await get_balances(user_id) == (5, 25)
    # Running it (or fail_document) again never refunds twice.
    assert await fail_document(doc_id, user_id, "INTERNAL_ERROR") is False
    assert await get_balances(user_id) == (5, 25)


async def test_fresh_processing_documents_are_not_swept(db_client, user_id):
    async with get_sessionmaker()() as s, s.begin():
        doc_id = uuid.uuid4()
        await s.execute(
            text(
                "INSERT INTO documents (id, user_id, file_name, mime_type, file_size, checksum, status) "
                "VALUES (:id, :u, 'new.pdf', 'application/pdf', 1, :c, 'processing')"
            ),
            {"id": doc_id, "u": user_id, "c": uuid.uuid4().hex},
        )
    await sweep_stale_processing(min_age_minutes=10)
    assert await scalar("SELECT status FROM documents WHERE id = :d", d=doc_id) == "processing"


# --- list / get / content / delete ------------------------------------------------------


async def test_list_returns_newest_first_without_file_bytes(db_client, user_id):
    first = await upload(db_client, user_id, "first.txt", factories.txt_bytes(100))
    second = await upload(db_client, user_id, "second.txt", factories.txt_bytes(100))
    resp = await db_client.get("/v1/documents", headers=headers_for(user_id))
    assert resp.status_code == 200
    docs = resp.json()["documents"]
    assert [d["id"] for d in docs] == [second.json()["id"], first.json()["id"]]
    assert set(docs[0]) == {
        "id", "file_name", "mime_type", "file_size", "num_pages", "status",
        "error_code", "ocr_used", "csv_schema", "created_at",
    }  # fmt: skip


async def test_content_streams_original_bytes(db_client, user_id):
    data = factories.text_pdf()
    did = (await upload(db_client, user_id, "my file.pdf", data, "application/pdf")).json()["id"]
    resp = await db_client.get(f"/v1/documents/{did}/content", headers=headers_for(user_id))
    assert resp.status_code == 200
    assert resp.content == data
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.headers["content-disposition"].startswith("inline")
    assert resp.headers["content-length"] == str(len(data))
    dl = await db_client.get(
        f"/v1/documents/{did}/content?download=true", headers=headers_for(user_id)
    )
    assert dl.headers["content-disposition"].startswith("attachment")


async def test_cross_user_access_is_denied_everywhere(db_client, user_id):
    data = factories.text_pdf()
    did = (await upload(db_client, user_id, "mine.pdf", data)).json()["id"]
    intruder = headers_for(f"{user_id}_intruder")
    for method, path in [
        ("GET", f"/v1/documents/{did}"),
        ("GET", f"/v1/documents/{did}/content"),
        ("DELETE", f"/v1/documents/{did}"),
    ]:
        resp = await db_client.request(method, path, headers=intruder)
        assert resp.status_code == 404, (method, path)
        assert resp.json()["status"] == "NOT_FOUND"
    assert (await db_client.get("/v1/documents", headers=intruder)).json() == {"documents": []}
    # The owner's document is untouched by the attempted delete.
    assert (await db_client.get(f"/v1/documents/{did}", headers=headers_for(user_id))).status_code == 200
    assert await storage.list_keys(f"{storage.user_prefix(user_id)}{did}/") != []


async def test_document_endpoints_require_user_header(db_client):
    key = {"X-Internal-Key": "test-internal-key"}
    assert (await db_client.get("/v1/documents", headers=key)).status_code == 401
    assert (await db_client.post("/v1/documents", headers=key, files=factories.multipart("a.txt", b"hi"))).status_code == 401


async def test_unknown_document_is_404(db_client, user_id):
    resp = await db_client.get(f"/v1/documents/{uuid.uuid4()}", headers=headers_for(user_id))
    assert resp.status_code == 404
    assert (await db_client.get("/v1/documents/not-a-uuid", headers=headers_for(user_id))).status_code == 422


async def test_delete_removes_object_chunks_and_rows(db_client, user_id):
    did = (await upload(db_client, user_id, "data.csv", factories.csv_bytes(rows=5), "text/csv")).json()["id"]
    prefix = f"{storage.user_prefix(user_id)}{did}/"
    assert await storage.list_keys(prefix) != []
    assert await chunk_count(did) > 0
    assert await scalar("SELECT count(*) FROM document_rows WHERE document_id = :d", d=did) > 0

    resp = await db_client.delete(f"/v1/documents/{did}", headers=headers_for(user_id))
    assert resp.status_code == 204

    assert await storage.list_keys(prefix) == []
    assert await chunk_count(did) == 0
    assert await scalar("SELECT count(*) FROM document_rows WHERE document_id = :d", d=did) == 0
    assert await scalar("SELECT count(*) FROM documents WHERE id = :d", d=did) == 0
    assert (await db_client.get(f"/v1/documents/{did}", headers=headers_for(user_id))).status_code == 404


async def test_object_key_format(db_client, user_id):
    did = (await upload(db_client, user_id, "../evil/name.txt", factories.txt_bytes(50))).json()["id"]
    keys = await storage.list_keys(storage.user_prefix(user_id))
    assert keys == [f"users/{user_id}/{did}/name.txt"]


# --- health -------------------------------------------------------------------------------


async def test_health_reports_database_and_storage(db_client):
    resp = await db_client.get("/v1/health", headers={"X-Internal-Key": "test-internal-key"})
    assert resp.status_code == 200
    assert resp.json()["checks"] == {"database": "ok", "storage": "ok"}
