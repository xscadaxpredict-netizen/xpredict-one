"""
Write operations on accounts and their tokens.

Token issuing lives here rather than in the view because it is not an HTTP
concern: a Celery task provisioning a tenant, or a management command, may need
to mint or revoke a token without a request in sight.

CREDENTIAL CHECKING DELIBERATELY DOES NOT. Verifying a password and answering
401 is the HTTP layer's own job — unlike a business rule, it has no meaning
outside a request, and routing it through a domain exception would invent a
category (`AuthenticationError`) that `shared/exceptions.py` does not have and
does not need.
"""

from __future__ import annotations

from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from core.accounts.models import User


def issue_tokens(user: User) -> tuple[str, str]:
    """Mint a fresh pair for a user who has just proved who they are."""
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token), str(refresh)


def rotate_tokens(raw_refresh: str) -> tuple[str, str | None]:
    """
    Exchange a refresh token for a new access token, rotating if configured.

    Returns `(access, refresh_or_None)`. The refresh is None when rotation is
    off, which tells the caller NOT to overwrite the cookie — writing a stale
    value back would shorten the session without anyone asking.

    Raises `TokenError` when the token is expired, malformed or already
    denylisted. The caller turns that into a 401; this function does not know
    what an HTTP status is.
    """
    refresh = RefreshToken(raw_refresh)
    access = str(refresh.access_token)

    from django.conf import settings

    if not settings.SIMPLE_JWT.get("ROTATE_REFRESH_TOKENS"):
        return access, None

    if settings.SIMPLE_JWT.get("BLACKLIST_AFTER_ROTATION"):
        # Spend the old token so a copy cannot be replayed. Needs the
        # token_blacklist app installed; without it this call raises rather
        # than silently doing nothing, which is the failure mode we want.
        refresh.blacklist()

    refresh.set_jti()
    refresh.set_exp()
    refresh.set_iat()

    return str(refresh.access_token), str(refresh)


def revoke_refresh_token(raw_refresh: str) -> bool:
    """
    Deny-list a refresh token. Used by logout.

    Returns whether anything was revoked, and NEVER RAISES on a bad token.
    Logging out with an expired or already-spent token is the normal end of a
    session, not an error — and a logout that can fail is a logout people
    learn to skip.
    """
    try:
        RefreshToken(raw_refresh).blacklist()
    except TokenError:
        return False
    return True
