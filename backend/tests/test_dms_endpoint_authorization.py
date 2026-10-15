"""
The DMS half of the permission link, and the default that was switched off.

WHY THIS FILE EXISTS SEPARATELY FROM `test_org_scoped_permissions.py`. That
file already pins the loud default -- a view that never declares
`required_permissions` raises instead of permitting everybody -- and it has
passed since it was written. It tests a view inheriting `OrgScopedAPIView`.

Every DMS endpoint inherits `TenantAPIView`, which set
`required_permissions = []` as a class default. So for the whole product the
value was never `None`, the check could never fire, and the existing test went
on passing about a base class nothing in DMS used directly. Thirteen views
declared nothing; twelve of them expose a write.

That is this project's recurring shape -- a check that cannot fail is
indistinguishable from one that passes -- so the assertions below are made
against `TenantAPIView` itself rather than against the parent.

EVERY TEST HERE FAILS WITH ITS FIX REVERTED, and there are TWO fixes, which
the reverts had to be run separately to see. Stated precisely, because
"reverted the fix and the tests went red" was true of only part of it:

  - Restoring `required_permissions = []` on `TenantAPIView` fails the two
    base-class tests below. The eleven refusals go on passing, because each
    view now declares its own permissions and a class default cannot undo
    that.
  - Removing one view's declaration instead fails that view's refusal --
    with a 500, not a 200. That is the restored default working: the
    endpoint becomes loud rather than open.
  - Reverting BOTH is the original bug, and it was run to see it: a sales
    representative's PUT to `dms/tools/calculator-settings/` answered **200**
    and rewrote the constants every quotation in the organisation is sized
    from.

So neither fix alone is what the refusals rest on, and neither test file
would have caught this by itself.
"""

from __future__ import annotations

import uuid
from typing import ClassVar

import pytest
from django.core.exceptions import ImproperlyConfigured
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.test import APIClient

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.api import TenantAPIView
from core.billing.models import AppSubscription, SubscriptionStatus
from core.organizations.models import (
    BusinessUnit,
    Membership,
    MembershipRole,
    MembershipStatus,
    Organization,
    OrganizationStatus,
)
from core.organizations.selectors import permissions_for
from core.permissions.models import AppAccess, AppCode, Role

pytestmark = pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])


# ---------------------------------------------------------------------------
# Fixtures. Hand-built rather than through `sign_up`, following
# test_dealer_isolation.py: these endpoints are unit-scoped, so the tests need
# two dealerships and a membership shape per role, which signup does not make.
# ---------------------------------------------------------------------------


def make_org(slug="dms-authz-org") -> Organization:
    org = Organization.objects.create(
        name="DMS Authorization Org",
        slug=slug,
        # The alias the suite declares, because the ALLOWED cases reach the
        # handler and the handler opens a tenant connection. The refusals
        # never get that far -- `_require_permissions` runs in `initial()` --
        # which is itself part of what is being asserted.
        db_name=TEST_TENANT_ALIAS,
        db_host="127.0.0.1",
        db_port=3306,
        status=OrganizationStatus.ACTIVE,
    )
    AppSubscription.objects.create(
        organization=org, app=AppCode.DMS, status=SubscriptionStatus.ACTIVE
    )
    return org


def add_member(org, role_code, email, unit=None):
    """
    A member holding one DMS role.

    `unit=None` is how an organisation-level role is attached -- Group
    operations has no dealership, which is the whole difference between it and
    Manager (C40). Standing stays `member`: the check constraint refuses
    owner/admin with a unit, and these tests are about app roles, not standing.
    """
    user = User.objects.create_user(email=email, password="correct horse battery staple")
    membership = Membership.objects.create(
        user=user,
        organization=org,
        unit=unit,
        role=MembershipRole.MEMBER,
        status=MembershipStatus.ACTIVE,
    )
    AppAccess.objects.create(
        membership=membership,
        app=AppCode.DMS,
        role=Role.objects.get(app=AppCode.DMS, code=role_code),
    )
    return user


# ---------------------------------------------------------------------------
# The default itself.
# ---------------------------------------------------------------------------

handler_calls: list[str] = []


class UnfinishedDMSView(TenantAPIView):
    """Somebody wrote a DMS view and never answered the question."""

    def get(self, request: Request, org_slug: str) -> Response:
        handler_calls.append("unfinished")
        return Response({"ok": True})


