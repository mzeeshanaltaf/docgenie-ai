# Phase 2: Credits, storage and document ingestion

**Goal:** users can upload documents that are validated, charged for, stored in MinIO, parsed (with OCR for scanned PDFs), chunked, embedded and indexed. Failures refund the credit.

**Depends on:** Phase 1 (scaffold, config, schema, internal auth).
**Unblocks:** Phase 3 (retrieval needs indexed chunks), Phase 4 (account export/delete needs storage).

## Session handoff

**Read before starting:** [README.md](README.md), the Current state in [progress.md](progress.md), and the Phase 1 log entry (smoke-test results, error helper, auth dependencies, commands).

**Record in the handoff** (in `progress.md`):
- MinIO ports (API and console), bucket name, how to start it, and the new `S3_*` env var names.
- The public functions of `services/credits.py` and `services/storage.py` (names and signatures) that Phases 3 and 4 will call.
- The `error_code` values ingestion can set on a failed document (Phase 8 maps them to readable messages).
- The `GET /v1/documents` and `GET /v1/documents/{id}` response shapes (or the schema module that defines them).
- How the test suite sets up the throwaway schema and MinIO, and the command to run it.
- Whether the signup-credit re-grant script was run locally, and its path.
- Whether the credits assumption (5 + 25, 1 per upload and per turn) was confirmed.

## Assumption to confirm

- Credits stay at **5 documents + 25 messages on signup**, 1 credit per upload and 1 per chat turn.

## Files

```
docker-compose.dev.yml        # MinIO (+ console) for local dev
backend/app/
  routers/documents.py  routers/credits.py
  services/
    storage.py              # MinIO (S3) client
    parsing.py              # PDF/DOCX/TXT/CSV extraction + page counting
    ocr.py                  # scanned-PDF fallback
    chunking.py  embeddings.py
    ingestion.py            # background pipeline
    credits.py              # atomic reserve / refund
    usage.py                # token + cost logging (embedding + OCR usage first)
```

## Tasks

### 1. Storage (MinIO)
- `docker-compose.dev.yml` runs MinIO and its console. Put the `S3_*` values in `.env.local` / `backend/.env`.
- `services/storage.py` uses `boto3` with path-style addressing and a dummy region (see the traps in the `add-minio-storage-to-coolify` skill). The bucket is private. Store object keys in the DB, never URLs.
- Object key format: `users/{user_id}/{document_id}/{file_name}`.
- Add a storage check to `GET /v1/health`.
- Existing `bytea` files are not migrated (they are dummy data); the column disappears with the old table.

### 2. Credits (`services/credits.py`)
- **Reserve** atomically: `UPDATE … SET credit_balance = credit_balance - 1 WHERE … AND credit_balance >= 1 RETURNING`. No row returned means `402 INSUFFICIENT_CREDITS`.
- **Refund** writes a compensating transaction.
- `POST /v1/users/{id}/signup-credits`: an idempotent grant (`ON CONFLICT DO NOTHING`) of `SIGNUP_DOC_CREDITS` / `SIGNUP_MESSAGE_CREDITS`.
- `GET /v1/credits/history`: the user's transactions, newest first.
- One-off script: re-grant signup credits to existing Better Auth users so current test accounts keep working.

### 3. Upload: synchronous part of `POST /v1/documents`
This part is kept fast so the user gets rejections immediately:

1. Stream the multipart body to a temp file with a hard byte cap. Reject past `MAX_UPLOAD_MB` (20 MB) without buffering the whole file → `413 FILE_TOO_LARGE`.
2. Detect the type from magic bytes + extension, **not** the browser MIME. This fixes the Windows `application/vnd.ms-excel` CSV rejection. Unknown types → `415 UNSUPPORTED_TYPE`.
3. Count pages before any heavy work:
   - PDF: `pypdf`
   - DOCX: `docProps/app.xml`, falling back to word count
   - TXT: words / `TXT_WORDS_PER_PAGE` (500)
   - CSV: row count against `MAX_CSV_ROWS`
   Over the limit → `400 PAGE_LIMIT_EXCEEDED` / `ROWS_LIMIT_EXCEEDED`.
4. Compute the SHA-256 checksum. The unique `(user_id, checksum)` index catches duplicates → `409 DUPLICATE_DOCUMENT`.
5. In **one transaction**: reserve 1 document credit, insert the document row as `processing`, write the transaction row. If there is no credit, no row is written and the response is a 402.
6. Upload the original file to MinIO.
7. Return `202` with the document in `processing`.

### 4. Background ingestion (`services/ingestion.py`)
Runs as a FastAPI `BackgroundTasks` job:

- Extract text per page (`pypdf`, `python-docx`, plain decode, `csv`).
- **OCR fallback:** if a PDF yields near-empty text, render its pages with `pypdfium2` and transcribe them with `OCR_MODEL` vision, capped at `MAX_PAGES`. Set `ocr_used`. Still no text → `NO_TEXT_FOUND`.
- Chunk with a recursive character splitter (`CHUNK_SIZE` 1000 / `CHUNK_OVERLAP` 200), carrying `page_start`/`page_end` on each chunk.
- **CSV:** rows go into `document_rows` with proper parameterization (no quote doubling). Store `csv_schema`. Build embeddings from a schema summary plus batches of rows rendered as `column: value` lines.
- Embed in batches, bulk insert chunks, mark the document `ready`.
- **On any failure:** mark it `failed` with an `error_code`, delete partial chunks and the MinIO object, and **refund the credit**.
- Log embedding and OCR token usage to `llm_usage` with cost from `PRICING`.

**Startup sweep:** in the app lifespan, mark stale `processing` rows as `failed` and refund them, so a crash mid-ingest never strands a credit.

### 5. Document endpoints

| Method and path | Purpose |
|---|---|
| `POST /v1/documents` | Upload (above) |
| `GET /v1/documents` | List, no file bytes |
| `GET /v1/documents/{id}` | Status; the frontend polls this while a document is `processing` |
| `GET /v1/documents/{id}/content` | Streams the original file from MinIO (preview and download) |
| `DELETE /v1/documents/{id}` | Removes the object; chunks and rows go by cascade |

Every endpoint checks that the document belongs to `X-User-Id`.

## Tests (`pytest`, real Postgres in a throwaway schema + local MinIO)

- [ ] Credit reservation under concurrency: no double spend, 0 credits rejected, refund on failure.
- [ ] Duplicate upload returns 409.
- [ ] Size, page and row limits each return the right code.
- [ ] Type sniffing: a CSV sent as `application/vnd.ms-excel` is accepted; a renamed binary is rejected.
- [ ] Scanned PDF goes through OCR and sets `ocr_used`.
- [ ] Cross-user access is denied on every document endpoint.
- [ ] Delete removes the MinIO object, chunks and rows.
- [ ] Signup-credit grant is idempotent.

## Exit criteria

- [ ] MinIO runs from `docker-compose.dev.yml`; health reports DB and storage.
- [ ] A text PDF, a scanned PDF, a DOCX and a CSV each reach `ready` with chunks and embeddings.
- [ ] All tests above pass.
