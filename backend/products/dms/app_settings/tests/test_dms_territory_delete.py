"""
Delete territory (the owner, 2026-11-24; C82 amended): "before deleting a
territory the records in that territory must be transferred to a different
territory".

`DELETE .../dms/settings/territories/<id>/ {transfer_to}` -- its DMS records
are transferred (the organisation's own database), its people move to the same
territory, then it goes. Refused while it has territories under it, never the
organisation, and checked BEFORE anything moves. `GET .../delete-preview/`
counts what would move. `dms.territory.delete`, held by no role.
"""

from __future__ import annotations

import uuid
from contextlib import contextmanager

import pytest
from rest_framework.test import APIClient

from config.routers import current_tenant_db
from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.organizations.models import (
    ActivationCode,
    Membership,
    MembershipAppAccess,
    MembershipAppTerritory,
    Territory,
    TerritoryKind,
)
from core.organizations.services import add_territory, grant_app_access, sign_up
from core.permissions.models import AppCode, Permission, Role, RolePermission
from products.dms.app_settings.services import (
    count_territory_records,
    territory_record_models,
)
from products.dms.sales.models import Enquiry
from shared.base_models import territory_scope

pytestmark = [
    pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS]),
]

GSTIN = "27AAPFU0939F1ZV"


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def found(name="Acme Water", email="owner@acme.test", code="CODE-ACME"):
    """An organisation whose own database is the test tenant database."""
    ActivationCode.objects.create(code=code)
    result = sign_up(
        activation_code=code,
        organization_name=name,
        email=email,
        password="correct horse battery staple",
    )
    result.organization.db_name = TEST_TENANT_ALIAS
    result.organization.save(update_fields=["db_name"])
    return result


@contextmanager
def tenant():
    """The test tenant database, every territory -- for building and reading records."""
    token = current_tenant_db.set(TEST_TENANT_ALIAS)
    try:
        with territory_scope(None):
            yield
    finally:
        current_tenant_db.reset(token)


def root(result, app=AppCode.DMS):
    return Territory.objects.root_for(result.organization, app)


def box(result, name, kind=TerritoryKind.REGION, parent=None):
    return add_territory(
        organization=result.organization,
        kind=kind,
        name=name,
        parent_id=parent.pk if parent else None,
        gstin=GSTIN if kind == TerritoryKind.DEALER else "",
    )


def enquiries_at(territory, count=1):
    # Every enquiry has its own number (`main`'s, merged 2026-11-26), unique per
    # territory: made unique across the test so a transfer never collides here.
    with tenant():
        return [
            Enquiry.objects.create(
                territory_id=territory.pk,
                enquiry_no=f"ENQ/TEST/{uuid.uuid4().hex[:12]}",
                customer_name=f"Customer {n}",
                phone="1234567890",
                created_by_user_id=uuid.uuid4(),
            )
            for n in range(count)
        ]


def territory_of(enquiry):
    with tenant():
        return Enquiry.all_territories.get(pk=enquiry.pk).territory_id


def member(result, *, email, places, role_code="dms.manager"):
    user = User.objects.create_user(email=email, password="x")
    membership = Membership.objects.create(user=user, organization=result.organization)
    grant_app_access(
        membership=membership,
        app=AppCode.DMS,
        role=Role.objects.get(code=role_code),
        territories=list(places),
    )
    return membership


def places_of(membership):
    grant = MembershipAppAccess.objects.get(membership=membership, app_id=AppCode.DMS)
    return sorted(p.territory.display_name for p in grant.territories.all())


def url(result, territory, rest=""):
    return f"/api/v1/orgs/{result.organization.slug}/dms/settings/territories/{territory.pk}/{rest}"


def as_owner(client, result):
    client.force_authenticate(user=result.user)
    return client


def delete(client, result, territory, transfer_to):
    return as_owner(client, result).delete(
        url(result, territory), {"transfer_to": str(transfer_to.pk)}, format="json"
    )


class TestDelete:
    def test_records_and_people_move_then_it_is_gone(self, client):
        result = found()
        north = box(result, "North")
        south = box(result, "South")
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER, north)
        moved = enquiries_at(delhi, 3)
        stays = enquiries_at(south)[0]
        ravi = member(result, email="ravi@acme.test", places=[delhi])
        both = member(result, email="both@acme.test", places=[delhi, south])

        response = delete(client, result, delhi, transfer_to=north)

        assert response.status_code == 204, response.content
        assert {territory_of(e) for e in moved} == {north.pk}
        assert territory_of(stays) == south.pk
        assert places_of(ravi) == ["North"]
        assert places_of(both) == ["North", "South"]
        assert not Territory.objects.filter(pk=delhi.pk).exists()
        assert Territory.objects.get(pk=north.pk).numchild == 0

    def test_the_organisation_can_take_everything(self, client):
        result = found()
        north = box(result, "North")
        enquiry = enquiries_at(north)[0]

        response = delete(client, result, north, transfer_to=root(result))

        assert response.status_code == 204, response.content
        assert territory_of(enquiry) == root(result).pk

    def test_the_preview_counts_what_would_move(self, client):
        result = found()
        north = box(result, "North")
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER, north)
        enquiries_at(north, 2)
        member(result, email="a@acme.test", places=[north])

        body = as_owner(client, result).get(url(result, north, "delete-preview/")).json()

        assert body == {"records": 2, "people": 1, "children": 1}
        assert delhi.pk  # it is the child counted

    def test_every_record_type_that_lives_at_a_territory_is_counted(self):
        """Found, not listed: a record type added later is transferred too."""
        names = {model.__name__ for model in territory_record_models()}

        assert {"Enquiry", "Customer", "Complaint", "ServiceReport", "CallRequest"} <= names
        # 19: TimerCalculation went with Timer Calculation (`main`, merged 2026-11-26).
        assert len(names) >= 19


