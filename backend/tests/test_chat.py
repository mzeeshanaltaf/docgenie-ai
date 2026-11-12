"""The chat stream, credits around it, sessions, messages and feedback (real Postgres, scripted
model). The wire contract is documented in backend/docs/chat-stream.md."""

import json
import uuid

import httpx
import openai
from sqlalchemy import text

from app.config import get_settings
from app.db import get_sessionmaker
from app.schemas.chat import ChatRequest
from app.services import chat
from tests.conftest import headers_for
from tests.factories import make_document
from tests.fake_llm import Step


def parse_sse(body: str) -> list[tuple[str, dict]]:
    events = []
    for block in body.strip().split("\n\n"):
        lines = block.split("\n")
        assert lines[0].startswith("event: ") and lines[1].startswith("data: "), block
        events.append((lines[0][7:], json.loads(lines[1][6:])))
    return events


def names(events):
    return [e for e, _ in events]


async def scalar(sql: str, **params):
    async with get_sessionmaker()() as s:
        return (await s.execute(text(sql), params)).scalar_one_or_none()


async def fetch(sql: str, **params):
    async with get_sessionmaker()() as s:
        return (await s.execute(text(sql), params)).all()


async def message_balance(uid: str) -> int | None:
    return await scalar("SELECT message_balance FROM credit_accounts WHERE user_id = :u", u=uid)


async def post_chat(client, uid, message="hello", session_id=None, **extra):
    sid = session_id or str(uuid.uuid4())
    resp = await client.post(
        "/v1/chat/stream",
        json={"session_id": sid, "message": message, **extra},
        headers=headers_for(uid),
    )
    return sid, resp


def simple_answer(text_="Hi there."):
    return Step(text=[text_])


# --- the stream contract -----------------------------------------------------------------------


async def test_stream_contract_reasoning_tool_citation_text_and_metrics(
    db_client, user_id, fake_openai
):
    await make_document(
        user_id,
        file_name="contract.pdf",
        chunks=[("The termination notice period is thirty days.", None, 4)],
    )
    fake_openai.responses.script(
        Step(
            reasoning=["I should search the contract for the notice period"],
            tool_calls=[("search_documents", {"query": "termination notice period"})],
        ),
        Step(text=["Thirty days ", "are required ", "[1]."]),
    )
    sid, resp = await post_chat(db_client, user_id, "What is the notice period?")

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    events = parse_sse(resp.text)
    order = names(events)

    # Order: start, reasoning, tool start/end, answer text, citation, end, then the title.
    assert order[0] == "message.start"
    assert order.index("reasoning.delta") < order.index("tool.start") < order.index("tool.end")
    assert order.index("tool.end") < order.index("text.delta") < order.index("citation")
    assert order.index("citation") < order.index("message.end") < order.index("session.title")
    assert order[-1] == "session.title"
    assert "error" not in order

    start = dict(events)["message.start"]
    assert start["session_id"] == sid and start["message_id"] and start["user_message_id"]

    tool_start = next(d for e, d in events if e == "tool.start")
    assert tool_start["name"] == "search_documents"
    assert tool_start["args"] == {"query": "termination notice period"}
    tool_end = next(d for e, d in events if e == "tool.end")
    assert tool_end["id"] == tool_start["id"] and tool_end["ok"] is True
    assert tool_end["summary"] == "1 passages from 1 document"
    assert isinstance(tool_end["duration_ms"], int)

    answer = "".join(d["text"] for e, d in events if e == "text.delta")
    assert answer == "Thirty days are required [1]."
    citation = next(d for e, d in events if e == "citation")
    assert citation["index"] == 1 and citation["file_name"] == "contract.pdf"
    assert citation["page_start"] == 4 and "thirty days" in citation["snippet"]

    end = next(d for e, d in events if e == "message.end")
    assert end["message_id"] == start["message_id"] and end["status"] == "complete"
    assert end["usage"]["output_tokens"] == 80  # two scripted model calls of 40
    m = end["metrics"]
    assert m["ttft_ms"] is not None and m["total_ms"] >= m["ttft_ms"]
    assert m["output_tokens"] == 80 and m["tokens_per_s"] and m["steps"] == 2
    assert m["tool_calls"] == 1 and m["service_tier"] == "default" and m["flex_fallback"] is False

    assert next(d for e, d in events if e == "session.title")["title"] == "A Fake Title"

    # How the model was called: stateless, reasoning summaries on, the configured effort.
    first = fake_openai.responses.calls[0]
    assert first["stream"] is True and first["store"] is False
    assert first["reasoning"] == {"effort": "medium", "summary": "auto"}
    assert first["include"] == ["reasoning.encrypted_content"]
    assert {t["name"] for t in first["tools"]} == {
        "list_documents", "search_documents", "get_document_text", "query_table",
    }  # fmt: skip
    # The tool output went back to the model on step two.
    outputs = [i for i in fake_openai.responses.calls[1]["input"] if i.get("type") == "function_call_output"]
    assert len(outputs) == 1 and "[1] contract.pdf, page 4" in outputs[0]["output"]

    # Persisted: the ordered parts and the metrics survive a reload.
    msgs = (await db_client.get(f"/v1/sessions/{sid}/messages", headers=headers_for(user_id))).json()["messages"]
    assert [m["role"] for m in msgs] == ["user", "assistant"]
    assistant = msgs[1]
    assert assistant["status"] == "complete" and assistant["content"] == answer
    assert [p["type"] for p in assistant["parts"]] == ["reasoning", "tool", "text", "citation"]
    assert assistant["parts"][1]["status"] == "done" and assistant["parts"][1]["name"] == "search_documents"
    assert assistant["parts"][3]["file_name"] == "contract.pdf"
    assert assistant["metrics"] == m and assistant["id"] == start["message_id"]  # same dict as message.end

    # One credit spent, usage logged for chat, embedding and title.
    assert await message_balance(user_id) == 24
    kinds = {k for (k,) in await fetch("SELECT kind FROM llm_usage WHERE user_id = :u", u=user_id)}
    assert kinds == {"chat", "embedding", "title"}


