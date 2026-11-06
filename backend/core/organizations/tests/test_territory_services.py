"""
Arranging the territory tree (C72 piece 1): the placement rule, the services
that create, rename and move territories, and the guards that stop a region
being mistaken for a dealership before C72 piece 2 can place people at one.

THE TENANCY TEST TO READ FIRST is `test_a_parent_in_another_organization_is_a_404`.
Paths are unique across the WHOLE table and every organisation's roots are
siblings, so a service that looked a parent up by id alone would graft one
customer's dealership into another customer's tree. Scope fails with 404.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.db import IntegrityError
from rest_framework.test import APIClient

from conftest import TEST_TENANT_ALIAS
from core.api import TenantAPIView
from core.organizations.exceptions import (
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

REGION, DEALER, BRANCH, WAREHOUSE = (
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
    """C72's version-1 tree, as a table. `None` is "at the top level"."""

    @pytest.mark.parametrize(
        ("kind", "parent_kind"),
        [
            (REGION, None),
            (REGION, REGION),
            (DEALER, None),
            (DEALER, REGION),
            (BRANCH, DEALER),
            (WAREHOUSE, None),
            (WAREHOUSE, REGION),
            (WAREHOUSE, DEALER),
            (WAREHOUSE, BRANCH),
        ],
    )
    def test_allowed(self, kind, parent_kind):
        parent = Territory(kind=parent_kind) if parent_kind else None
        assert_placement_allowed(kind, parent)

    @pytest.mark.parametrize(
        ("kind", "parent_kind"),
        [
            (REGION, DEALER),
            (REGION, BRANCH),
            (REGION, WAREHOUSE),
            (DEALER, DEALER),  # no sub-dealers until Q57 says so
            (DEALER, BRANCH),
            (DEALER, WAREHOUSE),
            (BRANCH, None),
            (BRANCH, REGION),
            (BRANCH, BRANCH),
            (BRANCH, WAREHOUSE),
            (WAREHOUSE, WAREHOUSE),
        ],
    )
    def test_refused(self, kind, parent_kind):
        parent = Territory(kind=parent_kind) if parent_kind else None
        with pytest.raises(TerritoryPlacementError):
            assert_placement_allowed(kind, parent)


class TestCreating:
    def test_a_region_a_dealer_in_it_and_a_branch_in_that(self):
        org = found().organization

        north = create_territory(organization=org, kind=REGION, name="North")
        delhi = create_dealer(organization=org, name="Delhi Motors", parent_id=north.pk)
        branch = create_territory(
            organization=org, kind=BRANCH, name="Karol Bagh", parent_id=delhi.pk
        )

        assert fresh(delhi).path.startswith(fresh(north).path)
        assert fresh(branch).depth == 3
        assert Territory.objects.find_problems() == ([], [], [], [], [])

    def test_a_branch_at_the_top_level_is_refused(self):
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
        The first thing every organisation will do: every dealership arrived
        at the top level (`0011`), and regions are drawn around them afterwards.
        """
        org = found().organization
        delhi = create_dealer(organization=org, name="Delhi Motors")
        create_territory(organization=org, kind=BRANCH, name="Karol Bagh", parent_id=delhi.pk)
        north = create_territory(organization=org, kind=REGION, name="North")

        moved = move_territory(territory=fresh(delhi), parent_id=north.pk)

        assert moved.pk == delhi.pk  # the id every membership and record points at
        assert moved.depth == 2
        assert Territory.objects.get(name="Karol Bagh").path.startswith(fresh(north).path)
        assert Territory.objects.find_problems() == ([], [], [], [], [])

    def test_and_back_out_to_the_top_level(self):
        org = found().organization
        north = create_territory(organization=org, kind=REGION, name="North")
        delhi = create_dealer(organization=org, name="Delhi Motors", parent_id=north.pk)

        moved = move_territory(territory=fresh(delhi), parent_id=None)

        assert moved.depth == 1
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

        assert fresh(delhi).depth == 1


class TestTwoTopLevelTerritoriesAtOnce:
    def test_mysql_names_the_path_index_in_the_error_the_retry_looks_for(self):
        """
        The retry recognises a root-path collision by the path index's name in
        MySQL's message. This pins that against the real server -- AND IT HAS
        ALREADY EARNED ITS PLACE: the first version looked for `.path'`, which
        MySQL never prints (it names the index, not the column), so the retry
        could never fire while the mocked test below passed happily.
        """
        org = found().organization
        a = create_dealer(organization=org, name="Delhi Motors")
        b = create_dealer(organization=org, name="Jaipur Auto")

        with pytest.raises(IntegrityError) as caught:
            Territory.objects.filter(pk=b.pk).update(path=a.path)

        assert f"{Territory._meta.db_table}_path_" in str(caught.value)

    def test_a_collision_on_the_root_path_is_retried(self):
        org = found().organization
        real_add_root = Territory.objects.add_root
        calls = []

        def collide_once(create_kwargs=None, **kwargs):
            calls.append(1)
            if len(calls) == 1:
                # MySQL's real wording, as the test above pins it.
                raise IntegrityError(
                    "(1062, \"Duplicate entry '00001' for key "
                    "'organizations_territory.organizations_territory_path_be21f7d1_uniq'\")"
                )
            return real_add_root(create_kwargs, **kwargs)

        with patch.object(Territory.objects, "add_root", side_effect=collide_once):
            region = create_territory(organization=org, kind=REGION, name="North")

        assert len(calls) == 2
        assert fresh(region).depth == 1

    def test_any_other_integrity_error_is_not_retried(self):
        org = found().organization
        calls = []

        def name_clash(create_kwargs=None, **kwargs):
            calls.append(1)
            raise IntegrityError(
                "(1062, \"Duplicate entry 'x' for key "
                "'organizations_territory.territory_unique_org_name'\")"
            )

        with patch.object(Territory.objects, "add_root", side_effect=name_clash):
            with pytest.raises(IntegrityError):
                create_territory(organization=org, kind=REGION, name="North")

        assert len(calls) == 1


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

        assert TenantAPIView._resolve_unit_id(request, result.organization) == delhi.pk

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
