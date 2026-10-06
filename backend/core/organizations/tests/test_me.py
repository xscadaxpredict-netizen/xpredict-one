"""
`resolve_allowed_units()` and the `/me` payload.

These are the scoping and entitlement rules, so they are written against the
decisions rather than against the code: every module list and permission count
below is spelled out, because asserting that the payload matches whatever the
catalogue happens to say would pass for any content at all.

THE TWO PEOPLE USED THROUGHOUT are the two the product is shaped around:

- an OWNER, organization-wide, who gets Administration from standing (C40);
- a DEALER ADMIN, whose standing is `member` and who gets Administration from
  holding the DMS System administrator role (C40 again, from the other side).

The second one is the interesting case and the one the frontend got wrong for
three sessions.
"""

from __future__ import annotations

import pytest

from core.accounts.models import User
from core.billing.models import AppSubscription, SubscriptionStatus
from core.organizations.models import (
    ActivationCode,
    BusinessUnit,
    Membership,
    MembershipRole,
    MembershipStatus,
)
from core.organizations.selectors import me, resolve_allowed_units
from core.organizations.services import sign_up
from core.permissions.models import AppAccess, AppCode, Role

pytestmark = pytest.mark.django_db


def found(name="Acme Motors", email="owner@acme.test", code="CODE-ACME"):
    ActivationCode.objects.create(code=code)
    return sign_up(
        activation_code=code,
        organization_name=name,
        email=email,
        password="correct horse battery staple",
    )


def add_dealer_admin(organization, unit, email="dealeradmin@acme.test"):
    """
    A dealer admin: `member` standing plus a dealership, holding the DMS System
    administrator role. NOT `admin` standing -- the database refuses that
    combination outright (C40), which is the whole point of the shape.
    """
    user = User.objects.create_user(email=email, password="x")
    membership = Membership.objects.create(
        user=user,
        organization=organization,
        unit=unit,
        role=MembershipRole.MEMBER,
    )
    AppAccess.objects.create(
        membership=membership,
        app=AppCode.DMS,
        role=Role.objects.get(app=AppCode.DMS, code="dms.system_admin"),
    )
    return user, membership


def app_of(payload, org_slug, key):
    membership = next(m for m in payload.memberships if m.org_slug == org_slug)
    return next(a for a in membership.apps if a.key == key)


class TestResolveAllowedUnits:
    """
    The single place unit scope is derived (C7). Everything else asks this.
    """

    def test_a_dealer_scoped_person_gets_their_own_dealership_in_dms(self):
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        _, membership = add_dealer_admin(result.organization, unit)

        assert resolve_allowed_units(membership, AppCode.DMS) == frozenset({unit.id})

    def test_an_organization_wide_person_is_unrestricted_in_dms(self):
        result = found()

        assert resolve_allowed_units(result.membership, AppCode.DMS) is None

    def test_a_dealer_scoped_person_is_unrestricted_in_crm(self):
        """
        THE ONE THAT MATTERS MOST, and the reason this is a function rather
        than a field read. CRM is not unit-aware (C5) and its models have no
        `unit_id`, so filtering a CRM query by a dealership would filter on a
        column that does not exist. A dealer-scoped person must come back
        unrestricted here even though they are restricted in DMS.
        """
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        _, membership = add_dealer_admin(result.organization, unit)

        assert resolve_allowed_units(membership, AppCode.CRM) is None

    def test_none_is_returned_rather_than_an_empty_set(self):
        """
        None means "do not filter". An empty set would mean "restricted to
        nothing" and match no rows -- the difference between a fleet manager
        seeing every dealership and seeing none of them.
        """
        result = found()

        assert resolve_allowed_units(result.membership, AppCode.DMS) is not frozenset()
        assert resolve_allowed_units(result.membership, AppCode.DMS) is None