async def test_csv_question_uses_query_table(db_client, user_id, fake_openai):
    doc = await make_document(
        user_id, csv_rows=[{"item": "a", "amount": "10"}, {"item": "b", "amount": "32.5"}]
    )
    fake_openai.responses.script(
        Step(tool_calls=[("list_documents", {})]),
        Step(tool_calls=[("query_table", {"document_id": str(doc), "sql": "SELECT SUM(amount) AS total FROM rows"})]),
        Step(text=["The total is 42.5 [1]."]),
    )
    _, resp = await post_chat(db_client, user_id, "What is the total amount?")
    events = parse_sse(resp.text)
    tool_ends = [d for e, d in events if e == "tool.end"]
    assert [t["name"] for t in tool_ends] == ["list_documents", "query_table"]
    assert all(t["ok"] for t in tool_ends) and tool_ends[1]["summary"] == "1 row"
    sql_result = [
        i["output"] for i in fake_openai.responses.calls[2]["input"] if i.get("type") == "function_call_output"
    ][-1]
    assert json.loads(sql_result)["rows"] == [[42.5]]
    citation = next(d for e, d in events if e == "citation")
    assert citation["file_name"] == "table.csv" and citation["snippet"].startswith("SQL: SELECT SUM")


async def test_agent_is_capped_and_the_last_step_forces_an_answer(
    db_client, user_id, fake_openai, monkeypatch
):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "agent_max_steps", 3)
    loop = Step(tool_calls=[("list_documents", {})])
    fake_openai.responses.script(loop, loop, Step(text=["Done."]))
    _, resp = await post_chat(db_client, user_id)
    assert parse_sse(resp.text)[-2][1]["status"] == "complete"
    choices = [c["tool_choice"] for c in fake_openai.responses.calls[:3]]
    assert choices == ["auto", "auto", "none"]  # the final step cannot call tools


# --- credits -----------------------------------------------------------------------------------


