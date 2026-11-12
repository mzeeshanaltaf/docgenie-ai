"""Safe SQL over one CSV document (the `query_table` agent tool).

The model writes SQL against a virtual relation called `rows`. Defence in depth:

1. **Parse** with sqlglot (Postgres dialect). The text must be exactly one plain `SELECT`
   (no `WITH`, no `UNION`, no `INTO`, no locking clause, no placeholders).
2. **Allowlist**: the only relation is `rows` (unqualified), and every function must be on
   `ALLOWED_FUNCTIONS`. That blocks `pg_read_file`, `dblink`, `pg_sleep`, `set_config`,
   `query_to_xml('select ...')`, `current_setting`, set-returning functions in `FROM`, etc.
3. **Re-render**: what is executed is the SQL regenerated from the validated AST, never the
   model's raw text, so parser disagreements (comments, stray `;`) cannot smuggle anything in.
4. **Confine**: `rows` is a CTE over `document_rows` for exactly one `(document_id, user_id)`
   pair, and the CSV values are exposed as typed columns (numbers safely cast, so dirty cells
   become NULL instead of raising).
5. **Execute** in a `READ ONLY` transaction with `statement_timeout`, with the result wrapped in
   a hard row cap. Even a guard bug cannot write, and a runaway query is cancelled.

The CSV header names become column names (case preserved). Unquoted references are matched
case-insensitively to the headers so `SELECT amount FROM rows` works for a header `Amount`.
"""

import datetime as dt
import decimal
import uuid
from dataclasses import dataclass
from typing import Any

import sqlglot
from sqlglot import exp
from sqlglot.errors import SqlglotError

from app.config import get_settings
from app.db import get_sessionmaker

MAX_SQL_CHARS = 4000
ROW_NUM_COLUMN = "row_num"

# Function names (upper-case, as sqlglot renders `sql_name()` / the name of an anonymous call).
ALLOWED_FUNCTIONS: frozenset[str] = frozenset(
    {
        # aggregates
        "COUNT", "SUM", "AVG", "MIN", "MAX", "STDDEV", "STDDEV_POP", "STDDEV_SAMP", "VARIANCE",
        "VAR_POP", "VAR_SAMP", "STRING_AGG", "GROUP_CONCAT", "ARRAY_AGG", "BOOL_AND", "BOOL_OR",
        "PERCENTILE_CONT", "PERCENTILE_DISC", "MEDIAN", "QUANTILE", "APPROX_DISTINCT",
        # numeric
        "ROUND", "ABS", "CEIL", "CEILING", "FLOOR", "POWER", "POW", "SQRT", "MOD", "SIGN", "LN",
        "LOG", "EXP", "TRUNC", "GREATEST", "LEAST",
        # text
        "LOWER", "UPPER", "LENGTH", "CHAR_LENGTH", "TRIM", "LTRIM", "RTRIM", "SUBSTRING", "SUBSTR",
        "REPLACE", "CONCAT", "CONCAT_WS", "LEFT", "RIGHT", "SPLIT_PART", "INITCAP", "POSITION",
        "STRPOS", "STARTS_WITH", "REVERSE", "REPEAT", "LPAD", "RPAD",
        # conditional / conversion
        "COALESCE", "NULLIF", "IF", "CAST", "TRY_CAST", "EXISTS", "REGEXP_LIKE", "REGEXP_ILIKE",
        # dates (on text/date values only; no clock access)
        "DATE_TRUNC", "TIMESTAMP_TRUNC", "DATETIME_TRUNC", "EXTRACT", "TO_DATE", "TO_CHAR",
        # window
        "ROW_NUMBER", "RANK", "DENSE_RANK", "LAG", "LEAD", "FIRST_VALUE", "LAST_VALUE", "NTH_VALUE",
        "NTILE", "PERCENT_RANK", "CUME_DIST",
    }
)  # fmt: skip

# Bare keywords that Postgres evaluates as functions even without parentheses.
SPECIAL_VALUE_KEYWORDS: frozenset[str] = frozenset(
    {"user", "current_user", "session_user", "current_role", "current_schema", "current_catalog",
     "system_user"}
)  # fmt: skip

