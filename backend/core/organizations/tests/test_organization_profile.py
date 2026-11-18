"""
`GET /api/v1/orgs/<slug>/admin/organization/` -- the Admin panel's
Organization -> Profile page (C78).

Read-only: name, web address, owner, created, workspace ready. Gated on
`admin.organization_info.view`, which the owner holds by rule and the Organisation
admin role holds by `permissions/0012`; a dealer admin does not.
"""

from __future__ import annotations

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.organizations.models import ActivationCode, Membership, Territory, TerritoryKind
from core.organizations.services import grant_app_access, sign_up
from core.permissions.models import AppCode, Role

pytestmark = [
    pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS]),
]

URL = "/api/v1/orgs/{slug}/admin/organization/"


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def found(name="Acme Water", email="owner@acme.test", code="CODE-ACME"):
    ActivationCode.objects.create(code=code)
    return sign_up(
        activation_code=code,
        organization_name=name,
        email=email,
        password="correct horse battery staple",
    )


def member(result, *, app, role_code, place, email):
    user = User.objects.create_user(email=email, password="x")
    membership = Membership.objects.create(user=user, organization=result.organization)
    grant_app_access(
        membership=membership,
        app=app,
        role=Role.objects.get(code=role_code),
        territories=[place],
    )
    return user


def org_admin(result, email="admin@acme.test"):
    root = Territory.objects.root_for(result.organization)
    return member(result, app=AppCode.ADMIN, role_code="admin.org_admin", place=root, email=email)


def dealer_admin(result, email="dealer@acme.test"):
    dealer = Territory.objects.create(
        organization=result.organization, kind=TerritoryKind.DEALER, name="Delhi East"
    )
    return member(
        result, app=AppCode.DMS, role_code="dms.system_admin", place=dealer, email=email
    )


class TestWhatItShows:
    def test_the_owner_sees_name_address_owner_created_and_readiness(self, client):
        result = found()
        result.user.first_name, result.user.last_name = "Asha", "Rao"
        result.user.save()
        client.force_authenticate(user=result.user)

        response = client.get(URL.format(slug=result.organization.slug))

        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "Acme Water"
        assert body["slug"] == result.organization.slug
        assert body["owner"] == {"name": "Asha Rao", "email": "owner@acme.test"}
        assert body["created_at"].startswith(str(result.organization.created_at.date()))
        assert body["is_ready"] is result.organization.is_ready

    def test_the_fields_are_exactly_what_organization_ts_declares(self, client):
        """
        `OrganizationProfile` in `shell/admin/api/organization.ts` is the other
        half of this contract and nothing checks the two agree (C43).
        """
        result = found()
        client.force_authenticate(user=result.user)

        body = client.get(URL.format(slug=result.organization.slug)).json()

        assert set(body) == {"name", "slug", "created_at", "is_ready", "owner"}
        assert set(body["owner"]) == {"name", "email"}

    def test_an_owner_with_no_name_is_shown_by_their_address(self, client):
        result = found()
        client.force_authenticate(user=result.user)

        body = client.get(URL.format(slug=result.organization.slug)).json()

        assert body["owner"]["name"] == "owner@acme.test"

    def test_a_workspace_still_being_set_up_says_so(self, client):
        result = found()
        result.organization.provisioned_at = None
        result.organization.save()
        client.force_authenticate(user=result.user)

        body = client.get(URL.format(slug=result.organization.slug)).json()

        assert body["is_ready"] is False

    def test_a_ready_workspace_says_so(self, client):
        result = found()
        result.organization.provisioned_at = timezone.now()
        result.organization.save()
        client.force_authenticate(user=result.user)

        body = client.get(URL.format(slug=result.organization.slug)).json()

        assert body["is_ready"] is True


class TestWhoMayAsk:
    def test_an_organisation_admin_may(self, client):
        result = found()
        client.force_authenticate(user=org_admin(result))

        response = client.get(URL.format(slug=result.organization.slug))

        assert response.status_code == 200
        # The OWNER is still the owner, whoever asks.
        assert response.json()["owner"]["email"] == "owner@acme.test"

    def test_a_dealer_admin_may_not(self, client):
        """403, not 404: they are a member, so the organisation is no secret
        to them -- they may just not open this page (C23)."""
        result = found()
        client.force_authenticate(user=dealer_admin(result))

        response = client.get(URL.format(slug=result.organization.slug))

        assert response.status_code == 403

    def test_somebody_from_another_organisation_gets_404(self, client):
        """Cross-tenant is 404: an organisation you do not belong to must look
        like one that does not exist (C49)."""
        acme = found()
        globex = found(name="Globex", email="owner@globex.test", code="CODE-GLOBEX")
        client.force_authenticate(user=globex.user)

        response = client.get(URL.format(slug=acme.organization.slug))

        assert response.status_code == 404

    def test_nobody_signed_in_gets_401(self, client):
        result = found()

        response = client.get(URL.format(slug=result.organization.slug))

        assert response.status_code == 401
