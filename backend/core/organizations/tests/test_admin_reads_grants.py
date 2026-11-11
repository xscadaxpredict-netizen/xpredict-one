"""
C72 step 2c, commit 3: the ADMIN questions read the grants, not `Membership.role`
and `Membership.unit`.

THE EXISTING SUITE PASSING ONLY PROVES NOTHING BROKE -- the services write the
old fields and the grants together, so a reader on either passes it. Every test
here builds a person whose old fields and grants DISAGREE, and asserts the grant
wins:

- `role = admin` with no Administration grant is NOT an admin;
- `role = member` with an "Organisation admin" grant IS one;
- `unit = None` with a DMS grant at Delhi Motors sits at Delhi Motors -- for
  whose people they manage, what `/me` says, and a closure;
- and a person placed at two dealerships is shut out only when both close.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.api import TenantAPIView
from core.organizations.models import (
    ActivationCode,
    Membership,
    MembershipAppAccess,
    MembershipRole,
    Territory,
    UnitStatus,
)
from core.organizations.selectors import (
    can_manage,
    is_shut_out_by_closure,
    me,
    org_users,
    permissions_for,
    reach,
    standing,
)
from core.organizations.services import create_dealer, grant_app_access, invite_person, sign_up
from core.permissions.models import AppCode, Permission, Role
from shared.exceptions import AuthorizationError

pytestmark = [pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])]


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def found():
    ActivationCode.objects.create(code="CODE-APEX")
    return sign_up(
        activation_code="CODE-APEX",
        organization_name="Apex Motors",
        email="owner@apex.test",
        password="correct horse battery staple",
    )


def person(result, email, *, role=MembershipRole.MEMBER, unit=None) -> Membership:
    """A membership with NO grants, whatever its old fields say."""
    user = User.objects.create_user(email=email, password="x")
    return Membership.objects.create(
        user=user, organization=result.organization, role=role, unit=unit
    )


def org_admin_grant(result, membership) -> None:
    grant_app_access(
        membership=membership,
        app=AppCode.ADMIN,
        role=Role.objects.get(code="admin.org_admin"),
        territories=[Territory.objects.root_for(result.organization)],
    )


def dms_at(membership, territories, code="dms.system_admin") -> None:
    grant_app_access(
        membership=membership,
        app=AppCode.DMS,
        role=Role.objects.get(code=code),
        territories=territories,
    )


def fresh(membership) -> Membership:
    """Reloaded, so prefetched grants are not stale."""
    return Membership.objects.get(pk=membership.pk)


def admin_codes() -> set[str]:
    return set(Permission.objects.filter(app=AppCode.ADMIN).values_list("code", flat=True))


def mine(user):
    (data,) = me(user).memberships
    return data


class TestAdminIsTheGrantNotTheStanding:
    def test_an_admin_standing_with_no_grant_is_not_an_admin(self):
        result = found()
        old = person(result, "old@apex.test", role=MembershipRole.ADMIN)

        assert not admin_codes() & permissions_for(old)
        assert standing(old) == MembershipRole.MEMBER
        assert mine(old.user).role == MembershipRole.MEMBER

    def test_a_member_standing_with_the_grant_is_an_admin(self):
        result = found()
        new = person(result, "new@apex.test")
        org_admin_grant(result, new)
        new = fresh(new)

        assert admin_codes() <= permissions_for(new)
        assert standing(new) == MembershipRole.ADMIN
        assert mine(new.user).role == MembershipRole.ADMIN
        assert reach(new) is None

    def test_the_users_list_calls_them_what_the_grant_says(self):
        result = found()
        new = person(result, "new@apex.test")
        org_admin_grant(result, new)

        row = next(p for p in org_users(result.organization, result.membership) if p.id == new.id)

        assert row.role == MembershipRole.ADMIN
        assert row.administers == "organisation"

    def test_is_manager_or_admin_follows_the_grant(self):
        result = found()
        new = person(result, "new@apex.test")
        org_admin_grant(result, new)
        old = person(result, "old@apex.test", role=MembershipRole.ADMIN)

        def flag(membership):
            view = TenantAPIView()
            view._membership = fresh(membership)
            return view.is_manager_or_admin

        assert flag(new) is True
        assert flag(old) is False


class TestWhoseAdministratorTheyAre:
    """`unit = None` on the old field; the grant says Delhi Motors."""

    def test_reach_is_the_grants_dealership(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        da = person(result, "da@apex.test")
        dms_at(da, [delhi])

        assert reach(fresh(da)) == frozenset({delhi.pk})

    def test_they_manage_their_dealership_and_nobody_else(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        jaipur = create_dealer(organization=result.organization, name="Jaipur Auto")
        da = person(result, "da@apex.test")
        dms_at(da, [delhi])
        da = fresh(da)

        assert can_manage(da, delhi.pk) is True
        assert can_manage(da, jaipur.pk) is False
        assert can_manage(da, None) is False

    def test_the_users_list_shows_them_their_dealership_only(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        jaipur = create_dealer(organization=result.organization, name="Jaipur Auto")
        at_delhi = person(result, "a@apex.test", unit=delhi)
        dms_at(at_delhi, [delhi], code="dms.manager")
        at_jaipur = person(result, "b@apex.test", unit=jaipur)
        dms_at(at_jaipur, [jaipur], code="dms.manager")
        da = person(result, "da@apex.test")
        dms_at(da, [delhi])

        seen = {p.id for p in org_users(result.organization, fresh(da))}

        # Delhi's people -- the dealer admin included, since step 2d matches
        # the ROWS by their grants too. Not Jaipur's, not the owner.
        assert seen == {at_delhi.id, da.id}

    def test_they_may_not_appoint_an_organisation_admin(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        da = person(result, "da@apex.test")
        dms_at(da, [delhi])

        with pytest.raises(AuthorizationError):
            invite_person(
                actor=fresh(da),
                organization=result.organization,
                email="boss@apex.test",
                first_name="B",
                last_name="Oss",
                unit_id=None,
                role=MembershipRole.ADMIN,
                apps=[],
            )

    def test_the_old_field_at_a_dealership_no_longer_narrows_them(self):
        """The reverse disagreement: `unit` says Delhi, the grant says the root."""
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        jaipur = create_dealer(organization=result.organization, name="Jaipur Auto")
        wide = person(result, "wide@apex.test", unit=delhi)
        dms_at(wide, [Territory.objects.root_for(result.organization)], code="dms.fleet_viewer")
        wide = fresh(wide)

        assert reach(wide) is None
        assert can_manage(wide, jaipur.pk) is True


class TestWhatMeSays:
    def test_unit_fields_come_from_the_grant(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        da = person(result, "da@apex.test")
        dms_at(da, [delhi])

        data = mine(da.user)

        assert data.unit_id == delhi.pk
        assert data.unit_name == "Delhi Motors"

    def test_several_dealerships_name_none(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        jaipur = create_dealer(organization=result.organization, name="Jaipur Auto")
        rep = person(result, "rep@apex.test", unit=delhi)
        dms_at(rep, [delhi, jaipur], code="dms.manager")

        data = mine(rep.user)

        assert data.unit_id is None
        assert data.unit_name is None


class TestAClosure:
    def close(self, territory) -> None:
        Territory.objects.filter(pk=territory.pk).update(status=UnitStatus.DISABLED)

    def test_shuts_out_somebody_the_grant_places_there(self, client):
        """`unit = None` on the old field would have let them straight in."""
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        da = person(result, "da@apex.test")
        dms_at(da, [delhi])
        self.close(delhi)
        client.force_authenticate(user=da.user)

        response = client.get(f"/api/v1/orgs/{result.organization.slug}/provisioning/")

        assert is_shut_out_by_closure(fresh(da)) is True
        assert mine(da.user).unit_closed is True
        assert response.status_code == 403
        assert response.json()["code"] == "unit_closed"

    def test_does_not_shut_out_somebody_the_grant_places_elsewhere(self, client):
        """The reverse: `unit` says closed Delhi, the grant says the root."""
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        wide = person(result, "wide@apex.test", unit=delhi)
        dms_at(wide, [Territory.objects.root_for(result.organization)], code="dms.fleet_viewer")
        self.close(delhi)
        client.force_authenticate(user=wide.user)

        response = client.get(f"/api/v1/orgs/{result.organization.slug}/provisioning/")

        assert response.status_code == 200

    def test_one_of_two_dealerships_closed_still_lets_them_work(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        jaipur = create_dealer(organization=result.organization, name="Jaipur Auto")
        rep = person(result, "rep@apex.test")
        dms_at(rep, [delhi, jaipur], code="dms.manager")
        self.close(delhi)

        assert is_shut_out_by_closure(fresh(rep)) is False

        self.close(jaipur)

        assert is_shut_out_by_closure(fresh(rep)) is True


def test_nobody_without_grants_is_everywhere():
    """Fail closed: no grants is an empty reach, never None."""
    result = found()
    nobody = person(result, "nobody@apex.test")

    assert reach(nobody) == frozenset()
    assert can_manage(nobody, None) is False
    assert not MembershipAppAccess.objects.filter(membership=nobody).exists()
