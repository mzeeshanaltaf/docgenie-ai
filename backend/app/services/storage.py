"""MinIO / S3 object storage (boto3, path-style addressing, dummy region).

boto3 is synchronous, so every public coroutine runs the blocking call in a worker thread.
The bucket is private; the DB stores object *keys* (never URLs) and the backend streams
bytes to the user itself (`GET /v1/documents/{id}/content`).

Key format: ``users/{user_id}/{document_id}/{file_name}``.
"""

import asyncio
import logging
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.config import get_settings

log = logging.getLogger("docgenie.storage")

_client: Any = None
_client_key: tuple[str, str, str, str] | None = None

STREAM_CHUNK_BYTES = 256 * 1024


class StorageError(Exception):
    """Any failure talking to object storage (unreachable, bad credentials, missing bucket)."""


class ObjectNotFound(StorageError):
    """The key does not exist (as opposed to storage being unreachable)."""


_NOT_FOUND_CODES = ("404", "NoSuchKey", "NotFound")


@dataclass
class StoredObject:
    body: Any  # botocore StreamingBody
    content_length: int
    content_type: str | None


def get_client() -> Any:
    """Lazily build the boto3 client. Rebuilt if the S3 settings change (tests do this)."""
    global _client, _client_key
    s = get_settings()
    key = (s.s3_endpoint, s.s3_access_key_id, s.s3_secret_access_key, s.s3_region)
    if _client is None or _client_key != key:
        _client = boto3.client(
            "s3",
            endpoint_url=s.s3_endpoint or None,
            aws_access_key_id=s.s3_access_key_id,
            aws_secret_access_key=s.s3_secret_access_key,
            region_name=s.s3_region or "us-east-1",  # MinIO ignores it; the SDK requires one
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},  # MinIO: endpoint/bucket/key, not bucket.host
                retries={"max_attempts": 3, "mode": "standard"},
                connect_timeout=5,
                read_timeout=60,
            ),
        )
        _client_key = key
    return _client


def reset_client() -> None:
    global _client, _client_key
    _client = None
    _client_key = None


def _bucket() -> str:
    return get_settings().s3_bucket


_UNSAFE_NAME_CHARS = re.compile(r"[\x00-\x1f\x7f/\\]")


def safe_file_name(file_name: str) -> str:
    """Make a user-supplied file name safe to use as the last segment of an object key."""
    name = _UNSAFE_NAME_CHARS.sub("_", file_name).strip().strip(".") or "document"
    return name[:200]


def object_key(user_id: str, document_id: Any, file_name: str) -> str:
    return f"users/{user_id}/{document_id}/{safe_file_name(file_name)}"


def user_prefix(user_id: str) -> str:
    return f"users/{user_id}/"


async def _run(fn: Any, *args: Any, **kwargs: Any) -> Any:
    try:
        return await asyncio.to_thread(fn, *args, **kwargs)
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in _NOT_FOUND_CODES:
            raise ObjectNotFound(str(exc)) from exc
        raise StorageError(str(exc)) from exc
    except BotoCoreError as exc:
        raise StorageError(str(exc)) from exc


async def put_file(key: str, path: Path, content_type: str) -> None:
    """Upload a local file (multipart for large files is handled by upload_file)."""

    def _upload() -> None:
        get_client().upload_file(
            str(path), _bucket(), key, ExtraArgs={"ContentType": content_type}
        )

    await _run(_upload)


async def put_bytes(key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    await _run(
        lambda: get_client().put_object(
            Bucket=_bucket(), Key=key, Body=data, ContentType=content_type
        )
    )


async def open_object(key: str) -> StoredObject:
    """Open an object for streaming. Raises StorageError (incl. missing key)."""
    resp = await _run(lambda: get_client().get_object(Bucket=_bucket(), Key=key))
    return StoredObject(
        body=resp["Body"],
        content_length=int(resp.get("ContentLength", 0)),
        content_type=resp.get("ContentType"),
    )


async def iter_object(obj: StoredObject) -> AsyncIterator[bytes]:
    """Yield the object in chunks without blocking the event loop; always closes the body."""
    try:
        while True:
            chunk: bytes = await asyncio.to_thread(obj.body.read, STREAM_CHUNK_BYTES)
            if not chunk:
                return
            yield chunk
    finally:
        await asyncio.to_thread(obj.body.close)


async def read_bytes(key: str) -> bytes:
    obj = await open_object(key)
    try:
        return await asyncio.to_thread(obj.body.read)
    finally:
        await asyncio.to_thread(obj.body.close)


async def object_exists(key: str) -> bool:
    def _head() -> bool:
        try:
            get_client().head_object(Bucket=_bucket(), Key=key)
            return True
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
                return False
            raise

    return bool(await _run(_head))


async def delete_object(key: str) -> None:
    """Delete one object. Deleting a missing key is not an error (S3 semantics)."""
    await _run(lambda: get_client().delete_object(Bucket=_bucket(), Key=key))


async def list_keys(prefix: str) -> list[str]:
    def _list() -> list[str]:
        keys: list[str] = []
        paginator = get_client().get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=_bucket(), Prefix=prefix):
            keys.extend(obj["Key"] for obj in page.get("Contents", []))
        return keys

    return await _run(_list)


async def delete_prefix(prefix: str) -> int:
    """Delete every object under a prefix (account deletion, Phase 4). Returns the count."""
    keys = await list_keys(prefix)

    def _delete_batch(batch: list[str]) -> None:
        get_client().delete_objects(
            Bucket=_bucket(), Delete={"Objects": [{"Key": k} for k in batch], "Quiet": True}
        )

    for i in range(0, len(keys), 1000):
        await _run(_delete_batch, keys[i : i + 1000])
    return len(keys)


async def ensure_bucket() -> None:
    """Create the bucket if missing (local dev / tests). Production buckets are provisioned."""

    def _ensure() -> None:
        client = get_client()
        try:
            client.head_bucket(Bucket=_bucket())
        except ClientError:
            client.create_bucket(Bucket=_bucket())

    await _run(_ensure)


async def check_storage() -> bool:
    """Health probe: can we reach the endpoint and see the bucket?"""
    try:
        await _run(lambda: get_client().head_bucket(Bucket=_bucket()))
    except StorageError as exc:
        log.warning("storage health check failed: %s", exc)
        return False
    return True
