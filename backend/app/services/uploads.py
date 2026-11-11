"""Stream a multipart upload to a temp file with a hard byte cap.

FastAPI's `UploadFile` would let Starlette spool the *entire* body before our code runs, so
an oversized upload would be fully received first. Here the request body is fed through
python-multipart's parser chunk by chunk: bytes go straight to a temp file, the SHA-256 is
computed on the fly, and the request is aborted with 413 the moment the cap is crossed.
"""

import contextlib
import hashlib
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import IO

from fastapi import Request
from python_multipart.multipart import MultipartParser, parse_options_header

from app.config import get_settings
from app.errors import ApiError, ErrorCode

# Multipart framing (boundaries, part headers) adds a little on top of the file bytes.
ENVELOPE_SLACK_BYTES = 64 * 1024


@dataclass
class ReceivedUpload:
    path: Path
    file_name: str
    size: int
    sha256: str

    def cleanup(self) -> None:
        with contextlib.suppress(OSError):
            self.path.unlink()


def clean_client_file_name(raw: str) -> str:
    """Drop any client-side directory part, control characters and overlong names."""
    name = raw.replace("\\", "/").rsplit("/", 1)[-1]
    name = "".join(ch for ch in name if ch.isprintable()).strip()
    return name[:255] or "document"


class _Sink:
    """Parser callbacks: write the target file part to disk, hash it, enforce the cap."""

    def __init__(self, out: IO[bytes], field_name: str, max_bytes: int) -> None:
        self.out = out
        self.field_name = field_name
        self.max_bytes = max_bytes
        self.digest = hashlib.sha256()
        self.total_bytes = 0  # every part, including non-file fields
        self.file_bytes = 0
        self.file_name = ""
        self.got_file = False
        self._writing = False
        self._field = b""
        self._value = b""
        self._headers: dict[bytes, bytes] = {}

    def on_header_field(self, data: bytes, start: int, end: int) -> None:
        self._field += data[start:end]

    def on_header_value(self, data: bytes, start: int, end: int) -> None:
        self._value += data[start:end]

    def on_header_end(self) -> None:
        self._headers[self._field.lower()] = self._value
        self._field, self._value = b"", b""

    def on_headers_finished(self) -> None:
        _, disposition = parse_options_header(self._headers.get(b"content-disposition", b""))
        self._headers = {}
        name = disposition.get(b"name", b"").decode("utf-8", "replace")
        self._writing = name == self.field_name and b"filename" in disposition and not self.got_file
        if self._writing:
            self.file_name = disposition[b"filename"].decode("utf-8", "replace")

    def on_part_data(self, data: bytes, start: int, end: int) -> None:
        size = end - start
        self.total_bytes += size
        if self.total_bytes > self.max_bytes + ENVELOPE_SLACK_BYTES:
            raise ApiError(ErrorCode.FILE_TOO_LARGE)
        if not self._writing:
            return
        self.file_bytes += size
        if self.file_bytes > self.max_bytes:
            raise ApiError(ErrorCode.FILE_TOO_LARGE)
        chunk = data[start:end]
        self.digest.update(chunk)
        self.out.write(chunk)

    def on_part_end(self) -> None:
        if self._writing:
            self._writing = False
            self.got_file = True

    def callbacks(self) -> dict[str, object]:
        return {
            "on_header_field": self.on_header_field,
            "on_header_value": self.on_header_value,
            "on_header_end": self.on_header_end,
            "on_headers_finished": self.on_headers_finished,
            "on_part_data": self.on_part_data,
            "on_part_end": self.on_part_end,
        }


async def receive_upload(request: Request, field_name: str = "file") -> ReceivedUpload:
    """Receive the single file in the `file` form field. Raises ApiError (413 / 422)."""
    max_bytes = get_settings().max_upload_bytes

    mime, params = parse_options_header(request.headers.get("content-type", ""))
    boundary = params.get(b"boundary")
    if mime != b"multipart/form-data" or not boundary:
        raise ApiError(ErrorCode.VALIDATION_ERROR, "Expected a multipart/form-data upload.")

    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > max_bytes + ENVELOPE_SLACK_BYTES:
        raise ApiError(ErrorCode.FILE_TOO_LARGE)  # reject before reading a byte of the body

    fd, tmp_name = tempfile.mkstemp(prefix="docgenie-upload-")
    tmp_path = Path(tmp_name)
    out = os.fdopen(fd, "wb")
    sink = _Sink(out, field_name, max_bytes)
    parser = MultipartParser(boundary, sink.callbacks())  # type: ignore[arg-type]
    try:
        try:
            async for chunk in request.stream():
                parser.write(chunk)
            parser.finalize()
        finally:
            out.close()
    except ApiError:
        tmp_path.unlink(missing_ok=True)
        raise
    except Exception as exc:  # malformed multipart body, client disconnect, ...
        tmp_path.unlink(missing_ok=True)
        raise ApiError(ErrorCode.VALIDATION_ERROR, "The upload could not be read.") from exc

    if not sink.got_file or sink.file_bytes == 0:
        tmp_path.unlink(missing_ok=True)
        raise ApiError(ErrorCode.VALIDATION_ERROR, "No file was uploaded in the 'file' field.")
    return ReceivedUpload(
        path=tmp_path,
        file_name=clean_client_file_name(sink.file_name),
        size=sink.file_bytes,
        sha256=sink.digest.hexdigest(),
    )
