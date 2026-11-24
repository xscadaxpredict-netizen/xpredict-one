"""
The app tile's Edit | Disable | Unassign (the owner, 2026-11-20, as Zoho's):
Admin panel -> Users -> a person -> Applications -> one app.

- `PUT    .../admin/users/<id>/apps/<app>/`          Edit: change the role.
- `POST   .../admin/users/<id>/apps/<app>/disable/`  Disable (and `enable/`).
- `DELETE .../admin/users/<id>/apps/<app>/`          Unassign.

Each needs `admin.user.view` plus its own act (C81): `edit_app`, `disable_app`,
`unassign_app`. The same three refusals
open each: outside the actor's reach is 404, the owner is 409 (they hold every
app by rule), Administration is 409 (Assign Admin's job).

A DISABLED GRANT keeps its role and places but opens nothing and permits
nothing -- the tests that matter most are the ones proving that, through `/me`
and the territory scope DMS filters by.
"""

from __future__ import annotations

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.billing.models import AppSubscription, SubscriptionStatus
from core.organizations.models import (
    ActivationCode,
    GrantStatus,
    Invitation,
    Membership,
    MembershipAppAccess,
    Territory,
    TerritoryKind,
)
from core.organizations.selectors import (
    GRANTS_PREFETCH,
    org_users,
    permissions_for,
    resolve_allowed_territories,
)
from core.organizations.services import grant_app_access, sign_up
from core.permissions.models import AppCode, Permission, Role, RolePermission

pytestmark = [pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])]

APP_URL = "/api/v1/orgs/{slug}/admin/users/{id}/apps/{app}/"
STATUS_URL = "/api/v1/orgs/{slug}/admin/users/{id}/apps/{app}/{action}/"
PASSWORD = "correct horse battery staple"


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def found(name="Acme Water", email="owner@acme.test", code="CODE-ACME"):
    """DMS is subscribed at signup; CRM too, so an org-wide second app exists."""
    ActivationCode.objects.create(code=code)
    result = sign_up(activation_code=code, organization_name=name, email=email, password=PASSWORD)
    AppSubscription.objects.create(
        organization=result.organization, app_id=AppCode.CRM, status=SubscriptionStatus.ACTIVE
    )
    return result


def holding(result, role_code="dms.group_operations", place=None, email="ravi@acme.test"):
    """Somebody holding DMS as `role_code`, at `place` or the organisation's root."""
    user = User.objects.create_user(email=email, password="x", first_name="Ravi", last_name="S")
    membership = Membership.objects.create(user=user, organization=result.organization)
    grant_app_access(
        membership=membership,
        app=AppCode.DMS,
        role=Role.objects.get(code=role_code),
        territories=[place or Territory.objects.root_for(result.organization, AppCode.DMS)],
    )
    return membership


def pending(result, email="kiran@acme.test", role_code="dms.group_operations") -> Invitation:
    invitation = Invitation.objects.create(
        organization=result.organization,
        email=email,
        token=f"token-{email}",
        expires_at=timezone.now() + timezone.timedelta(days=7),
    )
    invitation.app_grants.create(app_id=AppCode.DMS, role=Role.objects.get(code=role_code))
    return invitation


def dealership(result, name="Delhi") -> Territory:
    return Territory.objects.create(
        organization=result.organization, kind=TerritoryKind.DEALER, name=name
    )


def owner_of(result) -> Membership:
    return Membership.objects.get(user=result.user, organization=result.organization)


def fresh(membership: Membership) -> Membership:
    """Reloaded with the grants prefetched, as every request reads it."""
    return Membership.objects.prefetch_related(*GRANTS_PREFETCH).get(pk=membership.pk)


def grant_of(membership: Membership, app=AppCode.DMS) -> MembershipAppAccess:
    return MembershipAppAccess.objects.get(membership=membership, app_id=app)


def edit(client, result, person_id, role, app="dms", user=None):
    client.force_authenticate(user=user or result.user)
    return client.put(
        APP_URL.format(slug=result.organization.slug, id=person_id, app=app),
        {"role": role},
        format="json",
    )


def act(client, result, person_id, action, app="dms", user=None):
    client.force_authenticate(user=user or result.user)
    return client.post(
        STATUS_URL.format(slug=result.organization.slug, id=person_id, app=app, action=action)
    )


def unassign(client, result, person_id, app="dms", user=None):
    client.force_authenticate(user=user or result.user)
    return client.delete(APP_URL.format(slug=result.organization.slug, id=person_id, app=app))


def tile(response, app="dms") -> dict | None:
    return next((a for a in response.json()["apps"] if a["app"] == app), None)