async def test_zero_message_credits_is_402_before_any_stream_and_stores_nothing(
    db_client, user_id, fake_openai
):
    async with get_sessionmaker()() as s, s.begin():
        await s.execute(
            text("INSERT INTO credit_accounts (user_id, credit_balance, message_balance) VALUES (:u, 5, 0)"),
            {"u": user_id},
        )
    sid, resp = await post_chat(db_client, user_id)
    assert resp.status_code == 402
    assert resp.json()["status"] == "INSUFFICIENT_CREDITS"
    assert not resp.headers["content-type"].startswith("text/event-stream")
    assert fake_openai.responses.calls == []  # the model was never called
    assert await scalar("SELECT count(*) FROM chat_sessions WHERE id = :i", i=uuid.UUID(sid)) == 0
    assert await message_balance(user_id) == 0


def rate_limit_error(message: str) -> openai.RateLimitError:
    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    return openai.RateLimitError(message, response=httpx.Response(429, request=request), body=None)


async def test_failure_before_any_output_refunds_the_credit(db_client, user_id, fake_openai):
    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    boom = openai.APIConnectionError(message="provider exploded", request=request)
    fake_openai.responses.script(Step(fail_on_create=boom))
    sid, resp = await post_chat(db_client, user_id)
    assert resp.status_code == 200
    events = parse_sse(resp.text)
    assert names(events) == ["message.start", "error", "message.end"]
    err = dict(events)["error"]
    assert err["code"] == "LLM_ERROR" and "provider exploded" not in err["message"]  # no leaks
    assert dict(events)["message.end"]["status"] == "error"
    assert await message_balance(user_id) == 25  # 25 - 1 reserved + 1 refunded
    kinds = await scalar(
        "SELECT array_agg(transaction_type ORDER BY created_at) FROM credit_transactions "
        "WHERE user_id = :u AND unit_type = 'message' AND transaction_type IN ('usage','refund')",
        u=user_id,
    )
    assert kinds == ["usage", "refund"]
    stored = await scalar("SELECT status FROM chat_messages WHERE session_id = :s AND role = 'assistant'", s=uuid.UUID(sid))
    assert stored == "error"
    assert await scalar("SELECT title FROM chat_sessions WHERE id = :s", s=uuid.UUID(sid)) is None


async def test_unexpected_server_bug_is_reported_generically_and_refunded(
    db_client, user_id, fake_openai
):
    fake_openai.responses.script(Step(fail_on_create=RuntimeError("secret internals")))
    _, resp = await post_chat(db_client, user_id)
    err = dict(parse_sse(resp.text))["error"]
    assert err["code"] == "INTERNAL_ERROR" and "secret" not in err["message"]
    assert await message_balance(user_id) == 25


async def test_flex_unavailable_falls_back_to_the_fallback_tier(
    db_client, user_id, fake_openai, monkeypatch
):
    monkeypatch.setattr(get_settings(), "chat_service_tier", "flex")
    fake_openai.responses.script(
        Step(fail_on_create=rate_limit_error("429 Flex processing is temporarily unavailable")),
        simple_answer("Served on the fallback tier."),
    )
    _, resp = await post_chat(db_client, user_id)
    events = parse_sse(resp.text)
    assert "error" not in names(events)
    tiers = [c["service_tier"] for c in fake_openai.responses.calls if c.get("stream")]
    assert tiers == ["flex", "default"]  # tried flex, then retried on FLEX_FALLBACK_TIER
    metrics = dict(events)["message.end"]["metrics"]
    assert metrics["flex_fallback"] is True and metrics["service_tier"] == "default"
    assert await message_balance(user_id) == 24


async def test_flex_unavailable_inside_the_open_stream_also_falls_back(
    db_client, user_id, fake_openai, monkeypatch
):
    # Seen live: besides a 429 at request time, the same message can arrive as a generic APIError
    # from inside the stream, a moment after `response.created` and before any content.
    monkeypatch.setattr(get_settings(), "chat_service_tier", "flex")
    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    unavailable = openai.APIError(
        "Flex processing is temporarily unavailable. Please try again later or use standard "
        "processing.",
        request=request,
        body=None,
    )
    fake_openai.responses.script(
        Step(fail_at_stream_start=unavailable), simple_answer("Served after the retry.")
    )
    _, resp = await post_chat(db_client, user_id)
    events = parse_sse(resp.text)
    assert "error" not in names(events)
    assert "".join(d["text"] for e, d in events if e == "text.delta") == "Served after the retry."
    tiers = [c["service_tier"] for c in fake_openai.responses.calls if c.get("stream")]
    assert tiers == ["flex", "default"]
    assert dict(events)["message.end"]["metrics"]["flex_fallback"] is True


