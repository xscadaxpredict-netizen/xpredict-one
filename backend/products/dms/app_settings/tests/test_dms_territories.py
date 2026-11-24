"""
DMS settings -> Security & Controls -> Territory Management (the owner,
2026-11-24; C78 and C82 amended).

`/api/v1/orgs/<slug>/dms/settings/territories/`: DMS's tree (GET), New
Territory (POST), Edit (PUT `<id>/`), Close / Reopen (POST `<id>/close|reopen/`).
Gated on `dms.territory.*`, which no role holds: the owner alone, for now.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.organizations.exceptions import (
    TerritoryAlreadyClosedError,
    TerritoryGstinRequiredError,
    TerritoryIsTheOrganisationError,
)
from core.organizations.models import (
    ActivationCode,
    Membership,
    Territory,
    TerritoryKind,
    UnitStatus,
)
from core.organizations.selectors import is_shut_out_by_closure
from core.organizations.services import (
    add_territory,
    close_territory,
    grant_app_access,
    reopen_territory,
    sign_up,
    update_territory,
)
from core.permissions.models import AppCode, Permission, Role, RolePermission

pytestmark = [
    pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS]),
]

GSTIN = "27AAPFU0939F1ZV"
GSTIN_PAN = "AAPFU0939F"
OTHER_GSTIN = "29AAGCB7383J1Z4"
OTHER_GSTIN_PAN = "AAGCB7383J"

PERMISSIONS = [
    "dms.territory.view",
    "dms.territory.create",
    "dms.territory.update",
    "dms.territory.set_status",
]


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


def root(result, app=AppCode.DMS):
    return Territory.objects.root_for(result.organization, app)


def box(result, name, kind=TerritoryKind.REGION, parent=None, **details):
    """A territory in DMS's tree, straight through the service."""
    return add_territory(
        organization=result.organization,
        kind=kind,
        name=name,
        parent_id=parent.pk if parent else None,
        gstin=details.pop("gstin", GSTIN if kind == TerritoryKind.DEALER else ""),
        **details,
    )


def member(result, *, email, app=AppCode.DMS, role_code="dms.manager", place):
    user = User.objects.create_user(email=email, password="x")
    membership = Membership.objects.create(user=user, organization=result.organization)
    grant_app_access(
        membership=membership,
        app=app,
        role=Role.objects.get(code=role_code),
        territories=[place],
    )
    return membership


def url(result, rest=""):
    return f"/api/v1/orgs/{result.organization.slug}/dms/settings/territories/{rest}"


def as_owner(client, result):
    client.force_authenticate(user=result.user)
    return client


def tree(client, result):
    response = as_owner(client, result).get(url(result))
    assert response.status_code == 200, response.content
    return response.json()


def a_new(**overrides):
    return {
        "kind": "dealer",
        "name": "Delhi Motors",
        "parent_id": None,
        "code": "DLM-01",
        "gstin": GSTIN,
        "pan": "",
        "contact_person": "Ravi Sharma",
        "email": "ravi@delhi.test",
        "phone": "+91 98100 00000",
        "city": "New Delhi",
        "state": "Delhi",
        "postal_code": "110001",
        **overrides,
    }


def an_edit(**overrides):
    body = a_new(**overrides)
    body.pop("kind", None)
    body.pop("parent_id", None)
    return body


# --- The tree ---------------------------------------------------------------------


