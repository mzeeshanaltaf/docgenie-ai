"""Hybrid retrieval: semantic + keyword search fused with Reciprocal Rank Fusion, in one SQL
statement.

- Semantic: cosine distance on the HNSW-indexed `embedding`, top `RETRIEVAL_CANDIDATES`.
- Keyword: Postgres full text (`websearch_to_tsquery` against the generated `tsv`), ranked by
  `ts_rank_cd`, top `RETRIEVAL_CANDIDATES`.
- RRF: score = sum over both lists of 1 / (RRF_K + rank). The top `RETRIEVAL_TOP_K` are returned.

Every query is filtered by `user_id` (on chunks *and* documents) and only searches `ready`
documents, optionally narrowed to a set of document ids.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import ARRAY, bindparam, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings

_SQL = """
WITH semantic AS (
    SELECT id, row_number() OVER (ORDER BY dist) AS rnk
    FROM (
        SELECT c.id, c.embedding <=> CAST(:qvec AS vector) AS dist
        FROM document_chunks c
        JOIN documents d ON d.id = c.document_id
        WHERE c.user_id = :user_id AND d.user_id = :user_id AND d.status = 'ready'
          AND c.embedding IS NOT NULL {doc_filter}
        ORDER BY c.embedding <=> CAST(:qvec AS vector)
        LIMIT :candidates
    ) s
),
keyword AS (
    SELECT id, row_number() OVER (ORDER BY rank DESC, id) AS rnk
    FROM (
        SELECT c.id, ts_rank_cd(c.tsv, q.query) AS rank
        FROM document_chunks c
        JOIN documents d ON d.id = c.document_id,
             websearch_to_tsquery('english', :qtext) AS q(query)
        WHERE c.user_id = :user_id AND d.user_id = :user_id AND d.status = 'ready'
          AND c.tsv @@ q.query {doc_filter}
        ORDER BY rank DESC
        LIMIT :candidates
    ) k
),
fused AS (
    SELECT id,
           sum(1.0 / (:rrf_k + rnk)) AS score,
           min(rnk) FILTER (WHERE src = 's') AS semantic_rank,
           min(rnk) FILTER (WHERE src = 'k') AS keyword_rank
    FROM (
        SELECT id, rnk, 's' AS src FROM semantic
        UNION ALL
        SELECT id, rnk, 'k' AS src FROM keyword
    ) ranked
    GROUP BY id
)
SELECT c.id AS chunk_id, c.document_id, d.file_name, c.chunk_index, c.page_start, c.page_end,
       c.content, f.score, f.semantic_rank, f.keyword_rank
FROM fused f
JOIN document_chunks c ON c.id = f.id
JOIN documents d ON d.id = c.document_id
ORDER BY f.score DESC, c.id
LIMIT :top_k
"""


@dataclass(frozen=True)
class Hit:
    chunk_id: int
    document_id: uuid.UUID
    file_name: str
    chunk_index: int
    page_start: int | None
    page_end: int | None
    content: str
    score: float
    semantic_rank: int | None  # None when the chunk was only found by keyword
    keyword_rank: int | None  # None when the chunk was only found semantically

    @property
    def snippet(self) -> str:
        return make_snippet(self.content)


def make_snippet(content: str, limit: int | None = None) -> str:
    limit = limit or get_settings().snippet_chars
    flat = " ".join(content.split())
    return flat if len(flat) <= limit else flat[: limit - 1].rstrip() + "…"


def vector_literal(vector: list[float]) -> str:
    return "[" + ",".join(repr(float(v)) for v in vector) + "]"


async def search_chunks(
    session: AsyncSession,
    *,
    user_id: str,
    query_text: str,
    query_vector: list[float],
    document_ids: list[uuid.UUID] | None = None,
    top_k: int | None = None,
) -> list[Hit]:
    """Hybrid search. `document_ids=None` searches all of the user's ready documents."""
    s = get_settings()
    doc_filter = "AND c.document_id = ANY(:doc_ids)" if document_ids else ""
    stmt = text(_SQL.format(doc_filter=doc_filter))
    params: dict[str, object] = {
        "user_id": user_id,
        "qvec": vector_literal(query_vector),
        "qtext": query_text,
        "candidates": s.retrieval_candidates,
        "rrf_k": s.rrf_k,
        "top_k": top_k or s.retrieval_top_k,
    }
    if document_ids:
        stmt = stmt.bindparams(bindparam("doc_ids", type_=ARRAY(UUID(as_uuid=True))))
        params["doc_ids"] = document_ids
    # With a selective filter the HNSW scan would otherwise stop early and return too few rows.
    await session.execute(text("SELECT set_config('hnsw.iterative_scan', 'relaxed_order', true)"))
    rows = (await session.execute(stmt, params)).mappings().all()
    return [
        Hit(
            chunk_id=r["chunk_id"],
            document_id=r["document_id"],
            file_name=r["file_name"],
            chunk_index=r["chunk_index"],
            page_start=r["page_start"],
            page_end=r["page_end"],
            content=r["content"],
            score=float(r["score"]),
            semantic_rank=r["semantic_rank"],
            keyword_rank=r["keyword_rank"],
        )
        for r in rows
    ]
