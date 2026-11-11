from app.config import Settings, normalize_async_url


def test_defaults_match_plan():
    s = Settings(_env_file=None)
    assert (s.chat_model, s.chat_reasoning_effort, s.chat_service_tier) == ("gpt-6-luna", "medium", "default")
    assert (s.max_upload_mb, s.max_pages, s.max_csv_rows) == (20, 50, 10000)
    assert (s.chunk_size, s.chunk_overlap, s.retrieval_top_k, s.rrf_k, s.history_window) == (1000, 200, 8, 60, 20)
    assert (s.signup_doc_credits, s.signup_message_credits) == (5, 25)
    assert s.agent_max_steps == 8 and s.embedding_dim == 1536 and s.txt_words_per_page == 500
    assert s.max_upload_bytes == 20 * 1024 * 1024


def test_env_override(monkeypatch):
    monkeypatch.setenv("MAX_PAGES", "7")
    assert Settings(_env_file=None).max_pages == 7


def test_database_url_normalised_for_asyncpg():
    assert normalize_async_url("postgres://u:p@h:5432/d") == "postgresql+asyncpg://u:p@h:5432/d"
    assert normalize_async_url("postgresql://u:p@h/d?sslmode=require") == "postgresql+asyncpg://u:p@h/d"
