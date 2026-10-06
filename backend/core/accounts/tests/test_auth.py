"""
Auth tests. They cover the refusals, because the happy path is the easy half.

EVERY ONE OF THESE WAS CONFIRMED TO FAIL WITH ITS FIX REVERTED. That habit has
caught a useless test in every session it has been run, and five of this
project's bugs have shared one shape: a check that CANNOT fail is
indistinguishable from a check that passes.
"""

from __future__ import annotations

import pytest
from django.conf import settings
from django.urls import reverse
from rest_framework.test import APIClient

from core.accounts.models import User

pytestmark = pytest.mark.django_db

PASSWORD = "correct-horse-battery-staple"
ACCESS = settings.AUTH_COOKIE_ACCESS
REFRESH = settings.AUTH_COOKIE_REFRESH


@pytest.fixture
def user() -> User:
    return User.objects.create_user(
        email="rahul@acmemotors.in", password=PASSWORD, first_name="Rahul"
    )


@pytest.fixture
def client() -> APIClient:
    # enforce_csrf_checks, or DRF's test client disables the very protection
    # CookieJWTAuthentication exists to apply, and the CSRF tests below pass
    # for free. This is the single most important line in the file.
    return APIClient(enforce_csrf_checks=True)


def login(
    client: APIClient,
    email: str = "rahul@acmemotors.in",
    password: str = PASSWORD,
    origin: str | None = None,
):
    extra = {"HTTP_ORIGIN": origin, "HTTP_REFERER": f"{origin}/"} if origin else {}
    return client.post(
        reverse("accounts:login"),
        {"email": email, "password": password},
        format="json",
        **extra,
    )


def csrf_headers(client: APIClient) -> dict:
    """The header a browser would echo back from the readable csrftoken cookie."""
    return {"HTTP_X_CSRFTOKEN": client.cookies["csrftoken"].value}


# ---------------------------------------------------------------------------
# Signing in
# ---------------------------------------------------------------------------


class TestLogin:
    def test_sets_both_cookies_httponly(self, client, user):
        response = login(client)

        assert response.status_code == 200
        assert client.cookies[ACCESS]["httponly"] is True
        assert client.cookies[REFRESH]["httponly"] is True

    def test_puts_no_token_in_the_body(self, client, user):
        """
        The whole point of C12. A token in the body is readable by any injected
        script, which is exactly what the httpOnly cookie exists to prevent.
        """
        response = login(client)
        serialised = str(response.json())

        assert response.json()["email"] == "rahul@acmemotors.in"
        assert "access" not in serialised
        assert "refresh" not in serialised
        assert client.cookies[ACCESS].value not in serialised

    def test_scopes_the_refresh_cookie_to_the_auth_endpoints(self, client, user):
        """
        The refresh token is the long-lived credential. There is no reason for
        the browser to attach it to every API call for seven days.
        """
        login(client)

        assert client.cookies[REFRESH]["path"] == settings.AUTH_COOKIE_REFRESH_PATH
        assert client.cookies[ACCESS]["path"] == "/"

    def test_wrong_password_and_unknown_email_are_indistinguishable(self, client, user):
        """
        Different answers here turn the login form into a tool for discovering
        who holds an account.
        """
        wrong_password = login(client, password="not-the-password")
        unknown_email = login(client, email="nobody@example.com")

        assert wrong_password.status_code == unknown_email.status_code == 401
        assert wrong_password.json()["detail"] == unknown_email.json()["detail"]
        assert wrong_password.json()["code"] == unknown_email.json()["code"]

    def test_refuses_a_disabled_account(self, client, user):
        user.is_active = False
        user.save(update_fields=["is_active"])

        response = login(client)

        assert response.status_code == 401
        assert ACCESS not in response.cookies


# ---------------------------------------------------------------------------
# Using the session
# ---------------------------------------------------------------------------


class TestSession:
    def test_the_access_cookie_authenticates(self, client, user):
        login(client)

        response = client.get(reverse("accounts:session"))

        assert response.status_code == 200
        assert response.json()["email"] == "rahul@acmemotors.in"

    def test_no_cookie_is_401(self, client, user):
        assert client.get(reverse("accounts:session")).status_code == 401

    def test_disabling_a_user_takes_effect_on_the_next_request(self, client, user):
        """
        THE ANSWER TO Q17, and the reason the access-token lifetime is not the
        exposure window that question assumed. simplejwt loads the user row on
        every request and refuses an inactive one, so this does not wait fifteen
        minutes for a token to expire.
        """
        login(client)
        assert client.get(reverse("accounts:session")).status_code == 200

        user.is_active = False
        user.save(update_fields=["is_active"])

        assert client.get(reverse("accounts:session")).status_code == 401

    def test_changing_the_password_invalidates_the_session(self, client, user):
        """CHECK_REVOKE_TOKEN. "Change your password to sign out everywhere"."""
        login(client)
        assert client.get(reverse("accounts:session")).status_code == 200

        user.set_password("a-completely-different-password")
        user.save(update_fields=["password"])

        assert client.get(reverse("accounts:session")).status_code == 401


# ---------------------------------------------------------------------------
# CSRF, the price of cookie auth (C12)
# ---------------------------------------------------------------------------


