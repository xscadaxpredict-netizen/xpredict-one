"""
EVERY APP HAS ITS OWN TERRITORY TREE (the owner, 2026-11-24, amending C72's
one tree per organisation): each territory belongs to one app, each app has
its own root in each organisation, a box sits in its parent's app's tree, and
a person's places in an app are always in that app's tree.

The existing tree became DMS's (`organizations/0025`); the Admin panel's and
CRM's organisation-wide people moved to their own roots.
"""

from __future__ import annotations

import importlib

import pytest
from django.db import connection
from django.db.migrations.loader import MigrationLoader

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.organizations.exceptions import TerritoryOfAnotherAppError
from core.organizations.models import (
    ActivationCode,
    Membership,
    MembershipAppAccess,
    MembershipAppRole,
    MembershipAppTerritory,
    Territory,
    TerritoryKind,
)
from core.organizations.selectors import territory_tree
from core.organizations.services import grant_app_access, sign_up
from core.permissions.models import AppCode, Role

pytestmark = [pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])]


def found(name="Acme Water", email="owner@acme.test", code="CODE-ACME"):
    ActivationCode.objects.create(code=code)
    return sign_up(
        activation_code=code,
        organization_name=name,
        email=email,
        password="correct horse battery staple",
    )


def somebody(result, email="ravi@acme.test"):
    user = User.objects.create_user(email=email, password="x")
    return Membership.objects.create(user=user, organization=result.organization)


class TestEachAppHasItsOwnRoot:
    def test_sign_up_draws_dms_s_tree_and_places_the_owner_there(self):
        result = found()

        dms_root = Territory.objects.root_for(result.organization, AppCode.DMS)
        grant = MembershipAppAccess.objects.get(membership=result.membership, app_id=AppCode.DMS)

        assert dms_root.app_id == AppCode.DMS
        assert list(grant.territories.values_list("territory_id", flat=True)) == [dms_root.pk]

    def test_two_apps_two_roots_both_named_after_the_organisation(self):
        result = found()

        dms_root = Territory.objects.root_for(result.organization, AppCode.DMS)
        admin_root = Territory.objects.root_for(result.organization, AppCode.ADMIN)

        assert dms_root.pk != admin_root.pk
        assert (dms_root.depth, admin_root.depth) == (1, 1)
        assert dms_root.display_name == admin_root.display_name == "Acme Water"

    def test_asking_again_finds_the_same_root(self):
        result = found()

        first = Territory.objects.root_for(result.organization, AppCode.CRM)
        again = Territory.objects.root_for(result.organization, AppCode.CRM)

        assert first.pk == again.pk
        assert (
            Territory.objects.filter(
                organization=result.organization, app_id=AppCode.CRM, is_root=True
            ).count()
            == 1
        )


class TestABoxIsInItsParentsTree:
    def test_create_draws_in_dms_s_tree_unless_told(self):
        result = found()

        dealer = Territory.objects.create(
            organization=result.organization, kind=TerritoryKind.DEALER, name="Chennai"
        )

        assert dealer.app_id == AppCode.DMS
        assert dealer.path.startswith(
            Territory.objects.root_for(result.organization, AppCode.DMS).path
        )

    def test_a_child_takes_its_parent_s_app(self):
        result = found()
        dealer = Territory.objects.create(
            organization=result.organization, kind=TerritoryKind.DEALER, name="Chennai"
        )

        branch = Territory.objects.add_child(
            dealer,
            {"organization": result.organization, "kind": TerritoryKind.BRANCH, "name": "Guindy"},
        )

        assert branch.app_id == AppCode.DMS

    def test_a_child_in_another_app_s_tree_is_refused(self):
        result = found()
        dealer = Territory.objects.create(
            organization=result.organization, kind=TerritoryKind.DEALER, name="Chennai"
        )

        with pytest.raises(ValueError, match="every app has its own tree"):
            Territory.objects.add_child(
                dealer,
                {
                    "organization": result.organization,
                    "app_id": AppCode.CRM,
                    "kind": TerritoryKind.BRANCH,
                    "name": "Guindy",
                },
            )

    def test_the_same_name_may_be_used_in_two_apps_trees(self):
        result = found()

        Territory.objects.create(
            organization=result.organization, kind=TerritoryKind.REGION, name="South"
        )
        Territory.objects.create(
            organization=result.organization,
            app=AppCode.CRM,
            kind=TerritoryKind.REGION,
            name="South",
        )

        assert Territory.objects.filter(organization=result.organization, name="South").count() == 2


