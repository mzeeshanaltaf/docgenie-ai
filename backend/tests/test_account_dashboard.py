"""Dashboard, account export and account deletion (real Postgres + MinIO, scripted model).

The contact form is not part of the backend (it stays on n8n), so there is no contact test.
"""

import io
import json
import uuid
import zipfile
from datetime import UTC, datetime

import pytest
from sqlalchemy import text

from app.db import Base, get_sessionmaker
from app.services import chat as chat_service
from app.services import credits, storage
from app.services.account import ACCOUNT_TABLES
from tests import factories
from tests.conftest import KEY, headers_for
from tests.fake_llm import Step


@pytest.fixture(autouse=True)
def _fake(fake_openai):
    return fake_openai


async def scalar(sql: str, **params):
    async with get_sessionmaker()() as s:
        return (await s.execute(text(sql), params)).scalar_one()


async def upload(client, uid, name, data, mime="application/octet-stream"):
    return await client.post(
        "/v1/documents", headers=headers_for(uid), files=factories.multipart(name, data, mime)
    )


async def chat(client, uid, fake_openai, message):
    fake_openai.responses.script(Step(text=[f"Answer to {message}"]))
    sid = str(uuid.uuid4())
    resp = await client.post(
        "/v1/chat/stream",
        json={"session_id": sid, "message": message},
        headers=headers_for(uid),
    )
    assert resp.status_code == 200, resp.text
    await chat_service.drain_background()
    return sid


async def populate(client, uid, fake_openai) -> dict:
    """2 documents (a PDF and a CSV), 2 chats, 1 like. Returns what the tests compare against."""
    pdf = factories.text_pdf(pages=2)
    csv = factories.csv_bytes(rows=4)
    pdf_id = (await upload(client, uid, "report.pdf", pdf, "application/pdf")).json()["id"]
    csv_id = (await upload(client, uid, "data.csv", csv, "text/csv")).json()["id"]
    sid1 = await chat(client, uid, fake_openai, "first secret question")
    sid2 = await chat(client, uid, fake_openai, "second secret question")
    msgs = (await client.get(f"/v1/sessions/{sid1}/messages", headers=headers_for(uid))).json()
    assistant = next(m for m in msgs["messages"] if m["role"] == "assistant")
    liked = await client.put(
        f"/v1/messages/{assistant['id']}/feedback",
        json={"rating": "like", "comment": "nice"},
        headers=headers_for(uid),
    )
    assert liked.status_code == 200
    return {
        "files": {pdf_id: ("report.pdf", pdf), csv_id: ("data.csv", csv)},
        "sessions": [sid1, sid2],
    }


# --- dashboard ---------------------------------------------------------------------------


async def test_dashboard_is_read_only_for_a_user_without_a_credit_account(db_client, user_id):
    """It must never create an account (that would resurrect a deleted user's credits)."""
    for _ in range(2):
        resp = await db_client.get("/v1/dashboard", headers=headers_for(user_id))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["balances"] == {"documents": 0, "messages": 0}
        assert body["recent_activity"] == [] and body["usage"]["documents_spent"] == 0
    assert set((await rows_for(user_id)).values()) == {0}


async def test_dashboard_for_a_signed_up_user_with_nothing_yet(db_client, user_id):
    granted = await db_client.post(f"/v1/users/{user_id}/signup-credits", headers=KEY)
    assert granted.status_code == 200
    resp = await db_client.get("/v1/dashboard", headers=headers_for(user_id))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["balances"] == {"documents": 5, "messages": 25}
    assert body["counts"] == {
        "documents": 0,
        "documents_ready": 0,
        "documents_processing": 0,
        "documents_failed": 0,
        "sessions": 0,
        "user_messages": 0,
    }
    assert body["recent_sessions"] == [] and body["recent_documents"] == []
    assert body["usage"]["documents_spent"] == 0 and body["usage"]["messages_spent"] == 0
    assert len(body["usage"]["daily"]) == 14
    assert [a["kind"] for a in body["recent_activity"]] == ["signup", "signup"]
    # Reading the dashboard changes nothing.
    again = (await db_client.get("/v1/dashboard", headers=headers_for(user_id))).json()
    assert again["balances"] == {"documents": 5, "messages": 25}
    assert await scalar("SELECT count(*) FROM credit_transactions WHERE user_id = :u", u=user_id) == 2


