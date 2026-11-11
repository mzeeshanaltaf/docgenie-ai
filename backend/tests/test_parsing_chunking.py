"""Pure unit tests (no database, no MinIO, no network)."""

import itertools

import pytest

from app.errors import ApiError, ErrorCode
from app.services import parsing
from app.services.chunking import chunk_csv, chunk_pages, split_with_offsets
from app.services.parsing import PageText
from tests import factories


def write(tmp_path, name: str, data: bytes):
    p = tmp_path / name
    p.write_bytes(data)
    return p


# --- type detection ---------------------------------------------------------


def test_detects_each_supported_type(tmp_path):
    cases = [
        ("a.pdf", factories.text_pdf(), parsing.PDF),
        ("b.docx", factories.docx_bytes(), parsing.DOCX),
        ("c.txt", factories.txt_bytes(50), parsing.TXT),
        ("d.csv", factories.csv_bytes(), parsing.CSV),
    ]
    for name, data, kind in cases:
        assert parsing.detect_type(write(tmp_path, name, data), name).kind == kind


def test_pdf_detected_by_magic_not_extension(tmp_path):
    p = write(tmp_path, "report.bin", factories.text_pdf())
    assert parsing.detect_type(p, "report.bin").kind == parsing.PDF


def test_renamed_binary_is_rejected(tmp_path):
    binary = bytes(range(256)) * 20
    for name in ("fake.csv", "fake.txt", "fake.pdf", "fake.docx"):
        with pytest.raises(ApiError) as exc:
            parsing.detect_type(write(tmp_path, name, binary), name)
        assert exc.value.code == ErrorCode.UNSUPPORTED_TYPE


def test_unknown_text_extension_and_non_docx_zip_rejected(tmp_path):
    import io
    import zipfile

    with pytest.raises(ApiError):
        parsing.detect_type(write(tmp_path, "notes.md", b"# hello"), "notes.md")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("xl/workbook.xml", "<x/>")
    with pytest.raises(ApiError) as exc:
        parsing.detect_type(write(tmp_path, "sheet.docx", buf.getvalue()), "sheet.docx")
    assert exc.value.code == ErrorCode.UNSUPPORTED_TYPE


def test_empty_file_rejected(tmp_path):
    with pytest.raises(ApiError):
        parsing.detect_type(write(tmp_path, "e.txt", b""), "e.txt")


# --- counting / limits ------------------------------------------------------


def test_page_counts(tmp_path):
    pdf = write(tmp_path, "a.pdf", factories.text_pdf(pages=3))
    assert parsing.count_document(parsing.PDF, pdf).num_pages == 3
    txt = write(tmp_path, "a.txt", factories.txt_bytes(1200))  # 1201 words / 500
    assert parsing.count_document(parsing.TXT, txt).num_pages == 3
    docx = write(tmp_path, "a.docx", factories.docx_bytes())
    assert parsing.count_document(parsing.DOCX, docx).num_pages >= 1


def test_page_limit_enforced(tmp_path, monkeypatch):
    monkeypatch.setenv("MAX_PAGES", "2")
    from app.config import get_settings

    get_settings.cache_clear()
    try:
        pdf = write(tmp_path, "a.pdf", factories.text_pdf(pages=3))
        with pytest.raises(ApiError) as exc:
            parsing.count_document(parsing.PDF, pdf)
        assert exc.value.code == ErrorCode.PAGE_LIMIT_EXCEEDED
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()


def test_csv_row_limit_enforced(tmp_path, monkeypatch):
    monkeypatch.setenv("MAX_CSV_ROWS", "3")
    from app.config import get_settings

    get_settings.cache_clear()
    try:
        csv_path = write(tmp_path, "a.csv", factories.csv_bytes(rows=5))
        with pytest.raises(ApiError) as exc:
            parsing.count_document(parsing.CSV, csv_path)
        assert exc.value.code == ErrorCode.ROWS_LIMIT_EXCEEDED
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()


def test_encrypted_or_corrupt_pdf_rejected(tmp_path):
    p = write(tmp_path, "bad.pdf", b"%PDF-1.4\nthis is not really a pdf")
    with pytest.raises(ApiError) as exc:
        parsing.count_document(parsing.PDF, p)
    assert exc.value.code == ErrorCode.UNSUPPORTED_TYPE


# --- extraction -------------------------------------------------------------


