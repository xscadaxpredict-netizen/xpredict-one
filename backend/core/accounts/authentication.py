"""
JWT authentication that reads the access token from an httpOnly cookie (C12).

Two differences from simplejwt's `JWTAuthentication`, and both matter.

1. THE TOKEN COMES FROM A COOKIE, not from an Authorization header. The browser
   attaches it automatically; the frontend never sees it.

2. CSRF IS ENFORCED. That is the price of cookie auth, and C12 accepted it
   knowingly. A header-based token is immune to CSRF because an attacker's page
   cannot set the header; a cookie is attached by the browser to any request it
   makes, including one triggered from another origin. Without the check below,
   any site the user visits could POST to this API as them.

HOW A CALLER AUTHENTICATES, since there is no generated schema saying so:
send the `xp_access` cookie (set by POST /api/v1/auth/login/, httpOnly, so
the browser attaches it and JavaScript cannot read it), and on any
state-changing request also send the `X-CSRFToken` header, read from the
`csrftoken` cookie, which deliberately is readable.

WHAT THIS CLASS DOES NOT DO: decide anything about organizations. The org comes
from the URL path and is resolved by the tenant middleware (C3). A token proves
who you are and nothing about where.
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.middleware.csrf import CsrfViewMiddleware
from rest_framework import exceptions
from rest_framework.request import Request
from rest_framework_simplejwt.authentication import JWTAuthentication


class _CSRFCheck(CsrfViewMiddleware):
    """Expose the middleware's rejection reason instead of returning a response."""

    def _reject(self, request: Any, reason: str) -> str:  # type: ignore[override]
        return reason


def enforce_csrf(request: Request) -> None:
    """
    Run Django's own CSRF check. Raises `PermissionDenied` if it fails.

    A MODULE FUNCTION, not just a method, because DRF exempts every APIView
    from `CsrfViewMiddleware` and relies on the authentication class to put
    the check back. The auth endpoints set `authentication_classes = []` —
    they read cookies by hand — so without calling this they would have NO
    CSRF protection at all. The logout test caught exactly that.

    `process_view` exempts GET, HEAD, OPTIONS and TRACE itself, so reads are
    unaffected and only state-changing requests need the header.
    """
    check = _CSRFCheck(lambda req: None)
    check.process_request(request)
    reason = check.process_view(request, None, (), {})

    if reason:
        raise exceptions.PermissionDenied(f"CSRF failed: {reason}")


class CookieJWTAuthentication(JWTAuthentication):
    """Authenticate from the access cookie, then enforce CSRF."""

    def authenticate(self, request: Request) -> tuple[Any, Any] | None:
        raw_token = request.COOKIES.get(settings.AUTH_COOKIE_ACCESS)

        if raw_token is None:
            # Not "unauthenticated" — "this class has no opinion". Returning
            # None lets DRF fall through to the permission classes, which is
            # what produces a 401 on a protected view and lets an AllowAny view
            # (login, refresh) serve an anonymous caller normally.
            return None

        validated = self.get_validated_token(raw_token)
        user = self.get_user(validated)

        # Only after the token is known good: an attacker without a valid token
        # gains nothing from a CSRF message, and checking first would turn every
        # expired session into a confusing 403.
        enforce_csrf(request)

        return user, validated
