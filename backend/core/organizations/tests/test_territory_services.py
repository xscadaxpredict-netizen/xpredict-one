"""
Arranging the territory tree (C72 piece 1): the placement rule, the services
that create, rename and move territories, and the guards that stop a region
being mistaken for a dealership before C72 piece 2 can place people at one.

THE TENANCY TEST TO READ FIRST is `test_a_parent_in_another_organization_is_a_404`.
Paths are unique across the WHOLE table and every organisation's root is a
treebeard root, so a service that looked a parent up by id alone would graft one
customer's dealership into another customer's tree. Scope fails with 404.

THE ORGANISATION IS THE ROOT (the owner, 2026-11-06): "no parent" means
"directly under the organisation", and the root itself is never moved, renamed
or created by these services.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from rest_framework.test import APIClient

from conftest import TEST_TENANT_ALIAS
from core.api import TenantAPIView
from core.organizations.exceptions import (
    TerritoryIsTheOrganisationError,
    TerritoryMoveIntoItselfError,
    TerritoryNameTakenError,
    TerritoryPlacementError,
)
from core.organizations.models import ActivationCode, Territory, TerritoryKind
from core.organizations.selectors import _summary, dealers_for
from core.organizations.services import (
    assert_placement_allowed,
    create_dealer,
    create_territory,
    invite_person,
    move_territory,
    rename_territory,
    sign_up,
)
from core.permissions.models import AppCode
from shared.exceptions import NotFoundError

pytestmark = [pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])]

ORG, REGION, DEALER, BRANCH, WAREHOUSE = (
    TerritoryKind.ORGANISATION,
    TerritoryKind.REGION,
    TerritoryKind.DEALER,
    TerritoryKind.BRANCH,
    TerritoryKind.WAREHOUSE,
)


def found(name="Apex Motors", email="owner@apex.test", code="CODE-APEX"):
    ActivationCode.objects.create(code=code)
    return sign_up(
        activation_code=code,
        organization_name=name,
        email=email,
        password="correct horse battery staple",
    )


def fresh(territory: Territory) -> Territory:
    return Territory.objects.get(pk=territory.pk)


class TestThePlacementRule:
    """C72's version-1 tree, as a table. ORG is "directly under the organisation"."""

    @pytest.mark.parametrize(
        ("kind", "parent_kind"),
        [
            (REGION, ORG),
            (REGION, REGION),
            (DEALER, ORG),
            (DEALER, REGION),
            (BRANCH, DEALER),
            (WAREHOUSE, ORG),
            (WAREHOUSE, REGION),
            (WAREHOUSE, DEALER),
            (WAREHOUSE, BRANCH),
        ],
    )
    def test_allowed(self, kind, parent_kind):
        assert_placement_allowed(kind, Territory(kind=parent_kind))

    @pytest.mark.parametrize(
        ("kind", "parent_kind"),
        [
            (REGION, DEALER),
            (REGION, BRANCH),
            (REGION, WAREHOUSE),
            (DEALER, DEALER),  # no sub-dealers until Q57 says so
            (DEALER, BRANCH),
            (DEALER, WAREHOUSE),
            (BRANCH, ORG),
            (BRANCH, REGION),
            (BRANCH, BRANCH),
            (BRANCH, WAREHOUSE),
            (WAREHOUSE, WAREHOUSE),
            # Nothing is ever placed AS an organisation: there is one, and
            # sign-up made it.
            (ORG, ORG),
            (ORG, REGION),
            (ORG, DEALER),
        ],
    )
    def test_refused(self, kind, parent_kind):
        with pytest.raises(TerritoryPlacementError):
            assert_placement_allowed(kind, Territory(kind=parent_kind))


