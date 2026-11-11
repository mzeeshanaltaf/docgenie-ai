"""Build small sample documents in memory for the tests."""

import io
import secrets

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