class TestTheOwner:
    def test_they_are_the_owner_organization_wide(self):
        result = found()

        payload = me(result.user)

        assert len(payload.memberships) == 1
        membership = payload.memberships[0]
        assert membership.org_slug == "acme-motors"
        assert membership.role == MembershipRole.OWNER
        assert membership.unit_id is None
        assert membership.unit_name is None

    def test_administration_comes_from_standing_with_all_eleven_permissions(self):
        """
        Owners and org admins hold every `admin.*` permission and NOT through a
        Role row (C42) -- which is also why they get the dealers and roles
        modules and a dealer admin does not.
        """
        result = found()

        admin = app_of(me(result.user), "acme-motors", AppCode.ADMIN)

        assert admin.subscribed is True
        assert admin.accessible is True
        assert len(admin.permissions) == 11
        assert admin.modules == ["dealers", "roles", "users"]

    def test_administration_is_reported_subscribed_without_being_bought(self):
        """
        It comes with the platform (C40). Reporting it as subscribed is what
        lets the launcher treat every tile the same way instead of carrying a
        special case for this one.
        """
        result = found()

        assert not AppSubscription.objects.filter(app=AppCode.ADMIN).exists()
        assert app_of(me(result.user), "acme-motors", AppCode.ADMIN).subscribed is True

    def test_dms_is_group_operations_across_all_three_modules(self):
        """C41 seeds the owner at Group operations, which is Manager's set at
        organization scope -- 33 permissions, all three modules."""
        result = found()

        dms = app_of(me(result.user), "acme-motors", AppCode.DMS)

        assert dms.accessible is True
        assert dms.modules == ["sales", "service", "tech-support"]
        assert len(dms.permissions) == 33

    def test_unbought_apps_are_shown_but_not_accessible(self):
        """
        C16's two facts. CRM and E-commerce are not bought, so the tile is
        SHOWN DISABLED rather than hidden -- nobody can ask for a product they
        do not know exists.
        """
        result = found()
        payload = me(result.user)

        for key in (AppCode.CRM, AppCode.ECOMMERCE):
            app = app_of(payload, "acme-motors", key)
            assert app.subscribed is False, key
            assert app.accessible is False, key
            assert app.modules == []
            assert app.permissions == []

    def test_the_dms_summary_counts_dealerships(self):
        """
        `summary` carries a FACT the server knows and the browser cannot. The
        module names in the fake's version were copy the frontend already has.
        """
        result = found()
        BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        BusinessUnit.objects.create(organization=result.organization, name="Indiranagar")

        assert app_of(me(result.user), "acme-motors", AppCode.DMS).summary == "2 dealerships"

    def test_one_dealership_is_singular(self):
        result = found()
        BusinessUnit.objects.create(organization=result.organization, name="Whitefield")

        assert app_of(me(result.user), "acme-motors", AppCode.DMS).summary == "1 dealership"


class TestTheDealerAdmin:
    def test_their_standing_is_member_not_admin(self):
        """
        C40, AND THE COST IT ACCEPTED KNOWINGLY. A Users list showing standing
        alone displays this person as "Member", which the owner reported as a
        bug in session 5. The fix is that the list shows what people DO; the
        standing really is `member`, and the database refuses anything else.
        """
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        user, _ = add_dealer_admin(result.organization, unit)

        membership = me(user).memberships[0]

        assert membership.role == MembershipRole.MEMBER
        assert membership.unit_id == unit.id
        assert membership.unit_name == "Whitefield"

    def test_administration_opens_through_the_role_with_users_only(self):
        """
        The app appears because they hold `admin.*` permissions, whatever the
        source (C40). They get `users` and NOT `dealers` or `roles`: those
        modules are reachable only through standing, which they do not have.
        """
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        user, _ = add_dealer_admin(result.organization, unit)

        admin = app_of(me(user), "acme-motors", AppCode.ADMIN)

        assert admin.accessible is True
        assert admin.modules == ["users"]
        assert sorted(admin.permissions) == [
            "admin.person.invite",
            "admin.person.remove",
            "admin.person.resend_invitation",
            "admin.person.set_status",
            "admin.person.update",
            "admin.person.view",
        ]

    def test_they_cannot_create_dealers_or_read_the_role_catalogue(self):
        """
        The privilege test. A dealer admin manages their own dealership's
        people and nothing else -- creating dealerships is an organization-level
        job (C3, C23).
        """
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        user, _ = add_dealer_admin(result.organization, unit)

        admin = app_of(me(user), "acme-motors", AppCode.ADMIN)

        assert "admin.dealer.create" not in admin.permissions
        assert "admin.dealer.view" not in admin.permissions
        assert "admin.role.view" not in admin.permissions

    def test_dms_gives_them_read_access_so_the_sidebar_is_not_empty(self):
        """
        C42: System administrator gets DMS views because supporting software
        you cannot see is not a job.
        """
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        user, _ = add_dealer_admin(result.organization, unit)

        dms = app_of(me(user), "acme-motors", AppCode.DMS)

        assert dms.modules == ["sales", "service", "tech-support"]
        assert sorted(dms.permissions) == [
            "dms.enquiry.view",
            "dms.jobcard.view",
            "dms.ticket.view",
        ]

    def test_their_dms_summary_is_their_own_dealership(self):
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        BusinessUnit.objects.create(organization=result.organization, name="Indiranagar")
        user, _ = add_dealer_admin(result.organization, unit)

        assert app_of(me(user), "acme-motors", AppCode.DMS).summary == "Whitefield"