class TestTheTree:
    def test_a_new_organisation_is_its_root_alone_named_after_it(self, client):
        result = found()

        body = tree(client, result)

        assert len(body) == 1
        top = body[0]
        assert top["kind"] == "organisation"
        assert top["is_root"] is True
        assert top["parent_id"] is None
        assert top["name"] == "Acme Water"

    def test_the_fields_are_exactly_what_the_frontend_declares(self, client):
        result = found()

        body = tree(client, result)

        assert set(body[0]) == {
            "id",
            "kind",
            "name",
            "parent_id",
            "is_root",
            "status",
            "code",
            "gstin",
            "pan",
            "contact_person",
            "email",
            "phone",
            "city",
            "state",
            "postal_code",
            "people_count",
        }

    def test_tree_order_each_box_after_its_parent(self, client):
        result = found()
        north = box(result, "North")
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER, north)
        box(result, "Noida", TerritoryKind.BRANCH, delhi)
        box(result, "South")

        body = tree(client, result)

        by_id = {row["id"]: row for row in body}
        seen = set()
        for row in body:
            assert row["parent_id"] is None or row["parent_id"] in seen
            seen.add(row["id"])
        assert by_id[str(delhi.pk)]["parent_id"] == str(north.pk)
        assert by_id[str(north.pk)]["parent_id"] == str(root(result).pk)

    def test_people_count_is_the_people_placed_at_the_box(self, client):
        result = found()
        north = box(result, "North")
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER, north)
        member(result, email="a@acme.test", place=delhi)
        member(result, email="b@acme.test", place=delhi)

        counts = {row["name"]: row["people_count"] for row in tree(client, result)}

        assert counts["Delhi Motors"] == 2
        # Placed AT a box, not under it: the screen adds the subtree up itself.
        assert counts["North"] == 0

    def test_only_dms_s_tree(self, client):
        result = found()
        # The Admin panel's own root exists (it holds organisation admins).
        root(result, AppCode.ADMIN)

        body = tree(client, result)

        assert [row["kind"] for row in body] == ["organisation"]
        assert body[0]["id"] == str(root(result).pk)

    def test_never_another_organisation_s_territories(self, client):
        ours = found()
        theirs = found(name="Other Co", email="boss@other.test", code="CODE-OTHER")
        box(theirs, "Their Region")

        names = [row["name"] for row in tree(client, ours)]

        assert names == ["Acme Water"]


# --- Who may ask ------------------------------------------------------------------


class TestWhoMayAsk:
    """THE OWNER ALONE, for now (Q63): no role holds `dms.territory.*`."""

    def test_no_role_holds_any_of_the_permissions(self):
        assert Permission.objects.filter(code__in=PERMISSIONS).count() == 4
        assert not Role.objects.filter(permissions__code__in=PERMISSIONS).exists()

    def test_an_organisation_admin_is_refused(self, client):
        result = found()
        admin = member(
            result,
            email="admin@acme.test",
            app=AppCode.ADMIN,
            role_code="admin.org_admin",
            place=root(result, AppCode.ADMIN),
        )

        client.force_authenticate(user=admin.user)

        assert client.get(url(result)).status_code == 403
        assert client.post(url(result), a_new(), format="json").status_code == 403
        assert not Territory.objects.filter(name="Delhi Motors").exists()

    @pytest.mark.parametrize("role_code", ["dms.group_operations", "dms.fleet_viewer"])
    def test_an_organisation_level_dms_role_is_refused(self, client, role_code):
        result = found()
        person = member(result, email="hq@acme.test", role_code=role_code, place=root(result))

        client.force_authenticate(user=person.user)

        assert client.get(url(result)).status_code == 403

    def test_a_dealer_s_system_administrator_is_refused(self, client):
        result = found()
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER)
        person = member(result, email="sa@acme.test", role_code="dms.system_admin", place=delhi)

        client.force_authenticate(user=person.user)

        assert client.get(url(result)).status_code == 403
        assert client.post(url(result, f"{delhi.pk}/close/")).status_code == 403

    def test_another_organisation_s_owner_gets_not_found(self, client):
        ours = found()
        theirs = found(name="Other Co", email="boss@other.test", code="CODE-OTHER")

        client.force_authenticate(user=theirs.user)

        assert client.get(url(ours)).status_code == 404

    def test_signed_out_is_401(self, client):
        result = found()

        assert client.get(url(result)).status_code == 401


class TestEachActIsItsOwnPermission:
    """
    A role that may SEE the tree and nothing else: each act must still be
    refused, by its own permission rather than borrowing the tree's.
    """

    @pytest.fixture
    def looker(self, client):
        result = found()
        role = Role.objects.create(
            code="dms.tree_looker",
            name="Tree looker",
            app_id=AppCode.DMS,
            level="org",
            summary="Sees DMS's territory tree.",
            organization_id=result.organization.pk,
        )
        RolePermission.objects.create(
            role=role, permission=Permission.objects.get(code="dms.territory.view")
        )
        person = member(result, email="looker@acme.test", role_code=role.code, place=root(result))
        north = box(result, "North")
        client.force_authenticate(user=person.user)
        return result, north

    def test_seeing_is_allowed(self, client, looker):
        result, _north = looker
        assert client.get(url(result)).status_code == 200

    def test_new_territory(self, client, looker):
        result, _north = looker
        response = client.post(url(result), a_new(), format="json")
        assert response.status_code == 403
        assert not Territory.objects.filter(name="Delhi Motors").exists()

    def test_edit(self, client, looker):
        result, north = looker
        body = an_edit(name="Renamed", gstin="", code="")
        assert client.put(url(result, f"{north.pk}/"), body, format="json").status_code == 403
        north.refresh_from_db()
        assert north.name == "North"

    def test_close_and_reopen(self, client, looker):
        result, north = looker
        assert client.post(url(result, f"{north.pk}/close/")).status_code == 403
        assert client.post(url(result, f"{north.pk}/reopen/")).status_code == 403
        north.refresh_from_db()
        assert north.status == UnitStatus.ACTIVE