async def test_flex_error_after_content_is_not_retried(
    db_client, user_id, fake_openai, monkeypatch
):
    # Once text has been streamed a retry would repeat it for the user: fail instead.
    monkeypatch.setattr(get_settings(), "chat_service_tier", "flex")
    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    late = openai.APIError("Flex processing is temporarily unavailable.", request=request, body=None)
    fake_openai.responses.script(Step(text=["Partial ", "text"], fail_mid_stream=late))
    _, resp = await post_chat(db_client, user_id)
    events = parse_sse(resp.text)
    assert dict(events)["message.end"]["status"] == "incomplete"
    assert len([c for c in fake_openai.responses.calls if c.get("stream")]) == 1


async def test_flex_fallback_is_not_used_for_other_rate_limits(
    db_client, user_id, fake_openai, monkeypatch
):
    monkeypatch.setattr(get_settings(), "chat_service_tier", "default")
    fake_openai.responses.script(Step(fail_on_create=rate_limit_error("Rate limit reached")))
    _, resp = await post_chat(db_client, user_id)
    err = dict(parse_sse(resp.text))["error"]
    assert err["code"] == "LLM_BUSY"
    assert len([c for c in fake_openai.responses.calls if c.get("stream")]) == 1  # no retry
    assert await message_balance(user_id) == 25  # refunded


async def test_failure_after_some_text_keeps_the_partial_answer_and_the_credit(
    db_client, user_id, fake_openai
):
    fake_openai.responses.script(
        Step(text=["Partial ", "answer"], fail_mid_stream=RuntimeError("connection reset"))
    )
    sid, resp = await post_chat(db_client, user_id)
    events = parse_sse(resp.text)
    assert names(events)[-2:] == ["error", "message.end"]
    assert dict(events)["message.end"]["status"] == "incomplete"
    (row,) = await fetch(
        "SELECT status, content FROM chat_messages WHERE session_id = :s AND role = 'assistant'",
        s=uuid.UUID(sid),
    )
    assert row.status == "incomplete" and row.content == "Partial "
    assert await message_balance(user_id) == 24  # an answer was (partly) delivered


async def test_empty_model_answer_is_an_error_and_refunded(db_client, user_id, fake_openai):
    fake_openai.responses.script(Step(reasoning=["thinking"], text=[]))
    _, resp = await post_chat(db_client, user_id)
    events = parse_sse(resp.text)
    assert dict(events)["message.end"]["status"] == "error"
    assert await message_balance(user_id) == 25


# --- disconnect --------------------------------------------------------------------------------


async def prepared_turn(user_id: str, message: str = "hello") -> chat.Turn:
    async with get_sessionmaker()() as s:
        return await chat.prepare_turn(
            s, user_id, ChatRequest(session_id=uuid.uuid4(), message=message)
        )


async def test_disconnect_mid_stream_saves_the_partial_message_as_incomplete(
    infra, user_id, fake_openai
):
    fake_openai.responses.script(Step(text=["Half an ", "answer"], hang_after_first_text=True))
    turn = await prepared_turn(user_id)
    gen = chat.stream_turn(turn)
    seen = []
    async for frame in gen:
        seen.append(frame.split("\n", 1)[0])
        if frame.startswith("event: text.delta"):
            break  # the client goes away
    await gen.aclose()
    await chat.drain_background()

    assert "event: message.start" in seen
    assert fake_openai.responses.streams[0].closed  # the model stream was cancelled
    (row,) = await fetch(
        "SELECT status, content, metrics FROM chat_messages WHERE id = :i",
        i=turn.assistant_message_id,
    )
    assert row.status == "incomplete" and row.content == "Half an "
    assert row.metrics["ttft_ms"] is not None
    assert await message_balance(user_id) == 24  # text was delivered: no refund
    assert await scalar("SELECT title FROM chat_sessions WHERE id = :s", s=turn.session_id) is None