async def test_dashboard_numbers_match_the_database_after_uploads_and_chats(
    db_client, user_id, fake_openai
):
    state = await populate(db_client, user_id, fake_openai)
    fake_openai.fail_embeddings = True  # one more upload that fails and is refunded
    await upload(db_client, user_id, "bad.txt", factories.txt_bytes(200), "text/plain")
    fake_openai.fail_embeddings = False

    body = (await db_client.get("/v1/dashboard", headers=headers_for(user_id))).json()

    async with get_sessionmaker()() as s:
        balances = await credits.get_balances(s, user_id)
    assert body["balances"] == {
        "documents": balances.credit_balance,
        "messages": balances.message_balance,
    }
    assert body["balances"] == {"documents": 3, "messages": 23}  # 5-2 (refund restored the 3rd)
    assert body["counts"] == {
        "documents": 3,
        "documents_ready": 2,
        "documents_processing": 0,
        "documents_failed": 1,
        "sessions": 2,
        "user_messages": 2,
    }
    # Net of the refund: two documents and two chat turns were actually spent.
    assert body["usage"]["documents_spent"] == 2 and body["usage"]["messages_spent"] == 2
    today = datetime.now(UTC).date().isoformat()
    daily = body["usage"]["daily"]
    assert daily[-1] == {"date": today, "documents": 2, "messages": 2}
    assert all(d["documents"] == 0 and d["messages"] == 0 for d in daily[:-1])

    assert {s["id"] for s in body["recent_sessions"]} == set(state["sessions"])
    assert all(s["title"] == "A Fake Title" for s in body["recent_sessions"])
    failed = body["recent_documents"][0]  # newest first
    assert failed["file_name"] == "bad.txt"
    assert failed["status"] == "failed" and failed["error_code"] == "EMBEDDING_FAILED"
    kinds = [(a["kind"], a["unit_type"]) for a in body["recent_activity"]]
    assert kinds[0] == ("refund", "document")  # newest first
    assert ("usage", "message") in kinds


async def test_dashboard_is_small_and_has_no_message_bodies(db_client, user_id, fake_openai):
    await populate(db_client, user_id, fake_openai)
    resp = await db_client.get("/v1/dashboard", headers=headers_for(user_id))
    raw = resp.text
    assert "secret question" not in raw and "Answer to" not in raw
    assert len(raw) < 10_000
    session_keys = set(resp.json()["recent_sessions"][0])
    assert session_keys == {"id", "title", "updated_at"}


async def test_dashboard_limits_the_recent_lists(db_client, user_id, fake_openai, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "dashboard_recent_limit", 1)
    monkeypatch.setattr(get_settings(), "dashboard_activity_limit", 3)
    monkeypatch.setattr(get_settings(), "dashboard_usage_days", 3)
    await populate(db_client, user_id, fake_openai)
    body = (await db_client.get("/v1/dashboard", headers=headers_for(user_id))).json()
    assert len(body["recent_sessions"]) == 1 and len(body["recent_documents"]) == 1
    assert len(body["recent_activity"]) == 3 and len(body["usage"]["daily"]) == 3


# --- export ------------------------------------------------------------------------------


def open_zip(resp) -> zipfile.ZipFile:
    return zipfile.ZipFile(io.BytesIO(resp.content))


def read_json(zf: zipfile.ZipFile, name: str):
    return json.loads(zf.read(name))