class TestTheRoot:
    def test_sign_up_gives_the_organisation_its_root(self):
        org = found().organization

        roots = Territory.objects.filter(organization=org, is_root=True)

        assert [(r.kind, r.depth, r.display_name) for r in roots] == [(ORG, 1, "Apex Motors")]

    def test_the_root_cannot_be_moved(self):
        result = found()
        root = Territory.objects.root_for(result.organization)
        north = create_territory(organization=result.organization, kind=REGION, name="North")

        with pytest.raises(TerritoryIsTheOrganisationError):
            move_territory(territory=root, parent_id=north.pk)

    def test_the_root_cannot_be_renamed_here(self):
        """It shows the organisation's name; renaming the organisation renames it."""
        root = Territory.objects.root_for(found().organization)

        with pytest.raises(TerritoryIsTheOrganisationError):
            rename_territory(territory=root, name="Something else")

        assert fresh(root).name == ""

    def test_no_parent_means_directly_under_the_organisation(self):
        org = found().organization

        north = create_territory(organization=org, kind=REGION, name="North")

        assert fresh(north).depth == 2
        assert fresh(north).path.startswith(Territory.objects.root_for(org).path)


class TestCreating:
    def test_a_region_a_dealer_in_it_and_a_branch_in_that(self):
        org = found().organization

        north = create_territory(organization=org, kind=REGION, name="North")
        delhi = create_dealer(organization=org, name="Delhi Motors", parent_id=north.pk)
        branch = create_territory(
            organization=org, kind=BRANCH, name="Karol Bagh", parent_id=delhi.pk
        )

        assert fresh(delhi).path.startswith(fresh(north).path)
        assert fresh(branch).depth == 4
        assert Territory.objects.find_problems() == ([], [], [], [], [])

    def test_a_branch_directly_under_the_organisation_is_refused(self):
        org = found().organization

        with pytest.raises(TerritoryPlacementError):
            create_territory(organization=org, kind=BRANCH, name="Karol Bagh")

        assert not Territory.objects.filter(name="Karol Bagh").exists()

    def test_a_dealer_inside_a_dealer_is_refused(self):
        org = found().organization
        delhi = create_dealer(organization=org, name="Delhi Motors")

        with pytest.raises(TerritoryPlacementError):
            create_dealer(organization=org, name="Sub Dealer", parent_id=delhi.pk)

    def test_a_parent_in_another_organization_is_a_404(self):
        apex = found().organization
        bharat = found("Bharat Auto", "owner@bharat.test", "CODE-BHARAT").organization
        theirs = create_territory(organization=bharat, kind=REGION, name="West")

        with pytest.raises(NotFoundError):
            create_dealer(organization=apex, name="Pune Wheels", parent_id=theirs.pk)

        assert not Territory.objects.filter(name="Pune Wheels").exists()

    def test_one_name_per_organization_across_every_kind(self):
        """A region and a dealership both called "Chennai" read identically in every picker."""
        org = found().organization
        create_dealer(organization=org, name="Chennai")

        with pytest.raises(TerritoryNameTakenError):
            create_territory(organization=org, kind=REGION, name="Chennai")


