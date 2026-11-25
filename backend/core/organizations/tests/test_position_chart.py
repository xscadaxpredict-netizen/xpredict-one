"""
DMS's reporting chart (C72's WHOSE; the owner, 2026-11-25), step 1: the
`Position` tree itself, its database rules, and where a person's position is
kept. The services (adding, moving, requiring one for DMS) are step 2.

Shaped like the territory tree, so these mirror `test_territory_tree.py` --
and, as there, every refusal is asserted BY THE RULE'S NAME, so a test cannot
pass because some other rule happened to refuse the same row.
"""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

import pytest
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.utils import timezone

from core.accounts.models import User
from core.organizations.models import (
    Invitation,
    InvitationAppGrant,
    Membership,
    MembershipAppAccess,
    Organization,
    Position,
)
from core.permissions.models import AppCode, Permission, Role, RolePermission

pytestmark = pytest.mark.django_db


def make_org(slug: str = "apex") -> Organization:
    return Organization.objects.create(
        name=slug.title(), slug=slug, db_name=f"xpredict_chart_{slug}", db_host="127.0.0.1"
    )


def fresh(position: Position) -> Position:
    return Position.objects.get(pk=position.pk)


class TestTheOrganisationIsTheTop:
    def test_root_for_makes_one_top_and_reuses_it(self):
        org = make_org()

        first = Position.objects.root_for(org, AppCode.DMS)
        again = Position.objects.root_for(org, AppCode.DMS)

        assert first.pk == again.pk
        assert first.is_root is True
        assert first.depth == 1
        assert Position.objects.of(org, AppCode.DMS).count() == 1

    def test_the_top_shows_the_organisations_name_and_stores_none(self):
        org = make_org()
        org.name = "Apex Motors Ltd"
        org.save()

        top = Position.objects.root_for(org, AppCode.DMS)

        assert fresh(top).name == ""
        assert fresh(top).display_name == "Apex Motors Ltd"

    def test_the_database_refuses_a_second_top(self):
        org = make_org()
        Position.objects.root_for(org, AppCode.DMS)

        with pytest.raises(IntegrityError) as caught:
            Position.objects.add_root(
                {
                    "organization": org,
                    "app_id": AppCode.DMS,
                    "name": "A second top",
                    "is_root": True,
                }
            )

        assert "position_one_root_per_org_app" in str(caught.value)

    def test_the_database_refuses_anything_else_at_the_top(self):
        org = make_org()
        Position.objects.root_for(org, AppCode.DMS)

        with pytest.raises(IntegrityError) as caught:
            Position.objects.add_root(
                {"organization": org, "app_id": AppCode.DMS, "name": "Managing Director"}
            )

        assert "position_root_is_the_top" in str(caught.value)

    def test_each_organisation_and_each_app_has_its_own_chart(self):
        apex, bharat = make_org("apex"), make_org("bharat")

        apex_dms = Position.objects.root_for(apex, AppCode.DMS)
        bharat_dms = Position.objects.root_for(bharat, AppCode.DMS)
        apex_crm = Position.objects.root_for(apex, AppCode.CRM)

        assert len({apex_dms.pk, bharat_dms.pk, apex_crm.pk}) == 3
        Position.objects.create(organization=apex, name="Sales Manager")
        assert Position.objects.of(bharat, AppCode.DMS).count() == 1
        assert Position.objects.of(apex, AppCode.CRM).count() == 1


class TestBuildingTheChart:
    def test_create_adds_a_position_directly_under_the_organisation(self):
        org = make_org()

        manager = Position.objects.create(organization=org, name="Sales Manager")

        top = Position.objects.root_for(org, AppCode.DMS)
        assert fresh(manager).depth == 2
        assert fresh(manager).path.startswith(top.path)
        assert fresh(manager).app_id == AppCode.DMS
        assert fresh(manager).share_with_peers is False  # off unless asked (the owner)

    def test_reports_to_is_the_parent_and_moving_takes_everyone_under_along(self):
        org = make_org()
        director = Position.objects.create(organization=org, name="Managing Director")
        sales = Position.objects.create(organization=org, name="Sales Manager")
        executive = Position.objects.add_child(
            sales, {"organization": org, "name": "Sales Executive"}
        )

        Position.objects.move(fresh(sales), fresh(director), "last-child")

        assert fresh(sales).path.startswith(fresh(director).path)
        assert fresh(executive).path.startswith(fresh(sales).path)
        assert fresh(executive).depth == 4

    def test_one_name_per_chart(self):
        org = make_org()
        Position.objects.create(organization=org, name="Sales Manager")

        with pytest.raises(IntegrityError) as caught:
            Position.objects.create(organization=org, name="Sales Manager")

        assert "position_unique_org_app_name" in str(caught.value)

    def test_the_same_name_is_fine_in_another_organisation(self):
        Position.objects.create(organization=make_org("apex"), name="Sales Manager")
        Position.objects.create(organization=make_org("bharat"), name="Sales Manager")

        assert Position.objects.filter(name="Sales Manager").count() == 2

    def test_a_position_cannot_report_to_another_apps_chart(self):
        org = make_org()
        crm_top = Position.objects.root_for(org, AppCode.CRM)

        with pytest.raises(ValueError, match="every app has its own chart"):
            Position.objects.add_child(
                crm_top, {"organization": org, "app_id": AppCode.DMS, "name": "Sales Manager"}
            )


