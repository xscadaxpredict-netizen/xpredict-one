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
from datetime import datetime

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, IntegerField, OuterRef, Subquery, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from core.accounts.models import User
from core.billing.models import AppSubscription, SubscriptionStatus
from core.organizations.models import (
    BusinessUnit,
    Invitation,
    Membership,
    MembershipRole,
    MembershipStatus,
    Organization,
    UnitStatus,
)
from core.permissions.models import AppCode, Permission
from core.permissions.registry import is_unit_aware
from shared.exceptions import not_found


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

    """
    WHETHER THIS PERSON'S DEALERSHIP HAS BEEN CLOSED (C63).

    Always False for somebody organisation-wide -- they have no dealership to
    close, and closing one does not touch them.

    THE MEMBERSHIP IS STILL RETURNED, which is the point of having this field
    at all. Dropping it would be easier and would produce the screen C58 was
    written to remove: zero memberships, and a sign-in page saying access was
    removed when the person is perfectly entitled and their branch simply shut.
    Every app comes back inaccessible, so there is nothing to open -- and this
    says why, so the shell can tell them instead of showing an empty launcher.
    """
    unit_closed: bool


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

    # `unit` is select_related in `me()`, so this costs no query.
    unit_closed = membership.unit_id is not None and membership.unit.status == UnitStatus.DISABLED

    return MembershipData(
        org_id=membership.organization_id,
        org_name=membership.organization.name,
        org_slug=membership.organization.slug,
        role=membership.role,
        unit_id=membership.unit_id,
        unit_name=membership.unit.name if membership.unit_id else None,
        # `organization` is select_related in `me()`, so this costs no query.
        is_ready=membership.organization.is_ready,
        unit_closed=unit_closed,
        apps=[
            _app_data(app, membership, held, granted_apps, active_subscriptions, unit_closed)
            for app in AppCode
        ],
    )


def _app_data(
    app: str,
    membership: Membership,
    held: dict[str, set[Permission]],
    granted_apps: set[str],
    active_subscriptions: set[tuple[uuid.UUID, str]],
    unit_closed: bool = False,
) -> AppAccessData:
    permissions = held.get(app, set())

    if unit_closed:
        # A CLOSED DEALERSHIP OPENS NOTHING (C63) -- including Administration,
        # which a dealer admin would otherwise still reach. Every org-scoped
        # endpoint refuses them anyway (`OrgScopedAPIView`), so a tile that
        # looked clickable would lead straight to a 403; this is the launcher
        # agreeing with the backend rather than discovering it on the way in.
        #
        # `subscribed` is still reported honestly: the organisation's billing
        # is not this person's business but it is not a secret either, and
        # saying False would describe the organisation wrongly.
        return AppAccessData(
            key=app,
            subscribed=app == AppCode.ADMIN
            or (membership.organization_id, app) in active_subscriptions,
            accessible=False,
            summary=None,
            modules=[],
            permissions=[],
        )

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


def dealers_for(organization: Organization) -> list[BusinessUnit]:
    """
    Every dealership in this organization, with `user_count` annotated.

    `user_count` IS "how many people would the Users screen show for this
    dealership", which is memberships plus outstanding invitations -- not
    memberships alone. Somebody invited yesterday and still deciding is a
    person this dealership has, and the Users list shows them; a count that
    disagreed with the list it sits beside would read as a bug in whichever
    screen the reader happened to trust less.

    DISABLED MEMBERSHIPS COUNT. They are switched off, not gone -- C24 is
    explicit that removing somebody deletes the membership -- so a dealership
    with three disabled people has three people, and reopening them changes no
    count.

    TWO SUBQUERIES RATHER THAN TWO JOINS. Annotating a count across two
    separate reverse relations multiplies the rows: Django would join
    memberships and invitations together and report `memberships x
    invitations` for each. That is the classic annotate-twice bug, and it
    inflates rather than failing, so nothing looks wrong until somebody counts
    by hand.
    """
    memberships = (
        Membership.objects.filter(unit=OuterRef("pk"))
        .order_by()
        .values("unit")
        .annotate(total=Count("*"))
        .values("total")
    )
    pending = (
        Invitation.objects.filter(unit=OuterRef("pk"), accepted_at__isnull=True)
        .order_by()
        .values("unit")
        .annotate(total=Count("*"))
        .values("total")
    )

    return list(
        BusinessUnit.objects.filter(organization=organization).annotate(
            user_count=Coalesce(Subquery(memberships, output_field=IntegerField()), Value(0))
            + Coalesce(Subquery(pending, output_field=IntegerField()), Value(0))
        )
    )


