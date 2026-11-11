"""Internal auth. FastAPI is private: only the Next.js proxy talks to it.

- `verify_internal_key` runs on every /v1 route (router-level dependency).
- `current_user_id` additionally requires X-User-Id, set by Next.js from the
  Better Auth session. Every later query must be scoped by this id.
"""

import hmac
from typing import Annotated

from fastapi import Depends, Header

from app.config import get_settings
from app.errors import ApiError, ErrorCode


async def verify_internal_key(
    x_internal_key: Annotated[str | None, Header(alias="X-Internal-Key")] = None,
) -> None:
    expected = get_settings().internal_api_key
    # An unset server key must never authenticate anyone.
    if not expected or not x_internal_key:
        raise ApiError(ErrorCode.UNAUTHORIZED, "Invalid or missing internal key.")
    if not hmac.compare_digest(x_internal_key.encode(), expected.encode()):
        raise ApiError(ErrorCode.UNAUTHORIZED, "Invalid or missing internal key.")


async def current_user_id(
    x_user_id: Annotated[str | None, Header(alias="X-User-Id")] = None,
) -> str:
    user_id = (x_user_id or "").strip()
    if not user_id:
        raise ApiError(ErrorCode.UNAUTHORIZED, "Missing user id.")
    return user_id


CurrentUserId = Annotated[str, Depends(current_user_id)]