async def test_export_contains_every_section_and_every_original_file(
    db_client, user_id, fake_openai
):
    state = await populate(db_client, user_id, fake_openai)
    resp = await db_client.get("/v1/account/export", headers=headers_for(user_id))
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    assert resp.headers["content-disposition"].startswith('attachment; filename="docgenie-export-')
    assert resp.headers["content-length"] == str(len(resp.content))
    zf = open_zip(resp)
    assert zf.testzip() is None

    names = set(zf.namelist())
    assert {
        "account.json",
        "documents.json",
        "sessions.json",
        "messages.json",
        "feedback.json",
        "credit_transactions.json",
    } <= names

    account = read_json(zf, "account.json")
    assert account["user_id"] == user_id and account["missing_files"] == []
    assert account["balances"] == {"documents": 3, "messages": 23}

    documents = read_json(zf, "documents.json")
    assert {d["id"] for d in documents} == set(state["files"])
    for d in documents:
        file_name, original = state["files"][d["id"]]
        assert d["file_name"] == file_name and d["status"] == "ready"
        assert d["file"] == f"files/{d['id']}/{file_name}"
        assert zf.read(d["file"]) == original  # byte for byte
        assert "storage_key" not in d and "checksum" not in d and "user_id" not in d
    assert {n for n in names if n.startswith("files/")} == {d["file"] for d in documents}

    sessions = read_json(zf, "sessions.json")
    assert {s["id"] for s in sessions} == set(state["sessions"])
    messages = read_json(zf, "messages.json")
    assert len(messages) == 4 and {m["role"] for m in messages} == {"user", "assistant"}
    assert any("first secret question" in m["content"] for m in messages)
    assert all("parts" in m and "metrics" in m for m in messages)
    feedback = read_json(zf, "feedback.json")
    assert len(feedback) == 1 and feedback[0]["rating"] == "like" and feedback[0]["comment"] == "nice"
    ledger = read_json(zf, "credit_transactions.json")
    assert len(ledger) == 2 + 2 + 2  # 2 signup grants, 2 uploads, 2 chat turns
    assert all("user_id" not in row for row in ledger)


async def test_export_of_an_empty_account_is_a_valid_zip(db_client, user_id):
    resp = await db_client.get("/v1/account/export", headers=headers_for(user_id))
    assert resp.status_code == 200
    zf = open_zip(resp)
    for name in ("documents", "sessions", "messages", "feedback", "credit_transactions"):
        assert read_json(zf, f"{name}.json") == []
    assert read_json(zf, "account.json")["balances"] is None
    assert not [n for n in zf.namelist() if n.startswith("files/")]


async def test_export_lists_a_missing_original_instead_of_failing(db_client, user_id):
    did = (await upload(db_client, user_id, "gone.txt", factories.txt_bytes(100), "text/plain")).json()["id"]
    for key in await storage.list_keys(f"{storage.user_prefix(user_id)}{did}/"):
        await storage.delete_object(key)
    resp = await db_client.get("/v1/account/export", headers=headers_for(user_id))
    assert resp.status_code == 200
    zf = open_zip(resp)
    assert read_json(zf, "account.json")["missing_files"] == [did]
    assert read_json(zf, "documents.json")[0]["file"] is None


async def test_export_fails_with_503_when_storage_is_down(db_client, user_id, monkeypatch):
    await upload(db_client, user_id, "a.txt", factories.txt_bytes(100), "text/plain")

    async def broken(key):
        raise storage.StorageError("minio down")

    monkeypatch.setattr(storage, "open_object", broken)
    resp = await db_client.get("/v1/account/export", headers=headers_for(user_id))
    assert resp.status_code == 503 and resp.json()["status"] == "STORAGE_UNAVAILABLE"


# --- deletion ----------------------------------------------------------------------------


def user_tables() -> list[str]:
    return sorted(t.name for t in Base.metadata.sorted_tables if "user_id" in t.c)


async def rows_for(uid: str) -> dict[str, int]:
    return {t: await scalar(f"SELECT count(*) FROM {t} WHERE user_id = :u", u=uid) for t in user_tables()}


def test_every_table_with_a_user_id_is_deleted_with_the_account():
    import app.models  # noqa: F401

    covered = {m.__tablename__ for m in ACCOUNT_TABLES}  # type: ignore[attr-defined]
    assert covered == set(user_tables()), "add the new table to ACCOUNT_TABLES"


async def test_account_deletion_leaves_nothing_behind(db_client, user_id, fake_openai):
    await populate(db_client, user_id, fake_openai)
    other = f"{user_id}_other"
    await populate(db_client, other, fake_openai)

    before = await rows_for(user_id)
    assert all(n > 0 for n in before.values()), before  # every table really had data
    assert await storage.list_keys(storage.user_prefix(user_id)) != []

    resp = await db_client.delete("/v1/account", headers=headers_for(user_id))
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"deleted": {"documents": 2, "sessions": 2, "storage_objects": 2}}

    assert set((await rows_for(user_id)).values()) == {0}
    assert await storage.list_keys(storage.user_prefix(user_id)) == []
    # Everything of the other user is untouched.
    assert await rows_for(other) == before
    assert len(await storage.list_keys(storage.user_prefix(other))) == 2
    assert (await db_client.get("/v1/documents", headers=headers_for(other))).json()["documents"] != []
    # The deleted user's endpoints now see an empty account, and reading them recreates nothing
    # (in particular the dashboard does not grant signup credits again).
    assert (await db_client.get("/v1/documents", headers=headers_for(user_id))).json() == {"documents": []}
    gone = (await db_client.get("/v1/dashboard", headers=headers_for(user_id))).json()
    assert gone["balances"] == {"documents": 0, "messages": 0} and gone["recent_activity"] == []
    assert set((await rows_for(user_id)).values()) == {0}


