"""
Reading and writing the auth cookies (C12).

TOKENS NEVER APPEAR IN A RESPONSE BODY. They are set as httpOnly cookies, so
JavaScript cannot read them and one compromised npm dependency cannot exfiltrate
every session in the product. The cost, accepted in C12, is that cookies travel
automatically and CSRF protection therefore becomes mandatory — see
`authentication.py`.

simplejwt knows nothing about any of this: its own views return tokens in the
body for a client to store. These helpers are what make C12 true, and they are
the only place a cookie name or flag is written.
"""

from __future__ import annotations

from django.conf import settings
from rest_framework.response import Response


def set_auth_cookies(response: Response, access: str, refresh: str | None = None) -> Response:
    """
    Attach the access cookie, and the refresh cookie when one is supplied.

    `refresh` is optional because rotation is not guaranteed: with
    ROTATE_REFRESH_TOKENS off, a refresh call returns only a new access token
    and overwriting the refresh cookie with a stale value would end the session
    early.

    MAX AGE COMES FROM THE TOKEN LIFETIMES, not from a separate constant. Two
    numbers that must agree is one number too many: a cookie outliving its token
    produces a request that looks authenticated and is rejected, which reads
    like a server fault rather than an expiry.
    """
    response.set_cookie(
        settings.AUTH_COOKIE_ACCESS,
        access,
        max_age=int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        path="/",
    )

    if refresh is not None:
        response.set_cookie(
            settings.AUTH_COOKIE_REFRESH,
            refresh,
            max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
            httponly=True,
            secure=settings.AUTH_COOKIE_SECURE,
            samesite=settings.AUTH_COOKIE_SAMESITE,
            path=settings.AUTH_COOKIE_REFRESH_PATH,
        )

    return response


def clear_auth_cookies(response: Response) -> Response:
    """
    Delete both cookies.

    THE PATH MUST MATCH THE ONE THEY WERE SET WITH or the browser deletes
    nothing and keeps sending the old cookie — a logout that reports success
    and leaves the session alive. The refresh cookie is scoped to the auth
    endpoints, so it is deleted with that same path.
    """
    response.delete_cookie(
        settings.AUTH_COOKIE_ACCESS,
        path="/",
        samesite=settings.AUTH_COOKIE_SAMESITE,
    )
    response.delete_cookie(
        settings.AUTH_COOKIE_REFRESH,
        path=settings.AUTH_COOKIE_REFRESH_PATH,
        samesite=settings.AUTH_COOKIE_SAMESITE,
    )
    return response