class TestCsrf:
    def test_unsafe_request_without_the_header_is_refused(self, client, user):
        """
        Without this check any site the user visits could POST to this API as
        them: the browser attaches the cookie to a cross-origin request whether
        or not the page that triggered it is ours.
        """
        login(client)

        response = client.post(reverse("accounts:logout"))

        assert response.status_code == 403
        assert "CSRF" in str(response.json())

    def test_unsafe_request_with_the_header_is_allowed(self, client, user):
        login(client)

        response = client.post(reverse("accounts:logout"), **csrf_headers(client))

        assert response.status_code == 204

    def test_reads_do_not_need_the_header(self, client, user):
        """Django exempts safe methods itself. Asserted so nobody "fixes" that."""
        login(client)

        assert client.get(reverse("accounts:session")).status_code == 200

    def test_accepts_a_request_from_the_frontend_origin(self, client, user):
        """
        THE TEST CLIENT IS SAME-ORIGIN AND THE REAL FRONTEND IS NOT. Every other
        test here sends no Origin header, so Django's origin check never runs and
        they all pass whether or not CSRF_TRUSTED_ORIGINS is set.

        It was not set. Against a real browser every POST, PATCH and DELETE from
        the Vite dev server answered 403 "Origin checking failed", and nothing in
        this file noticed. This test sends the header a browser sends.

        THE ORIGIN IS WRITTEN OUT, not read from CSRF_TRUSTED_ORIGINS. Reading
        the allowed list and sending it straight back asserts only that the list
        matches itself; it would pass with the frontend's real origin missing.
        This is the address the Vite dev server actually serves on.
        """
        origin = "http://localhost:5173"
        login(client, origin=origin)

        response = client.post(
            reverse("accounts:logout"),
            HTTP_ORIGIN=origin,
            HTTP_REFERER=f"{origin}/",
            **csrf_headers(client),
        )

        assert response.status_code == 204

    def test_refuses_a_request_from_an_unknown_origin(self, client, user):
        """A site the user happens to be visiting is not a trusted origin."""
        login(client)

        response = client.post(
            reverse("accounts:logout"),
            HTTP_ORIGIN="https://evil.example.com",
            HTTP_REFERER="https://evil.example.com/",
            **csrf_headers(client),
        )

        assert response.status_code == 403
        assert "Origin checking failed" in str(response.json())


# ---------------------------------------------------------------------------
# Refresh and logout
# ---------------------------------------------------------------------------


class TestRefresh:
    def test_issues_a_new_access_cookie(self, client, user):
        login(client)
        first = client.cookies[ACCESS].value

        response = client.post(reverse("accounts:refresh"), **csrf_headers(client))

        assert response.status_code == 204
        assert client.cookies[ACCESS].value != first

    def test_the_old_refresh_token_cannot_be_replayed(self, client, user):
        """
        Rotation without a denylist is theatre: the old token keeps working, so
        a copied cookie is as good as the real session. This is the test that
        proves BLACKLIST_AFTER_ROTATION is wired up. It was set for four
        sessions while the token_blacklist app was not installed, and did
        nothing at all.
        """
        login(client)
        stolen = client.cookies[REFRESH].value

        client.post(reverse("accounts:refresh"), **csrf_headers(client))

        client.cookies[REFRESH] = stolen
        replay = client.post(reverse("accounts:refresh"), **csrf_headers(client))

        assert replay.status_code == 401
        assert replay.json()["code"] == "session_expired"

    def test_without_a_refresh_cookie_is_401(self, client, user):
        login(client)
        del client.cookies[REFRESH]

        response = client.post(reverse("accounts:refresh"), **csrf_headers(client))

        assert response.status_code == 401


class TestLogout:
    def test_clears_both_cookies(self, client, user):
        login(client)

        response = client.post(reverse("accounts:logout"), **csrf_headers(client))

        assert response.status_code == 204
        assert response.cookies[ACCESS].value == ""
        assert response.cookies[REFRESH].value == ""

    def test_the_refresh_token_is_spent(self, client, user):
        """
        Clearing a cookie signs out the browser in front of you. It does nothing
        about a copy taken earlier, which is what the denylist is for.
        """
        login(client)
        stolen = client.cookies[REFRESH].value
        headers = csrf_headers(client)

        client.post(reverse("accounts:logout"), **headers)

        client.cookies[REFRESH] = stolen
        replay = client.post(reverse("accounts:refresh"), **headers)

        # THE CSRF HEADER AND THE EXACT STATUS BOTH MATTER. An earlier version
        # of this test replayed without the header and accepted "401 or 403",
        # so it passed whether or not logout revoked anything -- CSRF refused
        # the request before the denylist was ever consulted. The revert check
        # caught it: logout was gutted and the test stayed green.
        assert replay.status_code == 401
        assert replay.json()["code"] == "session_expired"

    def test_succeeds_when_the_session_has_already_expired(self, client, user):
        """
        The realistic case: somebody leaves a tab open overnight and presses
        sign out in the morning. There is no refresh token left to revoke.

        A logout that can fail is a logout people stop trusting, and there is
        nothing the caller could do about the failure anyway.

        The CSRF cookie stays, because a browser that has ever signed in keeps
        it. Only the auth cookies are dropped, which is what expiry looks like.
        """
        login(client)
        headers = csrf_headers(client)
        del client.cookies[ACCESS]
        del client.cookies[REFRESH]

        assert client.post(reverse("accounts:logout"), **headers).status_code == 204