async def test_disconnect_before_any_text_is_incomplete_and_refunded(infra, user_id, fake_openai):
    fake_openai.responses.script(Step(reasoning=["pondering the question"], text=["never sent"]))
    turn = await prepared_turn(user_id)
    gen = chat.stream_turn(turn)
    async for frame in gen:
        if frame.startswith("event: reasoning.delta"):
            break
    await gen.aclose()
    await chat.drain_background()
    status = await scalar("SELECT status FROM chat_messages WHERE id = :i", i=turn.assistant_message_id)
    assert status == "incomplete"
    assert await message_balance(user_id) == 25


# --- history, titles, selection ----------------------------------------------------------------


async def test_history_is_replayed_without_old_citation_numbers_and_title_is_set_once(
    db_client, user_id, fake_openai
):
    fake_openai.responses.script(simple_answer("The fee is 5 dollars [1]."), simple_answer("Yes."))
    sid, _ = await post_chat(db_client, user_id, "What is the fee?")
    _, resp = await post_chat(db_client, user_id, "Is that per month?", session_id=sid)
    assert resp.status_code == 200
    second_input = fake_openai.responses.calls[2]["input"]  # calls: turn 1, title, turn 2
    assert second_input[0] == {"role": "user", "content": "What is the fee?"}
    assert second_input[1] == {"role": "assistant", "content": "The fee is 5 dollars."}
    assert second_input[2] == {"role": "user", "content": "Is that per month?"}
    # Only the first turn generated a title.
    assert sum(1 for c in fake_openai.responses.calls if not c.get("stream")) == 1
    assert "session.title" not in names(parse_sse(resp.text))
    title = (await db_client.get("/v1/sessions", headers=headers_for(user_id))).json()["sessions"][0]["title"]
    assert title == "A Fake Title"


async def test_title_falls_back_to_the_question_when_the_title_model_fails(
    db_client, user_id, fake_openai
):
    fake_openai.responses.fail_title = True
    fake_openai.responses.script(simple_answer())
    _, resp = await post_chat(db_client, user_id, "How do refunds work in this agreement?")
    title = next(d for e, d in parse_sse(resp.text) if e == "session.title")["title"]
    assert title == "How do refunds work in this agreement?"


async def test_history_window_limits_context(db_client, user_id, fake_openai, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "history_window", 2)
    fake_openai.responses.script(*[simple_answer(f"answer {i}") for i in range(3)])
    sid = str(uuid.uuid4())
    for i in range(3):
        await post_chat(db_client, user_id, f"question {i}", session_id=sid)
    last_input = [c for c in fake_openai.responses.calls if c.get("stream")][-1]["input"]
    # Window of 2 messages: the previous exchange, then the new question.
    assert [m["content"] for m in last_input] == ["question 1", "answer 1", "question 2"]


async def test_chat_selection_is_saved_and_enforced(db_client, user_id, fake_openai):
    a = await make_document(user_id, file_name="a.pdf", chunks=[("alpha", None, 1)])
    b = await make_document(user_id, file_name="b.pdf", chunks=[("beta", None, 1)])
    fake_openai.responses.script(
        Step(tool_calls=[("list_documents", {})]), simple_answer("ok"), simple_answer("ok")
    )
    sid, _resp = await post_chat(db_client, user_id, "list them", document_ids=[str(a)])
    listed = json.loads(
        next(i for i in fake_openai.responses.calls[1]["input"] if i.get("type") == "function_call_output")["output"]
    )["documents"]
    assert [d["file_name"] for d in listed] == ["a.pdf"]
    sessions = (await db_client.get("/v1/sessions", headers=headers_for(user_id))).json()["sessions"]
    assert sessions[0]["document_ids"] == [str(a)]
    # Omitting document_ids keeps the selection; an empty list clears it.
    await post_chat(db_client, user_id, "again", session_id=sid)
    kept = (await db_client.get("/v1/sessions", headers=headers_for(user_id))).json()["sessions"][0]
    assert kept["document_ids"] == [str(a)]
    await post_chat(db_client, user_id, "all", session_id=sid, document_ids=[])
    cleared = (await db_client.get("/v1/sessions", headers=headers_for(user_id))).json()["sessions"][0]
    assert cleared["document_ids"] is None
    assert b  # the second document existed throughout