def test_text_pdf_extracts_and_does_not_need_ocr(tmp_path):
    p = write(tmp_path, "a.pdf", factories.text_pdf(pages=2, marker="zebra"))
    pages = parsing.extract_pdf_pages(p)
    assert [pg.page for pg in pages] == [1, 2]
    assert "zebra" in pages[0].text
    assert not parsing.pdf_needs_ocr(pages)


def test_scanned_pdf_needs_ocr(tmp_path):
    p = write(tmp_path, "scan.pdf", factories.scanned_pdf(pages=2))
    pages = parsing.extract_pdf_pages(p)
    assert parsing.pdf_needs_ocr(pages)


def test_docx_extracts_paragraphs_and_tables(tmp_path):
    p = write(tmp_path, "a.docx", factories.docx_bytes(paragraphs=10))
    pages = parsing.extract_docx_pages(p, 2)
    joined = "\n".join(pg.text for pg in pages)
    assert "revenue grew steadily" in joined
    assert "Region | Sales" in joined and "North | 1200" in joined
    assert {pg.page for pg in pages} <= {1, 2}


def test_csv_parsing_handles_quotes_and_odd_headers(tmp_path):
    raw = b'id,,id,note\n1,x,y,"He said ""hi"", ok"\n\n2,short\n'
    data = parsing.parse_csv(write(tmp_path, "a.csv", raw))
    assert data.headers == ["id", "column_2", "id_2", "note"]
    assert len(data.rows) == 2  # the blank line is dropped
    assert data.rows[0]["note"] == 'He said "hi", ok'
    assert data.rows[1]["id_2"] == "" and data.rows[1]["note"] == ""  # short row padded
    assert data.schema["row_count"] == 2


def test_csv_sniffs_semicolon_and_infers_types(tmp_path):
    raw = b"id;price;day\n1;2.5;2026-01-02\n2;3.5;2026-02-03\n"
    data = parsing.parse_csv(write(tmp_path, "a.csv", raw))
    types = {c["name"]: c["type"] for c in data.schema["columns"]}
    assert types == {"id": "integer", "price": "number", "day": "date"}


def test_cp1252_csv_decodes(tmp_path):
    data = parsing.parse_csv(write(tmp_path, "a.csv", "name,city\nJosé,Zürich\n".encode("cp1252")))
    assert data.rows[0] == {"name": "José", "city": "Zürich"}


# --- chunking ---------------------------------------------------------------


def test_chunks_respect_size_overlap_and_cover_the_text():
    text = " ".join(f"sentence number {i} is here." for i in range(400))
    spans = split_with_offsets(text, 1000, 200)
    assert all(e - s <= 1000 for s, e in spans)
    assert spans[0][0] == 0 and spans[-1][1] == len(text)
    for (_, prev_end), (next_start, _) in itertools.pairwise(spans):
        assert next_start < prev_end  # consecutive chunks overlap
        assert prev_end - next_start <= 200


def test_unbroken_text_is_hard_split():
    spans = split_with_offsets("x" * 2500, 1000, 200)
    assert all(e - s <= 1000 for s, e in spans)
    assert spans[-1][1] == 2500


def test_chunks_carry_page_numbers():
    pages = [
        PageText(1, "Alpha paragraph. " * 20),
        PageText(2, "Beta paragraph. " * 20),
        PageText(3, "Gamma paragraph. " * 20),
    ]
    chunks = chunk_pages(pages)
    assert chunks[0].page_start == 1 and chunks[-1].page_end == 3
    assert all(1 <= c.page_start <= c.page_end <= 3 for c in chunks)
    # A chunk that begins in page 1's text and runs into page 2 spans both pages.
    assert any(c.page_start != c.page_end for c in chunks)
    for c in chunks:
        if "Beta" in c.content:
            assert c.page_start <= 2 <= c.page_end
        if "Gamma" in c.content:
            assert c.page_end == 3


def test_blank_pages_are_skipped():
    chunks = chunk_pages([PageText(1, "   "), PageText(2, "Real text here.")])
    assert len(chunks) == 1 and chunks[0].page_start == 2


def test_csv_chunks_have_schema_summary_then_row_batches(tmp_path):
    data = parsing.parse_csv(write(tmp_path, "a.csv", factories.csv_bytes(rows=40)))
    chunks = chunk_csv("a.csv", data)
    assert "40" in chunks[0].content or "41" in chunks[0].content
    assert "amount (number)" in chunks[0].content
    assert "name: Name 1" in chunks[1].content
    assert all(c.page_start is None for c in chunks)
    assert len(chunks) > 2  # rows were batched, not one giant chunk