# --- New Territory ----------------------------------------------------------------


class TestNewTerritory:
    def test_a_dealer_at_the_top_with_every_detail(self, client):
        result = found()

        response = as_owner(client, result).post(url(result), a_new(), format="json")

        assert response.status_code == 201, response.content
        body = response.json()
        assert body["kind"] == "dealer"
        assert body["parent_id"] == str(root(result).pk)
        assert body["code"] == "DLM-01"
        assert body["gstin"] == GSTIN
        # Derived from the GSTIN when none is given.
        assert body["pan"] == GSTIN_PAN
        assert body["contact_person"] == "Ravi Sharma"
        assert body["postal_code"] == "110001"
        assert body["status"] == "active"
        assert body["people_count"] == 0
        assert Territory.objects.get(pk=body["id"]).app_id == AppCode.DMS

    def test_the_new_box_is_the_tree_s_own_row(self, client):
        result = found()

        created = as_owner(client, result).post(url(result), a_new(), format="json").json()

        assert created in tree(client, result)

    @pytest.mark.parametrize(
        ("kind", "parent_kind"),
        [
            ("region", "region"),
            ("dealer", "region"),
            ("branch", "dealer"),
            ("warehouse", "branch"),
            ("warehouse", "dealer"),
        ],
    )
    def test_each_kind_under_a_parent_it_may_sit_in(self, client, kind, parent_kind):
        result = found()
        region = box(result, "North")
        dealer = box(result, "Delhi Motors", TerritoryKind.DEALER, region)
        branch = box(result, "Noida", TerritoryKind.BRANCH, dealer)
        parent = {"region": region, "dealer": dealer, "branch": branch}[parent_kind]

        response = as_owner(client, result).post(
            url(result),
            a_new(kind=kind, name="The new one", code="", parent_id=str(parent.pk)),
            format="json",
        )

        assert response.status_code == 201, response.content
        assert response.json()["parent_id"] == str(parent.pk)

    @pytest.mark.parametrize(
        ("kind", "parent_kind"),
        [("branch", "region"), ("branch", "root"), ("dealer", "dealer"), ("region", "dealer")],
    )
    def test_a_parent_the_kind_may_not_sit_in_is_refused(self, client, kind, parent_kind):
        result = found()
        region = box(result, "North")
        dealer = box(result, "Delhi Motors", TerritoryKind.DEALER, region)
        parent = {"region": region, "dealer": dealer, "root": root(result)}[parent_kind]

        response = as_owner(client, result).post(
            url(result),
            a_new(kind=kind, name="The new one", code="", parent_id=str(parent.pk)),
            format="json",
        )

        assert response.status_code == 409
        assert response.json()["code"] == "territory_placement_not_allowed"
        assert not Territory.objects.filter(name="The new one").exists()

    def test_never_a_second_organisation(self, client):
        result = found()

        response = as_owner(client, result).post(
            url(result), a_new(kind="organisation"), format="json"
        )

        assert response.status_code == 422

    def test_a_dealer_needs_its_gstin_on_the_field(self, client):
        result = found()

        response = as_owner(client, result).post(url(result), a_new(gstin=""), format="json")

        assert response.status_code == 422
        assert [e["field"] for e in response.json()["errors"]] == ["gstin"]
        assert not Territory.objects.filter(name="Delhi Motors").exists()

    def test_a_region_needs_no_gstin(self, client):
        result = found()

        response = as_owner(client, result).post(
            url(result), a_new(kind="region", name="North", gstin="", code=""), format="json"
        )

        assert response.status_code == 201, response.content
        assert response.json()["gstin"] == ""
        assert response.json()["pan"] == ""

    def test_a_bad_gstin_is_refused(self, client):
        result = found()

        response = as_owner(client, result).post(
            url(result), a_new(gstin="27AAPFU0939F1ZX"), format="json"
        )

        assert response.status_code == 422

    def test_a_name_already_in_the_tree_is_refused(self, client):
        result = found()
        box(result, "Delhi Motors")

        response = as_owner(client, result).post(url(result), a_new(), format="json")

        assert response.status_code == 409
        assert response.json()["code"] == "territory_name_taken"

    def test_a_code_already_in_the_tree_is_refused(self, client):
        result = found()
        box(result, "North", code="DLM-01")

        response = as_owner(client, result).post(url(result), a_new(), format="json")

        assert response.status_code == 409
        assert response.json()["code"] == "territory_code_taken"

    def test_any_number_may_have_no_code(self, client):
        result = found()
        owner = as_owner(client, result)

        first = owner.post(url(result), a_new(code=""), format="json")
        second = owner.post(url(result), a_new(name="Other Motors", code=""), format="json")

        assert (first.status_code, second.status_code) == (201, 201)

    def test_a_parent_in_another_organisation_is_not_found(self, client):
        ours = found()
        theirs = found(name="Other Co", email="boss@other.test", code="CODE-OTHER")
        their_region = box(theirs, "Their Region")

        response = as_owner(client, ours).post(
            url(ours), a_new(parent_id=str(their_region.pk)), format="json"
        )

        assert response.status_code == 404
        assert not Territory.objects.filter(name="Delhi Motors").exists()

    def test_a_parent_in_another_app_s_tree_is_not_found(self, client):
        result = found()

        response = as_owner(client, result).post(
            url(result), a_new(parent_id=str(root(result, AppCode.ADMIN).pk)), format="json"
        )

        assert response.status_code == 404


