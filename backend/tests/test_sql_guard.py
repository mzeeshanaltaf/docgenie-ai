"""query_table's SQL guard: the parser allowlist (no infrastructure) and real execution against
Postgres (isolation, read-only, timeout, row cap)."""

import pytest

from app.config import get_settings
from app.services import sql_guard
from app.services.sql_guard import SqlGuardError, rows_columns, run_query, validate_query
from tests.factories import make_document

SCHEMA = {
    "columns": [
        {"name": "Region", "type": "text", "sample": ["North"]},
        {"name": "Amount", "type": "number", "sample": ["10"]},
        {"name": "date", "type": "date", "sample": ["2024-01-01"]},
    ]
}
COLS = rows_columns(SCHEMA)

ALLOWED = [
    "SELECT * FROM rows",
    "select region, sum(amount) as total from rows group by region order by total desc",
    "SELECT COUNT(*) FROM rows WHERE amount > 10 AND region = 'a;b'",  # `;` inside a string
    "SELECT * FROM rows;",  # a trailing semicolon is fine
    "SELECT region, ROUND(AVG(amount), 2) FROM rows GROUP BY 1 HAVING COUNT(*) > 1",
    "SELECT row_num, SUM(amount) OVER (ORDER BY row_num) FROM rows",
    "SELECT * FROM rows WHERE amount > (SELECT AVG(amount) FROM rows)",
    "SELECT CASE WHEN amount > 5 THEN 'hi' ELSE 'lo' END, COALESCE(region, 'x') FROM rows",
    "SELECT DATE_TRUNC('month', CAST(date AS DATE)), SUM(amount) FROM rows GROUP BY 1",
    "SELECT a.region FROM rows a JOIN rows b ON a.row_num = b.row_num",
    "SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount) FROM rows",
    "SELECT region FROM rows WHERE region ILIKE '%a%' AND NOT (amount IS NULL)",
    "SELECT region || '-' || region, amount * 2 FROM rows",
]

REJECTED = [
    ("", "empty"),
    ("DROP TABLE rows", "single plain SELECT"),
    ("DELETE FROM rows", "single plain SELECT"),
    ("INSERT INTO rows VALUES (1)", "single plain SELECT"),
    ("UPDATE rows SET region = 'x'", "single plain SELECT"),
    ("COPY rows TO '/tmp/x'", "single plain SELECT"),
    ("SET statement_timeout = 0", "single plain SELECT"),
    ("SELECT 1; DROP TABLE documents", "exactly one"),
    ("SELECT 1; SELECT 2", "exactly one"),
    ("SELECT * FROM documents", "`rows`"),
    ("SELECT * FROM document_rows", "`rows`"),
    ("SELECT * FROM document_genie.documents", "unqualified"),
    ("SELECT * FROM public.rows", "unqualified"),
    ("SELECT * FROM pg_catalog.pg_user", "unqualified"),
    ('SELECT * FROM "user"', "`rows`"),
    ("SELECT (SELECT string_agg(email, ',') FROM \"user\")", "`rows`"),
    ("SELECT * FROM (SELECT * FROM pg_user) q", "`rows`"),
    ("SELECT * FROM rows UNION SELECT * FROM documents", "single plain SELECT"),
    ("WITH x AS (SELECT 1) SELECT * FROM x", "WITH"),
    ("SELECT * INTO newtab FROM rows", "INTO"),
    ("SELECT * FROM rows FOR UPDATE", "LOCK"),
    ("SELECT * FROM rows WHERE region = $1", "not allowed"),
    ("SELECT * FROM rows WHERE region = :x", "not allowed"),
    # functions that escape the rows relation or have side effects
    ("SELECT pg_read_file('/etc/passwd')", "pg_read_file"),
    ("SELECT pg_sleep(10)", "pg_sleep"),
    ("SELECT set_config('x', 'y', false)", "set_config"),
    ("SELECT current_setting('server_version')", "current_setting"),
    ("SELECT version()", "not allowed"),
    ("SELECT dblink('host=x', 'select 1')", "dblink"),
    ("SELECT lo_import('/etc/passwd')", "lo_import"),
    ("SELECT nextval('some_seq')", "nextval"),
    ("SELECT query_to_xml('select * from documents', true, true, '')", "query_to_xml"),
    ("SELECT * FROM rows, pg_ls_dir('/')", "`rows`"),
    ("SELECT * FROM generate_series(1, 1000000000)", "`rows`"),
    ("SELECT current_user", "not allowed"),
    ("SELECT user", "not available"),
    ("SELECT session_user", "not allowed"),
]


@pytest.mark.parametrize("sql", ALLOWED)
def test_allows_plain_selects_over_rows(sql):
    out = validate_query(sql, COLS)
    assert out.upper().startswith("SELECT")


@pytest.mark.parametrize(("sql", "why"), REJECTED)
def test_rejects_unsafe_sql(sql, why):
    with pytest.raises(SqlGuardError) as exc:
        validate_query(sql, COLS)
    assert why.lower() in str(exc.value).lower()


