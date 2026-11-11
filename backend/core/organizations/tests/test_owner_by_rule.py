"""
C72 step 2c, commit 1: the owner holds everything BY RULE, through `is_owner`.

Every permission of every app the organisation subscribes to, plus all of
Administration, everywhere in the territory tree -- whatever grant rows the
owner happens to hold, including none.

THE PROOF IS IN TAKING THE ROWS AWAY. An owner straight from sign-up holds a
DMS grant and (until later in step 2c) the owner standing, so they pass any
"can the owner do X" test whichever source is read. These tests delete the
owner's grants and `AppAccess` rows first; what is left can only come from
`is_owner`.

AND ONE THING THE RULE CHANGES, ON PURPOSE: the owner's DMS seed role, Group
operations, lacks the three Tech support ticket permissions. Under the rule
the owner holds them. C72 decided the owner holds everything; this pins that
the decision reached them, so nobody "fixes" it back by accident.
"""

from __future__ import annotations

import pytest

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.billing.models import AppSubscription, SubscriptionStatus
from core.organizations.models import ActivationCode, Membership, MembershipRole, Territory
from core.organizations.selectors import me, permissions_for, resolve_allowed_units
from core.organizations.services import create_dealer, grant_app_access, sign_up
from core.permissions.models import AppAccess, AppCode, Permission, Role

pytestmark = [pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])]


def found():
    ActivationCode.objects.create(code="CODE-APEX")
    return sign_up(
        activation_code="CODE-APEX",
        organization_name="Apex Motors",
        email="owner@apex.test",
        password="correct horse battery staple",
    )


def strip_rows(membership) -> None:
    """Take away every access row the owner holds, old and new."""
    membership.grants.all().delete()
    AppAccess.objects.filter(membership=membership).delete()


def codes(app: str) -> set[str]:
    return set(Permission.objects.filter(app=app).values_list("code", flat=True))


def app_in_me(user, key: str):
    (membership,) = me(user).memberships
    return next(a for a in membership.apps if a.key == key)


class TestTheOwnerHoldsEverythingWithNoRows:
    def test_every_permission_of_a_subscribed_app_and_all_of_administration(self):
        result = found()
        strip_rows(result.membership)

        assert permissions_for(result.membership) == frozenset(
            codes(AppCode.DMS) | codes(AppCode.ADMIN)
        )

    def test_the_launcher_opens_both(self):
        result = found()
        strip_rows(result.membership)

        assert app_in_me(result.user, AppCode.DMS).accessible is True
        assert app_in_me(result.user, AppCode.ADMIN).accessible is True

    def test_the_ticket_permissions_group_operations_lacks(self):
        """The one deliberate change: see the module docstring."""
        result = found()
        tickets = {"dms.ticket.create", "dms.ticket.update", "dms.ticket.export"}
        group_operations = set(
            Role.objects.get(code="dms.group_operations").permissions.values_list(
                "code", flat=True
            )
        )

        assert not tickets & group_operations
        assert tickets <= permissions_for(result.membership)


class TestTheRuleStopsAtTheSubscription:
    """Owning the organisation does not open an app it has not bought (C55)."""

    def test_an_app_never_subscribed(self):
        result = found()

        assert not {p for p in permissions_for(result.membership) if p.startswith("crm.")}
        assert app_in_me(result.user, AppCode.CRM).accessible is False

    def test_a_cancelled_subscription(self):
        result = found()
        AppSubscription.objects.filter(organization=result.organization, app=AppCode.DMS).update(
            status=SubscriptionStatus.CANCELLED
        )

        assert not {p for p in permissions_for(result.membership) if p.startswith("dms.")}
        assert app_in_me(result.user, AppCode.DMS).accessible is False
        # Administration is never bought, so it stays.
        assert codes(AppCode.ADMIN) <= permissions_for(result.membership)


class TestTheOwnerIsEverywhere:
    def test_with_no_grant_at_all(self):
        result = found()
        strip_rows(result.membership)

        assert resolve_allowed_units(result.membership, AppCode.DMS) is None

    def test_even_when_their_grant_says_one_dealership(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        grant_app_access(
            membership=result.membership,
            app=AppCode.DMS,
            role=Role.objects.get(code="dms.group_operations"),
            territories=[delhi],
        )

        assert resolve_allowed_units(result.membership, AppCode.DMS) is None


class TestEverybodyElseIsUnchanged:
    def test_a_member_does_not_get_the_rule(self):
        result = found()
        user = User.objects.create_user(email="meera@apex.test", password="x")
        member = Membership.objects.create(user=user, organization=result.organization)

        assert member.is_owner is None
        assert permissions_for(member) == frozenset()
        assert resolve_allowed_units(member, AppCode.DMS) == frozenset()

    def test_an_org_admin_holds_administration_and_only_what_they_are_granted(self):
        """
        Built the way admins are made since step 2c commit 3: the "Organisation
        admin" grant is what confers Administration -- the `admin` standing
        alone confers nothing (`test_admin_reads_grants.py`).
        """
        result = found()
        user = User.objects.create_user(email="ravi@apex.test", password="x")
        admin = Membership.objects.create(
            user=user, organization=result.organization, role=MembershipRole.ADMIN
        )
        grant_app_access(
            membership=admin,
            app=AppCode.ADMIN,
            role=Role.objects.get(code="admin.org_admin"),
            territories=[Territory.objects.root_for(result.organization)],
        )
        grant_app_access(
            membership=admin,
            app=AppCode.DMS,
            role=Role.objects.get(code="dms.fleet_viewer"),
            territories=[Territory.objects.root_for(result.organization)],
        )
        fleet_viewer = set(
            Role.objects.get(code="dms.fleet_viewer").permissions.values_list("code", flat=True)
        )

        assert permissions_for(admin) == frozenset(codes(AppCode.ADMIN) | fleet_viewer)
