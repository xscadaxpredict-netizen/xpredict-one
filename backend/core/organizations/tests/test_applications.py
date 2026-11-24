"""
`GET /api/v1/orgs/<slug>/admin/applications/` -- the Admin panel's
App Management -> Applications page (C78).

Every sellable app (never Administration), whether the organisation
subscribes, its owner (the organisation's owner, on active apps) and how many
people can open it. Gated on `admin.application.view`.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.billing.models import AppSubscription, SubscriptionStatus
from core.organizations.models import (
    ActivationCode,
    Membership,
    MembershipAppAccess,
    MembershipStatus,
    Territory,
    TerritoryKind,
)
from core.organizations.services import grant_app_access, sign_up
from core.permissions.models import AppCode, Role

pytestmark = [
    pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS]),
]

URL = "/api/v1/orgs/{slug}/admin/applications/"


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def found(name="Acme Water", email="owner@acme.test", code="CODE-ACME"):
    # Signup subscribes DMS and gives the owner a DMS grant.
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
    return membership


def dealer(result, name="Delhi East"):
    return Territory.objects.create(
        organization=result.organization, kind=TerritoryKind.DEALER, name=name
    )


def rows(client, result):
    client.force_authenticate(user=result.user)
    response = client.get(URL.format(slug=result.organization.slug))
    assert response.status_code == 200
    return {row["code"]: row for row in response.json()}


class TestTheList:
    def test_every_sellable_app_in_order_and_never_administration(self, client):
        result = found()
        client.force_authenticate(user=result.user)

        body = client.get(URL.format(slug=result.organization.slug)).json()

        assert [row["code"] for row in body] == ["dms", "crm", "ecommerce"]
        assert [row["name"] for row in body] == ["DMS", "CRM", "E-commerce"]

    def test_the_fields_are_exactly_what_applications_ts_declares(self, client):
        result = found()
        client.force_authenticate(user=result.user)

        body = client.get(URL.format(slug=result.organization.slug)).json()

        assert set(body[0]) == {"code", "name", "active", "members", "owner"}
        assert set(body[0]["owner"]) == {"name", "email"}

    def test_active_is_an_active_subscription(self, client):
        result = found()
        AppSubscription.objects.create(
            organization=result.organization,
            app_id=AppCode.CRM,
            status=SubscriptionStatus.CANCELLED,
        )

        by_code = rows(client, result)

        assert by_code["dms"]["active"] is True
        assert by_code["crm"]["active"] is False  # cancelled
        assert by_code["ecommerce"]["active"] is False  # never bought


class TestOwnerAndMembers:
    def test_an_active_app_is_owned_by_the_organisations_owner(self, client):
        result = found()
        result.user.first_name, result.user.last_name = "Asha", "Rao"
        result.user.save()

        dms = rows(client, result)["dms"]

        assert dms["owner"] == {"name": "Asha Rao", "email": "owner@acme.test"}

    def test_an_inactive_app_has_no_owner_and_no_members(self, client):
        result = found()

        ecommerce = rows(client, result)["ecommerce"]

        assert ecommerce["owner"] is None
        assert ecommerce["members"] == 0

    def test_members_are_the_people_who_can_open_it_with_the_owner_once(self, client):
        result = found()
        place = dealer(result)
        member(result, app=AppCode.DMS, role_code="dms.manager", place=place, email="a@a.test")
        member(result, app=AppCode.DMS, role_code="dms.technician", place=place, email="b@a.test")

        # The owner holds a DMS grant from signup AND every app by rule:
        # counted once, so 1 + 2.
        assert rows(client, result)["dms"]["members"] == 3

    def test_a_disabled_member_is_not_counted(self, client):
        result = found()
        gone = member(
            result,
            app=AppCode.DMS,
            role_code="dms.manager",
            place=dealer(result),
            email="gone@acme.test",
        )
        gone.status = MembershipStatus.DISABLED
        gone.save()

        assert rows(client, result)["dms"]["members"] == 1

    def test_grants_left_on_a_cancelled_app_count_nobody(self, client):
        """C16: a grant is not revoked when billing lapses, and opens nothing."""
        result = found()
        AppSubscription.objects.filter(
            organization=result.organization, app_id=AppCode.DMS
        ).update(status=SubscriptionStatus.CANCELLED)

        dms = rows(client, result)["dms"]

        assert dms["active"] is False
        assert dms["members"] == 0

    def test_another_organisations_people_are_not_counted(self, client):
        acme = found()
        globex = found(name="Globex", email="owner@globex.test", code="CODE-GLOBEX")
        member(
            globex,
            app=AppCode.DMS,
            role_code="dms.manager",
            place=dealer(globex),
            email="g@globex.test",
        )

        assert rows(client, acme)["dms"]["members"] == 1


class TestWhoMayAsk:
    def test_an_organisation_admin_may(self, client):
        result = found()
        admin = member(
            result,
            app=AppCode.ADMIN,
            role_code="admin.org_admin",
            place=Territory.objects.root_for(result.organization, AppCode.ADMIN),
            email="admin@acme.test",
        )
        client.force_authenticate(user=admin.user)

        response = client.get(URL.format(slug=result.organization.slug))

        assert response.status_code == 200

    def test_a_dealer_admin_may_not(self, client):
        result = found()
        dealer_admin = member(
            result,
            app=AppCode.DMS,
            role_code="dms.system_admin",
            place=dealer(result),
            email="dealer@acme.test",
        )
        client.force_authenticate(user=dealer_admin.user)

        response = client.get(URL.format(slug=result.organization.slug))

        assert response.status_code == 403

    def test_somebody_from_another_organisation_gets_404(self, client):
        acme = found()
        globex = found(name="Globex", email="owner@globex.test", code="CODE-GLOBEX")
        client.force_authenticate(user=globex.user)

        response = client.get(URL.format(slug=acme.organization.slug))

        assert response.status_code == 404

    def test_the_answer_costs_the_same_few_queries_however_many_people(
        self, client, django_assert_max_num_queries
    ):
        result = found()
        place = dealer(result)
        for n in range(5):
            member(
                result,
                app=AppCode.DMS,
                role_code="dms.technician",
                place=place,
                email=f"t{n}@acme.test",
            )
        client.force_authenticate(user=result.user)

        # Authentication, membership and permission checks plus the selector's
        # four reads; a query per person or per app would blow well past this.
        with django_assert_max_num_queries(15):
            client.get(URL.format(slug=result.organization.slug))


MEMBERS_URL = "/api/v1/orgs/{slug}/admin/applications/{code}/members/"


def members_of(client, result, code="dms"):
    client.force_authenticate(user=result.user)
    response = client.get(MEMBERS_URL.format(slug=result.organization.slug, code=code))
    assert response.status_code == 200
    return response.json()


class TestAnAppsMembers:
    def test_the_owner_first_then_everyone_else_by_name(self, client):
        result = found()
        place = dealer(result)
        member(result, app=AppCode.DMS, role_code="dms.technician", place=place, email="zed@a.test")
        member(result, app=AppCode.DMS, role_code="dms.manager", place=place, email="amy@a.test")

        people = members_of(client, result)

        assert [person["email"] for person in people] == [
            "owner@acme.test",
            "amy@a.test",
            "zed@a.test",
        ]
        assert [person["is_owner"] for person in people] == [True, False, False]

    def test_each_person_carries_their_role_and_places(self, client):
        result = found()
        east, west = dealer(result, "Delhi East"), dealer(result, "Delhi West")
        user = User.objects.create_user(email="ravi@a.test", password="x")
        user.first_name, user.last_name = "Ravi", "Kumar"
        user.save()
        membership = Membership.objects.create(user=user, organization=result.organization)
        grant_app_access(
            membership=membership,
            app=AppCode.DMS,
            role=Role.objects.get(code="dms.manager"),
            territories=[west, east],
        )

        ravi = next(p for p in members_of(client, result) if p["email"] == "ravi@a.test")

        assert ravi == {
            "id": str(membership.pk),
            "name": "Ravi Kumar",
            "email": "ravi@a.test",
            "is_owner": False,
            "role": "Manager",
            "places": ["Delhi East", "Delhi West"],
        }

    def test_the_owner_placed_at_the_root_shows_the_organisations_name(self, client):
        """Signup gives the owner a DMS grant at the root, and the root shows
        the organisation's name (C72)."""
        result = found()

        owner = members_of(client, result)[0]

        assert owner["places"] == ["Acme Water"]
        assert owner["role"] is not None

    def test_an_owner_with_no_grant_is_still_listed_with_no_role(self, client):
        """The owner holds every app by rule (C72), grant or not."""
        result = found()
        MembershipAppAccess.objects.filter(membership=result.membership).delete()

        people = members_of(client, result)

        assert [(p["email"], p["is_owner"], p["role"], p["places"]) for p in people] == [
            ("owner@acme.test", True, None, [])
        ]

    def test_they_are_exactly_the_people_the_list_counts(self, client):
        result = found()
        place = dealer(result)
        for n in range(3):
            member(
                result,
                app=AppCode.DMS,
                role_code="dms.technician",
                place=place,
                email=f"m{n}@a.test",
            )

        assert len(members_of(client, result)) == rows(client, result)["dms"]["members"] == 4

    def test_nobody_disabled_and_nobody_from_another_organisation(self, client):
        acme = found()
        gone = member(
            acme, app=AppCode.DMS, role_code="dms.manager", place=dealer(acme), email="gone@a.test"
        )
        gone.status = MembershipStatus.DISABLED
        gone.save()
        globex = found(name="Globex", email="owner@globex.test", code="CODE-GLOBEX")
        member(
            globex, app=AppCode.DMS, role_code="dms.manager", place=dealer(globex), email="g@g.test"
        )

        assert [p["email"] for p in members_of(client, acme)] == ["owner@acme.test"]

    def test_an_app_not_subscribed_opens_for_nobody(self, client):
        result = found()

        assert members_of(client, result, code="ecommerce") == []

    def test_administration_and_unknown_codes_are_not_found(self, client):
        result = found()
        client.force_authenticate(user=result.user)

        for code in ("admin", "payroll"):
            response = client.get(MEMBERS_URL.format(slug=result.organization.slug, code=code))
            assert response.status_code == 404, code

    def test_seeing_the_list_is_not_seeing_its_members(self, client):
        """
        The Members tab is `admin.application.view_users` (C79, the owner's final
        list): somebody whose role holds only `admin.application.view` sees the
        list and is refused the members.
        """
        from core.permissions.models import Permission

        result = found()
        lister = Role.objects.create(
            app_id=AppCode.ADMIN, code="test.lister", name="Lister", level="org", summary="."
        )
        lister.permissions.add(Permission.objects.get(code="admin.application.view"))
        user = User.objects.create_user(email="lister@a.test", password="x")
        membership = Membership.objects.create(user=user, organization=result.organization)
        grant_app_access(
            membership=membership,
            app=AppCode.ADMIN,
            role=lister,
            territories=[Territory.objects.root_for(result.organization, AppCode.ADMIN)],
        )
        client.force_authenticate(user=user)

        listed = client.get(URL.format(slug=result.organization.slug))
        members = client.get(MEMBERS_URL.format(slug=result.organization.slug, code="dms"))

        assert listed.status_code == 200
        assert members.status_code == 403

    def test_a_dealer_admin_may_not_ask(self, client):
        result = found()
        dealer_admin = member(
            result,
            app=AppCode.DMS,
            role_code="dms.system_admin",
            place=dealer(result),
            email="dealer@a.test",
        )
        client.force_authenticate(user=dealer_admin.user)

        response = client.get(MEMBERS_URL.format(slug=result.organization.slug, code="dms"))

        assert response.status_code == 403

    def test_the_answer_costs_the_same_few_queries_however_many_people(
        self, client, django_assert_max_num_queries
    ):
        result = found()
        place = dealer(result)
        for n in range(5):
            member(
                result,
                app=AppCode.DMS,
                role_code="dms.technician",
                place=place,
                email=f"p{n}@a.test",
            )
        client.force_authenticate(user=result.user)

        with django_assert_max_num_queries(16):
            client.get(MEMBERS_URL.format(slug=result.organization.slug, code="dms"))
