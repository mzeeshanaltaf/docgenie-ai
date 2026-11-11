"""Response shapes for the document endpoints (the contract Phase 5 / 7 build against).

`storage_key` and `checksum` are internal and never returned.
"""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

DocumentStatus = Literal["processing", "ready", "failed"]


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    file_name: str
    mime_type: str
    file_size: int
    num_pages: int | None  # null for CSV
    status: DocumentStatus
    error_code: str | None  # set when status == "failed" (IngestionErrorCode values)
    ocr_used: bool
    csv_schema: dict[str, Any] | None  # {columns: [{name, type, sample}], row_count, delimiter}
    created_at: datetime


class DocumentListOut(BaseModel):
    documents: list[DocumentOut]
