"""
`resolve_allowed_territories()` and the `/me` payload.

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

from dataclasses import asdict

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from core.accounts.models import User
from core.billing.models import AppSubscription, SubscriptionStatus
from core.organizations.models import (
    ActivationCode,
    Membership,
    MembershipAppAccess,
    MembershipRole,
    MembershipStatus,
    Organization,
    Territory,
    UnitStatus,
)
from core.organizations.selectors import me, permissions_for, resolve_allowed_territories
from core.organizations.services import grant_app_access, sign_up
from core.permissions.models import AppCode, Permission, Role, RolePermission

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
    membership = Membership.objects.create(user=user, organization=organization)
    grant_app_access(
        membership=membership,
        app=AppCode.DMS,
        role=Role.objects.get(app_id=AppCode.DMS, code="dms.system_admin"),
        territories=[unit],
    )
    return user, membership


def codes(modules) -> list[str]:
    """The top-level module codes, in the order sent."""
    return [module.code for module in modules]


def tree(modules) -> list[dict]:
    """The tree as plain data, so a whole tree compares in one assertion."""
    return [asdict(module) for module in modules]


def module(code, *sub_modules) -> dict:
    return {"code": code, "sub_modules": list(sub_modules)}


def sub(code, *tabs) -> dict:
    return {"code": code, "tabs": list(tabs)}


# The Admin panel's whole tree (`permissions/0017`, `0018`), in MENU order --
# the owner's: Organization, App Management, User Management (C78). Spelled
# out, not read from the database: a test comparing the payload with
# `AppSection.objects.all()` would pass for an empty tree.
WHOLE_ADMIN_PANEL = [
    module("organization", sub("profile", "organization_info")),
    module("app_management", sub("application")),
    module(
        "user_management",
        sub("user"),
        sub("admins_and_roles", "admin", "app_admin", "role"),
    ),
]


def app_of(payload, org_slug, key):
    membership = next(m for m in payload.memberships if m.org_slug == org_slug)
    return next(a for a in membership.apps if a.key == key)


class TestResolveAllowedUnits:
    """
    The single place unit scope is derived (C7). Everything else asks this.
    """

    def test_a_dealer_scoped_person_gets_their_own_dealership_in_dms(self):
        result = found()
        unit = Territory.objects.create(organization=result.organization, name="Whitefield")
        _, membership = add_dealer_admin(result.organization, unit)

        assert resolve_allowed_territories(membership, AppCode.DMS) == frozenset({unit.id})

    def test_an_organization_wide_person_is_unrestricted_in_dms(self):
        result = found()

        assert resolve_allowed_territories(result.membership, AppCode.DMS) is None

    def test_a_dealer_scoped_person_is_unrestricted_in_crm(self):
        """
        THE ONE THAT MATTERS MOST, and the reason this is a function rather
        than a field read. CRM is not unit-aware (C5) and its models have no
        `unit_id`, so filtering a CRM query by a dealership would filter on a
        column that does not exist. A dealer-scoped person must come back
        unrestricted here even though they are restricted in DMS.
        """
        result = found()
        unit = Territory.objects.create(organization=result.organization, name="Whitefield")
        _, membership = add_dealer_admin(result.organization, unit)

        assert resolve_allowed_territories(membership, AppCode.CRM) is None

    def test_none_is_returned_rather_than_an_empty_set(self):
        """
        None means "do not filter". An empty set would mean "restricted to
        nothing" and match no rows -- the difference between a fleet manager
        seeing every dealership and seeing none of them.
        """
        result = found()

        assert resolve_allowed_territories(result.membership, AppCode.DMS) is not frozenset()
        assert resolve_allowed_territories(result.membership, AppCode.DMS) is None


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

    def test_administration_comes_from_standing_with_all_thirty_permissions(self):
        """
        Owners and org admins hold every `admin.*` permission and NOT through a
        Role row (C42) -- which is also why they get the dealers and roles
        modules and a dealer admin does not. Eleven until C72 piece 1 added the
        three `admin.territory.*` codes, which reach them by the same rule with
        no grant written; they sit in the `dealers` module. C78 added the
        fifteenth and sixteenth, `admin.organization_info.view` and
        `admin.application.view`, in modules of their own -- `organization`
        and `applications`, the Admin panel's Profile and Applications pages; the
        owner's final list (C79, `permissions/0018`) made it twenty-nine, in the
        same modules, and the app tile's Edit (`admin.user.edit_app`, `0019`)
        thirty.

        `modules` IS THE ADMIN PANEL'S TREE since C79 (the owner, 2026-11-19):
        module -> sub-module -> tab, in menu order. Dealers and Territories
        are not on it (Q64), so the old `dealers` word is no longer sent.
        """
        result = found()

        admin = app_of(me(result.user), "acme-motors", AppCode.ADMIN)

        assert admin.subscribed is True
        assert admin.accessible is True
        assert len(admin.permissions) == 30
        # The Admin panel's whole tree (C79): the old `dealers` word is gone
        # with the rest of the flat list -- Dealers is not in the tree (Q64).
        assert tree(admin.modules) == WHOLE_ADMIN_PANEL

    def test_administration_is_reported_subscribed_without_being_bought(self):
        """
        It comes with the platform (C40). Reporting it as subscribed is what
        lets the launcher treat every tile the same way instead of carrying a
        special case for this one.
        """
        result = found()

        assert not AppSubscription.objects.filter(app_id=AppCode.ADMIN).exists()
        assert app_of(me(result.user), "acme-motors", AppCode.ADMIN).subscribed is True

    def test_dms_is_every_dms_permission_across_all_five_modules(self):
        """
        THE OWNER HOLDS ALL OF DMS BY RULE SINCE C72 STEP 2c, not their seed
        role. C41 seeds the owner at Group operations (40 permissions), which
        lacks Tech support's three ticket codes; this test pinned 40 until the
        rule arrived, and the owner held all 43 -- 45 since `dms.user.view` and
        `dms.user.create` (2026-11-23/24). `test_owner_by_rule.py` names the three.

        THE MODULE LIST IS DERIVED, NOT STORED (C42): a module shows when the
        person holds at least one permission inside it. `tools` and
        `ecommerce` arrived through that mechanism with C67.

        Worth knowing while reading the frontend: `shell/access.ts` has a
        hardcoded `isManagerOrAdmin && (moduleKey === "ecommerce" || moduleKey
        === "tools")` fallback, written when no permission could produce those
        two modules. It is now redundant for anybody holding these codes, and
        removing it is Q47's business rather than this test's.
        """
        result = found()

        dms = app_of(me(result.user), "acme-motors", AppCode.DMS)

        assert dms.accessible is True
        # `users`: DMS settings' Users page (`dms.user.view`, `permissions/0021`),
        # which no role holds -- the owner reaches it by this same rule.
        assert codes(dms.modules) == [
            "ecommerce",
            "sales",
            "service",
            "tech-support",
            "tools",
            "users",
        ]
        assert dms.permissions == sorted(
            Permission.objects.filter(app=AppCode.DMS).values_list("code", flat=True)
        )
        assert len(dms.permissions) == 45

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
        Territory.objects.create(organization=result.organization, name="Whitefield")
        Territory.objects.create(organization=result.organization, name="Indiranagar")

        assert app_of(me(result.user), "acme-motors", AppCode.DMS).summary == "2 dealerships"

    def test_one_dealership_is_singular(self):
        result = found()
        Territory.objects.create(organization=result.organization, name="Whitefield")

        assert app_of(me(result.user), "acme-motors", AppCode.DMS).summary == "1 dealership"


class TestWorkspaceReadiness:
    """
    `is_ready` per membership (C50), which the launcher refuses to open an app
    without.
    """

    def test_a_provisioned_organisation_reports_ready(self):
        result = found()
        Organization.objects.filter(pk=result.organization.pk).update(
            provisioned_at=timezone.now()
        )

        assert me(result.user).memberships[0].is_ready is True

    def test_an_unprovisioned_organisation_reports_not_ready(self):
        """
        Normal for a few seconds after signup, and permanent if provisioning
        failed for good. Signup itself leaves it null -- the task runs on
        commit, which in these tests never fires.
        """
        result = found()

        assert result.organization.provisioned_at is None
        assert me(result.user).memberships[0].is_ready is False

    def test_it_is_per_organisation_and_not_per_person(self):
        """
        THE REASON IT LIVES ON THE MEMBERSHIP. Somebody can belong to two
        organisations with only one provisioned, and the launcher has to be
        right about which one it is about to open -- a single flag on the user
        would be wrong for one of them.
        """
        acme = found("Acme Motors", "owner@acme.test", "CODE-ACME")
        northway = found("Northway Auto Group", "owner@northway.test", "CODE-NORTH")

        Organization.objects.filter(pk=acme.organization.pk).update(
            provisioned_at=timezone.now()
        )
        Membership.objects.create(
            user=acme.user,
            organization=northway.organization,
        )

        by_slug = {m.org_slug: m.is_ready for m in me(acme.user).memberships}

        assert by_slug == {"acme-motors": True, "northway-auto-group": False}


class TestTheDealerAdmin:
    def test_their_standing_is_member_not_admin(self):
        """
        C40, AND THE COST IT ACCEPTED KNOWINGLY. A Users list showing standing
        alone displays this person as "Member", which the owner reported as a
        bug in session 5. The fix is that the list shows what people DO; the
        standing really is `member`, and the database refuses anything else.
        """
        result = found()
        unit = Territory.objects.create(organization=result.organization, name="Whitefield")
        user, _ = add_dealer_admin(result.organization, unit)

        membership = me(user).memberships[0]

        assert membership.role == MembershipRole.MEMBER
        assert membership.unit_id == unit.id
        assert membership.unit_name == "Whitefield"

    def test_administration_opens_through_the_role_with_users_only(self):
        """
        The app appears because they hold `admin.*` permissions, whatever the
        source (C40). They see Users under User Management and nothing else:
        Admins and Roles, Profile and Applications need permissions only an
        organisation admin's role or the owner's rule gives (C79).
        """
        result = found()
        unit = Territory.objects.create(organization=result.organization, name="Whitefield")
        user, _ = add_dealer_admin(result.organization, unit)

        admin = app_of(me(user), "acme-motors", AppCode.ADMIN)

        assert admin.accessible is True
        assert tree(admin.modules) == [module("user_management", sub("user"))]
        assert sorted(admin.permissions) == [
            "admin.user.create",
            "admin.user.deactivate",
            "admin.user.delete",
            "admin.user.resend_invitation",
            "admin.user.update",
            "admin.user.view",
        ]

    def test_they_cannot_create_dealers_or_read_the_role_catalogue(self):
        """
        The privilege test. A dealer admin manages their own dealership's
        people and nothing else -- creating dealerships is an organization-level
        job (C3, C23).
        """
        result = found()
        unit = Territory.objects.create(organization=result.organization, name="Whitefield")
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
        unit = Territory.objects.create(organization=result.organization, name="Whitefield")
        user, _ = add_dealer_admin(result.organization, unit)

        dms = app_of(me(user), "acme-motors", AppCode.DMS)

        assert codes(dms.modules) == ["sales", "service", "tech-support"]
        assert sorted(dms.permissions) == [
            "dms.enquiry.view",
            "dms.jobcard.view",
            "dms.ticket.view",
        ]

    def test_their_dms_summary_is_their_own_dealership(self):
        result = found()
        unit = Territory.objects.create(organization=result.organization, name="Whitefield")
        Territory.objects.create(organization=result.organization, name="Indiranagar")
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
        unit = Territory.objects.create(organization=result.organization, name="Whitefield")
        user = User.objects.create_user(email="rep@acme.test", password="x")
        membership = Membership.objects.create(user=user, organization=result.organization)
        grant_app_access(
            membership=membership,
            app=AppCode.DMS,
            role=Role.objects.get(app_id=AppCode.DMS, code="dms.sales_representative"),
            territories=[unit],
        )

        payload = me(user)

        assert app_of(payload, "acme-motors", AppCode.ADMIN).accessible is False
        assert app_of(payload, "acme-motors", AppCode.ADMIN).permissions == []
        assert codes(app_of(payload, "acme-motors", AppCode.DMS).modules) == ["sales"]


class TestASubscriptionThatLapsed:
    def test_a_grant_left_on_a_cancelled_subscription_opens_nothing(self):
        """
        THE RULE THAT ONLY WORKS BECAUSE THESE ARE TWO TABLES (C16). Cancelling
        a subscription does not revoke anybody's grant -- there is no process
        that walks them -- so the grant outlives the subscription. This
        is the place that catches it, and if it did not, a lapsed customer
        would keep working indefinitely.
        """
        result = found()
        AppSubscription.objects.filter(
            organization=result.organization, app_id=AppCode.DMS
        ).update(status=SubscriptionStatus.CANCELLED)

        dms = app_of(me(result.user), "acme-motors", AppCode.DMS)

        assert MembershipAppAccess.objects.filter(app_id=AppCode.DMS).exists()
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

        Membership.objects.create(user=acme.user, organization=northway.organization)

        payload = me(acme.user)

        assert [m.org_slug for m in payload.memberships] == [
            "acme-motors",
            "northway-auto-group",
        ]
        # Owner in one, a member with no grants in the other.
        assert app_of(payload, "acme-motors", AppCode.DMS).accessible is True
        assert app_of(payload, "northway-auto-group", AppCode.DMS).accessible is False
        assert app_of(payload, "northway-auto-group", AppCode.ADMIN).accessible is False


class TestAClosedDealership:
    """
    C63. The membership is STILL RETURNED, with everything shut.

    THE TEMPTING IMPLEMENTATION IS TO DROP IT, and it produces exactly the
    screen C58 was written to remove: zero memberships, and a sign-in page
    telling somebody their access was removed when they are perfectly
    entitled and their branch simply closed. So it comes back marked, with
    every app inaccessible -- there is nothing to open, and the shell can say
    why.
    """

    def test_the_membership_is_still_returned(self):
        result = found()
        unit = Territory.objects.create(
            organization=result.organization, name="Whitefield", status=UnitStatus.DISABLED
        )
        user, _ = add_dealer_admin(result.organization, unit)

        memberships = me(user).memberships

        assert len(memberships) == 1
        assert memberships[0].unit_name == "Whitefield"

    def test_it_is_marked_closed(self):
        result = found()
        unit = Territory.objects.create(
            organization=result.organization, name="Whitefield", status=UnitStatus.DISABLED
        )
        user, _ = add_dealer_admin(result.organization, unit)

        assert me(user).memberships[0].unit_closed is True

    def test_nothing_is_accessible_including_administration(self):
        """
        ADMINISTRATION IS THE ONE THAT WOULD SLIP THROUGH. A dealer admin
        reaches it by holding `admin.user.*` through the DMS System
        administrator role (C40), not through a subscription -- so a rule
        written in terms of subscriptions would leave their Administration
        tile clickable, and it would lead straight to a 403.
        """
        result = found()
        unit = Territory.objects.create(
            organization=result.organization, name="Whitefield", status=UnitStatus.DISABLED
        )
        user, _ = add_dealer_admin(result.organization, unit)

        membership = me(user).memberships[0]

        assert [app.key for app in membership.apps if app.accessible] == []
        assert app_of(me(user), result.organization.slug, AppCode.ADMIN).accessible is False
        assert app_of(me(user), result.organization.slug, AppCode.DMS).accessible is False

    def test_it_reports_no_modules_or_permissions(self):
        """
        An app they cannot open says nothing about itself (C22) -- the same
        rule as a lapsed subscription one line over. Returning the modules
        would tell the browser what they would have been able to do.
        """
        result = found()
        unit = Territory.objects.create(
            organization=result.organization, name="Whitefield", status=UnitStatus.DISABLED
        )
        user, _ = add_dealer_admin(result.organization, unit)

        for app in me(user).memberships[0].apps:
            assert app.modules == []
            assert app.permissions == []

    def test_an_organisation_wide_person_is_never_marked_closed(self):
        """
        `unit_closed` is about a dealership, and they have none. The owner of
        an organisation whose every branch is shut still runs the place.
        """
        result = found()
        Territory.objects.create(
            organization=result.organization, name="Whitefield", status=UnitStatus.DISABLED
        )

        membership = me(result.user).memberships[0]

        assert membership.unit_closed is False
        assert app_of(me(result.user), result.organization.slug, AppCode.ADMIN).accessible is True

    def test_reopening_restores_everything(self):
        """
        Nothing to restore: the flag is computed per request, so the moment
        the dealership is open again the payload is what it always was.
        """
        result = found()
        unit = Territory.objects.create(
            organization=result.organization, name="Whitefield", status=UnitStatus.DISABLED
        )
        user, _ = add_dealer_admin(result.organization, unit)

        assert me(user).memberships[0].unit_closed is True

        unit.status = UnitStatus.ACTIVE
        unit.save(update_fields=["status"])

        membership = me(user).memberships[0]
        assert membership.unit_closed is False
        assert app_of(me(user), result.organization.slug, AppCode.ADMIN).accessible is True


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


# --- C79: the app's tree, as far as the person may see it -------------------


def add_org_admin(organization, email="orgadmin@acme.test"):
    user = User.objects.create_user(email=email, password="x")
    membership = Membership.objects.create(user=user, organization=organization)
    grant_app_access(
        membership=membership,
        app=AppCode.ADMIN,
        role=Role.objects.get(app_id=AppCode.ADMIN, code="admin.org_admin"),
        territories=[Territory.objects.root_for(organization)],
    )
    return user


def holding_only(organization, *codes, email="someone@acme.test"):
    """
    Somebody whose ONLY Administration permissions are `codes`: a made-up DMS
    role carrying them, granted at the root. Built-in roles hold whole sets, so
    a single permission needs a role of its own.
    """
    role = Role.objects.create(
        code="dms.test_only",
        name="Test role",
        app_id=AppCode.DMS,
        level="org",
        summary="Made up for a test.",
    )
    for code in codes:
        RolePermission.objects.create(role=role, permission=Permission.objects.get(code=code))
    user = User.objects.create_user(email=email, password="x")
    membership = Membership.objects.create(user=user, organization=organization)
    grant_app_access(
        membership=membership,
        app=AppCode.DMS,
        role=role,
        territories=[Territory.objects.root_for(organization)],
    )
    return user


class TestTheAdminPanelTree:
    def test_the_owner_sees_the_whole_admin_panel_in_menu_order(self):
        result = found()

        admin = app_of(me(result.user), result.organization.slug, AppCode.ADMIN)

        assert tree(admin.modules) == WHOLE_ADMIN_PANEL

    def test_an_organisation_admin_sees_the_whole_admin_panel(self):
        result = found()
        user = add_org_admin(result.organization)

        admin = app_of(me(user), result.organization.slug, AppCode.ADMIN)

        assert tree(admin.modules) == WHOLE_ADMIN_PANEL

    def test_a_dealer_admin_sees_users_under_user_management_only(self):
        result = found()
        unit = Territory.objects.create(organization=result.organization, name="Whitefield")
        user, _ = add_dealer_admin(result.organization, unit)

        admin = app_of(me(user), result.organization.slug, AppCode.ADMIN)

        assert tree(admin.modules) == [module("user_management", sub("user"))]

    def test_a_tab_brings_its_sub_module_and_module_and_nothing_beside_it(self):
        result = found()
        user = holding_only(result.organization, "admin.admin.view")

        admin = app_of(me(user), result.organization.slug, AppCode.ADMIN)

        assert tree(admin.modules) == [
            module("user_management", sub("admins_and_roles", "admin")),
        ]

    def test_only_a_view_opens_a_section(self):
        """
        C79 rule 5: you cannot act on a page you cannot see. Holding Users'
        update and delete without its view shows nothing -- even though the
        Admin panel itself is open to them, because they hold `admin.*`.
        """
        result = found()
        user = holding_only(result.organization, "admin.user.update", "admin.user.delete")

        admin = app_of(me(user), result.organization.slug, AppCode.ADMIN)

        assert admin.accessible is True
        assert admin.modules == []

    def test_a_permission_with_no_section_shows_nothing(self):
        """
        Dealers and Territories are not in the tree yet (Q64): the old
        `dealers` module word is no longer sent for the Admin panel.
        """
        result = found()
        user = holding_only(result.organization, "admin.dealer.view")

        admin = app_of(me(user), result.organization.slug, AppCode.ADMIN)

        assert admin.modules == []


class TestAnAppNotOnTheTreeYet:
    def test_dms_modules_keep_their_words_with_no_sub_modules(self):
        """
        C79, amended: DMS moves onto the section tree later. Until then its
        modules are the old words, in the same shape as every other app.
        """
        result = found()

        dms = app_of(me(result.user), result.organization.slug, AppCode.DMS)

        assert tree(dms.modules) == [
            module("ecommerce"),
            module("sales"),
            module("service"),
            module("tech-support"),
            module("tools"),
            # DMS settings' Users page (`dms.user.view`, owner only, 2026-11-23).
            module("users"),
        ]

    def test_an_app_nobody_can_open_reports_no_modules(self):
        result = found()

        crm = app_of(me(result.user), result.organization.slug, AppCode.CRM)

        assert crm.accessible is False
        assert crm.modules == []


class TestTheTreeCost:
    @staticmethod
    def section_queries(context) -> int:
        return sum("permissions_appsection" in q["sql"] for q in context.captured_queries)

    def test_me_reads_the_tree_once_however_many_organisations(self):
        first = found()
        other = found(name="Northway", email="owner@northway.test", code="CODE-NORTH")
        Membership.objects.create(user=first.user, organization=other.organization)

        with CaptureQueriesContext(connection) as context:
            payload = me(first.user)

        assert len(payload.memberships) == 2
        assert self.section_queries(context) == 1

    def test_a_permission_check_never_reads_the_tree(self):
        """`permissions_for()` runs on every request and never uses the tree."""
        result = found()

        with CaptureQueriesContext(connection) as context:
            permissions_for(result.membership)

        assert self.section_queries(context) == 0


class TestTheMeEndpoint:
    def test_each_app_has_exactly_the_fields_auth_ts_declares(self):
        """
        `AppAccess`, `AppModule` and `AppSubModule` in `shell/api/auth.ts` are
        hand-written (C43), so a field missing here is a frontend reading
        `undefined`.
        """
        result = found()
        client = APIClient()
        client.force_authenticate(user=result.user)

        body = client.get("/api/v1/me/").json()

        apps = {app["key"]: app for app in body["memberships"][0]["apps"]}
        assert set(apps["admin"]) == {
            "key",
            "subscribed",
            "accessible",
            "summary",
            "modules",
            "permissions",
        }
        assert apps["admin"]["modules"] == WHOLE_ADMIN_PANEL
        assert apps["dms"]["modules"][0] == {"code": "ecommerce", "sub_modules": []}


class TestSomebodyWithNoApp:
    """
    C73 RETIRED (the owner, 2026-11-20): a person may hold no app. They belong
    to the organisation and can open nothing in it -- not even the Admin panel
    -- and the launcher tells them so.
    """

    def test_they_belong_and_can_open_nothing(self):
        result = found()
        user = User.objects.create_user(email="nobody@acme.test", password="x")
        Membership.objects.create(user=user, organization=result.organization)

        payload = me(user)

        assert [m.org_slug for m in payload.memberships] == [result.organization.slug]
        apps = payload.memberships[0].apps
        assert [app.key for app in apps if app.accessible] == []
        assert all(app.modules == [] and app.permissions == [] for app in apps)
