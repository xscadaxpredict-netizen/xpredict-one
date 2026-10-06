"""
The two unauthenticated signup endpoints.

They are the only public surface that checks a secret, which is what made Q20
a question. What answers it (C47) is 32 characters of entropy plus an IP
throttle, and the tests below cover the throttle because a rate limit nobody
exercises is a configuration value, not a protection.

THE CACHE IS CLEARED BETWEEN TESTS, and that is not tidiness. DRF keeps throttle
history in the Django cache, which outlives a test transaction -- so without
the fixture below, the test that exhausts the limit leaves it exhausted and
every later test in the file gets a 429 depending on the order they ran in.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.conf import settings
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.accounts.models import User
from core.organizations.models import ActivationCode, MembershipRole, Organization

pytestmark = pytest.mark.django_db

ACCESS = settings.AUTH_COOKIE_ACCESS
REFRESH = settings.AUTH_COOKIE_REFRESH

VALIDATE_URL = reverse("accounts:activation-code-validate")
SIGNUP_URL = reverse("accounts:signup")

DETAILS = {
    "organisation_name": "Acme Motors",
    "first_name": "Rahul",
    "last_name": "Kandaswamy",
    "email": "rahul@acmemotors.in",
    "password": "correct-horse-battery-staple",
}


@pytest.fixture(autouse=True)
def _clear_throttle_history():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def client() -> APIClient:
    # enforce_csrf_checks on, as in the auth tests. These two endpoints are
    # deliberately exempt -- a first-time visitor holds no CSRF cookie -- and
    # that exemption is only worth anything if the client would have enforced it.
    return APIClient(enforce_csrf_checks=True)


@pytest.fixture
def code() -> ActivationCode:
    return ActivationCode.objects.create(code="a-long-unguessable-code", label="Acme")


class TestValidatingACode:
    def test_a_usable_code_is_accepted(self, client, code):
        response = client.post(VALIDATE_URL, {"code": code.code}, format="json")

        assert response.status_code == 200
        # A BODY, not 204: the frontend's request() calls response.json()
        # unconditionally, so an empty 204 throws on the happy path.
        assert response.json() == {"valid": True}

    def test_an_unknown_code_is_422_and_says_invalid(self, client):
        response = client.post(VALIDATE_URL, {"code": "nope"}, format="json")

        assert response.status_code == 422
        assert response.json()["code"] == "activation_code_invalid"

    def test_a_spent_code_is_409_and_says_used_rather_than_invalid(self, client, code):
        """
        C14 asked for these to be told apart. The string is the contract --- the
        frontend switches on `code` to choose its wording, so `activation_code_used`
        matching `signup.ts` matters more than the status does.
        """
        code.spent_at = timezone.now()
        code.save(update_fields=["spent_at"])

        response = client.post(VALIDATE_URL, {"code": code.code}, format="json")

        assert response.status_code == 409
        assert response.json()["code"] == "activation_code_used"

    def test_an_expired_code_says_expired(self, client, code):
        """
        The third state, reachable now that Q20 chose a 90-day lifetime (C47).
        `signup.ts` has no case for this string yet and will show its generic
        fallback --- worth a line of frontend copy, and still better than
        telling a customer their real code is invalid.
        """
        code.expires_at = timezone.now() - timedelta(days=1)
        code.save(update_fields=["expires_at"])

        response = client.post(VALIDATE_URL, {"code": code.code}, format="json")

        assert response.status_code == 409
        assert response.json()["code"] == "activation_code_expired"

    def test_validating_does_not_spend_the_code(self, client, code):
        """
        Step one is a courtesy, not a reservation. If it consumed the code, a
        customer who checked it and then closed the tab would be locked out of
        the product they just bought.
        """
        client.post(VALIDATE_URL, {"code": code.code}, format="json")

        code.refresh_from_db()
        assert code.spent_at is None
        assert Organization.objects.count() == 0

    def test_a_missing_code_field_is_a_validation_error(self, client):
        """
        422, NOT 400. Every error leaves this API as RFC 9457
        problem+json and `config.exception_handler` maps DRF's own
        ValidationError to 422 with the code `validation_failed`, so a
        missing field reads the same as a field-level rule being broken.
        Asserting 400 here is what a test written from DRF defaults rather
        than from this codebase would say --- and it was, until it failed.
        """
        response = client.post(VALIDATE_URL, {}, format="json")

        assert response.status_code == 422
        assert response.json()["code"] == "validation_failed"
        assert [error["field"] for error in response.json()["errors"]] == ["code"]


class TestSigningUp:
    def test_it_creates_the_organisation_and_reports_the_slug(self, client, code):
        response = client.post(SIGNUP_URL, {"activation_code": code.code, **DETAILS}, format="json")

        assert response.status_code == 201
        assert response.json() == {"org_slug": "acme-motors", "is_ready": False}

        organization = Organization.objects.get()
        assert organization.slug == "acme-motors"
        assert organization.memberships.get().role == MembershipRole.OWNER

    def test_is_ready_is_false_because_the_database_is_not_there(self, client, code):
        """
        Not a placeholder --- an honest answer. Each organisation gets its own
        database (C1), created by a task that does not exist yet, so the
        account exists and its workspace does not. C14 gave that its own step
        and its own screen for exactly this reason.
        """
        response = client.post(SIGNUP_URL, {"activation_code": code.code, **DETAILS}, format="json")

        assert response.json()["is_ready"] is False

    def test_signing_up_signs_you_in(self, client, code):
        """
        The new owner is the only person in the organisation. Bouncing them to
        the login form to retype the password they just chose is friction, and
        the frontend already assumes this: its fake calls fakeSignIn() with a
        comment saying the real endpoint sets the cookie.
        """
        response = client.post(SIGNUP_URL, {"activation_code": code.code, **DETAILS}, format="json")

        assert ACCESS in response.cookies
        assert REFRESH in response.cookies
        # C12: the token goes out as a cookie JavaScript cannot read, and must
        # never also appear in the body where it could be stored.
        assert "access" not in response.json()
        assert "token" not in response.json()

    def test_the_cookies_are_httponly(self, client, code):
        response = client.post(SIGNUP_URL, {"activation_code": code.code, **DETAILS}, format="json")

        assert response.cookies[ACCESS]["httponly"] is True
        assert response.cookies[REFRESH]["httponly"] is True

    def test_it_spends_the_code(self, client, code):
        client.post(SIGNUP_URL, {"activation_code": code.code, **DETAILS}, format="json")

        code.refresh_from_db()
        assert code.spent_at is not None
        assert code.organization_id == Organization.objects.get().id

    def test_a_second_signup_on_the_same_code_is_refused(self, client, code):
        client.post(SIGNUP_URL, {"activation_code": code.code, **DETAILS}, format="json")

        response = client.post(
            SIGNUP_URL,
            {"activation_code": code.code, **DETAILS, "email": "second@example.com"},
            format="json",
        )

        assert response.status_code == 409
        assert response.json()["code"] == "activation_code_used"
        assert Organization.objects.count() == 1

    def test_a_taken_email_is_409_with_the_string_the_frontend_expects(self, client, code):
        User.objects.create_user(email="rahul@acmemotors.in", password="x")

        response = client.post(SIGNUP_URL, {"activation_code": code.code, **DETAILS}, format="json")

        assert response.status_code == 409
        assert response.json()["code"] == "email_taken"

    def test_a_taken_email_does_not_spend_the_code(self, client, code):
        User.objects.create_user(email="rahul@acmemotors.in", password="x")

        client.post(SIGNUP_URL, {"activation_code": code.code, **DETAILS}, format="json")

        code.refresh_from_db()
        assert code.spent_at is None

    def test_an_unusable_organisation_name_is_refused(self, client, code):
        response = client.post(
            SIGNUP_URL,
            {"activation_code": code.code, **DETAILS, "organisation_name": "A" * 70},
            format="json",
        )

        assert response.status_code == 422
        assert response.json()["code"] == "organization_name_too_long"

    def test_no_signup_is_possible_without_a_code(self, client):
        """The gate is the serializer, before any of the service runs."""
        response = client.post(SIGNUP_URL, DETAILS, format="json")

        assert response.status_code == 422
        assert [error["field"] for error in response.json()["errors"]] == [
            "activation_code"
        ]
        assert Organization.objects.count() == 0
        assert User.objects.count() == 0


class TestTheThrottle:
    """
    Q20's rate limiting (C47), exercised rather than merely configured.

    The entropy is what makes a code unguessable; this is the brake on
    automation. A limit nobody tests is a settings value that can be removed
    by accident and noticed by nobody.
    """

    def test_the_validate_endpoint_stops_answering_after_twenty_attempts(self, client):
        for _ in range(20):
            client.post(VALIDATE_URL, {"code": "wrong"}, format="json")

        response = client.post(VALIDATE_URL, {"code": "wrong"}, format="json")

        assert response.status_code == 429

    def test_signup_shares_the_same_budget_as_validate(self, client, code):
        """
        ONE SCOPE FOR BOTH, and throttling only the first step would be
        theatre: the signup endpoint takes a code too, so an attacker who
        skipped step one would be guessing against an unthrottled endpoint.
        """
        for _ in range(20):
            client.post(VALIDATE_URL, {"code": "wrong"}, format="json")

        response = client.post(SIGNUP_URL, {"activation_code": code.code, **DETAILS}, format="json")

        assert response.status_code == 429
        assert Organization.objects.count() == 0

    def test_a_legitimate_first_attempt_is_not_throttled(self, client, code):
        """The limit has to leave the actual customer alone."""
        response = client.post(SIGNUP_URL, {"activation_code": code.code, **DETAILS}, format="json")

        assert response.status_code == 201