# --- Edit -------------------------------------------------------------------------


class TestEdit:
    def test_changes_the_details_and_nothing_else(self, client):
        result = found()
        north = box(result, "North")
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER, north, code="DLM-01")

        response = as_owner(client, result).put(
            url(result, f"{delhi.pk}/"),
            an_edit(name="Delhi Motors Ltd", code="DLM-02", gstin=OTHER_GSTIN, city="Noida"),
            format="json",
        )

        assert response.status_code == 200, response.content
        body = response.json()
        assert body["name"] == "Delhi Motors Ltd"
        assert body["code"] == "DLM-02"
        assert body["pan"] == OTHER_GSTIN_PAN
        assert body["city"] == "Noida"
        assert body["kind"] == "dealer"
        assert body["parent_id"] == str(north.pk)
        assert body["status"] == "active"

    @pytest.mark.parametrize("field", ["kind", "status"])
    def test_refuses_what_it_does_not_change(self, client, field):
        result = found()
        north = box(result, "North")

        response = as_owner(client, result).put(
            url(result, f"{north.pk}/"),
            {**an_edit(name="North", gstin="", code=""), field: "x"},
            format="json",
        )

        assert response.status_code == 422

    # --- the PARENT TERRITORY: moving is done in Edit (the owner, 2026-11-24) ---

    def test_a_new_parent_moves_it_and_everything_under_it(self, client):
        result = found()
        north = box(result, "North")
        south = box(result, "South")
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER, north)
        noida = box(result, "Noida", TerritoryKind.BRANCH, delhi)

        response = as_owner(client, result).put(
            url(result, f"{delhi.pk}/"),
            {**an_edit(code="DLM-01"), "parent_id": str(south.pk)},
            format="json",
        )

        assert response.status_code == 200, response.content
        assert response.json()["parent_id"] == str(south.pk)
        rows = {row["name"]: row for row in tree(client, result)}
        assert rows["Delhi Motors"]["parent_id"] == str(south.pk)
        # Its branch went with it, still inside it.
        assert rows["Noida"]["parent_id"] == str(delhi.pk)
        noida.refresh_from_db()
        assert noida.path.startswith(Territory.objects.get(pk=south.pk).path)

    def test_null_is_the_organisation_and_left_out_keeps_the_parent(self, client):
        result = found()
        north = box(result, "North")
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER, north)
        owner = as_owner(client, result)

        kept = owner.put(url(result, f"{delhi.pk}/"), an_edit(), format="json")
        assert kept.json()["parent_id"] == str(north.pk)

        up = owner.put(
            url(result, f"{delhi.pk}/"), {**an_edit(), "parent_id": None}, format="json"
        )
        assert up.status_code == 200, up.content
        assert up.json()["parent_id"] == str(root(result).pk)

    def test_a_parent_its_kind_may_not_sit_under_is_refused_and_nothing_is_saved(self, client):
        result = found()
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER)
        jaipur = box(result, "Jaipur Motors", TerritoryKind.DEALER)

        response = as_owner(client, result).put(
            url(result, f"{delhi.pk}/"),
            {**an_edit(name="Renamed"), "parent_id": str(jaipur.pk)},
            format="json",
        )

        assert response.status_code == 409
        assert response.json()["code"] == "territory_placement_not_allowed"
        delhi.refresh_from_db()
        assert delhi.name == "Delhi Motors"

    def test_never_inside_itself(self, client):
        result = found()
        north = box(result, "North")
        inner = box(result, "Inner", TerritoryKind.REGION, north)

        response = as_owner(client, result).put(
            url(result, f"{north.pk}/"),
            {**an_edit(name="North", gstin="", code=""), "parent_id": str(inner.pk)},
            format="json",
        )

        assert response.status_code == 409
        assert response.json()["code"] == "territory_move_into_itself"

    def test_a_parent_in_another_organisation_is_not_found_and_nothing_is_saved(self, client):
        ours = found()
        theirs = found(name="Other Co", email="boss@other.test", code="CODE-OTHER")
        delhi = box(ours, "Delhi Motors", TerritoryKind.DEALER)

        response = as_owner(client, ours).put(
            url(ours, f"{delhi.pk}/"),
            {**an_edit(name="Renamed"), "parent_id": str(box(theirs, "Theirs").pk)},
            format="json",
        )

        assert response.status_code == 404
        delhi.refresh_from_db()
        assert delhi.name == "Delhi Motors"

    def test_people_keep_their_places_when_it_moves(self, client):
        result = found()
        north = box(result, "North")
        south = box(result, "South")
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER, north)
        person = Membership.objects.create(
            user=User.objects.create_user(email="p@acme.test", password="x"),
            organization=result.organization,
        )
        grant_app_access(
            membership=person,
            app=AppCode.DMS,
            role=Role.objects.get(code="dms.manager"),
            territories=[delhi],
        )

        as_owner(client, result).put(
            url(result, f"{delhi.pk}/"), {**an_edit(), "parent_id": str(south.pk)}, format="json"
        )

        grant = person.grants.get(app_id=AppCode.DMS)
        assert [p.territory_id for p in grant.territories.all()] == [delhi.pk]

    def test_a_dealer_cannot_lose_its_gstin(self, client):
        result = found()
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER)

        response = as_owner(client, result).put(
            url(result, f"{delhi.pk}/"), an_edit(gstin=""), format="json"
        )

        assert response.status_code == 422
        delhi.refresh_from_db()
        assert delhi.gstin == GSTIN

    def test_keeping_its_own_name_and_code_is_not_a_collision(self, client):
        result = found()
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER, code="DLM-01")

        response = as_owner(client, result).put(
            url(result, f"{delhi.pk}/"), an_edit(), format="json"
        )

        assert response.status_code == 200, response.content

    def test_another_box_s_name_is_refused(self, client):
        result = found()
        box(result, "North")
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER)

        response = as_owner(client, result).put(
            url(result, f"{delhi.pk}/"), an_edit(name="North"), format="json"
        )

        assert response.status_code == 409

    def test_never_the_root(self, client):
        result = found()

        response = as_owner(client, result).put(
            url(result, f"{root(result).pk}/"), an_edit(name="Renamed", gstin=""), format="json"
        )

        assert response.status_code == 409
        assert response.json()["code"] == "territory_is_the_organisation"

    def test_another_organisation_s_territory_is_not_found(self, client):
        ours = found()
        theirs = found(name="Other Co", email="boss@other.test", code="CODE-OTHER")
        their_region = box(theirs, "Their Region")

        response = as_owner(client, ours).put(
            url(ours, f"{their_region.pk}/"), an_edit(name="Mine now", gstin=""), format="json"
        )

        assert response.status_code == 404
        their_region.refresh_from_db()
        assert their_region.name == "Their Region"

    @pytest.mark.parametrize("bad_id", ["not-a-uuid", "00000000-0000-0000-0000-000000000000"])
    def test_nonsense_is_not_found(self, client, bad_id):
        result = found()

        response = as_owner(client, result).put(
            url(result, f"{bad_id}/"), an_edit(gstin=""), format="json"
        )

        assert response.status_code == 404


