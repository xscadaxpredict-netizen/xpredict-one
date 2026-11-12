"""
`/api/v1/orgs/<slug>/admin/territories/` -- the territory tree (C72 piece 1).

The three kinds of refusal, as everywhere in Administration:

- SCOPE -> 404: another organisation's territory, or a parent in another
  organisation's tree, is indistinguishable from one that does not exist.
- CAPABILITY -> 403: a dealer admin holds `admin.person.*` and nothing of
  `admin.territory.*`, so a dealership cannot redraw the tree it sits in.
- STATE -> 409: the tree refuses the arrangement (a branch at the top level, a
  region moved inside itself).
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.organizations.models import (
    ActivationCode,
    Membership,
    Territory,
    TerritoryKind,
)
from core.organizations.selectors import permissions_for
from core.organizations.services import (
    create_dealer,
    create_territory,
    grant_app_access,
    sign_up,
)
from core.permissions.models import AppCode, Permission, Role

pytestmark = [pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])]

LIST_URL = "/api/v1/orgs/{slug}/admin/territories/"
DETAIL_URL = "/api/v1/orgs/{slug}/admin/territories/{id}/"
MOVE_URL = "/api/v1/orgs/{slug}/admin/territories/{id}/move/"
DEALERS_URL = "/api/v1/orgs/{slug}/admin/dealers/"
GSTIN = "27AAPFU0939F1ZV"
TERRITORY_PERMISSIONS = {"admin.territory.view", "admin.territory.create", "admin.territory.update"}


def found(name="Apex Motors", email="owner@apex.test", code="CODE-APEX"):
    ActivationCode.objects.create(code=code)
    return sign_up(
        activation_code=code,
        organization_name=name,
        email=email,
        password="correct horse battery staple",
    )


def signed_in(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def dealer_admin_at(organization, dealer) -> User:
    user = User.objects.create_user(email="sunil@apex.test", password="x")
    membership = Membership.objects.create(user=user, organization=organization)
    grant_app_access(
        membership=membership,
        app=AppCode.DMS,
        role=Role.objects.get(app_id=AppCode.DMS, code="dms.system_admin"),
        territories=[dealer],
    )
    return user


class TestThePermissions:
    def test_the_three_codes_exist_in_the_dealers_module(self):
        rows = Permission.objects.filter(code__in=TERRITORY_PERMISSIONS)

        assert {p.code for p in rows} == TERRITORY_PERMISSIONS
        assert {(p.app_id, p.module) for p in rows} == {(AppCode.ADMIN, "dealers")}

    def test_the_owner_holds_them_by_standing(self):
        result = found()
        assert permissions_for(result.membership) >= TERRITORY_PERMISSIONS

    def test_a_dealer_admin_does_not(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        user = dealer_admin_at(result.organization, delhi)
        membership = Membership.objects.get(user=user)

        assert not permissions_for(membership) & TERRITORY_PERMISSIONS


class TestTheTree:
    def test_the_owner_reads_the_tree_with_parents(self):
        result = found()
        org = result.organization
        north = create_territory(organization=org, kind=TerritoryKind.REGION, name="North")
        create_dealer(organization=org, name="Delhi Motors", parent_id=north.pk)

        response = signed_in(result.user).get(LIST_URL.format(slug=org.slug))

        assert response.status_code == 200
        root = Territory.objects.root_for(org)
        # The organisation is the root, shown under its own name (it stores none).
        assert [(t["name"], t["kind"], t["parent_id"], t["depth"]) for t in response.json()] == [
            ("Apex Motors", "organisation", None, 1),
            ("North", "region", str(root.pk), 2),
            ("Delhi Motors", "dealer", str(north.pk), 3),
        ]
        assert "path" not in response.json()[0]

    def test_adding_a_region_then_a_dealer_inside_it(self):
        result = found()
        client = signed_in(result.user)
        slug = result.organization.slug

        region = client.post(
            LIST_URL.format(slug=slug), {"kind": "region", "name": "North"}, "json"
        )
        dealer = client.post(
            DEALERS_URL.format(slug=slug),
            {"name": "Delhi Motors", "gstin": GSTIN, "parent_id": region.json()["id"]},
            "json",
        )

        assert (region.status_code, dealer.status_code) == (201, 201)
        # Where it sits is read from the tree, not the dealer response, which
        # keeps exactly the shape `dealers.ts` declares until C72 piece 7.
        tree = {t["id"]: t for t in client.get(LIST_URL.format(slug=slug)).json()}
        placed = tree[dealer.json()["id"]]
        assert (placed["kind"], placed["parent_id"]) == ("dealer", region.json()["id"])

    def test_a_dealer_cannot_be_added_through_the_territories_endpoint(self):
        """It carries a GSTIN and the rest of its details; it has its own door."""
        result = found()

        response = signed_in(result.user).post(
            LIST_URL.format(slug=result.organization.slug),
            {"kind": "dealer", "name": "Delhi Motors"},
            "json",
        )

        assert response.status_code == 422  # this project answers 422 to failed validation
        assert not Territory.objects.filter(name="Delhi Motors").exists()

    def test_a_branch_at_the_top_level_is_409(self):
        result = found()

        response = signed_in(result.user).post(
            LIST_URL.format(slug=result.organization.slug),
            {"kind": "branch", "name": "Karol Bagh"},
            "json",
        )

        assert response.status_code == 409
        assert response.json()["code"] == "territory_placement_not_allowed"

    def test_rename_and_move(self):
        result = found()
        org = result.organization
        delhi = create_dealer(organization=org, name="Delhi Motors")
        north = create_territory(organization=org, kind=TerritoryKind.REGION, name="North")
        client = signed_in(result.user)

        renamed = client.patch(
            DETAIL_URL.format(slug=org.slug, id=north.pk), {"name": "North India"}, "json"
        )
        moved = client.post(
            MOVE_URL.format(slug=org.slug, id=delhi.pk), {"parent_id": str(north.pk)}, "json"
        )
        back = client.post(MOVE_URL.format(slug=org.slug, id=delhi.pk), {"parent_id": None}, "json")

        assert (renamed.json()["name"], moved.json()["parent_id"]) == ("North India", str(north.pk))
        # "No parent" means directly under the organisation -- its root.
        root_id = str(Territory.objects.root_for(org).pk)
        assert (back.status_code, back.json()["parent_id"], back.json()["depth"]) == (
            200,
            root_id,
            2,
        )

    def test_a_move_must_say_where_to(self):
        """An omitted `parent_id` must not be read as "the top level" by accident."""
        result = found()
        north = create_territory(
            organization=result.organization, kind=TerritoryKind.REGION, name="North"
        )
        punjab = create_territory(
            organization=result.organization,
            kind=TerritoryKind.REGION,
            name="Punjab",
            parent_id=north.pk,
        )

        response = signed_in(result.user).post(
            MOVE_URL.format(slug=result.organization.slug, id=punjab.pk), {}, "json"
        )

        assert response.status_code == 422  # this project answers 422 to failed validation
        assert Territory.objects.get(pk=punjab.pk).depth == 3  # organisation > North > Punjab


class TestADealerAdminCannotRedrawTheTree:
    def test_403_on_every_territory_endpoint(self):
        result = found()
        org = result.organization
        delhi = create_dealer(organization=org, name="Delhi Motors")
        north = create_territory(organization=org, kind=TerritoryKind.REGION, name="North")
        client = signed_in(dealer_admin_at(org, delhi))

        listed = client.get(LIST_URL.format(slug=org.slug))
        created = client.post(
            LIST_URL.format(slug=org.slug), {"kind": "region", "name": "S"}, "json"
        )
        renamed = client.patch(DETAIL_URL.format(slug=org.slug, id=north.pk), {"name": "X"}, "json")
        moved = client.post(
            MOVE_URL.format(slug=org.slug, id=delhi.pk), {"parent_id": str(north.pk)}, "json"
        )
        codes = tuple(r.status_code for r in (listed, created, renamed, moved))

        assert codes == (403, 403, 403, 403)
        assert Territory.objects.get(pk=delhi.pk).depth == 2


class TestAnotherOrganizationsTreeDoesNotExist:
    def test_its_territories_are_404_and_never_listed(self):
        apex = found()
        bharat = found("Bharat Auto", "owner@bharat.test", "CODE-BHARAT")
        theirs = create_territory(
            organization=bharat.organization, kind=TerritoryKind.REGION, name="West"
        )
        create_dealer(organization=apex.organization, name="Delhi Motors")
        client = signed_in(apex.user)
        slug = apex.organization.slug

        listed = client.get(LIST_URL.format(slug=slug)).json()
        renamed = client.patch(DETAIL_URL.format(slug=slug, id=theirs.pk), {"name": "Mine"}, "json")
        moved = client.post(MOVE_URL.format(slug=slug, id=theirs.pk), {"parent_id": None}, "json")

        assert [t["name"] for t in listed] == ["Apex Motors", "Delhi Motors"]
        assert (renamed.status_code, moved.status_code) == (404, 404)
        assert Territory.objects.get(pk=theirs.pk).name == "West"

    def test_a_parent_in_their_tree_is_404_not_409(self):
        """
        A placement error would confirm the id exists and say what kind it is.
        404 says nothing.
        """
        apex = found()
        bharat = found("Bharat Auto", "owner@bharat.test", "CODE-BHARAT")
        theirs = create_territory(
            organization=bharat.organization, kind=TerritoryKind.REGION, name="West"
        )

        response = signed_in(apex.user).post(
            DEALERS_URL.format(slug=apex.organization.slug),
            {"name": "Pune Wheels", "gstin": GSTIN, "parent_id": str(theirs.pk)},
            "json",
        )

        assert response.status_code == 404
        assert not Territory.objects.filter(name="Pune Wheels").exists()


class TestTheRootOverTheAPI:
    def test_the_root_cannot_be_moved_or_renamed(self):
        result = found()
        org = result.organization
        root = Territory.objects.root_for(org)
        north = create_territory(organization=org, kind=TerritoryKind.REGION, name="North")
        client = signed_in(result.user)

        renamed = client.patch(DETAIL_URL.format(slug=org.slug, id=root.pk), {"name": "X"}, "json")
        moved = client.post(
            MOVE_URL.format(slug=org.slug, id=root.pk), {"parent_id": str(north.pk)}, "json"
        )

        assert (renamed.status_code, moved.status_code) == (409, 409)
        assert renamed.json()["code"] == "territory_is_the_organisation"
        assert Territory.objects.get(pk=root.pk).depth == 1

    def test_an_organisation_cannot_be_created_through_the_api(self):
        result = found()

        response = signed_in(result.user).post(
            LIST_URL.format(slug=result.organization.slug),
            {"kind": "organisation", "name": "Second Apex"},
            "json",
        )

        assert response.status_code == 422  # not one of the kinds this door accepts
        assert Territory.objects.filter(organization=result.organization, is_root=True).count() == 1
