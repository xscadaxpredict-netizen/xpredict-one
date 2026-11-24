"""
Assigning people to territories (the owner, 2026-11-24; C82 amended):

- ONLY APP ROLES: any DMS role at any territory.
- NO TERRITORY UNTIL ONE IS ASSIGNED: joining DMS places nobody, and somebody
  with no place sees no DMS records.
- A territory's People tab: who works here, Assign users (ADDS this place),
  Remove, Move. DMS Users -> Edit sets a person's places.
"""

from __future__ import annotations

import importlib

import pytest
from django.apps import apps as django_apps
from django.utils import timezone
from rest_framework.test import APIClient

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.organizations.models import (
    ActivationCode,
    Invitation,
    Membership,
    MembershipAppAccess,
    Territory,
    TerritoryKind,
)
from core.organizations.selectors import resolve_allowed_territories
from core.organizations.services import (
    accept_invitation,
    add_territory,
    grant_app_access,
    invite_to_app,
    sign_up,
)
from core.permissions.models import AppCode, Permission, Role, RolePermission

pytestmark = [
    pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS]),
]

GSTIN = "27AAPFU0939F1ZV"


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


def box(result, name, kind=TerritoryKind.REGION, parent=None):
    return add_territory(
        organization=result.organization,
        kind=kind,
        name=name,
        parent_id=parent.pk if parent else None,
        gstin=GSTIN if kind == TerritoryKind.DEALER else "",
    )


def member(result, *, email, role_code="dms.manager", places=(), app=AppCode.DMS):
    user = User.objects.create_user(email=email, password="x")
    membership = Membership.objects.create(user=user, organization=result.organization)
    grant_app_access(
        membership=membership,
        app=app,
        role=Role.objects.get(code=role_code),
        territories=list(places),
    )
    return membership


def places_of(membership, app=AppCode.DMS):
    grant = MembershipAppAccess.objects.get(membership=membership, app_id=app)
    return sorted(p.territory.display_name for p in grant.territories.all())


def role_of(membership, app=AppCode.DMS):
    grant = MembershipAppAccess.objects.get(membership=membership, app_id=app)
    return grant.roles.get().role.code


def url(result, territory, rest=""):
    return (
        f"/api/v1/orgs/{result.organization.slug}/dms/settings/territories/{territory.pk}/"
        f"people/{rest}"
    )


def user_url(result, person_id):
    return f"/api/v1/orgs/{result.organization.slug}/dms/settings/users/{person_id}/"


def as_owner(client, result):
    client.force_authenticate(user=result.user)
    return client


# --- No territory until one is assigned -------------------------------------------


class TestJoiningPlacesNobody:
    def test_accepting_a_dms_invitation_gives_dms_with_no_place(self):
        result = found()
        owner = Membership.objects.get(user=result.user)
        invitation = invite_to_app(
            actor=owner,
            organization=result.organization,
            app=AppCode.DMS,
            email="new@acme.test",
            first_name="New",
            last_name="Person",
            role="dms.manager",
        )
        joined = accept_invitation(
            token=invitation.token, password="correct horse battery staple"
        ).membership

        assert role_of(joined) == "dms.manager"
        assert places_of(joined) == []

    def test_somebody_with_no_place_sees_no_dms_records(self):
        result = found()
        nobody = member(result, email="n@acme.test")

        allowed = resolve_allowed_territories(
            Membership.objects.get(pk=nobody.pk), AppCode.DMS
        )

        # An EMPTY set -- restricted to nothing -- never None (= everything).
        assert allowed == frozenset()

    def test_the_organisation_box_means_everywhere(self):
        result = found()
        everywhere = member(result, email="e@acme.test", places=[root(result)])

        assert resolve_allowed_territories(everywhere, AppCode.DMS) is None