# ---------------------------------------------------------------------------
# The Administration users list.
#
# A UNION OF TWO TABLES, which C51 settled and the schema forces. Somebody who
# has not accepted yet may have no account at all, and `Membership.user` cannot
# be null -- so a pending person is an `Invitation` row and nothing else. The
# screen shows both in one list, so this is where they are stitched together.
#
# THE CONSEQUENCE TO REMEMBER: `id` is not one table's primary key. An active
# person's id is a membership id and a pending one's is an invitation id, so
# every write endpoint has to know which it was handed. `status` is what tells
# it, and `find_person()` below is the one place that looks it up.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AppGrantData:
    """One app somebody holds, and the role they hold it with."""

    app: str
    role_code: str
    role_name: str


@dataclass(frozen=True)
class OrgUserData:
    """
    One row of the Administration users list. Mirrors `OrgUser` in
    `shell/admin/api/users.ts`.
    """

    id: uuid.UUID
    first_name: str
    last_name: str
    email: str
    unit_id: uuid.UUID | None
    unit_name: str | None
    role: str
    status: str
    apps: list[AppGrantData]

    created_at: datetime
    """
    When this person was added, and the ONLY thing the list is ordered by.

    Not displayed. It exists so a newly invited person lands at the bottom
    rather than somewhere alphabetical, which is where whoever just invited
    them will look.
    """

    administers: str | None
    """
    `"organisation"`, `"dealer"`, or None -- the FACT, not the words (C53).

    Administration is never an `AppAccess` row (the check constraint refuses
    it) and has no `Role`, so "Organisation admin" and "Dealer admin" are copy
    describing a derived state rather than data. The browser picks the wording,
    the way it already does for every other static label.

    TWO SOURCES, which are the two branches in `_administers()`: standing, or
    a role that grants `admin.*`. C40 keeps them independent, so a dealer admin
    reaches this from the second while their standing stays `member`.
    """


def org_users(organization: Organization, viewer: Membership) -> list[OrgUserData]:
    """
    The people in this organization that `viewer` is allowed to see.

    SCOPED FROM THE CALLER'S MEMBERSHIP, never from a parameter. A dealer admin
    sees their own dealership's people and nobody else's; an organization-wide
    admin sees everybody. The frontend fake keyed this off the organisation
    slug because it had no token to read, and said so -- doing that for real
    would be the frontend deciding who may see whom.

    PENDING PEOPLE ARE SCOPED THE SAME WAY. It would be easy to filter the
    memberships and forget the invitations, and the result is a dealer admin
    reading another dealership's invited staff -- the same leak, one table
    over, and invisible until somebody has an outstanding invitation.
    """
    memberships = (
        Membership.objects.filter(organization=organization)
        .select_related("user", "unit")
        .prefetch_related("app_access__role__permissions")
    )
    invitations = (
        Invitation.objects.filter(organization=organization, accepted_at__isnull=True)
        .select_related("unit")
        .prefetch_related("app_grants__role__permissions")
    )

    if viewer.unit_id is not None:
        memberships = memberships.filter(unit_id=viewer.unit_id)
        invitations = invitations.filter(unit_id=viewer.unit_id)

    people = [_membership_row(m) for m in memberships] + [_invitation_row(i) for i in invitations]

    # Sorted here rather than in the database, because two queries cannot share
    # an ORDER BY.
    #
    # OLDEST FIRST, so somebody just added appears at the BOTTOM. Alphabetical
    # was the obvious choice and is wrong for what this screen is used for: you
    # invite somebody and then look for them, and a name-sorted list drops them
    # at an unpredictable point in the middle. Arrival order means the person
    # you just added is always in the same place -- the end.
    #
    # `created_at` is the tie-breaker's tie-breaker rather than the whole key on
    # its own: two rows written in the same transaction can share a timestamp,
    # so the id keeps the order stable instead of letting it vary between
    # requests.
    return sorted(people, key=lambda p: (p.created_at, str(p.id)))