class TestTheDMSBaseClassDoesNotAnswerForYou:
    def test_tenant_api_view_supplies_no_default(self):
        """
        THE ONE-LINE ASSERTION THE WHOLE FIX RESTS ON.

        `None` means nobody has answered. `[]` means somebody decided nothing
        was needed. A base class that supplies `[]` collapses the two for
        every view beneath it, and no amount of testing the parent notices.
        """
        assert TenantAPIView.required_permissions is None

    def test_a_dms_view_that_declares_nothing_raises_rather_than_permitting(self):
        """
        Reached through the class, not a route: the point is that the DMS base
        leaves the value unanswered, and a local urlconf would only re-test
        what `test_org_scoped_permissions.py` already covers for the parent.

        It raises before the handler, before membership is even consulted --
        `_require_permissions` checks for `None` first, so an unfinished view
        is loud on the first request from anybody, including an admin.
        """
        handler_calls.clear()

        view = UnfinishedDMSView()

        with pytest.raises(ImproperlyConfigured, match="must declare `required_permissions`"):
            view._require_permissions(None)

        assert handler_calls == []


# ---------------------------------------------------------------------------
# The eleven gated writes.
#
# (label, method, path suffix, the code it now needs)
#
# A refusal needs no valid payload and no existing row: the permission check
# runs in `initial()`, so garbage and a random UUID both answer 403 before the
# handler sees them. That is the property being asserted, not a shortcut.
# ---------------------------------------------------------------------------

ROW = uuid.uuid4()

GATED_WRITES = [
    ("place a store order", "post", "dms/ecommerce/orders/", "dms.store_order.create"),
    ("cancel a store order", "delete", f"dms/ecommerce/orders/{ROW}/", "dms.store_order.manage"),
    (
        "move a store order along",
        "patch",
        f"dms/ecommerce/orders/{ROW}/status/",
        "dms.store_order.manage",
    ),
    ("upload a user manual", "post", "dms/tech-support/manuals/", "dms.manual.manage"),
    ("delete a user manual", "delete", f"dms/tech-support/manuals/{ROW}/", "dms.manual.manage"),
    ("upload a machine video", "post", "dms/tech-support/videos/", "dms.video.manage"),
    ("delete a machine video", "delete", f"dms/tech-support/videos/{ROW}/", "dms.video.manage"),
    ("upload marketing material", "post", "dms/tools/marketing/", "dms.marketing_asset.manage"),
    (
        "delete marketing material",
        "delete",
        f"dms/tools/marketing/{ROW}/",
        "dms.marketing_asset.manage",
    ),
    (
        "delete a saved calculation",
        "delete",
        f"dms/tools/calculations/{ROW}/",
        "dms.timer_calculation.delete",
    ),
    (
        "rewrite the calculator constants",
        "put",
        "dms/tools/calculator-settings/",
        "dms.calculator.manage",
    ),
]

# Reads, which stay open to any member on purpose. Listed so that tightening
# one by accident is a failing test rather than a support ticket.
OPEN_READS = [
    "dms/ecommerce/catalog/",
    "dms/ecommerce/orders/",
    "dms/tech-support/manuals/",
    "dms/tech-support/videos/",
    "dms/tools/marketing/",
    "dms/tools/calculations/",
    "dms/tools/calculator-settings/",
]