async def test_chat_rejects_another_users_documents_and_sessions(db_client, user_id, fake_openai):
    other = f"other_{uuid.uuid4().hex[:8]}"
    theirs = await make_document(other, chunks=[("secret", None, 1)])
    _sid, resp = await post_chat(db_client, user_id, document_ids=[str(theirs)])
    assert resp.status_code == 404
    assert fake_openai.responses.calls == []
    assert await message_balance(user_id) is None  # rejected before the credit was touched

    fake_openai.responses.script(simple_answer())
    owned_sid, ok = await post_chat(db_client, other)
    assert ok.status_code == 200
    _, stolen = await post_chat(db_client, user_id, session_id=owned_sid)
    assert stolen.status_code == 404
    assert await message_balance(user_id) is None  # nothing was charged (rolled back)


async def test_chat_body_validation(db_client, user_id):
    h = headers_for(user_id)
    assert (await db_client.post("/v1/chat/stream", json={"message": "x"}, headers=h)).status_code == 422
    blank = {"session_id": str(uuid.uuid4()), "message": "   "}
    assert (await db_client.post("/v1/chat/stream", json=blank, headers=h)).status_code == 422
    nokey = await db_client.post("/v1/chat/stream", json=blank)
    assert nokey.status_code == 401
    nouser = await db_client.post(
        "/v1/chat/stream", json=blank, headers={"X-Internal-Key": "test-internal-key"}
    )
    assert nouser.status_code == 401


# --- sessions, messages, feedback --------------------------------------------------------------


async def test_session_endpoints_and_cascade_delete(db_client, user_id, fake_openai):
    fake_openai.responses.script(simple_answer("First."), simple_answer("Second."))
    h = headers_for(user_id)
    sid1, _ = await post_chat(db_client, user_id, "one")
    sid2, _ = await post_chat(db_client, user_id, "two")
    listed = (await db_client.get("/v1/sessions", headers=h)).json()["sessions"]
    assert [s["id"] for s in listed] == [sid2, sid1]  # most recently active first

    doc = await make_document(user_id, chunks=[("x", None, 1)])
    patched = await db_client.patch(
        f"/v1/sessions/{sid1}", json={"title": "  My chat ", "document_ids": [str(doc)]}, headers=h
    )
    assert patched.status_code == 200
    assert patched.json()["title"] == "My chat" and patched.json()["document_ids"] == [str(doc)]
    cleared = await db_client.patch(f"/v1/sessions/{sid1}", json={"document_ids": None}, headers=h)
    assert cleared.json()["document_ids"] is None and cleared.json()["title"] == "My chat"
    assert (await db_client.patch(f"/v1/sessions/{sid1}", json={"title": ""}, headers=h)).status_code == 422

    msgs = (await db_client.get(f"/v1/sessions/{sid1}/messages", headers=h)).json()["messages"]
    assistant = next(m for m in msgs if m["role"] == "assistant")
    await db_client.put(f"/v1/messages/{assistant['id']}/feedback", json={"rating": "like"}, headers=h)

    assert (await db_client.delete(f"/v1/sessions/{sid1}", headers=h)).status_code == 204
    assert (await db_client.get(f"/v1/sessions/{sid1}/messages", headers=h)).status_code == 404
    left = await scalar(
        "SELECT (SELECT count(*) FROM chat_messages WHERE session_id = :s) + "
        "(SELECT count(*) FROM message_feedback WHERE message_id = :m)",
        s=uuid.UUID(sid1),
        m=uuid.UUID(assistant["id"]),
    )
    assert left == 0  # messages and feedback cascaded
    assert [s["id"] for s in (await db_client.get("/v1/sessions", headers=h)).json()["sessions"]] == [sid2]