async def test_account_deletion_is_idempotent(db_client, user_id, fake_openai):
    await populate(db_client, user_id, fake_openai)
    assert (await db_client.delete("/v1/account", headers=headers_for(user_id))).status_code == 200
    again = await db_client.delete("/v1/account", headers=headers_for(user_id))
    assert again.status_code == 200
    assert again.json() == {"deleted": {"documents": 0, "sessions": 0, "storage_objects": 0}}


async def test_storage_failure_during_deletion_is_503_and_a_retry_finishes_the_job(
    db_client, user_id, fake_openai, monkeypatch
):
    await populate(db_client, user_id, fake_openai)
    real = storage.delete_prefix

    async def broken(prefix):
        raise storage.StorageError("minio down")

    monkeypatch.setattr(storage, "delete_prefix", broken)
    resp = await db_client.delete("/v1/account", headers=headers_for(user_id))
    assert resp.status_code == 503 and resp.json()["status"] == "STORAGE_UNAVAILABLE"
    assert set((await rows_for(user_id)).values()) == {0}  # rows are gone ...
    assert await storage.list_keys(storage.user_prefix(user_id)) != []  # ... objects are not yet

    monkeypatch.setattr(storage, "delete_prefix", real)
    retry = await db_client.delete("/v1/account", headers=headers_for(user_id))
    assert retry.status_code == 200 and retry.json()["deleted"]["storage_objects"] == 2
    assert await storage.list_keys(storage.user_prefix(user_id)) == []


async def test_deleting_a_user_whose_id_is_a_prefix_of_another_keeps_the_other(
    db_client, user_id, fake_openai
):
    longer = f"{user_id}9"  # users/{id}/ must not match users/{id}9/
    await upload(db_client, longer, "keep.txt", factories.txt_bytes(100), "text/plain")
    await upload(db_client, user_id, "drop.txt", factories.txt_bytes(100), "text/plain")
    assert (await db_client.delete("/v1/account", headers=headers_for(user_id))).status_code == 200
    assert len(await storage.list_keys(storage.user_prefix(longer))) == 1


# --- access control ----------------------------------------------------------------------


async def test_cross_user_access_is_denied_on_every_endpoint(db_client, user_id, fake_openai):
    state = await populate(db_client, user_id, fake_openai)
    intruder = headers_for(f"{user_id}_intruder")

    dash = (await db_client.get("/v1/dashboard", headers=intruder)).json()
    assert dash["counts"]["documents"] == 0 and dash["counts"]["sessions"] == 0
    assert dash["recent_sessions"] == [] and dash["recent_documents"] == []
    assert dash["usage"]["messages_spent"] == 0

    zf = open_zip(await db_client.get("/v1/account/export", headers=intruder))
    assert read_json(zf, "documents.json") == [] and read_json(zf, "messages.json") == []
    assert not [n for n in zf.namelist() if n.startswith("files/")]

    await db_client.delete("/v1/account", headers=intruder)  # deletes only the intruder's own (empty) data
    owner = (await db_client.get("/v1/dashboard", headers=headers_for(user_id))).json()
    assert owner["counts"]["documents"] == 2 and {s["id"] for s in owner["recent_sessions"]} == set(state["sessions"])
    assert len(await storage.list_keys(storage.user_prefix(user_id))) == 2


@pytest.mark.parametrize(
    ("method", "path"),
    [("GET", "/v1/dashboard"), ("GET", "/v1/account/export"), ("DELETE", "/v1/account")],
)
async def test_endpoints_require_the_internal_key_and_the_user_header(db_client, method, path):
    key = {"X-Internal-Key": "test-internal-key"}
    assert (await db_client.request(method, path, headers=key)).status_code == 401  # no user
    assert (await db_client.request(method, path, headers={"X-User-Id": "u"})).status_code == 401  # no key
    wrong = {"X-Internal-Key": "nope", "X-User-Id": "u"}
    assert (await db_client.request(method, path, headers=wrong)).status_code == 401
