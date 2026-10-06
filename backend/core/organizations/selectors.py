"""
Read logic for memberships, unit scope, and the `/me` payload.

`resolve_allowed_units()` is the one function that turns "which dealership is
this person attached to" into "which dealerships may this query see". Nothing
else reads `Membership.unit_id` to make a scoping decision (C7) --- one place
to be right, one place to test.

`me()` builds the whole answer to "who am I and what may I open". It is the
endpoint that lets the frontend delete its fakes, so the shape here is the
contract: `apps/web/src/shell/api/auth.ts` declares the matching TypeScript by
hand, because C43 removed the generated client. When the two disagree, THIS is
the source and the types are the bug.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from core.billing.models import AppSubscription, SubscriptionStatus
from core.organizations.models import (
    BusinessUnit,
    Membership,
    MembershipRole,
    MembershipStatus,
    UnitStatus,
)
from core.permissions.models import AppCode, Permission
from core.permissions.registry import is_unit_aware


def resolve_allowed_units(membership: Membership, app: str) -> frozenset[uuid.UUID] | None:
    """
    Which dealerships this membership may see inside this app.

    `None` MEANS UNRESTRICTED AND IS NOT THE SAME AS AN EMPTY SET. None says
    "do not filter"; an empty set would say "restricted to nothing", which
    matches no rows at all. `UnitScopedManager` reads this distinction
    directly, so returning the wrong one is the difference between a fleet
    manager seeing everything and seeing nothing.

    Two independent reasons to be unrestricted, and both are normal:

    - **The app has no dealerships** (CRM, E-commerce). A unit-scoped person's
      CRM queries must not be filtered by a column CRM does not have (C5).
    - **The person is organization-wide** (`unit_id IS NULL`), which is every
      owner and every org admin (C40), plus org-level roles like Fleet viewer.

    A unit-scoped person gets exactly their own dealership. C29 made
    dealerships a FLAT list, so there is no subtree to walk --- and C7's
    wording, "the membership's subtree", stays true because the subtree of a
    flat node is that node. If Q22 is ever answered and parents come back,
    this function is the only place that has to learn to recurse.
    """
    if not is_unit_aware(app):
        return None
    if membership.unit_id is None:
        return None
    return frozenset({membership.unit_id})


@dataclass(frozen=True)
class AppAccessData:
    """One app's availability for one membership. Mirrors `AppAccess` in auth.ts."""

    key: str
    subscribed: bool
    accessible: bool
    summary: str | None
    modules: list[str]
    permissions: list[str]


@dataclass(frozen=True)
class MembershipData:
    """One organization this person belongs to. Mirrors `Membership` in auth.ts."""

    org_id: uuid.UUID
    org_name: str
    org_slug: str
    role: str
    unit_id: uuid.UUID | None
    unit_name: str | None
    apps: list[AppAccessData]

    """
    WHETHER THIS ORGANIZATION'S DATABASE EXISTS YET (C50).

    Per membership, not per user: somebody can belong to two organizations with
    only one of them provisioned, and the launcher has to be right about which
    one it is about to open.

    False is normal for a few seconds after signup and permanent if
    provisioning failed for good. Either way the launcher refuses to open an
    app, because the first business query would hit a database that is not
    there -- today that is nothing, since no tenant app has models, and the
    moment DMS has one it is a 500 on every page.
    """
    is_ready: bool


@dataclass(frozen=True)
class MeData:
    """Mirrors `Me` in auth.ts."""

    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    memberships: list[MembershipData]


def _standing_grants_administration(role: str) -> bool:
    """
    Whether org standing alone confers Administration.

    Owners and org admins hold all 11 `admin.*` permissions and NOT through a
    Role row (C42). A dealer admin reaches the same app from the other
    direction --- by holding the DMS System administrator role, which grants
    `admin.person.*` --- and `Membership.role` stays `member` (C40).
    """
    return role in (MembershipRole.OWNER, MembershipRole.ADMIN)