class TestAPositionWithoutAPlaceIsRefused:
    def test_a_queryset_create_cannot_save_one_with_no_path(self):
        org = make_org()

        with pytest.raises(ValueError, match="needs a place on the chart"):
            Position.objects.filter(organization=org).model(
                organization=org, app_id=AppCode.DMS, name="Floating"
            ).save()


class TestTwoTopsAtOnce:
    """The shared root-making path, as the territory tree's: a collision on
    `path` -- which MySQL reports by the POSITION table's index -- is retried."""

    def test_a_real_collision_on_the_position_path_is_one_the_retry_recognises(self):
        """
        THE REAL SERVER'S MESSAGE, fed to the retry. This test found that MySQL
        names this table's index `'organizations_position.path'` -- not the
        `..._path_<hash>_uniq` form the territory table has -- so the shared
        retry, which looked only for the latter, could never have fired here.
        """
        a = Position.objects.root_for(make_org("apex"), AppCode.DMS)
        b = Position.objects.root_for(make_org("bharat"), AppCode.DMS)

        # In a savepoint: the test carries on using the database afterwards.
        with pytest.raises(IntegrityError) as caught, transaction.atomic():
            Position.objects.filter(pk=b.pk).update(path=a.path)
        real_message = str(caught.value)

        real_add_root = Position.objects.add_root
        calls = []

        def collide_once(create_kwargs=None, **kwargs):
            calls.append(1)
            if len(calls) == 1:
                raise IntegrityError(real_message)
            return real_add_root(create_kwargs, **kwargs)

        with patch.object(Position.objects, "add_root", side_effect=collide_once):
            top = Position.objects.root_for(make_org("chola"), AppCode.DMS)

        assert len(calls) == 2
        assert fresh(top).is_root is True

    def test_a_collision_on_the_top_path_is_retried(self):
        real_add_root = Position.objects.add_root
        calls = []

        def collide_once(create_kwargs=None, **kwargs):
            calls.append(1)
            if len(calls) == 1:
                raise IntegrityError(
                    "(1062, \"Duplicate entry '00001' for key 'organizations_position.path'\")"
                )
            return real_add_root(create_kwargs, **kwargs)

        with patch.object(Position.objects, "add_root", side_effect=collide_once):
            top = Position.objects.root_for(make_org(), AppCode.DMS)

        assert len(calls) == 2
        assert fresh(top).is_root is True


class TestWhereAPersonsPositionIsKept:
    def _grant(self, org: Organization, position: Position | None) -> MembershipAppAccess:
        user = User.objects.create_user(email="meera@example.com", password="x")
        membership = Membership.objects.create(user=user, organization=org)
        return MembershipAppAccess.objects.create(
            membership=membership, app_id=AppCode.DMS, position=position
        )

    def test_the_grant_holds_one_position(self):
        org = make_org()
        manager = Position.objects.create(organization=org, name="Sales Manager")

        grant = self._grant(org, manager)

        assert MembershipAppAccess.objects.get(pk=grant.pk).position_id == manager.pk
        assert list(fresh(manager).holders.all()) == [grant]

    def test_a_held_position_cannot_be_deleted_out_from_under_its_people(self):
        org = make_org()
        manager = Position.objects.create(organization=org, name="Sales Manager")
        self._grant(org, manager)

        with pytest.raises(ProtectedError):
            fresh(manager).delete()

    def test_an_invitation_can_carry_the_position_and_protects_it_too(self):
        org = make_org()
        manager = Position.objects.create(organization=org, name="Sales Manager")
        inviter = User.objects.create_user(email="owner@example.com", password="x")
        invitation = Invitation.objects.create(
            organization=org,
            email="ravi@example.com",
            invited_by=inviter,
            token="t" * 64,
            expires_at=timezone.now() + timedelta(days=7),
        )
        role = Role.objects.filter(app_id=AppCode.DMS).first()
        InvitationAppGrant.objects.create(
            invitation=invitation, app_id=AppCode.DMS, role=role, position=manager
        )

        with pytest.raises(ProtectedError):
            fresh(manager).delete()


class TestThePermissions:
    CODES = (
        "dms.position.view",
        "dms.position.create",
        "dms.position.update",
        "dms.position.delete",
    )

    def test_the_four_are_seeded_on_dms(self):
        seeded = set(Permission.objects.filter(code__in=self.CODES).values_list("code", "app_id"))

        assert seeded == {(code, AppCode.DMS) for code in self.CODES}

    def test_no_role_holds_them_the_owner_alone_does(self):
        assert not RolePermission.objects.filter(permission__code__in=self.CODES).exists()