class TestAPlaceIsInTheGrantsTree:
    def test_a_dms_grant_at_the_admin_panel_s_root_is_refused(self):
        result = found()

        with pytest.raises(TerritoryOfAnotherAppError):
            grant_app_access(
                membership=somebody(result),
                app=AppCode.DMS,
                role=Role.objects.get(code="dms.fleet_viewer"),
                territories=[Territory.objects.root_for(result.organization, AppCode.ADMIN)],
            )

    def test_an_admin_panel_grant_at_dms_s_root_is_refused(self):
        result = found()

        with pytest.raises(TerritoryOfAnotherAppError):
            grant_app_access(
                membership=somebody(result),
                app=AppCode.ADMIN,
                role=Role.objects.get(code="admin.org_admin"),
                territories=[Territory.objects.root_for(result.organization, AppCode.DMS)],
            )

    def test_each_grant_at_its_own_app_s_root_is_fine(self):
        result = found()
        person = somebody(result)

        grant_app_access(
            membership=person,
            app=AppCode.ADMIN,
            role=Role.objects.get(code="admin.org_admin"),
            territories=[Territory.objects.root_for(result.organization, AppCode.ADMIN)],
        )
        grant_app_access(
            membership=person,
            app=AppCode.DMS,
            role=Role.objects.get(code="dms.fleet_viewer"),
            territories=[Territory.objects.root_for(result.organization, AppCode.DMS)],
        )

        places = dict(
            MembershipAppTerritory.objects.filter(app_access__membership=person).values_list(
                "app_access__app_id", "territory__app_id"
            )
        )
        assert places == {AppCode.ADMIN: AppCode.ADMIN, AppCode.DMS: AppCode.DMS}


class TestDmsScreensSeeDmsTree:
    def test_the_territories_list_is_dms_s_tree_only(self):
        result = found()
        Territory.objects.root_for(result.organization, AppCode.ADMIN)
        Territory.objects.create(
            organization=result.organization, kind=TerritoryKind.DEALER, name="Chennai"
        )

        listed = territory_tree(result.organization)

        assert {t.app_id for t in listed} == {AppCode.DMS}
        assert [t.display_name for t in listed] == ["Acme Water", "Chennai"]


class TestTheMove:
    """
    `organizations/0025`, run by its own function against the models as they
    stood at that migration -- as `TestTheSeedCanBeRunAgain` runs `0002`.
    """

    @staticmethod
    def run_0025():
        state = MigrationLoader(connection).project_state(
            ("organizations", "0025_territory_app_trees")
        )
        module = importlib.import_module("core.organizations.migrations.0025_territory_app_trees")
        module.give_every_app_its_tree(state.apps, None)

    @staticmethod
    def misplaced_admin(result):
        """An Admin panel grant at DMS's root: the one shared root, before per-app trees."""
        person = somebody(result)
        grant = MembershipAppAccess.objects.create(membership=person, app_id=AppCode.ADMIN)
        MembershipAppRole.objects.create(
            app_access=grant, role=Role.objects.get(code="admin.org_admin")
        )
        MembershipAppTerritory.objects.create(
            app_access=grant,
            territory=Territory.objects.root_for(result.organization, AppCode.DMS),
        )
        return grant

    def test_an_admin_panel_place_moves_to_the_admin_panel_s_own_root(self):
        result = found()
        grant = self.misplaced_admin(result)

        self.run_0025()

        place = MembershipAppTerritory.objects.get(app_access=grant).territory
        assert place.app_id == AppCode.ADMIN
        assert place.is_root
        assert place.pk != Territory.objects.root_for(result.organization, AppCode.DMS).pk

    def test_dms_places_and_the_tree_stay_where_they_are(self):
        result = found()
        dealer = Territory.objects.create(
            organization=result.organization, kind=TerritoryKind.DEALER, name="Chennai"
        )
        owner_place = MembershipAppTerritory.objects.get(
            app_access__membership=result.membership, app_access__app_id=AppCode.DMS
        ).territory_id

        self.run_0025()

        dealer.refresh_from_db()
        assert dealer.app_id == AppCode.DMS
        assert (
            MembershipAppTerritory.objects.get(
                app_access__membership=result.membership, app_access__app_id=AppCode.DMS
            ).territory_id
            == owner_place
        )

    def test_running_it_again_changes_nothing(self):
        result = found()
        grant = self.misplaced_admin(result)

        self.run_0025()
        first = MembershipAppTerritory.objects.get(app_access=grant).territory_id
        roots = Territory.objects.filter(is_root=True).count()
        self.run_0025()

        assert MembershipAppTerritory.objects.get(app_access=grant).territory_id == first
        assert Territory.objects.filter(is_root=True).count() == roots