FORBIDDEN_NODES: tuple[type[exp.Expression], ...] = (
    exp.With,
    exp.Union,  # also covers INTERSECT / EXCEPT
    exp.Into,
    exp.Lock,
    exp.Placeholder,
    exp.Parameter,
    exp.SessionParameter,
    exp.Command,
    exp.Set,
    exp.Pragma,
    exp.Insert,
    exp.Update,
    exp.Delete,
    exp.Merge,
    exp.Create,
    exp.Drop,
    exp.Alter,
    exp.Copy,
    exp.Use,
)


OPERATOR_NODES: tuple[type[exp.Expression], ...] = (exp.Connector, exp.Case, exp.Not)


class SqlGuardError(Exception):
    """The query was rejected, or failed to run. The message is safe to show the model."""


@dataclass(frozen=True)
class RowsColumn:
    """One column of the virtual `rows` relation."""

    name: str  # exposed (quoted) column name
    key: str | None  # JSON key in `row_data` (None for the synthetic row number)
    type: str  # integer | number | date | boolean | text


@dataclass
class QueryResult:
    columns: list[str]
    rows: list[list[Any]]
    truncated: bool
    row_count: int


def rows_columns(csv_schema: dict[str, Any] | None) -> list[RowsColumn]:
    """The columns `rows` exposes: a 1-based `row_num`, then every CSV header (de-duplicated)."""
    cols = [RowsColumn(ROW_NUM_COLUMN, None, "integer")]
    used = {ROW_NUM_COLUMN.lower()}
    for col in (csv_schema or {}).get("columns", []):
        base = str(col["name"])
        name, n = base, 2
        while name.lower() in used:
            name = f"{base}_{n}"
            n += 1
        used.add(name.lower())
        cols.append(RowsColumn(name, base, str(col.get("type", "text"))))
    return cols


def validate_query(sql: str, columns: list[RowsColumn]) -> str:
    """Return the safe SQL to execute (regenerated from the AST), or raise SqlGuardError."""
    sql = (sql or "").strip().rstrip(";").strip()
    if not sql:
        raise SqlGuardError("The SQL is empty.")
    if len(sql) > MAX_SQL_CHARS:
        raise SqlGuardError(f"The SQL is too long (max {MAX_SQL_CHARS} characters).")
    try:
        statements = sqlglot.parse(sql, read="postgres")
    except SqlglotError as exc:
        raise SqlGuardError(f"The SQL could not be parsed: {_short(exc)}") from exc
    statements = [s for s in statements if s is not None]
    if len(statements) != 1:
        raise SqlGuardError("Send exactly one SELECT statement.")
    tree = statements[0]
    if not isinstance(tree, exp.Select):
        raise SqlGuardError("Only a single plain SELECT statement is allowed.")

    for node in tree.walk():
        if isinstance(node, FORBIDDEN_NODES):
            raise SqlGuardError(f"{type(node).__name__.upper()} is not allowed in the query.")
        if isinstance(node, exp.Table):
            _check_table(node)
        elif isinstance(node, exp.Func):
            _check_function(node)

    _normalise_columns(tree, columns)
    for column in tree.find_all(exp.Column):
        ident = column.this
        if (
            not column.table
            and isinstance(ident, exp.Identifier)
            and not ident.quoted
            and ident.name.lower() in SPECIAL_VALUE_KEYWORDS
        ):
            raise SqlGuardError(f"`{ident.name}` is not available.")

    try:
        return tree.sql(dialect="postgres")
    except SqlglotError as exc:
        raise SqlGuardError(f"The SQL could not be processed: {_short(exc)}") from exc


def _check_table(node: exp.Table) -> None:
    ident = node.this
    if not isinstance(ident, exp.Identifier):  # a function call used as a table
        raise SqlGuardError("Only the `rows` relation can be queried.")
    if node.args.get("db") or node.args.get("catalog"):
        raise SqlGuardError("Only the unqualified `rows` relation can be queried.")
    name = ident.name if ident.quoted else ident.name.lower()
    if name != "rows":
        raise SqlGuardError("Only the `rows` relation can be queried; use `FROM rows`.")


def _check_function(node: exp.Func) -> None:
    # sqlglot models some operators and constructs (AND/OR, CASE) as Func subclasses; they call
    # nothing, so they are not subject to the function allowlist.
    if isinstance(node, OPERATOR_NODES):
        return
    name = (node.name if isinstance(node, exp.Anonymous) else node.sql_name()).upper()
    if name not in ALLOWED_FUNCTIONS:
        raise SqlGuardError(f"The function `{name.lower()}` is not allowed.")