class TestEdit:
    def test_it_changes_the_role_and_nothing_else(self, client):
        result = found()
        ravi = holding(result, "dms.group_operations")

        response = edit(client, result, ravi.id, "dms.fleet_viewer")

        assert response.status_code == 200
        assert tile(response) == {
            "app": "dms",
            "role_code": "dms.fleet_viewer",
            "role_name": "Fleet viewer",
            "status": "active",
        }
        # Still placed at the organisation's root.
        places = [p.territory for p in grant_of(ravi).territories.all()]
        assert [t.is_root for t in places] == [True]

    def test_somebody_at_a_dealership_keeps_it_and_takes_a_dealership_role(self, client):
        result = found()
        delhi = dealership(result)
        ravi = holding(result, "dms.sales_representative", place=delhi)

        response = edit(client, result, ravi.id, "dms.manager")

        assert response.status_code == 200
        assert tile(response)["role_code"] == "dms.manager"
        assert [p.territory_id for p in grant_of(ravi).territories.all()] == [delhi.id]

    def test_a_role_that_does_not_fit_where_they_sit_is_refused(self, client):
        """C27: an organisation-level role for somebody at a dealership."""
        result = found()
        ravi = holding(result, "dms.sales_representative", place=dealership(result))

        response = edit(client, result, ravi.id, "dms.group_operations")

        assert response.status_code == 409
        assert response.json()["code"] == "role_scope_mismatch"
        assert grant_of(ravi).roles.get().role.code == "dms.sales_representative"

    def test_a_disabled_app_stays_disabled(self, client):
        result = found()
        ravi = holding(result)
        act(client, result, ravi.id, "disable")

        response = edit(client, result, ravi.id, "dms.fleet_viewer")

        assert tile(response)["status"] == "disabled"

    def test_a_pending_persons_role_changes_on_the_invitation(self, client):
        result = found()
        kiran = pending(result)

        response = edit(client, result, kiran.id, "dms.fleet_viewer")

        assert response.status_code == 200
        assert kiran.app_grants.get().role.code == "dms.fleet_viewer"

    def test_an_app_they_do_not_hold_is_404(self, client):
        result = found()
        ravi = holding(result)

        assert edit(client, result, ravi.id, "crm.member", app="crm").status_code == 404


class TestDisable:
    def test_it_disables_the_app_and_keeps_its_role(self, client):
        result = found()
        ravi = holding(result, "dms.group_operations")

        response = act(client, result, ravi.id, "disable")

        assert response.status_code == 200
        assert tile(response) == {
            "app": "dms",
            "role_code": "dms.group_operations",
            "role_name": "Group operations",
            "status": "disabled",
        }
        assert grant_of(ravi).status == GrantStatus.DISABLED

    def test_a_disabled_app_permits_nothing_and_opens_nothing(self, client):
        """THE POINT OF DISABLE: no permission from it, and no app in `/me`."""
        result = found()
        ravi = holding(result, "dms.group_operations")
        assert any(code.startswith("dms.") for code in permissions_for(fresh(ravi)))

        act(client, result, ravi.id, "disable")

        assert not any(code.startswith("dms.") for code in permissions_for(fresh(ravi)))
        client.force_authenticate(user=ravi.user)
        me = client.get("/api/v1/me/").json()
        dms = next(a for a in me["memberships"][0]["apps"] if a["key"] == "dms")
        assert dms["accessible"] is False
        assert dms["permissions"] == []

    def test_a_disabled_app_sees_no_dealership(self):
        """The second lock: DMS's own territory filter is restricted to nothing."""
        result = found()
        delhi = dealership(result)
        ravi = holding(result, "dms.sales_representative", place=delhi)
        assert resolve_allowed_territories(fresh(ravi), AppCode.DMS) == frozenset({delhi.id})

        grant = grant_of(ravi)
        grant.status = GrantStatus.DISABLED
        grant.save()

        assert resolve_allowed_territories(fresh(ravi), AppCode.DMS) == frozenset()

    def test_enable_gives_back_exactly_what_was_there(self, client):
        result = found()
        ravi = holding(result, "dms.group_operations")
        before = permissions_for(fresh(ravi))
        act(client, result, ravi.id, "disable")

        response = act(client, result, ravi.id, "enable")

        assert response.status_code == 200
        assert tile(response)["status"] == "active"
        assert permissions_for(fresh(ravi)) == before

    def test_they_still_belong_where_they_are_placed(self):
        """
        Disabled is not gone: the person stays at their dealership, so the
        admins who managed them still see them.
        """
        result = found()
        delhi = dealership(result)
        ravi = holding(result, "dms.sales_representative", place=delhi)
        grant = grant_of(ravi)
        grant.status = GrantStatus.DISABLED
        grant.save()
        dealer_admin = holding(result, "dms.system_admin", place=delhi, email="da@acme.test")

        seen = {p.email for p in org_users(result.organization, fresh(dealer_admin))}

        assert "ravi@acme.test" in seen

    def test_a_pending_persons_app_cannot_be_disabled(self, client):
        result = found()
        kiran = pending(result)

        response = act(client, result, kiran.id, "disable")

        assert response.status_code == 409
        assert response.json()["code"] == "app_not_yet_in_use"

    def test_an_unknown_action_is_404(self, client):
        result = found()
        ravi = holding(result)

        assert act(client, result, ravi.id, "explode").status_code == 404
        assert grant_of(ravi).status == GrantStatus.ACTIVE


