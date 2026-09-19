"""Two small, deliberately dumb middlewares -- neither needs a library.

MAX_BODY_BYTES is generous for a lab PDF (most are a few hundred KB; 15MB
comfortably covers a large multi-page scan) while still refusing an
obviously-abusive upload before it's fully read into memory. Checked via
Content-Length, which every normal HTTP client sends; it will not catch a
chunked-transfer request with no declared length, but combined with rate
limiting that's a narrow, low-value gap, not the main threat this closes.
"""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

MAX_BODY_BYTES = 15 * 1024 * 1024  # 15MB


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_BODY_BYTES:
            return JSONResponse(status_code=413, content={"detail": "request body too large"})
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response