class TestOnlyAppRoles:
    def test_add_user_offers_every_dms_role(self, client):
        result = found()

        codes = {
            r["code"]
            for r in as_owner(client, result)
            .get(f"/api/v1/orgs/{result.organization.slug}/dms/settings/invite-roles/")
            .json()
        }

        assert {"dms.manager", "dms.technician", "dms.group_operations"} <= codes

    def test_add_user_takes_a_role_that_was_dealership_only(self, client):
        result = found()

        response = as_owner(client, result).post(
            f"/api/v1/orgs/{result.organization.slug}/dms/settings/users/",
            {
                "first_name": "Priya",
                "last_name": "M",
                "email": "p@acme.test",
                "role": "dms.manager",
            },
            format="json",
        )

        assert response.status_code == 201, response.content

    def test_an_organisation_role_works_at_a_dealer(self, client):
        result = found()
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER)
        hq = member(result, email="hq@acme.test", role_code="dms.group_operations")

        response = as_owner(client, result).post(
            url(result, delhi), {"users": [str(hq.pk)]}, format="json"
        )

        assert response.status_code == 200, response.content
        assert places_of(hq) == ["Delhi Motors"]
        assert role_of(hq) == "dms.group_operations"

    def test_edit_offers_every_role_to_somebody_at_a_dealer(self, client):
        result = found()
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER)
        person = member(result, email="m@acme.test", places=[delhi])

        codes = {
            r["code"]
            for r in as_owner(client, result).get(f"{user_url(result, person.pk)}roles/").json()
        }

        assert {"dms.manager", "dms.group_operations", "dms.fleet_viewer"} <= codes


# --- The People tab ---------------------------------------------------------------


class TestPeopleTab:
    def test_lists_the_people_placed_here_not_below_and_never_the_owner(self, client):
        result = found()
        north = box(result, "North")
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER, north)
        member(result, email="rm@acme.test", role_code="dms.group_operations", places=[north])
        member(result, email="dm@acme.test", places=[delhi, north])
        member(result, email="below@acme.test", places=[delhi])

        body = as_owner(client, result).get(url(result, north)).json()

        assert [p["email"] for p in body] == ["dm@acme.test", "rm@acme.test"]
        both = next(p for p in body if p["email"] == "dm@acme.test")
        assert both["role"] == {"code": "dms.manager", "name": "Manager"}
        assert both["other_places"] == ["Delhi Motors"]
        assert both["access_status"] == "active"
        assert set(both) == {
            "id",
            "first_name",
            "last_name",
            "email",
            "role",
            "other_places",
            "access_status",
            "other_apps",
        }

    def test_assign_adds_the_place_and_keeps_the_others_and_the_role(self, client):
        result = found()
        north = box(result, "North")
        jaipur = box(result, "Jaipur Motors", TerritoryKind.DEALER, north)
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER, north)
        meera = member(result, email="meera@acme.test", role_code="dms.service_advisor",
                       places=[jaipur])
        newcomer = member(result, email="new@acme.test", role_code="dms.technician")

        response = as_owner(client, result).post(
            url(result, delhi), {"users": [str(meera.pk), str(newcomer.pk)]}, format="json"
        )

        assert response.status_code == 200, response.content
        assert {p["email"] for p in response.json()} == {"meera@acme.test", "new@acme.test"}
        assert places_of(meera) == ["Delhi Motors", "Jaipur Motors"]
        assert role_of(meera) == "dms.service_advisor"
        assert places_of(newcomer) == ["Delhi Motors"]

    def test_assigning_somebody_already_here_assigns_nobody(self, client):
        result = found()
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER)
        here = member(result, email="here@acme.test", places=[delhi])
        newcomer = member(result, email="new@acme.test")

        response = as_owner(client, result).post(
            url(result, delhi), {"users": [str(newcomer.pk), str(here.pk)]}, format="json"
        )

        assert response.status_code == 409
        assert response.json()["code"] == "already_in_territory"
        # All or nothing: the newcomer was not placed either.
        assert places_of(newcomer) == []

    def test_somebody_pending_cannot_be_placed(self, client):
        result = found()
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER)
        invitation = Invitation.objects.create(
            organization=result.organization,
            email="pending@acme.test",
            token="token-pending",
            expires_at=timezone.now() + timezone.timedelta(days=7),
        )
        invitation.app_grants.create(app_id=AppCode.DMS, role=Role.objects.get(code="dms.manager"))

        response = as_owner(client, result).post(
            url(result, delhi), {"users": [str(invitation.pk)]}, format="json"
        )

        assert response.status_code == 409
        assert response.json()["code"] == "pending_person_cannot_be_placed"

    def test_somebody_without_dms_or_the_owner_is_refused(self, client):
        result = found()
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER)
        admin = member(
            result,
            email="admin@acme.test",
            app=AppCode.ADMIN,
            role_code="admin.org_admin",
            places=[root(result, AppCode.ADMIN)],
        )
        owner = Membership.objects.get(user=result.user)
        owner_client = as_owner(client, result)

        assert (
            owner_client.post(url(result, delhi), {"users": [str(admin.pk)]}, format="json")
        ).status_code == 404
        assert (
            owner_client.post(url(result, delhi), {"users": [str(owner.pk)]}, format="json")
        ).status_code == 409

    def test_c27_somebody_holding_an_app_without_territories_is_not_put_at_a_dealer(
        self, client
    ):
        result = found()
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER)
        person = member(result, email="both@acme.test")
        grant_app_access(
            membership=person,
            app=AppCode.ADMIN,
            role=Role.objects.get(code="admin.org_admin"),
            territories=[root(result, AppCode.ADMIN)],
        )

        response = as_owner(client, result).post(
            url(result, delhi), {"users": [str(person.pk)]}, format="json"
        )

        assert response.status_code == 409
        assert places_of(person) == []

    def test_remove_takes_this_place_off_and_may_leave_none(self, client):
        result = found()
        north = box(result, "North")
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER, north)
        two = member(result, email="two@acme.test", places=[north, delhi])
        one = member(result, email="one@acme.test", places=[delhi])
        owner = as_owner(client, result)

        assert owner.delete(url(result, delhi, f"{two.pk}/")).status_code == 204
        assert owner.delete(url(result, delhi, f"{one.pk}/")).status_code == 204

        assert places_of(two) == ["North"]
        assert places_of(one) == []
        assert role_of(one) == "dms.manager"

    def test_remove_somebody_not_here_is_not_found(self, client):
        result = found()
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER)
        elsewhere = member(result, email="else@acme.test", places=[box(result, "North")])

        response = as_owner(client, result).delete(url(result, delhi, f"{elsewhere.pk}/"))

        assert response.status_code == 404

    def test_move_swaps_this_place_for_another_and_keeps_the_rest(self, client):
        result = found()
        north = box(result, "North")
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER, north)
        jaipur = box(result, "Jaipur Motors", TerritoryKind.DEALER, north)
        south = box(result, "South")
        person = member(result, email="p@acme.test", places=[delhi, south])

        response = as_owner(client, result).post(
            url(result, delhi, f"{person.pk}/move/"), {"to": str(jaipur.pk)}, format="json"
        )

        assert response.status_code == 204, response.content
        assert places_of(person) == ["Jaipur Motors", "South"]
        assert role_of(person) == "dms.manager"

    def test_move_to_another_organisation_s_territory_is_not_found(self, client):
        ours = found()
        theirs = found(name="Other Co", email="boss@other.test", code="CODE-OTHER")
        delhi = box(ours, "Delhi Motors", TerritoryKind.DEALER)
        person = member(ours, email="p@acme.test", places=[delhi])

        response = as_owner(client, ours).post(
            url(ours, delhi, f"{person.pk}/move/"), {"to": str(box(theirs, "Theirs").pk)},
            format="json",
        )

        assert response.status_code == 404
        assert places_of(person) == ["Delhi Motors"]