# --- Close and Reopen -------------------------------------------------------------


class TestCloseAndReopen:
    def test_closes_and_reopens_any_kind(self, client):
        result = found()
        north = box(result, "North")
        owner = as_owner(client, result)

        closed = owner.post(url(result, f"{north.pk}/close/"))
        assert closed.status_code == 200, closed.content
        assert closed.json()["status"] == UnitStatus.DISABLED

        reopened = owner.post(url(result, f"{north.pk}/reopen/"))
        assert reopened.status_code == 200
        assert reopened.json()["status"] == UnitStatus.ACTIVE

    def test_what_is_under_it_stays_open(self, client):
        result = found()
        north = box(result, "North")
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER, north)

        as_owner(client, result).post(url(result, f"{north.pk}/close/"))

        delhi.refresh_from_db()
        assert delhi.status == UnitStatus.ACTIVE

    def test_closing_twice_is_a_conflict(self, client):
        result = found()
        north = box(result, "North")
        owner = as_owner(client, result)
        owner.post(url(result, f"{north.pk}/close/"))

        response = owner.post(url(result, f"{north.pk}/close/"))

        assert response.status_code == 409
        assert response.json()["code"] == "territory_already_closed"

    def test_reopening_an_open_one_is_a_conflict(self, client):
        result = found()
        north = box(result, "North")

        response = as_owner(client, result).post(url(result, f"{north.pk}/reopen/"))

        assert response.status_code == 409
        assert response.json()["code"] == "territory_already_open"

    def test_never_the_root(self, client):
        result = found()

        response = as_owner(client, result).post(url(result, f"{root(result).pk}/close/"))

        assert response.status_code == 409
        assert root(result).status == UnitStatus.ACTIVE

    def test_an_unknown_action_is_not_found(self, client):
        result = found()
        north = box(result, "North")

        response = as_owner(client, result).post(url(result, f"{north.pk}/delete/"))

        assert response.status_code == 404
        assert Territory.objects.filter(pk=north.pk).exists()

    def test_another_organisation_s_territory_is_not_found(self, client):
        ours = found()
        theirs = found(name="Other Co", email="boss@other.test", code="CODE-OTHER")
        their_region = box(theirs, "Their Region")

        response = as_owner(client, ours).post(url(ours, f"{their_region.pk}/close/"))

        assert response.status_code == 404
        their_region.refresh_from_db()
        assert their_region.status == UnitStatus.ACTIVE

    def test_somebody_placed_only_at_a_closed_region_is_shut_out(self, client):
        result = found()
        north = box(result, "North")
        person = member(result, email="rm@acme.test", role_code="dms.group_operations", place=north)
        assert is_shut_out_by_closure(person) is False

        as_owner(client, result).post(url(result, f"{north.pk}/close/"))

        assert is_shut_out_by_closure(Membership.objects.get(pk=person.pk)) is True


