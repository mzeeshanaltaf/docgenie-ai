"""File type detection, page/row counting and text extraction for PDF, DOCX, TXT and CSV.

Everything here is synchronous and CPU/IO bound: call it through `asyncio.to_thread`.

Type detection ignores the browser-supplied MIME type (Windows reports CSV as
`application/vnd.ms-excel`). Binary formats are recognised by magic bytes; text formats by
extension plus a "this really is text" check, so a renamed binary is rejected.
"""

import csv
import io
import math
import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

from app.config import get_settings
from app.errors import ApiError, ErrorCode

PDF = "pdf"
DOCX = "docx"
TXT = "txt"
CSV = "csv"

MIME_BY_KIND = {
    PDF: "application/pdf",
    DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    TXT: "text/plain",
    CSV: "text/csv",
}

_MAX_DOCX_UNCOMPRESSED = 200 * 1024 * 1024  # zip-bomb guard


@dataclass
class DetectedType:
    kind: str
    mime_type: str


@dataclass
class DocumentCounts:
    """Result of the cheap pre-check: pages for page-based files, rows for CSV."""

    num_pages: int | None
    num_rows: int | None = None


@dataclass
class PageText:
    page: int  # 1-based
    text: str


@dataclass
class CsvData:
    headers: list[str]
    rows: list[dict[str, str]]
    delimiter: str
    schema: dict[str, Any] = field(default_factory=dict)


def _unsupported(message: str | None = None) -> ApiError:
    return ApiError(ErrorCode.UNSUPPORTED_TYPE, message)


# ---------------------------------------------------------------------------
# Type detection
# ---------------------------------------------------------------------------


def detect_type(path: Path, file_name: str) -> DetectedType:
    """Detect the file kind from magic bytes (+ extension for text). Raises UNSUPPORTED_TYPE."""
    with path.open("rb") as fh:
        head = fh.read(8192)
    if not head:
        raise _unsupported("The file is empty.")
    ext = Path(file_name).suffix.lower()

    if head.lstrip(b"\x00 \t\r\n")[:5] == b"%PDF-" or b"%PDF-" in head[:1024]:
        return DetectedType(PDF, MIME_BY_KIND[PDF])

    if head[:4] == b"PK\x03\x04":
        if _is_docx(path):
            return DetectedType(DOCX, MIME_BY_KIND[DOCX])
        raise _unsupported()  # some other zip container (xlsx, pptx, a plain zip, ...)

    if ext in (".txt", ".csv"):
        if _looks_binary(head):
            raise _unsupported()
        try:
            decode_text(path.read_bytes())
        except UnicodeError:
            raise _unsupported() from None
        return DetectedType(CSV if ext == ".csv" else TXT, MIME_BY_KIND[CSV if ext == ".csv" else TXT])

    raise _unsupported()


def _is_docx(path: Path) -> bool:
    try:
        with zipfile.ZipFile(path) as zf:
            names = set(zf.namelist())
            if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                return False
            return sum(i.file_size for i in zf.infolist()) <= _MAX_DOCX_UNCOMPRESSED
    except zipfile.BadZipFile:
        return False


def _looks_binary(head: bytes) -> bool:
    if head[:2] in (b"\xff\xfe", b"\xfe\xff"):  # UTF-16 BOM: text with NUL bytes
        return False
    return b"\x00" in head


