"""
The three auth endpoints. Permission -> deserialize -> service -> serialize.

Issued by the platform layer and never by an app (C6), and carrying no
organization: the org comes from the URL path, so switching organizations needs
no new token (C3).
"""

from __future__ import annotations

from typing import ClassVar

from django.contrib.auth import authenticate
from django.middleware.csrf import get_token
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError

from core.accounts.api.serializers import (
    LoginSerializer,
    MeSerializer,
    SignedInUserSerializer,
)
from core.accounts.authentication import enforce_csrf
from core.accounts.cookies import clear_auth_cookies, set_auth_cookies
from core.accounts.services import issue_tokens, revoke_refresh_token, rotate_tokens
from core.organizations.selectors import me as build_me
from shared.exceptions import AuthenticationError


class InvalidCredentialsError(AuthenticationError):
    """
    Wrong email, wrong password, or a disabled account.

    ONE EXCEPTION FOR ALL THREE, deliberately. Saying "no account with that
    email" turns the login form into a tool for discovering who banks with a
    dealership. The response is identical in every case, and so is the time it
    takes — `authenticate()` runs the password hasher even for an unknown
    email precisely so the two cannot be told apart by a stopwatch.
    """

    code = "invalid_credentials"
    message = "Email or password is incorrect."


class LoginView(APIView):
    """
    Exchange credentials for cookies.

    THE ONE ENDPOINT WITHOUT CSRF ENFORCEMENT, deliberately. There is no
    session yet and a first-time visitor holds no CSRF cookie, so requiring
    one would mean a round trip to fetch a token before anybody could sign
    in. The attack it would prevent is login-CSRF — signing a victim into
    the attacker's account — which is real but far milder than what the
    other two endpoints protect, and this response is what sets the CSRF
    cookie the rest of the session uses.
    """

    authentication_classes: ClassVar[list] = []
    permission_classes: ClassVar[list] = [AllowAny]

    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = authenticate(
            request,
            username=serializer.validated_data["email"],
            password=serializer.validated_data["password"],
        )

        if user is None:
            # 401, not 422: the input was well-formed, the credentials were
            # not. `authenticate()` already refuses an inactive user, so a
            # disabled account arrives here and is indistinguishable from a
            # wrong password — which is the intent.
            raise InvalidCredentialsError()

        access, refresh = issue_tokens(user)

        response = Response(SignedInUserSerializer(user).data, status=status.HTTP_200_OK)

        # Hand the frontend a CSRF token it CAN read, because every
        # state-changing request from here on must echo it back. Without this
        # the first POST after signing in fails the check in
        # CookieJWTAuthentication, and it looks like the login did not work.
        get_token(request)

        return set_auth_cookies(response, access, refresh)


class SessionView(APIView):
    """
    Who is signed in, if anyone.

    C12 makes "am I signed in?" SERVER state rather than client state: with
    the token in an httpOnly cookie there is nothing in JavaScript to inspect,
    so the only honest answer is whether a request succeeds.

    This is not `/me`, and both are kept. `/me` below answers the same question
    and much more, so this one looks redundant --- it is not. It touches a
    single table, which makes it the right thing for an interceptor to call on
    a 401 to find out whether the session is gone or the request was simply
    refused, and it is what the auth tests prove themselves against without
    needing an organization to exist.
    """

    permission_classes: ClassVar[list] = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        return Response(SignedInUserSerializer(request.user).data)


class MeView(APIView):
    """
    Who is signed in, where they belong, and what they may open.

    THE ENDPOINT THAT LETS THE FRONTEND DELETE ITS FAKES. Everything the shell
    needs to render itself comes from here in one request: the launcher's tiles
    (C15, C16), the organization switcher (C13), the sidebar's modules, and the
    permission strings `useAccess()` mirrors.

    NO ORGANIZATION IN THE PATH, deliberately, while almost everything else
    will be under `/api/v1/orgs/<slug>/`. This is the request that TELLS the
    browser which slugs exist --- it cannot require one it does not yet know.
    It is also why the token carries no organization (C3).

    A MIRROR, NOT A SOURCE. The permissions returned here are what the frontend
    hides buttons with. Every one of them is enforced again server-side on the
    request that acts (C19); nothing is authorised because it appeared in this
    payload.
    """

    permission_classes: ClassVar[list] = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        return Response(MeSerializer(build_me(request.user)).data)


class RefreshView(APIView):
    """Exchange the refresh cookie for a new access cookie."""

    authentication_classes: ClassVar[list] = []
    permission_classes: ClassVar[list] = [AllowAny]

    def post(self, request: Request) -> Response:
        from django.conf import settings

        # DRF exempts every APIView from CsrfViewMiddleware and expects the
        # authentication class to reinstate the check. This view has none —
        # it reads the cookie by hand — so the call has to be explicit, and
        # it matters most here: this is the endpoint that MINTS credentials.
        enforce_csrf(request)

        raw = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)

        if not raw:
            raise InvalidCredentialsError("No session to refresh.", code="no_refresh_token")

        try:
            access, refresh = rotate_tokens(raw)
        except TokenError as exc:
            # Expired, malformed, or already spent by rotation. All of them mean
            # one thing to the caller: sign in again.
            #
            # THE DEAD COOKIE IS LEFT IN PLACE, and an earlier draft of this
            # block tried to clear it by building a Response here and then
            # raising --- which does nothing at all, because raising discards
            # the response and the exception handler builds its own. Clearing
            # cookies from a raising path needs the handler to know about
            # cookies, and that would put a second translation point in the
            # codebase to tidy something harmless.
            #
            # Harmless because the refresh cookie is scoped to this endpoint:
            # it is never attached to ordinary API calls, every attempt to use
            # it answers 401, and signing in again overwrites it.
            raise InvalidCredentialsError(
                "Your session has expired.", code="session_expired", reason=str(exc)
            ) from exc

        return set_auth_cookies(Response(status=status.HTTP_204_NO_CONTENT), access, refresh)


class LogoutView(APIView):
    """Spend the refresh token and clear both cookies."""

    authentication_classes: ClassVar[list] = []
    permission_classes: ClassVar[list] = [AllowAny]

    def post(self, request: Request) -> Response:
        from django.conf import settings

        # Forcing somebody to sign out is only an annoyance, so this is the
        # weakest case for CSRF of the three — but a browser that has ever
        # signed in already holds the token, so demanding it costs a real
        # caller nothing and removes the need to argue about it again.
        enforce_csrf(request)

        raw = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)

        if raw:
            revoke_refresh_token(raw)

        # ALWAYS 204, even with no cookie, an expired token or one already
        # spent. A logout that can fail is a logout people stop trusting, and
        # there is nothing the caller could usefully do about the failure. The
        # cookies are cleared either way, which is the part that matters to
        # whoever pressed the button.
        return clear_auth_cookies(Response(status=status.HTTP_204_NO_CONTENT))