# --- The services, directly -------------------------------------------------------


class TestTheServices:
    def test_add_territory_derives_the_pan_and_stores_no_code_as_null(self):
        result = found()

        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER, code="")

        assert delhi.pan == GSTIN_PAN
        assert delhi.code is None
        assert delhi.app_id == AppCode.DMS

    def test_add_territory_refuses_a_dealer_with_no_gstin(self):
        result = found()

        with pytest.raises(TerritoryGstinRequiredError):
            box(result, "Delhi Motors", TerritoryKind.DEALER, gstin="")

    def test_update_territory_gives_the_pan_back_when_cleared(self):
        result = found()
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER, pan="ZZZZZ9999Z")
        assert delhi.pan == "ZZZZZ9999Z"

        update_territory(territory=delhi, pan="")

        assert delhi.pan == GSTIN_PAN

    def test_update_territory_refuses_the_root(self):
        result = found()

        with pytest.raises(TerritoryIsTheOrganisationError):
            update_territory(territory=root(result), city="Pune")

    def test_close_and_reopen_refuse_the_root(self):
        result = found()

        with pytest.raises(TerritoryIsTheOrganisationError):
            close_territory(territory=root(result))
        with pytest.raises(TerritoryIsTheOrganisationError):
            reopen_territory(territory=root(result))

    def test_close_territory_is_not_idempotent(self):
        result = found()
        north = box(result, "North")
        close_territory(territory=north)

        with pytest.raises(TerritoryAlreadyClosedError):
            close_territory(territory=north)