def decode_text(data: bytes) -> str:
    """Decode text files: BOM-aware, UTF-8 first, then Windows-1252 (common for Excel CSVs)."""
    if data[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return data.decode("utf-16")
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("cp1252", errors="replace")


# ---------------------------------------------------------------------------
# Counting (synchronous part of upload)
# ---------------------------------------------------------------------------


def count_document(kind: str, path: Path) -> DocumentCounts:
    """Pages (PDF/DOCX/TXT) or rows (CSV), before any heavy work. Enforces the limits."""
    s = get_settings()
    if kind == CSV:
        rows = len(parse_csv(path).rows)
        if rows > s.max_csv_rows:
            raise ApiError(
                ErrorCode.ROWS_LIMIT_EXCEEDED,
                f"The file has {rows} rows; the maximum is {s.max_csv_rows}.",
            )
        return DocumentCounts(num_pages=None, num_rows=rows)

    if kind == PDF:
        pages = _count_pdf_pages(path)
    elif kind == DOCX:
        pages = _count_docx_pages(path)
    else:
        pages = _count_txt_pages(decode_text(path.read_bytes()))
    if pages > s.max_pages:
        raise ApiError(
            ErrorCode.PAGE_LIMIT_EXCEEDED,
            f"The document has {pages} pages; the maximum is {s.max_pages}.",
        )
    return DocumentCounts(num_pages=pages)


def _count_pdf_pages(path: Path) -> int:
    from pypdf import PdfReader
    from pypdf.errors import PyPdfError

    try:
        reader = PdfReader(str(path))
        if reader.is_encrypted:
            raise _unsupported("Password-protected PDFs are not supported.")
        return max(len(reader.pages), 1)
    except ApiError:
        raise
    except (PyPdfError, ValueError, KeyError, OSError, RecursionError):
        raise _unsupported("This PDF could not be read.") from None


def _count_words(text: str) -> int:
    return len(text.split())


def _count_txt_pages(text: str) -> int:
    return max(math.ceil(_count_words(text) / get_settings().txt_words_per_page), 1)


def _count_docx_pages(path: Path) -> int:
    """`docProps/app.xml` <Pages> if the producing app wrote one; otherwise word count."""
    try:
        with zipfile.ZipFile(path) as zf:
            if "docProps/app.xml" in zf.namelist():
                root = ElementTree.fromstring(zf.read("docProps/app.xml"))
                for el in root.iter():
                    if el.tag.endswith("}Pages") and el.text and el.text.strip().isdigit():
                        pages = int(el.text.strip())
                        if pages > 0:
                            return pages
    except (zipfile.BadZipFile, ElementTree.ParseError, KeyError):
        pass
    return _count_txt_pages("\n".join(p for p in _docx_blocks(path)))


# ---------------------------------------------------------------------------
# Extraction (background ingestion)
# ---------------------------------------------------------------------------


def extract_pdf_pages(path: Path) -> list[PageText]:
    from pypdf import PdfReader
    from pypdf.errors import PyPdfError

    try:
        reader = PdfReader(str(path))
        pages: list[PageText] = []
        for i, page in enumerate(reader.pages, start=1):
            try:
                text = page.extract_text() or ""
            except (PyPdfError, ValueError, KeyError, RecursionError):
                text = ""  # one broken page should not fail the whole file
            pages.append(PageText(i, text))
        return pages
    except (PyPdfError, ValueError, KeyError, OSError, RecursionError) as exc:
        raise ValueError(f"unreadable PDF: {exc}") from exc


def pdf_needs_ocr(pages: list[PageText]) -> bool:
    """True when the PDF has (almost) no text layer, i.e. it is a scan."""
    if not pages:
        return True
    total = sum(len(p.text.strip()) for p in pages)
    return total / len(pages) < get_settings().ocr_min_chars_per_page


def _docx_blocks(path: Path) -> list[str]:
    """Paragraph and table text from a DOCX in document order (one string per block)."""
    from docx import Document
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    doc = Document(str(path))
    blocks: list[str] = []
    for child in doc.element.body.iterchildren():
        if child.tag.endswith("}p"):
            text = Paragraph(child, doc).text.strip()
            if text:
                blocks.append(text)
        elif child.tag.endswith("}tbl"):
            for row in Table(child, doc).rows:
                cells = []
                for cell in row.cells:
                    t = cell.text.strip()
                    if t and (not cells or cells[-1] != t):  # merged cells repeat their text
                        cells.append(t)
                if cells:
                    blocks.append(" | ".join(cells))
    return blocks


def extract_docx_pages(path: Path, num_pages: int) -> list[PageText]:
    """DOCX has no stored page layout, so paragraphs are spread across `num_pages` virtual
    pages in proportion to their length (page numbers in citations are approximate)."""
    blocks = _docx_blocks(path)
    total = sum(len(b) + 2 for b in blocks)
    if total == 0:
        return []
    num_pages = max(num_pages, 1)
    pages: dict[int, list[str]] = {}
    seen = 0
    for block in blocks:
        page = min(int(seen / total * num_pages) + 1, num_pages)
        pages.setdefault(page, []).append(block)
        seen += len(block) + 2
    return [PageText(p, "\n\n".join(parts)) for p, parts in sorted(pages.items())]


def extract_txt_pages(path: Path) -> list[PageText]:
    """Plain text, split into virtual pages of TXT_WORDS_PER_PAGE words (matches the count)."""
    text = decode_text(path.read_bytes())
    per_page = get_settings().txt_words_per_page
    pages: list[PageText] = []
    buf: list[str] = []
    words = 0
    # Walk line by line so we never cut a line in half; a page may run slightly over.
    for line in text.splitlines(keepends=True):
        buf.append(line)
        words += len(line.split())
        if words >= per_page:
            pages.append(PageText(len(pages) + 1, "".join(buf)))
            buf, words = [], 0
    if "".join(buf).strip():
        pages.append(PageText(len(pages) + 1, "".join(buf)))
    return pages


# ---------------------------------------------------------------------------
# CSV
# ---------------------------------------------------------------------------


def parse_csv(path: Path) -> CsvData:
    """Parse a CSV into dict rows with normalised headers. Empty rows are dropped."""
    text = decode_text(path.read_bytes())
    delimiter = _sniff_delimiter(text[:8192])
    reader = csv.reader(io.StringIO(text, newline=""), delimiter=delimiter)
    try:
        raw_headers = next(reader)
    except StopIteration:
        return CsvData([], [], delimiter)
    headers = _normalise_headers(raw_headers)
    rows: list[dict[str, str]] = []
    for record in reader:
        if not any(cell.strip() for cell in record):
            continue
        record = record[: len(headers)] + [""] * (len(headers) - len(record))
        rows.append({h: v.strip() for h, v in zip(headers, record, strict=True)})
    data = CsvData(headers, rows, delimiter)
    data.schema = build_csv_schema(data)
    return data


def _sniff_delimiter(sample: str) -> str:
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
    except csv.Error:
        return ","


def _normalise_headers(raw: list[str]) -> list[str]:
    headers: list[str] = []
    seen: set[str] = set()
    for i, h in enumerate(raw, start=1):
        name = h.strip() or f"column_{i}"
        base, n = name, 2
        while name in seen:
            name = f"{base}_{n}"
            n += 1
        seen.add(name)
        headers.append(name)
    return headers


_INT_RE = re.compile(r"^[+-]?\d+$")
_NUM_RE = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$|^\d{1,2}/\d{1,2}/\d{2,4}$")


def _infer_type(values: list[str]) -> str:
    present = [v for v in values if v != ""]
    if not present:
        return "text"
    if all(_INT_RE.match(v) for v in present):
        return "integer"
    if all(_NUM_RE.match(v) for v in present):
        return "number"
    if all(_DATE_RE.match(v) for v in present):
        return "date"
    if all(v.lower() in ("true", "false", "yes", "no") for v in present):
        return "boolean"
    return "text"


def build_csv_schema(data: CsvData) -> dict[str, Any]:
    columns = []
    for h in data.headers:
        values = [r[h] for r in data.rows]
        samples: list[str] = []
        for v in values:
            if v and v not in samples:
                samples.append(v[:80])
            if len(samples) == 3:
                break
        columns.append({"name": h, "type": _infer_type(values[:2000]), "sample": samples})
    return {"columns": columns, "row_count": len(data.rows), "delimiter": data.delimiter}
