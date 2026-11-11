"""API errors. Bodies keep the legacy shape: {success, status, message, details}.

Later phases raise `ApiError(ErrorCode.X)` (or a subclass helper) and never build
JSON error responses by hand.
"""

from enum import StrEnum
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ErrorCode(StrEnum):
    INSUFFICIENT_CREDITS = "INSUFFICIENT_CREDITS"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    DUPLICATE_DOCUMENT = "DUPLICATE_DOCUMENT"
    PAGE_LIMIT_EXCEEDED = "PAGE_LIMIT_EXCEEDED"
    ROWS_LIMIT_EXCEEDED = "ROWS_LIMIT_EXCEEDED"
    UNSUPPORTED_TYPE = "UNSUPPORTED_TYPE"
    NO_TEXT_FOUND = "NO_TEXT_FOUND"
    STORAGE_UNAVAILABLE = "STORAGE_UNAVAILABLE"
    # generic codes
    UNAUTHORIZED = "UNAUTHORIZED"
    NOT_FOUND = "NOT_FOUND"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    INTERNAL_ERROR = "INTERNAL_ERROR"


ERROR_HTTP_STATUS: dict[ErrorCode, int] = {
    ErrorCode.INSUFFICIENT_CREDITS: 402,
    ErrorCode.FILE_TOO_LARGE: 413,
    ErrorCode.DUPLICATE_DOCUMENT: 409,
    ErrorCode.PAGE_LIMIT_EXCEEDED: 400,
    ErrorCode.ROWS_LIMIT_EXCEEDED: 400,
    ErrorCode.UNSUPPORTED_TYPE: 415,
    ErrorCode.NO_TEXT_FOUND: 422,
    ErrorCode.STORAGE_UNAVAILABLE: 503,
    ErrorCode.UNAUTHORIZED: 401,
    ErrorCode.NOT_FOUND: 404,
    ErrorCode.VALIDATION_ERROR: 422,
    ErrorCode.INTERNAL_ERROR: 500,
}

DEFAULT_MESSAGES: dict[ErrorCode, str] = {
    ErrorCode.INSUFFICIENT_CREDITS: "You have no credits left for this action.",
    ErrorCode.FILE_TOO_LARGE: "The file exceeds the maximum upload size.",
    ErrorCode.DUPLICATE_DOCUMENT: "This document has already been uploaded.",
    ErrorCode.PAGE_LIMIT_EXCEEDED: "The document exceeds the maximum page count.",
    ErrorCode.ROWS_LIMIT_EXCEEDED: "The file exceeds the maximum number of rows.",
    ErrorCode.UNSUPPORTED_TYPE: "This file type is not supported.",
    ErrorCode.NO_TEXT_FOUND: "No text could be extracted from this document.",
    ErrorCode.STORAGE_UNAVAILABLE: "File storage is temporarily unavailable. Please try again.",
    ErrorCode.UNAUTHORIZED: "Unauthorized.",
    ErrorCode.NOT_FOUND: "Not found.",
    ErrorCode.VALIDATION_ERROR: "The request is invalid.",
    ErrorCode.INTERNAL_ERROR: "Something went wrong.",
}


class IngestionErrorCode(StrEnum):
    """Values stored in `documents.error_code` when a document ends up `failed`.

    These are not HTTP errors (the upload already returned 202); the frontend maps them to
    readable messages. `NO_TEXT_FOUND` deliberately matches the `ErrorCode` string.
    """

    NO_TEXT_FOUND = "NO_TEXT_FOUND"  # nothing extractable, even after OCR
    PARSE_FAILED = "PARSE_FAILED"  # the file could not be read or decoded
    OCR_FAILED = "OCR_FAILED"  # the vision model call failed for a scanned PDF
    EMBEDDING_FAILED = "EMBEDDING_FAILED"  # the embeddings call failed
    STORAGE_FAILED = "STORAGE_FAILED"  # the original file could not be stored
    TEXT_TOO_LARGE = "TEXT_TOO_LARGE"  # extracted text exceeded MAX_EXTRACTED_CHARS
    PROCESSING_INTERRUPTED = "PROCESSING_INTERRUPTED"  # backend restarted/crashed mid-ingest
    INTERNAL_ERROR = "INTERNAL_ERROR"  # anything unexpected


class IngestionError(Exception):
    """Raised inside the ingestion pipeline to fail a document with a specific code."""

    def __init__(self, code: IngestionErrorCode, message: str = "") -> None:
        self.code = code
        super().__init__(message or code.value)


class ApiError(Exception):
    """Raise from anywhere in a request; the handler below renders it."""

    def __init__(
        self,
        code: ErrorCode,
        message: str | None = None,
        details: Any = None,
        status_code: int | None = None,
    ) -> None:
        self.code = code
        self.message = message or DEFAULT_MESSAGES[code]
        self.details = details
        self.status_code = status_code or ERROR_HTTP_STATUS[code]
        super().__init__(self.message)


def error_body(code: str, message: str, details: Any = None) -> dict[str, Any]:
    return {"success": False, "status": code, "message": message, "details": details}


def _response(status_code: int, code: str, message: str, details: Any = None) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=error_body(code, message, details))


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return _response(exc.status_code, exc.code.value, exc.message, exc.details)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {401: "UNAUTHORIZED", 404: "NOT_FOUND"}.get(exc.status_code, f"HTTP_{exc.status_code}")
        return _response(exc.status_code, code, str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]} for e in exc.errors()
        ]
        return _response(422, ErrorCode.VALIDATION_ERROR.value, DEFAULT_MESSAGES[ErrorCode.VALIDATION_ERROR], details)

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        import logging

        logging.getLogger("docgenie").exception("Unhandled error", exc_info=exc)
        return _response(500, ErrorCode.INTERNAL_ERROR.value, DEFAULT_MESSAGES[ErrorCode.INTERNAL_ERROR])