def _membership_row(membership: Membership) -> OrgUserData:
    grants = list(membership.app_access.all())
    return OrgUserData(
        id=membership.id,
        first_name=membership.user.first_name,
        last_name=membership.user.last_name,
        email=membership.user.email,
        unit_id=membership.unit_id,
        unit_name=membership.unit.name if membership.unit_id else None,
        role=membership.role,
        # `invited` is not reachable here: C51 put pending people in the other
        # table, and `MembershipStatus.INVITED` went with it.
        status=membership.status,
        apps=[_grant(g.app, g.role) for g in grants],
        created_at=membership.created_at,
        administers=_administers(
            membership.role, membership.unit_id, [g.role for g in grants]
        ),
    )


def _invitation_row(invitation: Invitation) -> OrgUserData:
    grants = list(invitation.app_grants.all())
    return OrgUserData(
        # AN INVITATION ID, not a membership id. There is no membership yet.
        id=invitation.id,
        first_name=invitation.first_name,
        last_name=invitation.last_name,
        email=invitation.email,
        unit_id=invitation.unit_id,
        unit_name=invitation.unit.name if invitation.unit_id else None,
        role=invitation.role,
        status="invited",
        apps=[_grant(g.app, g.role) for g in grants],
        created_at=invitation.created_at,
        administers=_administers(
            invitation.role, invitation.unit_id, [g.role for g in grants]
        ),
    )


def _grant(app: str, role) -> AppGrantData:
    """
    BOTH THE CODE AND THE NAME. The list displays the name and the edit form
    matches on the code; sending only the name made that form compare display
    strings, which it complained about in a comment and which breaks silently
    the first time a role is renamed.
    """
    return AppGrantData(app=app, role_code=role.code, role_name=role.name)


def _administers(standing: str, unit_id: uuid.UUID | None, roles: list) -> str | None:
    """
    Whether this person administers, and what.

    ORDER MATTERS. Standing is checked first because an owner or org admin
    administers the whole organization whatever roles they hold -- and the
    check constraint guarantees they have no dealership, so the second branch
    could never fire for them anyway.

    `role.administers` is derived from the permissions the role grants (C44),
    so this cannot drift from what the role actually confers. Prefetch
    `role__permissions` before calling it in a loop.
    """
    if standing in (MembershipRole.OWNER, MembershipRole.ADMIN):
        return "organisation"

    if unit_id is not None and any(role.administers for role in roles):
        return "dealer"

    return None


# ---------------------------------------------------------------------------
# What the accept screen is allowed to know (C56).
#
# UNAUTHENTICATED, so everything here is a deliberate disclosure to whoever
# holds the token. The organisation's name has to be shown --- "join an
# organisation" with no name is not something anybody should type a password
# into --- and the address is shown so the holder can tell they were sent
# somebody else's link. Nothing else: not the dealership, not the apps, not
# the role, because none of it helps the person decide and all of it is
# somebody's staffing arrangement.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class InvitationPreview:
    """The accept screen's whole world before anybody types anything."""

    organization_name: str
    organization_slug: str
    email: str
    expires_at: datetime
    is_expired: bool
    is_accepted: bool

    # True when the address already has an account, so the screen asks them to
    # sign in rather than offering a password field (C56). The service refuses
    # the other path anyway; this is what stops the screen asking the wrong
    # question first.
    requires_sign_in: bool

    # Who did the inviting, as a name or an address. Shown because an
    # unexpected link is more plausible with a colleague's name on it than
    # without --- and the holder was meant to receive it.
    invited_by: str


def invitation_preview(token: str) -> InvitationPreview:
    """
    Describe an invitation to the person holding its link.

    IT DOES NOT REFUSE AN EXPIRED OR SPENT ONE. The states are reported so the
    screen can explain them: "ask for a new link" and "sign in instead" are
    different sentences and both are more use than a dead page. Only an unknown
    token is a 404, which is the one case where there is nothing to say.
    """
    try:
        invitation = (
            Invitation.objects.select_related("organization", "invited_by").get(token=token)
        )
    except (Invitation.DoesNotExist, DjangoValidationError, ValueError):
        raise not_found("Invitation") from None

    inviter = invitation.invited_by
    invited_by = ""
    if inviter is not None:
        invited_by = f"{inviter.first_name} {inviter.last_name}".strip() or inviter.email

    return InvitationPreview(
        organization_name=invitation.organization.name,
        organization_slug=invitation.organization.slug,
        email=invitation.email,
        expires_at=invitation.expires_at,
        is_expired=invitation.expires_at <= timezone.now(),
        is_accepted=invitation.accepted_at is not None,
        requires_sign_in=User.objects.filter(email__iexact=invitation.email).exists(),
        invited_by=invited_by,
    )