class TestRenamingAndMoving:
    def test_rename(self):
        org = found().organization
        north = create_territory(organization=org, kind=REGION, name="North")

        rename_territory(territory=north, name="North India")

        assert fresh(north).name == "North India"

    def test_rename_cannot_take_another_territorys_name(self):
        org = found().organization
        create_dealer(organization=org, name="Delhi Motors")
        north = create_territory(organization=org, kind=REGION, name="North")

        with pytest.raises(TerritoryNameTakenError):
            rename_territory(territory=north, name="Delhi Motors")

    def test_an_existing_dealership_moves_into_a_new_region_with_its_branches(self):
        """
        The first thing every organisation will do: every dealership sits
        directly under the organisation (`0014`), and regions are drawn around
        them afterwards.
        """
        org = found().organization
        delhi = create_dealer(organization=org, name="Delhi Motors")
        create_territory(organization=org, kind=BRANCH, name="Karol Bagh", parent_id=delhi.pk)
        north = create_territory(organization=org, kind=REGION, name="North")

        moved = move_territory(territory=fresh(delhi), parent_id=north.pk)

        assert moved.pk == delhi.pk  # the id every membership and record points at
        assert moved.depth == 3
        assert Territory.objects.get(name="Karol Bagh").path.startswith(fresh(north).path)
        assert Territory.objects.find_problems() == ([], [], [], [], [])

    def test_and_back_out_to_directly_under_the_organisation(self):
        org = found().organization
        north = create_territory(organization=org, kind=REGION, name="North")
        delhi = create_dealer(organization=org, name="Delhi Motors", parent_id=north.pk)

        moved = move_territory(territory=fresh(delhi), parent_id=None)

        assert moved.depth == 2
        assert moved.path.startswith(Territory.objects.root_for(org).path)
        assert fresh(north).numchild == 0
        assert Territory.objects.find_problems() == ([], [], [], [], [])

    def test_a_territory_cannot_move_inside_itself(self):
        org = found().organization
        north = create_territory(organization=org, kind=REGION, name="North")
        punjab = create_territory(organization=org, kind=REGION, name="Punjab", parent_id=north.pk)

        with pytest.raises(TerritoryMoveIntoItselfError):
            move_territory(territory=fresh(north), parent_id=punjab.pk)
        with pytest.raises(TerritoryMoveIntoItselfError):
            move_territory(territory=fresh(north), parent_id=north.pk)

    def test_a_move_must_still_obey_the_placement_rule(self):
        org = found().organization
        delhi = create_dealer(organization=org, name="Delhi Motors")
        jaipur = create_dealer(organization=org, name="Jaipur Auto")

        with pytest.raises(TerritoryPlacementError):
            move_territory(territory=fresh(jaipur), parent_id=delhi.pk)

    def test_a_move_into_another_organizations_tree_is_a_404(self):
        apex = found().organization
        bharat = found("Bharat Auto", "owner@bharat.test", "CODE-BHARAT").organization
        delhi = create_dealer(organization=apex, name="Delhi Motors")
        theirs = create_territory(organization=bharat, kind=REGION, name="West")

        with pytest.raises(NotFoundError):
            move_territory(territory=fresh(delhi), parent_id=theirs.pk)

        assert fresh(delhi).depth == 2


class TestARegionIsNeverTakenForADealership:
    """
    Until C72 piece 2 a person is placed at a dealership or at nothing, and
    everything that says "dealership" means kind = dealer. Each of these was a
    plain `filter(organization=...)` before regions existed.
    """

    def test_the_dealers_list_leaves_regions_out(self):
        org = found().organization
        north = create_territory(organization=org, kind=REGION, name="North")
        create_dealer(organization=org, name="Delhi Motors", parent_id=north.pk)

        assert [d.name for d in dealers_for(org)] == ["Delhi Motors"]

    def test_the_launcher_counts_dealerships_not_regions(self):
        result = found()
        north = create_territory(organization=result.organization, kind=REGION, name="North")
        create_dealer(organization=result.organization, name="Delhi Motors", parent_id=north.pk)

        assert _summary(AppCode.DMS, result.membership) == "1 dealership"

    def test_a_person_cannot_be_placed_at_a_region(self):
        result = found()
        north = create_territory(organization=result.organization, kind=REGION, name="North")

        with pytest.raises(NotFoundError):
            invite_person(
                actor=result.membership,
                organization=result.organization,
                email="ravi@apex.test",
                first_name="Ravi",
                last_name="Kumar",
                unit_id=north.pk,
                role="member",
                apps=[{"app": "dms", "role": "dms.manager"}],
            )

    def test_a_dms_request_cannot_choose_a_region_as_its_dealership(self):
        """
        An organisation-level person picks a dealership with `X-Unit-Id`;
        records they create are filed under it. A region there would file an
        enquiry under a region.
        """
        result = found()
        north = create_territory(organization=result.organization, kind=REGION, name="North")
        delhi = create_dealer(
            organization=result.organization, name="Delhi Motors", parent_id=north.pk
        )
        request = SimpleNamespace(
            membership=result.membership, headers={"X-Unit-Id": str(north.pk)}
        )

        assert TenantAPIView._resolve_territory_id(request, result.organization) == delhi.pk

    def test_the_dealer_endpoints_answer_404_for_a_region(self):
        result = found()
        north = create_territory(organization=result.organization, kind=REGION, name="North")
        client = APIClient()
        client.force_authenticate(user=result.user)
        slug = result.organization.slug

        edit = client.put(f"/api/v1/orgs/{slug}/admin/dealers/{north.pk}/", {}, format="json")
        close = client.post(f"/api/v1/orgs/{slug}/admin/dealers/{north.pk}/close/")

        assert (edit.status_code, close.status_code) == (404, 404)
        assert fresh(north).status == "active"