def _normalise_columns(tree: exp.Select, columns: list[RowsColumn]) -> None:
    """Quote unquoted column references that match a header case-insensitively."""
    exact = {c.name.lower(): c.name for c in columns}
    aliases = {a.alias.lower() for a in tree.find_all(exp.Alias) if a.alias}
    for column in tree.find_all(exp.Column):
        ident = column.this
        if not isinstance(ident, exp.Identifier) or ident.quoted:
            continue
        low = ident.name.lower()
        if low in exact and low not in aliases:
            column.set("this", exp.to_identifier(exact[low], quoted=True))


def _short(exc: Exception) -> str:
    return " ".join(str(exc).split())[:300]


def _quote(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


_NUMERIC_PATTERN = "^[+-]?([0-9]+[.]?[0-9]*|[.][0-9]+)([eE][+-]?[0-9]+)?$"


def build_rows_cte(columns: list[RowsColumn], first_param: int = 3) -> tuple[str, list[str]]:
    """The `rows` CTE body and the JSON keys it binds as $first_param, $first_param+1, ...

    $1 is the document id and $2 the user id (bound by the caller). Column names are
    quoted identifiers; JSON keys are bound parameters, never interpolated.
    """
    selects: list[str] = []
    keys: list[str] = []
    for col in columns:
        if col.key is None:
            selects.append(f"d.row_index AS {_quote(col.name)}")
            continue
        param = f"${first_param + len(keys)}::text"
        keys.append(col.key)
        value = f"d.row_data ->> {param}"
        if col.type in ("integer", "number"):
            # Dirty cells (the type was inferred from a sample) become NULL, not an error.
            selects.append(
                f"CASE WHEN {value} ~ '{_NUMERIC_PATTERN}' "
                f"THEN ({value})::numeric END AS {_quote(col.name)}"
            )
        else:
            selects.append(f"{value} AS {_quote(col.name)}")
    body = (
        f"SELECT {', '.join(selects)} FROM document_rows d "
        "WHERE d.document_id = $1 AND d.user_id = $2"
    )
    return body, keys


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, decimal.Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, (dt.date, dt.datetime, dt.time)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    return str(value)


async def run_query(
    *, user_id: str, document_id: uuid.UUID, csv_schema: dict[str, Any] | None, sql: str
) -> QueryResult:
    """Validate and run `sql` against one document's rows. The caller has already checked that
    the document belongs to `user_id` (and `user_id` is enforced again in the CTE)."""
    s = get_settings()
    columns = rows_columns(csv_schema)
    safe_sql = validate_query(sql, columns)
    cte_body, keys = build_rows_cte(columns)
    limit_param = 3 + len(keys)
    full_sql = (
        f"WITH rows AS ({cte_body}) "
        f"SELECT * FROM ({safe_sql}) AS q LIMIT ${limit_param}"
    )
    params = (document_id, user_id, *keys, s.query_max_rows + 1)

    async with get_sessionmaker()() as session:
        conn = await session.connection()
        try:
            # Must be the first statement of the transaction.
            await conn.exec_driver_sql("SET TRANSACTION READ ONLY")
            await conn.exec_driver_sql(f"SET LOCAL statement_timeout = {int(s.query_timeout_ms)}")
            result = await conn.exec_driver_sql(full_sql, params)
            names = list(result.keys())
            fetched = result.fetchall()
        except Exception as exc:
            await session.rollback()
            raise SqlGuardError(_db_message(exc)) from exc
        finally:
            await session.rollback()  # read-only: nothing to keep; ends the transaction

    truncated = len(fetched) > s.query_max_rows
    fetched = fetched[: s.query_max_rows]
    return QueryResult(
        columns=names,
        rows=[[_json_safe(v) for v in row] for row in fetched],
        truncated=truncated,
        row_count=len(fetched),
    )


def _db_message(exc: Exception) -> str:
    orig = getattr(exc, "orig", None) or exc
    text = " ".join(str(orig).split())
    if "statement timeout" in text or "canceling statement" in text:
        return "The query took too long and was cancelled. Simplify it or filter earlier."
    # asyncpg messages look like "<class 'asyncpg.exceptions.X'>: message"
    if ": " in text and text.startswith("<class"):
        text = text.split(": ", 1)[1]
    return f"The query failed: {text[:300]}"