class TestTenantIsolation:
    def test_another_organisation_s_territory_and_people_are_not_found(self, client):
        ours = found()
        theirs = found(name="Other Co", email="boss@other.test", code="CODE-OTHER")
        their_box = box(theirs, "Their Region")
        their_person = member(theirs, email="them@other.test", places=[their_box])
        our_box = box(ours, "North")
        owner = as_owner(client, ours)

        # Their territory, under our address.
        assert owner.get(url(ours, their_box)).status_code == 404
        assert owner.post(url(ours, their_box), {"users": [str(their_person.pk)]},
                          format="json").status_code == 404
        # Their person, assigned to our territory.
        assert owner.post(url(ours, our_box), {"users": [str(their_person.pk)]},
                          format="json").status_code == 404
        assert places_of(their_person) == ["Their Region"]


# --- DMS Users -> Edit's Territory field ------------------------------------------


def an_edit(**overrides):
    return {
        "first_name": "Meera",
        "last_name": "Iyer",
        "email": "meera@acme.test",
        "role": "dms.service_advisor",
        **overrides,
    }


class TestEditTerritories:
    def test_sets_exactly_these_places(self, client):
        result = found()
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER)
        jaipur = box(result, "Jaipur Motors", TerritoryKind.DEALER)
        meera = member(result, email="meera@acme.test", role_code="dms.service_advisor",
                       places=[jaipur])

        response = as_owner(client, result).put(
            user_url(result, meera.pk),
            an_edit(territories=[str(delhi.pk), str(jaipur.pk)]),
            format="json",
        )

        assert response.status_code == 200, response.content
        assert places_of(meera) == ["Delhi Motors", "Jaipur Motors"]
        row = response.json()
        assert sorted(p["name"] for p in row["places"]) == ["Delhi Motors", "Jaipur Motors"]
        assert {p["id"] for p in row["places"]} == {str(delhi.pk), str(jaipur.pk)}

    def test_an_empty_list_unplaces_and_leaving_it_out_keeps(self, client):
        result = found()
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER)
        meera = member(result, email="meera@acme.test", role_code="dms.service_advisor",
                       places=[delhi])
        owner = as_owner(client, result)

        assert owner.put(user_url(result, meera.pk), an_edit(), format="json").status_code == 200
        assert places_of(meera) == ["Delhi Motors"]

        assert owner.put(
            user_url(result, meera.pk), an_edit(territories=[]), format="json"
        ).status_code == 200
        assert places_of(meera) == []

    def test_another_app_s_territory_is_not_found_and_nothing_is_saved(self, client):
        result = found()
        meera = member(result, email="meera@acme.test", role_code="dms.service_advisor")

        response = as_owner(client, result).put(
            user_url(result, meera.pk),
            an_edit(first_name="Changed", territories=[str(root(result, AppCode.ADMIN).pk)]),
            format="json",
        )

        assert response.status_code == 404
        meera.user.refresh_from_db()
        assert meera.user.first_name != "Changed"


