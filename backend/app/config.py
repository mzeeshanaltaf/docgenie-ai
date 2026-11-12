"""Every tunable lives here. Override any value through the environment or backend/.env."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent

# (model, service_tier) -> (USD per 1M input tokens, USD per 1M output tokens).
# Placeholder values: fill in real prices before relying on cost_usd. A missing
# entry means cost is recorded as null rather than guessed.
PRICING: dict[tuple[str, str], tuple[float, float]] = {
    # Embeddings have no service tier; "default" is the key used when logging them.
    ("text-embedding-3-small", "default"): (0.02, 0.0),
    # gpt-6-luna prices are not filled in yet (Phase 3): its cost is logged as null.
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- LLM ---
    chat_model: str = "gpt-6-luna"
    chat_reasoning_effort: str = "medium"
    chat_service_tier: str = "default"  # "flex" is opt-in; it 429s often (see FLEX_FALLBACK_TIER)
    title_model: str = "gpt-6-luna"
    ocr_model: str = "gpt-6-luna"
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = 1536
    llm_timeout_s: float = 900.0  # flex tier can queue for a long time
    flex_fallback_tier: str = "default"  # only relevant if CHAT_SERVICE_TIER=flex
    agent_max_steps: int = 8
    # USD per 1M tokens for the chat/title/OCR model (gpt-6-luna has no public price known to this
    # repo). Unset -> `llm_usage.cost_usd` stays NULL. `flex_price_multiplier` scales these for the
    # flex tier (flex is billed at a discount).
    llm_input_price_per_m: float | None = None
    llm_output_price_per_m: float | None = None
    flex_price_multiplier: float = 0.5
    title_max_chars: int = 60

    # --- Limits ---
    max_upload_mb: int = 20
    max_pages: int = 50
    max_csv_rows: int = 10000
    max_extracted_chars: int = 2_000_000
    allowed_mime_types: list[str] = Field(
        default_factory=lambda: [
            "application/pdf",
            "text/plain",
            "text/csv",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ]
    )
    txt_words_per_page: int = 500

    # --- Ingestion ---
    # A PDF whose extracted text averages fewer characters per page than this is treated as
    # scanned and sent through OCR.
    ocr_min_chars_per_page: int = 25
    ocr_reasoning_effort: str = "low"
    ocr_render_scale: float = 2.0  # pdfium scale; 2.0 is roughly 144 dpi
    ocr_concurrency: int = 4
    embedding_batch_size: int = 64
    csv_rows_per_chunk_chars: int = 1500  # soft size of a batch of CSV rows (one embedding)
    # A `processing` document older than this is considered stranded by a crash and is failed
    # and refunded by the sweep (run at startup and every INGESTION_SWEEP_INTERVAL_S).
    # Keep it well above the longest legitimate ingestion (a 50-page OCR job takes minutes):
    # the database may be shared with another running backend instance.
    ingestion_stale_minutes: int = 10
    ingestion_sweep_interval_s: int = 300

    # --- Retrieval ---
    chunk_size: int = 1000
    chunk_overlap: int = 200
    retrieval_top_k: int = 8
    rrf_k: int = 60
    history_window: int = 20
    retrieval_candidates: int = 30  # per ranking (semantic / keyword) before fusion
    snippet_chars: int = 240  # citation snippet length

    # --- Agent tools ---
    doc_text_max_tokens: int = 25_000  # get_document_text truncation budget (about 4 chars/token)
    query_max_rows: int = 100  # query_table result cap
    query_timeout_ms: int = 5000  # query_table statement_timeout
    tool_result_max_chars: int = 24_000  # hard cap on any tool output sent back to the model

    # --- Credits ---
    signup_doc_credits: int = 5
    signup_message_credits: int = 25

    # --- Infra ---
    database_url: str = ""
    openai_api_key: str = ""
    s3_endpoint: str = ""
    s3_bucket: str = "docgenie"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_region: str = "us-east-1"
    internal_api_key: str = ""
    resend_api_key: str = ""
    contact_notify_email: str = ""

    db_schema: str = "document_genie"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @computed_field  # type: ignore[prop-decorator]
    @property
    def async_database_url(self) -> str:
        """DATABASE_URL is shared with Next.js (postgres://...). Normalise it for asyncpg."""
        return normalize_async_url(self.database_url)


def normalize_async_url(url: str) -> str:
    """Convert a libpq-style URL to an asyncpg SQLAlchemy URL and drop query params
    (sslmode etc.) that asyncpg does not understand."""
    if not url:
        return url
    for prefix in ("postgresql+asyncpg://", "postgres://", "postgresql://"):
        if url.startswith(prefix):
            url = "postgresql+asyncpg://" + url[len(prefix) :]
            break
    return url.split("?", 1)[0]


@lru_cache
def get_settings() -> Settings:
    return Settings()