class TestRefusedBeforeAnythingMoves:
    def test_while_territories_sit_under_it(self, client):
        result = found()
        north = box(result, "North")
        box(result, "Delhi Motors", TerritoryKind.DEALER, north)
        enquiry = enquiries_at(north)[0]

        response = delete(client, result, north, transfer_to=root(result))

        assert response.status_code == 409
        assert response.json()["code"] == "territory_has_children"
        assert territory_of(enquiry) == north.pk
        assert Territory.objects.filter(pk=north.pk).exists()

    def test_never_the_organisation(self, client):
        result = found()
        north = box(result, "North")

        response = delete(client, result, root(result), transfer_to=north)

        assert response.status_code == 409
        assert response.json()["code"] == "territory_is_the_organisation"

    def test_never_to_itself(self, client):
        result = found()
        north = box(result, "North")

        response = delete(client, result, north, transfer_to=north)

        assert response.status_code == 409
        assert response.json()["code"] == "transfer_to_itself"

    def test_somebody_who_cannot_move_to_the_target_stops_it(self, client):
        result = found()
        north = box(result, "North")
        south = box(result, "South")
        enquiry = enquiries_at(north)[0]
        # Holding the Admin panel AND placed at North: only data made before the
        # DMS-only rule can look like this (Nishanth, locally) -- the services
        # refuse it now, so the North placement is written straight in.
        person = member(result, email="both@acme.test", places=[root(result)])
        grant_app_access(
            membership=person,
            app=AppCode.ADMIN,
            role=Role.objects.get(code="admin.org_admin"),
            territories=[root(result, AppCode.ADMIN)],
        )
        MembershipAppTerritory.objects.create(
            app_access=MembershipAppAccess.objects.get(membership=person, app_id=AppCode.DMS),
            territory=north,
        )

        response = delete(client, result, north, transfer_to=south)

        assert response.status_code == 409
        assert response.json()["code"] == "other_apps_held"
        assert territory_of(enquiry) == north.pk
        assert Territory.objects.filter(pk=north.pk).exists()

    def test_another_organisation_s_territory_is_not_found(self, client):
        ours = found()
        north = box(ours, "North")
        enquiry = enquiries_at(north)[0]
        ActivationCode.objects.create(code="CODE-OTHER")
        theirs = sign_up(
            activation_code="CODE-OTHER",
            organization_name="Other Co",
            email="boss@other.test",
            password="correct horse battery staple",
        )
        their_box = add_territory(organization=theirs.organization, kind="region", name="Theirs")

        to_theirs = delete(client, ours, north, transfer_to=their_box)
        theirs_under_us = as_owner(client, ours).delete(
            url(ours, their_box), {"transfer_to": str(north.pk)}, format="json"
        )

        assert (to_theirs.status_code, theirs_under_us.status_code) == (404, 404)
        assert territory_of(enquiry) == north.pk
        assert Territory.objects.filter(pk=their_box.pk).exists()


class TestDeletingIsItsOwnPermission:
    def test_editing_territories_does_not_let_you_delete_one(self, client):
        result = found()
        role = Role.objects.create(
            code="dms.tree_editor",
            name="Tree editor",
            app_id=AppCode.DMS,
            level="org",
            summary="Sees and edits territories.",
            organization_id=result.organization.pk,
        )
        for code in ("dms.territory.view", "dms.territory.update"):
            RolePermission.objects.create(role=role, permission=Permission.objects.get(code=code))
        editor = member(result, email="ed@acme.test", places=[root(result)], role_code=role.code)
        north = box(result, "North")
        enquiry = enquiries_at(north)[0]
        client.force_authenticate(user=editor.user)

        refused = client.delete(url(result, north), {"transfer_to": str(root(result).pk)},
                                format="json")
        preview = client.get(url(result, north, "delete-preview/"))

        assert (refused.status_code, preview.status_code) == (403, 403)
        assert territory_of(enquiry) == north.pk
        assert Territory.objects.filter(pk=north.pk).exists()

    def test_no_role_holds_it(self):
        assert not Role.objects.filter(permissions__code="dms.territory.delete").exists()
        assert count_territory_records  # imported for the preview; used above via the API