def me(user) -> MeData:
    """
    Everything the shell needs to render itself for this person.

    ONLY ACTIVE MEMBERSHIPS. An `invited` membership has not been accepted and
    a `disabled` one has been switched off; either appearing here would put an
    organization in the launcher that the person cannot use.

    Organization SUSPENSION is deliberately not filtered here. This endpoint
    answers "where do you belong"; refusing a suspended organization's requests
    is the tenant middleware's job, and doing it in both places means two rules
    that have to agree.
    """
    memberships = list(
        Membership.objects.filter(user=user, status=MembershipStatus.ACTIVE)
        .select_related("organization", "unit")
        .prefetch_related("app_access__role__permissions")
        .order_by("organization__name")
    )

    # The 11 `admin.*` rows, fetched once rather than per membership. They are
    # the same list for every organization: the catalogue is platform-wide (C28).
    admin_permissions = list(Permission.objects.filter(app=AppCode.ADMIN))

    active_subscriptions = set(
        AppSubscription.objects.filter(
            organization_id__in=[m.organization_id for m in memberships],
            status=SubscriptionStatus.ACTIVE,
        ).values_list("organization_id", "app")
    )

    return MeData(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        memberships=[
            _membership_data(membership, admin_permissions, active_subscriptions)
            for membership in memberships
        ],
    )


def _membership_data(
    membership: Membership,
    admin_permissions: list[Permission],
    active_subscriptions: set[tuple[uuid.UUID, str]],
) -> MembershipData:
    # Every permission this person holds here, from BOTH sources, bucketed by
    # the app the permission belongs to --- which is not always the app of the
    # role that granted it. The DMS System administrator role grants
    # `admin.person.*`, and that is exactly how a dealer admin gets the
    # Administration app without any standing (C40).
    held: dict[str, set[Permission]] = {}

    if _standing_grants_administration(membership.role):
        held.setdefault(AppCode.ADMIN, set()).update(admin_permissions)

    granted_apps: set[str] = set()
    for access in membership.app_access.all():
        granted_apps.add(access.app)
        for permission in access.role.permissions.all():
            held.setdefault(permission.app, set()).add(permission)

    return MembershipData(
        org_id=membership.organization_id,
        org_name=membership.organization.name,
        org_slug=membership.organization.slug,
        role=membership.role,
        unit_id=membership.unit_id,
        unit_name=membership.unit.name if membership.unit_id else None,
        # `organization` is select_related in `me()`, so this costs no query.
        is_ready=membership.organization.is_ready,
        apps=[
            _app_data(app, membership, held, granted_apps, active_subscriptions)
            for app in AppCode
        ],
    )


def _app_data(
    app: str,
    membership: Membership,
    held: dict[str, set[Permission]],
    granted_apps: set[str],
    active_subscriptions: set[tuple[uuid.UUID, str]],
) -> AppAccessData:
    permissions = held.get(app, set())

    if app == AppCode.ADMIN:
        # Administration is never bought and never granted a row: it comes with
        # the platform, and holding any `admin.*` permission is what opens it
        # (C40, C44). Reported as subscribed so the launcher needs no special
        # case for it.
        subscribed = True
        accessible = bool(permissions)
    else:
        subscribed = (membership.organization_id, app) in active_subscriptions
        # BOTH facts are required, which is the whole of C16. A grant left
        # behind on a cancelled subscription must open nothing --- the grant is
        # not revoked when billing lapses, so this is where that is caught.
        accessible = subscribed and app in granted_apps

    if not accessible:
        # An app they cannot open reports nothing about itself. Returning its
        # modules or permissions anyway would tell the browser what the person
        # would have been able to do, which is the hiding undone (C22).
        return AppAccessData(
            key=app,
            subscribed=subscribed,
            accessible=False,
            summary=None,
            modules=[],
            permissions=[],
        )

    return AppAccessData(
        key=app,
        subscribed=subscribed,
        accessible=True,
        summary=_summary(app, membership),
        modules=sorted({permission.module for permission in permissions}),
        permissions=sorted(permission.code for permission in permissions),
    )


