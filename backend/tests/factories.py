"""Build small sample documents in memory for the tests."""

import io
import secrets
import uuid
from typing import Any

from docx import Document as DocxDocument
from PIL import Image, ImageDraw
from reportlab.pdfgen import canvas


def text_pdf(pages: int = 2, marker: str | None = None) -> bytes:
    """A PDF with a real text layer. `marker` makes the bytes unique (checksums are per user)."""
    marker = marker or secrets.token_hex(4)
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    for n in range(1, pages + 1):
        c.drawString(72, 750, f"Page {n} heading {marker}")
        for line in range(1, 15):
            c.drawString(
                72, 750 - line * 20, f"Line {line} of page {n}: the quick brown fox jumps over."
            )
        c.showPage()
    c.save()
    return buf.getvalue()


def scanned_pdf(pages: int = 2) -> bytes:
    """A PDF made only of page images (no text layer), like a scan."""
    marker = secrets.token_hex(4)
    images = []
    for n in range(1, pages + 1):
        img = Image.new("RGB", (612, 792), "white")
        draw = ImageDraw.Draw(img)
        draw.text((60, 60), f"Scanned page {n} {marker}", fill="black")
        images.append(img)
    buf = io.BytesIO()
    images[0].save(buf, format="PDF", save_all=True, append_images=images[1:])
    return buf.getvalue()


def docx_bytes(paragraphs: int = 30) -> bytes:
    doc = DocxDocument()
    doc.add_heading(f"Report {secrets.token_hex(4)}", level=1)
    for i in range(paragraphs):
        doc.add_paragraph(f"Paragraph {i}: revenue grew steadily across the quarter. " * 3)
    table = doc.add_table(rows=2, cols=2)
    table.cell(0, 0).text, table.cell(0, 1).text = "Region", "Sales"
    table.cell(1, 0).text, table.cell(1, 1).text = "North", "1200"
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def csv_bytes(rows: int = 5, quote_value: str = 'He said "hi", ok') -> bytes:
    lines = ["id,name,amount,note"]
    for i in range(1, rows + 1):
        note = '"' + quote_value.replace('"', '""') + '"' if i == 1 else "plain"
        lines.append(f"{i},Name {i},{i * 10}.5,{note}")
    lines.append(f"# {secrets.token_hex(4)},unique,0,x")  # makes the checksum unique per call
    return ("\n".join(lines) + "\n").encode()


def txt_bytes(words: int = 1200) -> bytes:
    body = " ".join(f"word{i}" for i in range(words))
    return f"{secrets.token_hex(4)} {body}\n".encode()


def multipart(file_name: str, data: bytes, content_type: str = "application/octet-stream"):
    """httpx `files=` value for the `file` field."""
    return {"file": (file_name, data, content_type)}


def one_hot(i: int, dim: int = 1536) -> list[float]:
    """An embedding pointing along one axis: distances between different axes are exactly 1."""
    v = [0.0] * dim
    v[i] = 1.0
    return v


async def make_document(
    user_id: str,
    *,
    file_name: str = "report.pdf",
    chunks: list[tuple[str, list[float] | None, int | None]] | None = None,
    csv_rows: list[dict[str, str]] | None = None,
    status: str = "ready",
    num_pages: int | None = 3,
) -> uuid.UUID:
    """Insert a document straight into the database (no upload, no OpenAI).

    `chunks` = [(content, embedding or None for the deterministic fake, page_start)].
    `csv_rows` makes it a table: schema and `document_rows` are built like real ingestion does.
    """
    from app.db import get_sessionmaker
    from app.models.documents import Document, DocumentChunk, DocumentRow
    from app.services import parsing
    from tests.conftest import _fake_vector

    doc_id = uuid.uuid4()
    schema: dict[str, Any] | None = None
    if csv_rows:
        headers = list(csv_rows[0])
        data = parsing.CsvData(headers, csv_rows, ",")
        schema = parsing.build_csv_schema(data)
        num_pages = None
        file_name = file_name if file_name.endswith(".csv") else "table.csv"
    async with get_sessionmaker()() as s, s.begin():
        s.add(
            Document(
                id=doc_id,
                user_id=user_id,
                file_name=file_name,
                mime_type="text/csv" if schema else "application/pdf",
                file_size=1000,
                num_pages=num_pages,
                storage_key=f"users/{user_id}/{doc_id}/{file_name}",
                checksum=secrets.token_hex(16),
                status=status,
                csv_schema=schema,
            )
        )
        await s.flush()
        for i, (content, emb, page) in enumerate(chunks or []):
            s.add(
                DocumentChunk(
                    document_id=doc_id,
                    user_id=user_id,
                    chunk_index=i,
                    page_start=page,
                    page_end=page,
                    content=content,
                    embedding=emb if emb is not None else _fake_vector(content),
                )
            )
        for i, row in enumerate(csv_rows or [], start=1):
            s.add(DocumentRow(document_id=doc_id, user_id=user_id, row_index=i, row_data=row))
    return doc_id
