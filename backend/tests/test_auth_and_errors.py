import pytest

from app.errors import ERROR_HTTP_STATUS, ErrorCode
from tests.conftest import KEY

SHAPE = {"success", "status", "message", "details"}


async def test_missing_internal_key_rejected(client):
    r = await client.get("/v1/_test/me", headers={"X-User-Id": "u1"})
    assert r.status_code == 401
    assert set(r.json()) == SHAPE and r.json()["success"] is False


async def test_wrong_internal_key_rejected(client):
    r = await client.get("/v1/_test/me", headers={"X-Internal-Key": "nope", "X-User-Id": "u1"})
    assert r.status_code == 401


async def test_health_requires_internal_key(client):
    assert (await client.get("/v1/health")).status_code == 401


async def test_user_scoped_route_requires_user_id(client):
    r = await client.get("/v1/_test/me", headers=KEY)
    assert r.status_code == 401
    assert set(r.json()) == SHAPE


async def test_blank_user_id_rejected(client):
    r = await client.get("/v1/_test/me", headers={**KEY, "X-User-Id": "   "})
    assert r.status_code == 401


async def test_valid_headers_pass(client):
    r = await client.get("/v1/_test/me", headers={**KEY, "X-User-Id": "user-123"})
    assert r.status_code == 200
    assert r.json() == {"user_id": "user-123"}


async def test_internal_key_checked_before_user_id(client):
    # Bad key and no user id: the key failure is what is reported.
    r = await client.get("/v1/_test/me", headers={"X-Internal-Key": "nope"})
    assert r.status_code == 401
    assert "internal key" in r.json()["message"].lower()


@pytest.mark.parametrize(
    ("code", "http"),
    [
        ("INSUFFICIENT_CREDITS", 402),
        ("FILE_TOO_LARGE", 413),
        ("DUPLICATE_DOCUMENT", 409),
        ("PAGE_LIMIT_EXCEEDED", 400),
        ("ROWS_LIMIT_EXCEEDED", 400),
        ("UNSUPPORTED_TYPE", 415),
        ("NO_TEXT_FOUND", 422),
    ],
)
async def test_error_codes_map_to_http_status(client, code, http):
    r = await client.get(f"/v1/_test/raise/{code}", headers=KEY)
    assert r.status_code == http
    body = r.json()
    assert set(body) == SHAPE
    assert body["success"] is False and body["status"] == code
    assert body["details"] == {"k": "v"} and body["message"]


async def test_unhandled_error_is_generic_500(client):
    r = await client.get("/v1/_test/boom", headers=KEY)
    assert r.status_code == 500
    assert set(r.json()) == SHAPE
    assert "secret internals" not in r.text


async def test_unknown_route_uses_error_shape(client):
    r = await client.get("/v1/nope", headers=KEY)
    assert r.status_code == 404
    assert set(r.json()) == SHAPE


def test_every_plan_code_is_defined():
    for c in ("INSUFFICIENT_CREDITS", "FILE_TOO_LARGE", "DUPLICATE_DOCUMENT",
              "PAGE_LIMIT_EXCEEDED", "ROWS_LIMIT_EXCEEDED", "UNSUPPORTED_TYPE", "NO_TEXT_FOUND"):
        assert ErrorCode(c) in ERROR_HTTP_STATUS
