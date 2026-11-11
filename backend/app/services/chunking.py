"""Recursive character splitter that keeps page numbers on every chunk.

Pieces are produced by splitting on a hierarchy of separators (paragraph, line, sentence,
word, character) and are merged back into chunks of at most CHUNK_SIZE characters, each
overlapping the previous by up to CHUNK_OVERLAP characters. Separators stay attached to the
end of the preceding piece, so chunk text is always an exact slice of the source and its
offsets map straight back to pages.
"""

from bisect import bisect_right
from dataclasses import dataclass
from typing import Any

from app.config import get_settings
from app.services.parsing import CsvData, PageText

SEPARATORS = ["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " ", ""]
PAGE_JOINER = "\n\n"
MAX_CSV_ROW_CHARS = 4000  # a single absurdly wide row is clipped before embedding


@dataclass
class Chunk:
    content: str
    page_start: int | None
    page_end: int | None


def _split_pieces(text: str, start: int, max_len: int, seps: list[str]) -> list[tuple[int, int]]:
    """Split text[start:...] into (start, end) spans no longer than max_len."""
    if len(text) <= max_len:
        return [(start, start + len(text))] if text else []
    sep = next((s for s in seps if s == "" or s in text), "")
    if sep == "":
        return [(start + i, start + min(i + max_len, len(text))) for i in range(0, len(text), max_len)]
    rest = seps[seps.index(sep) + 1 :]
    spans: list[tuple[int, int]] = []
    pos = 0
    while pos < len(text):
        idx = text.find(sep, pos)
        end = len(text) if idx == -1 else idx + len(sep)
        piece = text[pos:end]
        if len(piece) > max_len:
            spans.extend(_split_pieces(piece, start + pos, max_len, rest))
        elif piece:
            spans.append((start + pos, start + end))
        pos = end
    return spans


def split_with_offsets(text: str, chunk_size: int, overlap: int) -> list[tuple[int, int]]:
    """Chunk spans (start, end) into `text`, each <= chunk_size, overlapping by <= overlap."""
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")
    overlap = max(0, min(overlap, chunk_size - 1))
    pieces = _split_pieces(text, 0, chunk_size, SEPARATORS)
    chunks: list[tuple[int, int]] = []
    window: list[tuple[int, int]] = []

    def window_len() -> int:
        return window[-1][1] - window[0][0] if window else 0

    for piece in pieces:
        if window and piece[1] - window[0][0] > chunk_size:
            chunks.append((window[0][0], window[-1][1]))
            # Keep only the tail that fits in the overlap budget (and leaves room for `piece`).
            while window and (window_len() > overlap or piece[1] - window[0][0] > chunk_size):
                window.pop(0)
        window.append(piece)
    if window:
        last = (window[0][0], window[-1][1])
        # A trailing window made only of overlap already covered by the previous chunk adds nothing.
        if not chunks or last[1] > chunks[-1][1]:
            chunks.append(last)
    return chunks


def chunk_pages(pages: list[PageText]) -> list[Chunk]:
    """Chunk page-based text, recording which page(s) each chunk spans."""
    s = get_settings()
    parts: list[str] = []
    bounds: list[tuple[int, int]] = []  # (start offset of page, page number)
    offset = 0
    for page in pages:
        text = page.text.strip()
        if not text:
            continue
        bounds.append((offset, page.page))
        parts.append(text)
        offset += len(text) + len(PAGE_JOINER)
    full = PAGE_JOINER.join(parts)
    starts = [b[0] for b in bounds]

    def page_at(pos: int) -> int:
        return bounds[max(bisect_right(starts, pos) - 1, 0)][1]

    chunks: list[Chunk] = []
    for start, end in split_with_offsets(full, s.chunk_size, s.chunk_overlap):
        raw = full[start:end]
        content = raw.strip()
        if not content:
            continue
        lead = len(raw) - len(raw.lstrip())
        first = start + lead
        last = first + len(content) - 1
        chunks.append(Chunk(content, page_at(first), page_at(last)))
    return chunks


def render_csv_row(index: int, row: dict[str, str]) -> str:
    lines = [f"Row {index}"] + [f"{k}: {v}" for k, v in row.items() if v != ""]
    return "\n".join(lines)[:MAX_CSV_ROW_CHARS]


def csv_schema_summary(file_name: str, schema: dict[str, Any]) -> str:
    cols = ", ".join(f"{c['name']} ({c['type']})" for c in schema["columns"])
    return f"CSV file {file_name}: {schema['row_count']} rows. Columns: {cols}."


def chunk_csv(file_name: str, data: CsvData) -> list[Chunk]:
    """One schema-summary chunk, then batches of rows rendered as `column: value` lines."""
    limit = get_settings().csv_rows_per_chunk_chars
    chunks = [Chunk(csv_schema_summary(file_name, data.schema), None, None)]
    batch: list[str] = []
    size = 0
    for i, row in enumerate(data.rows, start=1):
        rendered = render_csv_row(i, row)
        if batch and size + len(rendered) > limit:
            chunks.append(Chunk("\n\n".join(batch), None, None))
            batch, size = [], 0
        batch.append(rendered)
        size += len(rendered) + 2
    if batch:
        chunks.append(Chunk("\n\n".join(batch), None, None))
    return chunks
