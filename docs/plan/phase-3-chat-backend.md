# Phase 3: Retrieval, agent and chat stream

**Goal:** a streaming chat endpoint backed by hybrid retrieval and a safe tool-using agent. It emits reasoning, tool traces, citations and timing metrics, and it persists sessions, messages, feedback and usage.

**Depends on:** Phase 2 (indexed chunks, credits, usage logging).
**Unblocks:** Phase 5 (chat proxy), Phase 7 (assistant-ui chat).

## Session handoff

**Read before starting:** [README.md](README.md), the Current state in [progress.md](progress.md), and the Phase 1 and 2 log entries (smoke-test results matter for the reasoning and flex settings).

**Record in the handoff** (in `progress.md`):
- **The exact SSE contract:** the SSE `event:` name and JSON payload for each event type, with one real example per event. Phase 7's adapter is built from this, so put it in a file (e.g. `backend/docs/chat-stream.md`) and link it under Contracts.
- Response shapes of the session, message and feedback endpoints (including how `parts` and `metrics` are structured).
- Where the system prompt lives.
- How flex-tier fallback behaved in practice (latency, how often it triggered).
- Any `sqlglot` limits found in `sql_guard` (SQL that is allowed vs. rejected).
- Whether the copy/like/dislike assumption was confirmed.

## Assumption to confirm

- "copied/linked/disliked" in the original request means **copy, like, dislike**. Feedback here supports like and dislike; copy is client-only.

## Files

```
backend/app/
  routers/chat.py  routers/sessions.py  routers/feedback.py
  services/
    retrieval.py
    llm.py                  # OpenAI Responses API wrapper (extended from Phase 1)
    agent.py  tools.py      # tool loop + tool implementations
    sql_guard.py            # safe CSV querying
```

## Tasks

### 1. Hybrid retrieval (`services/retrieval.py`)
One SQL statement:
- Semantic CTE: `embedding <=> $q`, top 30.
- Keyword CTE: `tsv @@ websearch_to_tsquery`, ranked by `ts_rank_cd`, top 30.
- Fuse with Reciprocal Rank Fusion (`RRF_K`) and cut to `RETRIEVAL_TOP_K`.
- Always filter by `user_id`, and by the session's `document_ids` when set.
- Each hit returns the document id, file name, page range and a snippet. These become citations.

### 2. Tools (`services/tools.py`)
These are the same four capabilities n8n had, made safe:

| Tool | Behavior |
|---|---|
| `list_documents` | The user's `ready` documents (respecting the session's selection), with CSV schemas |
| `search_documents(query, document_id?)` | Hybrid retrieval above |
| `get_document_text(document_id)` | Full text rebuilt from chunks with the overlap removed, truncated to a token budget |
| `query_table(document_id, sql)` | Replaces arbitrary SQL (see below) |

**`query_table` / `sql_guard.py`:**
- Check that the user owns the document.
- Parse with `sqlglot`. The SQL must be a **single `SELECT`** that references only a relation named `rows`.
- Run it in a `READ ONLY` transaction with `statement_timeout`, where `rows` is a CTE over that one document's `document_rows`.
- Cap the number of result rows.

### 3. LLM + agent loop (`services/llm.py`, `agent.py`)
- OpenAI Python SDK, **Responses API** with streaming, `reasoning={"effort": CHAT_REASONING_EFFORT, "summary": "auto"}`, `service_tier` from config.
- If flex returns resource-unavailable, retry on `FLEX_FALLBACK_TIER`.
- A hand-written tool loop capped at `AGENT_MAX_STEPS`. No LangChain, so the code keeps full control of the stream events that the traces need.
- Carry over the existing system prompt, updated for the new tool names and with an instruction to cite sources by index.

### 4. `POST /v1/chat/stream` (SSE)
1. Atomically reserve 1 message credit. Return 402 before any stream if the balance is empty. Refund it if the run fails before producing output.
2. Upsert the session (the id is client-generated), persist the user message.
3. Load the last `HISTORY_WINDOW` messages as context.
4. Stream these SSE events:

| Event | Payload |
|---|---|
| `message.start` | ids, server timestamp |
| `reasoning.delta` | reasoning summary text |
| `tool.start` | name, args |
| `tool.end` | result summary, duration |
| `text.delta` | answer text |
| `citation` | index, document id, file name, page range, snippet |
| `error` | code, message (insufficient credits, flex busy, interrupted) |
| `message.end` | usage + metrics |

5. The server measures TTFT, total time, output tokens and tokens/s. It persists the assistant message with `parts` and `metrics` and logs `llm_usage` with cost.
6. A client disconnect cancels the OpenAI stream and saves the partial message as `incomplete`.
7. Title generation runs server-side after the first turn with `TITLE_MODEL`. There is no separate client call, so there is no race with the session row not existing yet.

### 5. Sessions and feedback

| Method and path | Purpose |
|---|---|
| `GET /v1/sessions` | The user's sessions |
| `GET /v1/sessions/{id}/messages` | Messages with `parts` and `metrics` |
| `PATCH /v1/sessions/{id}` | Rename, set `document_ids` |
| `DELETE /v1/sessions/{id}` | Delete (messages and feedback cascade) |
| `PUT /v1/messages/{id}/feedback` | Like/dislike with `reason` and `comment` |
| `DELETE /v1/messages/{id}/feedback` | Clear feedback |

All of these are scoped by `X-User-Id`. Message ids come from the server.

## Tests

- [ ] Hybrid search returns matches that are only keyword and matches that are only semantic.
- [ ] `sql_guard` rejects writes, other tables, multiple statements and functions that escape the `rows` CTE.
- [ ] Retrieval and `query_table` never return another user's data.
- [ ] **Stream contract:** a test consumes `/v1/chat/stream` and asserts event order, the presence of reasoning and tool events, and metrics in `message.end`.
- [ ] Zero message credits → 402 before streaming; a failure before output → refund.
- [ ] Disconnect mid-stream → message stored as `incomplete`.
- [ ] Cross-user access denied on session, message and feedback endpoints.

## Exit criteria

- [ ] A chat about an uploaded PDF streams reasoning, a `search_documents` trace, a cited answer and metrics.
- [ ] A chat about a CSV uses `query_table` successfully.
- [ ] The session gets a server-generated title after the first turn.
- [ ] All tests above pass.