def test_rejects_overlong_sql():
    with pytest.raises(SqlGuardError):
        validate_query("SELECT '" + "a" * 5000 + "' FROM rows", COLS)


def test_executed_sql_is_regenerated_from_the_ast_not_the_raw_text():
    out = validate_query("SELECT region FROM rows -- ; DROP TABLE documents", COLS)
    assert "DROP" not in out.upper().replace("/* ; DROP TABLE DOCUMENTS */", "")


def test_unquoted_references_are_matched_to_header_case():
    out = validate_query("SELECT amount FROM rows WHERE region = 'x'", COLS)
    assert '"Amount"' in out and '"Region"' in out


def test_duplicate_and_reserved_headers_get_unique_column_names():
    cols = rows_columns(
        {"columns": [{"name": "row_num", "type": "text"}, {"name": "ROW_NUM", "type": "text"}]}
    )
    names = [c.name.lower() for c in cols]
    assert len(names) == len(set(names)) == 3


# --- execution against Postgres ----------------------------------------------------------------

ROWS = [
    {"Region": "North", "Amount": "10", "date": "2024-01-05"},
    {"Region": "North", "Amount": "20.5", "date": "2024-02-10"},
    {"Region": "South", "Amount": "n/a", "date": "2024-03-15"},  # dirty numeric cell
    {"Region": "South", "Amount": "5", "date": "2024-03-20"},
]


async def test_query_runs_with_typed_numeric_columns(infra, user_id):
    doc = await make_document(user_id, csv_rows=ROWS)
    schema = {
        "columns": [
            {"name": "Region", "type": "text"},
            {"name": "Amount", "type": "number"},
            {"name": "date", "type": "date"},
        ]
    }
    res = await run_query(
        user_id=user_id,
        document_id=doc,
        csv_schema=schema,
        sql="SELECT region, SUM(amount) AS total, COUNT(*) AS n FROM rows "
        "GROUP BY region ORDER BY region",
    )
    assert res.columns == ["Region", "total", "n"]
    # "n/a" became NULL instead of raising, so South sums only the 5.
    assert res.rows == [["North", 30.5, 2], ["South", 5, 2]]
    assert not res.truncated


async def test_row_cap_and_truncation_flag(infra, user_id, monkeypatch):
    monkeypatch.setattr(get_settings(), "query_max_rows", 2)
    doc = await make_document(user_id, csv_rows=ROWS)
    res = await run_query(
        user_id=user_id,
        document_id=doc,
        csv_schema={"columns": [{"name": c, "type": "text"} for c in ROWS[0]]},
        sql="SELECT * FROM rows ORDER BY row_num",
    )
    assert res.row_count == 2 and res.truncated
    assert [r[0] for r in res.rows] == [1, 2]


async def test_another_users_rows_are_never_visible(infra, user_id):
    doc = await make_document(user_id, csv_rows=ROWS)
    schema = {"columns": [{"name": c, "type": "text"} for c in ROWS[0]]}
    # Even handed the owner's document id, a different user id sees nothing: the CTE filters on both.
    res = await run_query(
        user_id="someone_else", document_id=doc, csv_schema=schema, sql="SELECT * FROM rows"
    )
    assert res.rows == []


async def test_database_enforces_read_only_even_if_the_guard_is_bypassed(
    infra, user_id, monkeypatch
):
    doc = await make_document(user_id, csv_rows=ROWS)
    # nextval() writes, so it fails in a READ ONLY transaction. Simulate a guard bug by skipping
    # validation: the transaction mode is the second line of defence.
    monkeypatch.setattr(sql_guard, "validate_query", lambda sql, cols: sql)
    with pytest.raises(SqlGuardError) as exc:
        await run_query(
            user_id=user_id,
            document_id=doc,
            csv_schema={"columns": [{"name": "Region", "type": "text"}]},
            sql="SELECT nextval('document_chunks_id_seq')",
        )
    assert "read-only" in str(exc.value).lower()


async def test_runaway_query_is_cancelled_by_the_statement_timeout(infra, user_id, monkeypatch):
    monkeypatch.setattr(get_settings(), "query_timeout_ms", 300)
    doc = await make_document(user_id, csv_rows=ROWS)
    monkeypatch.setattr(sql_guard, "validate_query", lambda sql, cols: sql)
    with pytest.raises(SqlGuardError) as exc:
        await run_query(
            user_id=user_id,
            document_id=doc,
            csv_schema={"columns": [{"name": "Region", "type": "text"}]},
            sql="SELECT pg_sleep(5) FROM rows",
        )
    assert "too long" in str(exc.value)


async def test_sql_errors_come_back_as_readable_messages(infra, user_id):
    doc = await make_document(user_id, csv_rows=ROWS)
    with pytest.raises(SqlGuardError) as exc:
        await run_query(
            user_id=user_id,
            document_id=doc,
            csv_schema={"columns": [{"name": "Region", "type": "text"}]},
            sql="SELECT nonexistent_column FROM rows",
        )
    assert "nonexistent_column" in str(exc.value)