# --- Who may ------------------------------------------------------------------------


class TestPlacingIsItsOwnPermission:
    """
    A role that may SEE the tree and the users and nothing else: the People tab
    reads, and every act that places somebody is refused by `dms.user.update`.
    """

    @pytest.fixture
    def looker(self, client):
        result = found()
        role = Role.objects.create(
            code="dms.people_looker",
            name="People looker",
            app_id=AppCode.DMS,
            level="org",
            summary="Sees territories and users.",
            organization_id=result.organization.pk,
        )
        for code in ("dms.territory.view", "dms.user.view"):
            RolePermission.objects.create(role=role, permission=Permission.objects.get(code=code))
        person = member(result, email="looker@acme.test", role_code=role.code,
                        places=[root(result)])
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER)
        target = member(result, email="t@acme.test", places=[delhi])
        client.force_authenticate(user=person.user)
        return result, delhi, target

    def test_sees_the_people_tab(self, client, looker):
        result, delhi, _target = looker
        assert client.get(url(result, delhi)).status_code == 200

    def test_cannot_assign_remove_or_move(self, client, looker):
        result, delhi, target = looker
        newcomer = member(result, email="new@acme.test")

        assert client.post(url(result, delhi), {"users": [str(newcomer.pk)]},
                           format="json").status_code == 403
        assert client.delete(url(result, delhi, f"{target.pk}/")).status_code == 403
        assert client.post(url(result, delhi, f"{target.pk}/move/"),
                           {"to": str(root(result).pk)}, format="json").status_code == 403
        assert places_of(newcomer) == []
        assert places_of(target) == ["Delhi Motors"]

    def test_without_the_users_view_the_tab_is_refused(self, client):
        result = found()
        role = Role.objects.create(
            code="dms.tree_only",
            name="Tree only",
            app_id=AppCode.DMS,
            level="org",
            summary="Sees the tree.",
            organization_id=result.organization.pk,
        )
        RolePermission.objects.create(
            role=role, permission=Permission.objects.get(code="dms.territory.view")
        )
        person = member(result, email="tree@acme.test", role_code=role.code,
                        places=[root(result)])
        client.force_authenticate(user=person.user)

        assert client.get(url(result, box(result, "North"))).status_code == 403


# --- The migration that unplaced the old automatic root placements -----------------


class TestUnplaceMigration:
    def test_removes_dms_root_places_except_the_owner_s_and_keeps_the_rest(self):
        result = found()
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER)
        at_root = member(result, email="root@acme.test", places=[root(result)])
        at_both = member(result, email="both@acme.test", places=[root(result), delhi])
        owner = Membership.objects.get(user=result.user)
        owner_before = places_of(owner)

        migration = importlib.import_module(
            "core.organizations.migrations.0027_unplace_dms_root"
        )
        migration.unplace(django_apps, None)

        assert places_of(at_root) == []
        assert places_of(at_both) == ["Delhi Motors"]
        assert places_of(owner) == owner_before