def _summary(app: str, membership: Membership) -> str | None:
    """
    A line of FACT the server knows and the browser cannot.

    Static wording belongs in the frontend catalog --- "Dealership management"
    is copy, not data, and shipping copy from Django means a backend release to
    fix a typo. So this returns a count or a name, or nothing.

    The fake's DMS line, "Sales - Service - Tech support across 12 dealers",
    mixed the two: the module names are copy the frontend already has, and only
    the dealer count was ever a server fact. Only the count is sent.
    """
    if app != AppCode.DMS:
        return None

    if membership.unit_id is not None:
        return membership.unit.name

    count = BusinessUnit.objects.filter(
        organization_id=membership.organization_id, status=UnitStatus.ACTIVE
    ).count()
    return f"{count} dealership" if count == 1 else f"{count} dealerships"


# ---------------------------------------------------------------------------
# The authorization chain, links two and three (C49).
#
# `OrgScopedAPIView` is link one: it answers "do you belong to this
# organization". These two answer "may you do this" and "to whom".
#
# THEY DELIBERATELY REUSE `_membership_data()` RATHER THAN RE-DERIVING. The
# launcher and the guards have to agree about what somebody holds, and the
# cheap way to write `permissions_for()` would have been a fresh loop over
# `app_access` -- which is the same shape as the CSRF header and the token
# denylist: two implementations of one rule, where the drift is invisible until
# it matters. Here the dangerous direction is a guard believing in a permission
# the launcher never granted, so there is one derivation and both callers go
# through it.
# ---------------------------------------------------------------------------


def permissions_for(membership: Membership) -> frozenset[str]:
    """
    Every permission code this membership holds right now.

    Flattened across apps, because a guard asks "may you invite somebody",
    not "may you invite somebody in DMS". The bucketing `/me` does is for the
    sidebar, which needs to know which app a capability showed up under; an
    authorization check does not care where it came from.

    THE C16 GATE APPLIES HERE TOO, which is the reason this goes through
    `_membership_data()`. A grant left behind on a cancelled subscription
    opens nothing (`_app_data`), so it must also permit nothing -- otherwise
    the launcher hides an app while the endpoints behind it still answer.

    ONE KNOWN ASYMMETRY, inherited rather than introduced: Administration is
    never bought, so its bucket is not gated on a subscription. A dealer admin
    whose organization cancelled DMS therefore keeps `admin.person.*`, because
    those permissions arrive through the DMS System administrator role but land
    in the `admin` bucket. Whether that is right is a product question -- it is
    arguably correct, since somebody has to be able to manage people in an
    organization that has stopped paying for DMS -- and it is recorded in Q34
    rather than changed quietly here.

    Costs a few queries. Prefetch as `me()` does if you are asking for a list
    of memberships; for one caller on one request it is not worth caching.
    """
    admin_permissions = list(Permission.objects.filter(app=AppCode.ADMIN))
    active_subscriptions = set(
        AppSubscription.objects.filter(
            organization_id=membership.organization_id,
            status=SubscriptionStatus.ACTIVE,
        ).values_list("organization_id", "app")
    )

    data = _membership_data(membership, admin_permissions, active_subscriptions)

    return frozenset(code for app in data.apps if app.accessible for code in app.permissions)


def can_manage(membership: Membership, target_unit_id: uuid.UUID | None) -> bool:
    """
    May this person administer somebody attached to `target_unit_id`?

    `None` as the target means an organization-wide person -- an owner, an org
    admin, or somebody holding an org-level role like Fleet viewer.

    TWO KINDS OF ADMINISTRATOR, and they are the two branches (C40, C23):

    - **Organization-wide** (`unit_id IS NULL`, which the check constraint
      guarantees for owner and admin standing): manages everybody, including
      every dealership's people. Reaching into a dealership's users is an
      audited override rather than the normal path, but it is allowed.
    - **A dealer admin** (`member` standing, a dealership, and the DMS System
      administrator role): manages exactly their own dealership's people and
      nobody else's -- not another dealership's, and not an organization-wide
      person, who is senior to them and whose scope they do not share.

    THIS ANSWERS SCOPE ONLY, never capability. Holding `admin.person.update` is
    a separate question asked by the view; a Sales representative passes this
    function for their own dealership and still may not manage anybody. Both
    checks are required and they refuse differently: failing this is a 404,
    because a person outside your scope must be indistinguishable from one who
    does not exist, while failing the permission check is a 403.
    """
    if membership.unit_id is None:
        return True
    return target_unit_id == membership.unit_id