class TestASalesRepresentativeCannotWrite:
    """
    THE REFUSALS THAT WERE 200s. A sales representative is the most junior DMS
    role and holds none of the seven new codes; before this, every one of
    these eleven calls reached the handler on membership alone.
    """

    @pytest.mark.parametrize(
        ("label", "method", "suffix", "code"),
        GATED_WRITES,
        ids=[row[0] for row in GATED_WRITES],
    )
    def test_each_write_is_403(self, label, method, suffix, code):
        org = make_org()
        unit = BusinessUnit.objects.create(organization=org, name="Dealer A")
        rep = add_member(org, "dms.sales_representative", "rep@dms-authz.test", unit=unit)

        client = APIClient()
        client.force_authenticate(user=rep)

        response = getattr(client, method)(
            f"/api/v1/orgs/{org.slug}/{suffix}", {}, format="json"
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN, (
            f"a sales representative could {label}"
        )

    @pytest.mark.parametrize("suffix", OPEN_READS)
    def test_but_every_read_still_works(self, suffix):
        """
        The other half, and the reason the writes use `method_permissions`
        rather than a blanket `required_permissions`: looking a spare part up,
        or reading the calculator's constants, is the job.
        """
        org = make_org()
        unit = BusinessUnit.objects.create(organization=org, name="Dealer A")
        rep = add_member(org, "dms.sales_representative", "rep@dms-authz.test", unit=unit)

        client = APIClient()
        client.force_authenticate(user=rep)

        response = client.get(f"/api/v1/orgs/{org.slug}/{suffix}")

        assert response.status_code != status.HTTP_403_FORBIDDEN


class TestTheGrantsMatchTheScopeOfTheData:
    """
    WHICH ROLE GETS WHAT, and the reason it is not seniority.

    Store orders and saved calculations inherit `UnitScopedModel`, so they
    belong to one dealership and a Manager is the right audience. Manuals,
    videos, marketing material and the calculator constants inherit
    `BaseModel` -- no `unit_id`, one copy per organisation, read by every
    dealership -- so a unit-level grant would let one dealership's Manager
    change what all the others see.
    """

    UNIT_LEVEL: ClassVar[list[str]] = [
        "dms.store_order.create",
        "dms.store_order.manage",
        "dms.timer_calculation.delete",
    ]
    ORG_LEVEL: ClassVar[list[str]] = [
        "dms.manual.manage",
        "dms.video.manage",
        "dms.marketing_asset.manage",
        "dms.calculator.manage",
    ]

    def test_a_manager_holds_the_unit_scoped_codes(self):
        org = make_org()
        unit = BusinessUnit.objects.create(organization=org, name="Dealer A")
        user = add_member(org, "dms.manager", "mgr@dms-authz.test", unit=unit)
        held = permissions_for(Membership.objects.get(user=user, organization=org))

        assert set(self.UNIT_LEVEL).issubset(held)

    def test_a_manager_does_not_hold_the_organisation_wide_ones(self):
        """
        The scope decision, pinned. A dealership's Manager editing a row that
        every other dealership reads is the reach C5 and C40 exist to prevent.
        """
        org = make_org()
        unit = BusinessUnit.objects.create(organization=org, name="Dealer A")
        user = add_member(org, "dms.manager", "mgr@dms-authz.test", unit=unit)
        held = permissions_for(Membership.objects.get(user=user, organization=org))

        assert set(self.ORG_LEVEL).isdisjoint(held)

    def test_group_operations_holds_both(self):
        """
        The organisation-level writing role, and the only one that may touch
        the shared library. It no longer holds Manager's set exactly, and the
        difference is precisely the four resources that have no dealership.
        """
        org = make_org()
        user = add_member(org, "dms.group_operations", "groupops@dms-authz.test")
        held = permissions_for(Membership.objects.get(user=user, organization=org))

        assert set(self.UNIT_LEVEL).issubset(held)
        assert set(self.ORG_LEVEL).issubset(held)

    def test_a_dealer_admin_does_not_get_them_by_being_an_admin(self):
        """
        `dms.system_admin` is the intuitive home for a content library and is
        deliberately not granted it: the role runs the SOFTWARE at ONE
        dealership (C36), and these four rows belong to the organisation. If
        this ever needs reversing it is a migration written on purpose, which
        is why the absence is asserted rather than left implied.
        """
        org = make_org()
        unit = BusinessUnit.objects.create(organization=org, name="Dealer A")
        user = add_member(org, "dms.system_admin", "dealeradmin@dms-authz.test", unit=unit)
        held = permissions_for(Membership.objects.get(user=user, organization=org))

        assert set(self.ORG_LEVEL).isdisjoint(held)

    def test_the_fleet_viewer_still_changes_nothing(self):
        """
        "Reads every dealership. Changes nothing." Seven new codes landed and
        none of them end in `.view`, so the read-only role must be untouched
        -- the cheap way to grant the library would have been `_DMS_READS`.
        """
        org = make_org()
        user = add_member(org, "dms.fleet_viewer", "fleet@dms-authz.test")
        held = permissions_for(Membership.objects.get(user=user, organization=org))

        assert set(self.UNIT_LEVEL).isdisjoint(held)
        assert set(self.ORG_LEVEL).isdisjoint(held)


class TestTheCodesExistAsRows:
    """
    C44: permissions are DATA. A declaration naming a code no row provides is
    a permission nobody can ever hold, which presents as a 403 that no role
    assignment fixes.
    """

    def test_every_declared_code_is_seeded(self):
        from core.permissions.models import Permission

        declared = {row[3] for row in GATED_WRITES}
        seeded = set(
            Permission.objects.filter(code__in=declared).values_list("code", flat=True)
        )

        assert declared == seeded, f"declared but never seeded: {sorted(declared - seeded)}"