# --- A territory's people hold DMS only (the owner, 2026-11-24) ----------------------


def with_admin_panel(result, person):
    """Give a DMS person the Admin panel too -- an app that ignores territories."""
    grant_app_access(
        membership=person,
        app=AppCode.ADMIN,
        role=Role.objects.get(code="admin.org_admin"),
        territories=[root(result, AppCode.ADMIN)],
    )
    return person


class TestATerritorysPeopleHoldDmsOnly:
    @pytest.mark.parametrize("kind", [TerritoryKind.REGION, TerritoryKind.WAREHOUSE])
    def test_somebody_holding_another_app_is_not_assigned_below_the_organisation(
        self, client, kind
    ):
        result = found()
        place = box(result, "Somewhere", kind)
        person = with_admin_panel(result, member(result, email="both@acme.test"))

        response = as_owner(client, result).post(
            url(result, place), {"users": [str(person.pk)]}, format="json"
        )

        assert response.status_code == 409
        body = response.json()
        assert body["code"] == "other_apps_held"
        assert "the Admin panel" in body["detail"]
        assert places_of(person) == []

    def test_the_organisation_takes_them(self, client):
        result = found()
        person = with_admin_panel(result, member(result, email="both@acme.test"))

        response = as_owner(client, result).post(
            url(result, root(result)), {"users": [str(person.pk)]}, format="json"
        )

        assert response.status_code == 200, response.content
        assert places_of(person) == ["Acme Water"]

    def test_moving_them_down_from_the_organisation_is_refused(self, client):
        result = found()
        north = box(result, "North")
        person = with_admin_panel(
            result, member(result, email="both@acme.test", places=[root(result)])
        )

        response = as_owner(client, result).post(
            url(result, root(result), f"{person.pk}/move/"), {"to": str(north.pk)}, format="json"
        )

        assert response.status_code == 409
        assert response.json()["code"] == "other_apps_held"
        assert places_of(person) == ["Acme Water"]

    def test_moving_up_to_the_organisation_and_between_territories_is_just_moving(self, client):
        result = found()
        north = box(result, "North")
        delhi = box(result, "Delhi Motors", TerritoryKind.DEALER, north)
        person = member(result, email="p@acme.test", places=[delhi])
        owner = as_owner(client, result)

        between = owner.post(
            url(result, delhi, f"{person.pk}/move/"), {"to": str(north.pk)}, format="json"
        )
        up = owner.post(
            url(result, north, f"{person.pk}/move/"), {"to": str(root(result).pk)}, format="json"
        )

        assert (between.status_code, up.status_code) == (204, 204)
        assert places_of(person) == ["Acme Water"]

    def test_edit_cannot_place_them_below_the_organisation_and_saves_nothing(self, client):
        result = found()
        north = box(result, "North")
        meera = with_admin_panel(
            result,
            member(result, email="meera@acme.test", role_code="dms.service_advisor"),
        )

        response = as_owner(client, result).put(
            user_url(result, meera.pk),
            an_edit(first_name="Changed", territories=[str(north.pk)]),
            format="json",
        )

        assert response.status_code == 409
        assert places_of(meera) == []
        meera.user.refresh_from_db()
        assert meera.user.first_name != "Changed"

    def test_somebody_at_a_region_is_given_no_other_app(self, client):
        result = found()
        north = box(result, "North")
        person = member(result, email="rm@acme.test", places=[north])

        response = as_owner(client, result).post(
            f"/api/v1/orgs/{result.organization.slug}/admin/admins/",
            {"users": [str(person.pk)], "role": "admin.org_admin"},
            format="json",
        )

        assert response.status_code == 409
        assert not person.grants.filter(app_id=AppCode.ADMIN).exists()

    def test_dms_users_rows_name_the_other_apps(self, client):
        result = found()
        with_admin_panel(result, member(result, email="both@acme.test"))
        member(result, email="only@acme.test")

        rows = {
            row["email"]: row["other_apps"]
            for row in as_owner(client, result)
            .get(f"/api/v1/orgs/{result.organization.slug}/dms/settings/users/")
            .json()
        }

        assert rows["both@acme.test"] == ["the Admin panel"]
        assert rows["only@acme.test"] == []
        assert rows["owner@acme.test"] == []