class TestUnassign:
    def test_it_removes_the_app_with_its_role_and_places(self, client):
        result = found()
        ravi = holding(result)

        response = unassign(client, result, ravi.id)

        assert response.status_code == 200
        assert response.json()["apps"] == []
        assert not MembershipAppAccess.objects.filter(membership=ravi).exists()

    def test_a_disabled_app_can_be_unassigned(self, client):
        result = found()
        ravi = holding(result)
        act(client, result, ravi.id, "disable")

        assert unassign(client, result, ravi.id).status_code == 200
        assert not MembershipAppAccess.objects.filter(membership=ravi).exists()

    def test_a_pending_persons_app_comes_off_the_invitation(self, client):
        result = found()
        kiran = pending(result)

        response = unassign(client, result, kiran.id)

        assert response.status_code == 200
        assert not kiran.app_grants.exists()

    def test_an_app_they_do_not_hold_is_404(self, client):
        result = found()
        ravi = holding(result)

        assert unassign(client, result, ravi.id, app="crm").status_code == 404


class TestWhatIsRefused:
    @pytest.mark.parametrize("action", ["edit", "disable", "unassign"])
    def test_the_owner_holds_every_app_by_rule(self, client, action):
        result = found()
        owner = owner_of(result)

        response = {
            "edit": lambda: edit(client, result, owner.id, "dms.fleet_viewer"),
            "disable": lambda: act(client, result, owner.id, "disable"),
            "unassign": lambda: unassign(client, result, owner.id),
        }[action]()

        assert response.status_code == 409
        assert response.json()["code"] == "owner_holds_every_app"

    @pytest.mark.parametrize("action", ["disable", "unassign"])
    def test_administration_is_assign_admins_job(self, client, action):
        result = found()
        ravi = holding(result)

        response = (
            act(client, result, ravi.id, "disable", app="admin")
            if action == "disable"
            else unassign(client, result, ravi.id, app="admin")
        )

        assert response.status_code == 409
        assert response.json()["code"] == "administration_not_grantable"

    def test_another_organisations_person_is_404(self, client):
        result = found()
        other = found(name="Other Co", email="owner@other.test", code="CODE-OTHER")
        theirs = holding(other, email="theirs@other.test")

        assert unassign(client, result, theirs.id).status_code == 404
        assert MembershipAppAccess.objects.filter(membership=theirs).exists()

    def test_somebody_outside_the_actors_reach_is_404(self, client):
        """Every permission, but placed at Delhi: Mumbai's person is not there."""
        result = found()
        delhi, mumbai = dealership(result, "Delhi"), dealership(result, "Mumbai")
        role = Role.objects.create(
            code="dms.test_tiler", name="Test", app_id=AppCode.DMS, level="unit", summary="."
        )
        for code in (
            "admin.user.view",
            "admin.user.edit_app",
            "admin.user.disable_app",
            "admin.user.unassign_app",
        ):
            RolePermission.objects.create(role=role, permission=Permission.objects.get(code=code))
        actor = holding(result, "dms.test_tiler", place=delhi, email="actor@acme.test")
        theirs = holding(result, "dms.sales_representative", place=mumbai)

        assert act(client, result, theirs.id, "disable", user=actor.user).status_code == 404
        assert unassign(client, result, theirs.id, user=actor.user).status_code == 404
        assert grant_of(theirs).status == GrantStatus.ACTIVE

    @pytest.mark.parametrize(
        ("action", "permission"),
        [
            ("edit", "admin.user.edit_app"),
            ("disable", "admin.user.disable_app"),
            ("unassign", "admin.user.unassign_app"),
        ],
    )
    def test_each_needs_its_own_permission(self, client, action, permission):
        """
        Everything else an Organisation admin holds, minus this one act: 403.

        `admin.user.update` stays in the list on purpose: it is Edit user (a
        name, an email), and holding it must NOT be enough to change somebody's
        role in an app -- which is what it was, before `edit_app`.
        """
        result = found()
        role = Role.objects.create(
            code="dms.test_almost", name="Test", app_id=AppCode.DMS, level="org", summary="."
        )
        for code in (
            "admin.user.view",
            "admin.user.update",
            "admin.user.edit_app",
            "admin.user.disable_app",
            "admin.user.unassign_app",
        ):
            if code != permission:
                RolePermission.objects.create(
                    role=role, permission=Permission.objects.get(code=code)
                )
        actor = holding(result, "dms.test_almost", email="actor@acme.test")
        ravi = holding(result)

        response = {
            "edit": lambda: edit(client, result, ravi.id, "dms.fleet_viewer", user=actor.user),
            "disable": lambda: act(client, result, ravi.id, "disable", user=actor.user),
            "unassign": lambda: unassign(client, result, ravi.id, user=actor.user),
        }[action]()

        assert response.status_code == 403
        assert grant_of(ravi).status == GrantStatus.ACTIVE
        assert grant_of(ravi).roles.get().role.code == "dms.group_operations"