class TestSomebodyWithNoAdministration:
    def test_a_salesperson_does_not_see_the_administration_app_at_all(self):
        """
        C22: hidden means silent. Not subscribed is shown disabled; no access
        is hidden entirely, because naming a thing in order to say you cannot
        have it gives away what the hiding was for.
        """
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        user = User.objects.create_user(email="rep@acme.test", password="x")
        membership = Membership.objects.create(
            user=user, organization=result.organization, unit=unit, role=MembershipRole.MEMBER
        )
        AppAccess.objects.create(
            membership=membership,
            app=AppCode.DMS,
            role=Role.objects.get(app=AppCode.DMS, code="dms.sales_representative"),
        )

        payload = me(user)

        assert app_of(payload, "acme-motors", AppCode.ADMIN).accessible is False
        assert app_of(payload, "acme-motors", AppCode.ADMIN).permissions == []
        assert app_of(payload, "acme-motors", AppCode.DMS).modules == ["sales"]


class TestASubscriptionThatLapsed:
    def test_a_grant_left_on_a_cancelled_subscription_opens_nothing(self):
        """
        THE RULE THAT ONLY WORKS BECAUSE THESE ARE TWO TABLES (C16). Cancelling
        a subscription does not revoke anybody's `AppAccess` row -- there is no
        process that walks them -- so the grant outlives the subscription. This
        is the place that catches it, and if it did not, a lapsed customer
        would keep working indefinitely.
        """
        result = found()
        AppSubscription.objects.filter(
            organization=result.organization, app=AppCode.DMS
        ).update(status=SubscriptionStatus.CANCELLED)

        dms = app_of(me(result.user), "acme-motors", AppCode.DMS)

        assert AppAccess.objects.filter(app=AppCode.DMS).exists()
        assert dms.subscribed is False
        assert dms.accessible is False
        assert dms.modules == []
        assert dms.permissions == []


class TestOrganizationIsolation:
    def test_me_returns_only_the_organizations_this_person_belongs_to(self):
        """
        Tenant isolation at the entitlement layer. Two organizations exist and
        each person sees exactly their own -- if this leaked, the switcher
        would offer somebody an organization they have no membership in.
        """
        acme = found("Acme Motors", "owner@acme.test", "CODE-ACME")
        northway = found("Northway Auto Group", "owner@northway.test", "CODE-NORTH")

        assert [m.org_slug for m in me(acme.user).memberships] == ["acme-motors"]
        assert [m.org_slug for m in me(northway.user).memberships] == ["northway-auto-group"]

    def test_one_person_in_two_organizations_gets_both_with_separate_apps(self):
        """
        C27's case: the same account, two organizations, one login. The apps
        are reported PER ORGANIZATION because subscriptions are bought by an
        organization -- hanging them off the user would show one organization's
        apps while inside the other.
        """
        acme = found("Acme Motors", "owner@acme.test", "CODE-ACME")
        northway = found("Northway Auto Group", "owner@northway.test", "CODE-NORTH")

        unit = BusinessUnit.objects.create(organization=northway.organization, name="Whitefield")
        Membership.objects.create(
            user=acme.user,
            organization=northway.organization,
            unit=unit,
            role=MembershipRole.MEMBER,
        )

        payload = me(acme.user)

        assert [m.org_slug for m in payload.memberships] == [
            "acme-motors",
            "northway-auto-group",
        ]
        # Owner in one, a dealer-scoped member with no grants in the other.
        assert app_of(payload, "acme-motors", AppCode.DMS).accessible is True
        assert app_of(payload, "northway-auto-group", AppCode.DMS).accessible is False
        assert app_of(payload, "northway-auto-group", AppCode.ADMIN).accessible is False


class TestMembershipsThatShouldNotAppear:
    def test_a_disabled_membership_is_left_out(self):
        """
        Somebody switched off must not find the organization waiting in their
        launcher. Disabling takes effect on the next request (Q17), and this is
        what that means for the shell.
        """
        result = found()
        Membership.objects.filter(pk=result.membership.pk).update(
            status=MembershipStatus.DISABLED
        )

        assert me(result.user).memberships == []

    def test_an_invited_membership_is_left_out(self):
        """An invitation not yet accepted is not a membership you can use."""
        result = found()
        Membership.objects.filter(pk=result.membership.pk).update(
            status=MembershipStatus.INVITED
        )

        assert me(result.user).memberships == []