async def test_feedback_like_dislike_replace_and_clear(db_client, user_id, fake_openai):
    fake_openai.responses.script(simple_answer())
    h = headers_for(user_id)
    sid, _ = await post_chat(db_client, user_id)
    msgs = (await db_client.get(f"/v1/sessions/{sid}/messages", headers=h)).json()["messages"]
    user_msg = next(m for m in msgs if m["role"] == "user")
    assistant = next(m for m in msgs if m["role"] == "assistant")
    assert assistant["feedback"] is None

    url = f"/v1/messages/{assistant['id']}/feedback"
    liked = await db_client.put(url, json={"rating": "like"}, headers=h)
    assert liked.status_code == 200 and liked.json()["rating"] == "like"
    disliked = await db_client.put(
        url, json={"rating": "dislike", "reason": "Wrong", "comment": "It missed page 3"}, headers=h
    )
    assert disliked.json() == {
        "message_id": assistant["id"], "rating": "dislike", "reason": "Wrong", "comment": "It missed page 3",
    }  # fmt: skip
    after = (await db_client.get(f"/v1/sessions/{sid}/messages", headers=h)).json()["messages"]
    fb = next(m for m in after if m["role"] == "assistant")["feedback"]
    assert fb["rating"] == "dislike" and fb["reason"] == "Wrong"
    assert await scalar("SELECT count(*) FROM message_feedback WHERE message_id = :m", m=uuid.UUID(assistant["id"])) == 1

    assert (await db_client.delete(url, headers=h)).status_code == 204
    assert (await db_client.delete(url, headers=h)).status_code == 204  # idempotent
    final = (await db_client.get(f"/v1/sessions/{sid}/messages", headers=h)).json()["messages"]
    assert next(m for m in final if m["role"] == "assistant")["feedback"] is None

    assert (await db_client.put(url, json={"rating": "meh"}, headers=h)).status_code == 422
    on_user = await db_client.put(f"/v1/messages/{user_msg['id']}/feedback", json={"rating": "like"}, headers=h)
    assert on_user.status_code == 422


async def test_cross_user_access_is_denied_on_sessions_messages_and_feedback(
    db_client, user_id, fake_openai
):
    fake_openai.responses.script(simple_answer())
    owner = headers_for(user_id)
    intruder = headers_for(f"intruder_{uuid.uuid4().hex[:8]}")
    sid, _ = await post_chat(db_client, user_id)
    msgs = (await db_client.get(f"/v1/sessions/{sid}/messages", headers=owner)).json()["messages"]
    assistant = next(m for m in msgs if m["role"] == "assistant")
    url = f"/v1/messages/{assistant['id']}/feedback"
    await db_client.put(url, json={"rating": "like"}, headers=owner)

    assert (await db_client.get("/v1/sessions", headers=intruder)).json()["sessions"] == []
    assert (await db_client.get(f"/v1/sessions/{sid}/messages", headers=intruder)).status_code == 404
    assert (await db_client.patch(f"/v1/sessions/{sid}", json={"title": "pwned"}, headers=intruder)).status_code == 404
    assert (await db_client.delete(f"/v1/sessions/{sid}", headers=intruder)).status_code == 404
    assert (await db_client.put(url, json={"rating": "dislike"}, headers=intruder)).status_code == 404
    assert (await db_client.delete(url, headers=intruder)).status_code == 404

    # Nothing changed for the owner.
    kept = (await db_client.get(f"/v1/sessions/{sid}/messages", headers=owner)).json()["messages"]
    assert next(m for m in kept if m["role"] == "assistant")["feedback"]["rating"] == "like"
    sess = (await db_client.get("/v1/sessions", headers=owner)).json()["sessions"][0]
    assert sess["title"] == "A Fake Title"


async def test_endpoints_require_the_user_header(db_client):
    key = {"X-Internal-Key": "test-internal-key"}
    sid = uuid.uuid4()
    assert (await db_client.get("/v1/sessions", headers=key)).status_code == 401
    assert (await db_client.get(f"/v1/sessions/{sid}/messages", headers=key)).status_code == 401
    assert (await db_client.put(f"/v1/messages/{sid}/feedback", json={"rating": "like"}, headers=key)).status_code == 401
