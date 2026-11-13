"""
Read logic for memberships, unit scope, and the `/me` payload.

`resolve_allowed_territories()` is the one function that turns "where does this
person's grant for this app place them" into "which dealerships may this query
see" (C7, C72) --- one place to be right, one place to test.

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
from types import SimpleNamespace

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, IntegerField, OuterRef, Prefetch, Q, Subquery, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from core.accounts.models import User
from core.billing.models import AppSubscription, SubscriptionStatus
from core.organizations.models import (
    Invitation,
    Membership,
    MembershipAppRole,
    MembershipAppTerritory,
    MembershipRole,
    MembershipStatus,
    Organization,
    Territory,
    TerritoryKind,
    UnitStatus,
)
from core.permissions.models import AppCode, Permission
from core.permissions.registry import is_unit_aware
from shared.exceptions import not_found

# WHAT EVERY READER OF A MEMBERSHIP'S ACCESS PREFETCHES (C72 step 2b): its
# per-app grants, each grant's role with that role's permissions, and each
# grant's territories. One definition, so `/me`, the permission check and the
# users list cannot drift into fetching different things.
#
# FOUR QUERIES, WHATEVER THE NUMBER OF GRANTS: the grants; their roles WITH the
# role row joined in; those roles' permissions; their territories WITH the
# territory row joined in. Plain lookups ("grants__roles__role") would spend a
# query on each join, on every request that checks a permission.
GRANTS_PREFETCH: tuple[str | Prefetch, ...] = (
    Prefetch("grants__roles", queryset=MembershipAppRole.objects.select_related("role")),
    "grants__roles__role__permissions",
    Prefetch("grants__territories",queryset=MembershipAppTerritory.objects.select_related("territory"),),
)


def resolve_allowed_territories(membership: Membership, app: str) -> frozenset[uuid.UUID] | None:
    """
    Which dealerships this membership may see inside this app.

    `None` MEANS UNRESTRICTED AND IS NOT THE SAME AS AN EMPTY SET. None says
    "do not filter"; an empty set would say "restricted to nothing", which
    matches no rows at all. `TerritoryScopedManager` reads this distinction
    directly, so returning the wrong one is the difference between a fleet
    manager seeing everything and seeing nothing.

    Two independent reasons to be unrestricted, and both are normal:

    - **The app has no dealerships** (CRM, E-commerce). A unit-scoped person's
      CRM queries must not be filtered by a column CRM does not have (C5).
    - **The person is organization-wide**: their grant for this app places
      them AT the organisation's root (C72) -- every owner, and org-level roles
      like Fleet viewer.

    READ FROM THE PER-APP GRANT (C72 step 2b). The grant's territories are
    where this person sits in this app: the root means everything; otherwise
    EACH PLACE AND EVERYTHING BELOW IT (C72 piece 3 step 2) -- placed at North,
    you see North, Delhi, Delhi's branches and Jaipur, not Chennai.

    NO GRANT FOR THIS APP IS AN EMPTY SET, never None: restricted to nothing,
    so a missing grant fails closed. (The permission layer refuses such a
    request first; this is the second lock.)
    """
    if not is_unit_aware(app):
        return None
    if membership.is_owner:
        # THE OWNER IS EVERYWHERE, BY RULE (C72), whatever their grant for this
        # app says -- or whether they hold one at all. The permission layer
        # still stops them at an app the organisation has not bought (C55).
        return None
    grant = next((g for g in membership.grants.all() if g.app_id == app), None)
    if grant is None:
        return frozenset()
    placed = [placement.territory for placement in grant.territories.all()]
    if any(territory.is_root for territory in placed):
        return None
    return with_subtrees(membership.organization_id, placed)


def with_subtrees(
    organization_id: uuid.UUID, territories: list[Territory]
) -> frozenset[uuid.UUID]:
    """
    These territories AND EVERYTHING BELOW THEM, as ids (C72 piece 3 step 2).

    ONE QUERY, however many places: treebeard stores a box's position as a
    path that grows by one step per level ("0001" root, "00010001" North,
    "000100010001" Delhi), so everything under North is every box whose path
    STARTS WITH North's. Read on every call, never stored, so moving a box in
    the tree changes who sees what on the very next request.

    FILTERED BY ORGANISATION, ALWAYS. Every organisation's root shares one
    path sequence (CLAUDE.md), and an unfiltered tree question is a
    cross-tenant leak. Today two organisations' paths never share a prefix,
    so no test can make this filter fail -- it is the rule that keeps that
    true if the tree's numbering ever changes.

    No territories is an EMPTY set, never everything: fails closed.
    """
    if not territories:
        return frozenset()
    below = Q()
    for territory in territories:
        below |= Q(path__startswith=territory.path)
    return frozenset(
        Territory.objects.filter(organization_id=organization_id)
        .filter(below)
        .values_list("id", flat=True)
    )


# ---------------------------------------------------------------------------
# Where a person sits, ACROSS ALL THEIR GRANTS (C72 step 2c, commit 3).
#
# `resolve_allowed_territories()` answers a per-app question -- which dealerships does
# a DMS request see. These answer the organisation's questions -- whose people
# may this person administer, are they shut out by a closure, what does `/me`
# call them -- which used to be read from `Membership.role` and
# `Membership.unit`. Callers prefetch `GRANTS_PREFETCH`, so they walk memory.
# ---------------------------------------------------------------------------


def _placements(membership: Membership) -> list[Territory]:
    return [
        placement.territory
        for grant in membership.grants.all()
        for placement in grant.territories.all()
    ]


def placements_for(membership: Membership, app: str) -> list[Territory]:
    """Where this person's grant for ONE app places them -- not expanded."""
    return [
        placement.territory
        for grant in membership.grants.all()
        if grant.app_id == app
        for placement in grant.territories.all()
    ]


def reach(membership: Membership) -> frozenset[uuid.UUID] | None:
    """
    Where in the organisation this person sits. `None` MEANS EVERYWHERE.

    - **The owner**: everywhere, by rule (C72).
    - **Any grant placed at the root**: everywhere -- every Organisation admin
      (their Administration grant), and organisation-wide app users such as a
      Fleet viewer, exactly as `Membership.unit IS NULL` used to say.
    - **Otherwise**: exactly the territories their grants place them at -- a
      dealer admin's dealership(s).
    - **No grants at all**: an EMPTY set, never None. Fails closed.

    WHERE THEY ARE PLACED, NOT WHAT IS BELOW. For "whose people may they
    administer", which covers everything below their places, ask
    `administers_within()`.
    """
    if membership.is_owner:
        return None
    placed = _placements(membership)
    if any(territory.is_root for territory in placed):
        return None
    return frozenset(territory.id for territory in placed)


def administers_within(membership: Membership) -> frozenset[uuid.UUID] | None:
    """
    The territories whose people this person may administer: their places
    AND EVERYTHING BELOW THEM (C72 piece 3 step 2, the owner 2026-11-13). A
    DMS System administrator placed at North manages Delhi's and Jaipur's
    people, not Chennai's. `None` means everywhere, exactly as `reach()`.

    One query. Callers checking many people -- the users list -- ask this
    ONCE and compare each person against it, never once per person.
    """
    if reach(membership) is None:
        return None
    return with_subtrees(membership.organization_id, _placements(membership))


def standing(membership: Membership) -> str:
    """
    `owner`, `admin` or `member` -- READ FROM `is_owner` AND THE GRANTS (C72
    step 2c), no longer from `Membership.role`. An admin is somebody holding an
    Administration grant ("Organisation admin", Q60). Kept as these three words
    because `/me` and the users list still send them to a frontend that reads
    them, until piece 7.
    """
    if membership.is_owner:
        return MembershipRole.OWNER
    if any(grant.app_id == AppCode.ADMIN for grant in membership.grants.all()):
        return MembershipRole.ADMIN
    return MembershipRole.MEMBER


def dealership_of(membership: Membership) -> Territory | None:
    """
    The ONE place a dealership-scoped person sits, for `/me`'s `unit_id` and
    `unit_name` and the launcher's DMS summary -- or None.

    None for anybody who sits everywhere, and ALSO for somebody placed at
    several dealerships (C72, Q10): `/me` has one field, and naming one of two
    would be wrong. Nothing in the product can place a person at two yet; the
    frontend learns about several in piece 7.
    """
    if reach(membership) is None:
        return None
    places = {territory.id: territory for territory in _placements(membership)}
    return next(iter(places.values())) if len(places) == 1 else None


def is_shut_out_by_closure(membership: Membership) -> bool:
    """
    C63, READ FROM THE GRANTS: true when EVERY place this person sits is a
    closed dealership.

    With one placement that is exactly the old rule ("your dealership is
    closed"). With several (C72, Q10), closing one of them must not lock
    somebody out of the other -- they go on working at the one still open.
    (Whether they should still see the closed one's records is C63's
    read-only question, Q21, and belongs to piece 3's wall.)

    Anybody who sits everywhere is never shut out: closing a dealership does
    not touch organisation-level people. Nobody with no placements is "closed"
    either -- they are refused by having nothing, not by this.
    """
    if reach(membership) is None:
        return False
    places = {territory.id: territory for territory in _placements(membership)}.values()
    return bool(places) and all(territory.status == UnitStatus.DISABLED for territory in places)


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
        .select_related("organization")
        .prefetch_related(*GRANTS_PREFETCH)
        .order_by("organization__name")
    )

    # The whole catalogue, fetched once rather than per membership: an owner
    # holds all of it (C72). It is the same list for every organization,
    # because the catalogue is platform-wide (C28).
    catalogue = list(Permission.objects.all())

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
            _membership_data(membership, catalogue, active_subscriptions)
            for membership in memberships
        ],
    )


def _membership_data(
    membership: Membership,
    catalogue: list[Permission],
    active_subscriptions: set[tuple[uuid.UUID, str]],
) -> MembershipData:
    # Every permission this person holds here, from BOTH sources -- the
    # owner rule and their grants -- bucketed by the app the permission belongs
    # to, which is not always the app of the role that granted it. The DMS
    # System administrator role grants `admin.person.*`, and that is how a
    # dealer admin reaches Administration (C40).
    #
    # NO STANDING SOURCE SINCE C72 STEP 2c: an organisation admin holds
    # Administration through their "Organisation admin" grant (Q60), and
    # `Membership.role` confers nothing.
    held: dict[str, set[Permission]] = {}
    granted_apps: set[str] = set()

    if membership.is_owner:
        # THE OWNER HOLDS EVERYTHING, BY RULE (C72 step 2c) -- every permission
        # of every app, as though granted every app. It is NOT a way round
        # billing: `_app_data()` still requires the subscription, so an owner
        # is not let into an app the organisation has not bought (C55).
        #
        # By rule rather than by rows because rows would need topping up every
        # time an app, a role or a permission is added, and the first one
        # forgotten leaves the one account that must never be locked out
        # short of something.
        for permission in catalogue:
            held.setdefault(permission.app_id, set()).add(permission)
        granted_apps.update(AppCode)

    # FROM THE PER-APP GRANTS (C72 step 2b), not `AppAccess`. Callers prefetch
    # `GRANTS_PREFETCH`, so this walks memory rather than the database.
    for grant in membership.grants.all():
        granted_apps.add(grant.app_id)
        for held_role in grant.roles.all():
            for permission in held_role.role.permissions.all():
                held.setdefault(permission.app_id, set()).add(permission)

    # FROM THE GRANTS SINCE C72 STEP 2c, not `Membership.role` / `.unit`.
    unit_closed = is_shut_out_by_closure(membership)
    dealership = dealership_of(membership)

    return MembershipData(
        org_id=membership.organization_id,
        org_name=membership.organization.name,
        org_slug=membership.organization.slug,
        role=standing(membership),
        unit_id=dealership.id if dealership else None,
        unit_name=dealership.name if dealership else None,
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

    dealership = dealership_of(membership)
    if dealership is not None:
        return dealership.name

    # DEALERS ONLY: regions, branches and warehouses are territories too (C72),
    # and "4 dealerships" must not count the region they sit in.
    count = Territory.objects.filter(
        organization_id=membership.organization_id,
        kind=TerritoryKind.DEALER,
        status=UnitStatus.ACTIVE,
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
    catalogue = list(Permission.objects.all())
    active_subscriptions = set(
        AppSubscription.objects.filter(
            organization_id=membership.organization_id,
            status=SubscriptionStatus.ACTIVE,
        ).values_list("organization_id", "app")
    )

    data = _membership_data(membership, catalogue, active_subscriptions)

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
    # THE ACTOR'S SIDE READS THE GRANTS (C72 step 2c), expanded to subtrees
    # (piece 3 step 2). The TARGET here is a single dealership id -- from a
    # form, or an invitation's `unit` -- and a member is judged by
    # `can_manage_person()` instead.
    scope = administers_within(membership)
    if scope is None:
        return True
    return target_unit_id is not None and target_unit_id in scope


def _person_inside(scope: frozenset[uuid.UUID] | None, person: Membership) -> bool:
    """Everywhere `person` sits is inside `scope` -- an actor's, already expanded."""
    if scope is None:
        return True
    target = reach(person)
    return target is not None and bool(target) and target <= scope


def can_manage_person(actor: Membership, person: Membership | Invitation) -> bool:
    """
    May `actor` administer this person? BOTH SIDES FROM THE GRANTS (C72 step
    2d) for a member: the person must sit somewhere, and everywhere they sit
    must be inside the actor's reach.

    - Somebody who sits everywhere (the owner, anybody at the root) is
      managed only by somebody who also sits everywhere.
    - Somebody placed at Delhi AND Jaipur is managed only by somebody whose
      reach covers both -- a Delhi dealer admin does not get them.
    - Somebody with no grants sits nowhere, and only organisation-wide admins
      reach them. C73 requires an app for everybody new; this keeps any older
      app-less member manageable from head office.

    THE ACTOR'S PLACES COVER EVERYTHING BELOW THEM (piece 3 step 2): an admin
    at North manages somebody at Delhi. The PERSON's side stays where they are
    placed, unexpanded -- "everywhere they sit is inside my subtree" needs
    only the actor's side expanded.

    AN INVITATION KEEPS ITS OWN `unit` until piece 5, so it is still judged by
    `can_manage(actor, invitation.unit_id)`.
    """
    if isinstance(person, Invitation):
        return can_manage(actor, person.unit_id)
    return _person_inside(administers_within(actor), person)


def dealers_for(organization: Organization) -> list[Territory]:
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
    # PEOPLE PLACED HERE BY A GRANT (C72 step 2d), counted once each however
    # many of their apps place them here -- not `Membership.unit`.
    memberships = (
        MembershipAppTerritory.objects.filter(territory=OuterRef("pk"))
        .order_by()
        .values("territory")
        .annotate(total=Count("app_access__membership", distinct=True))
        .values("total")
    )
    pending = (
        Invitation.objects.filter(unit=OuterRef("pk"), accepted_at__isnull=True)
        .order_by()
        .values("unit")
        .annotate(total=Count("*"))
        .values("total")
    )

    # ORDERED BY NAME EXPLICITLY. This used to come from `Meta.ordering`; the
    # territory manager now sorts by tree position, so alphabetical order has
    # to be asked for. DEALERS ONLY -- the dealers screen lists dealerships, and
    # the rest of the tree has its own endpoint (C72).
    return list(
        Territory.objects.filter(organization=organization, kind=TerritoryKind.DEALER)
        .annotate(
            user_count=Coalesce(Subquery(memberships, output_field=IntegerField()), Value(0))
            + Coalesce(Subquery(pending, output_field=IntegerField()), Value(0))
        )
        .order_by("name")
    )


def territories_for(organization: Organization) -> list[Territory]:
    """
    Every territory in this organization's tree, in tree order (C72).

    TREE ORDER, NOT NAME ORDER: each box comes after its parent, which is what
    lets a client build the tree in one pass over `parent_id`. That is the
    treebeard manager's own ordering (`path`), asked for explicitly anyway so
    the contract does not rest on a default.
    """
    territories = list(Territory.objects.filter(organization=organization).order_by("path"))
    return _with_parent_ids(organization, territories)


def _with_parent_ids(organization: Organization, territories: list[Territory]) -> list[Territory]:
    """
    Set `parent_id` on each territory, from its path.

    A box's parent is the box whose path is its own minus the last step --
    that is what a materialised path means. One query for the organisation's
    path-to-id map rather than treebeard's `get_parent()`, which would ask the
    database once per territory.

    FROM THIS ORGANIZATION ONLY. Paths are unique across the whole table, so a
    map built without the filter could not return the wrong parent -- but it
    would read every customer's tree to answer for one.
    """
    ids_by_path = dict(
        Territory.objects.filter(organization=organization).values_list("path", "id")
    )
    for territory in territories:
        parent_path = territory.path[: -Territory.steplen]
        territory.parent_id = ids_by_path.get(parent_path) if parent_path else None
    return territories


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

    "Organisation admin" and "Dealer admin" are copy describing a derived
    state rather than data: the first is the `admin.org_admin` grant at the
    root, the second a role granting `admin.*` held at a dealership. The browser picks the wording,
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
        .select_related("user")
        .prefetch_related(*GRANTS_PREFETCH)
    )
    invitations = (
        Invitation.objects.filter(organization=organization, accepted_at__isnull=True)
        .select_related("unit")
        .prefetch_related("app_grants__role__permissions")
    )

    # BOTH SIDES FROM THE GRANTS (C72 step 2d): the same rule as managing a
    # person, so the list never shows somebody the actions would refuse.
    # Invitations keep their own `unit` until piece 5. The viewer's scope,
    # subtrees included, is worked out ONCE -- not once per row.
    scope = administers_within(viewer)
    if scope is not None:
        invitations = invitations.filter(unit_id__in=scope)
    members = [m for m in memberships if _person_inside(scope, m)]

    people = [_membership_row(m) for m in members] + [_invitation_row(i) for i in invitations]

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
    dealership = dealership_of(membership)
    # FROM THE PER-APP GRANTS (C72 step 2b): each grant's app and its role, as
    # `(app_id, role)` pairs -- the same shape `AppAccess` rows gave.
    grants = [
        SimpleNamespace(app_id=grant.app_id, role=held_role.role)
        for grant in membership.grants.all()
        for held_role in grant.roles.all()
    ]
    return OrgUserData(
        id=membership.id,
        first_name=membership.user.first_name,
        last_name=membership.user.last_name,
        email=membership.user.email,
        # FROM THE GRANTS (C72 step 2d), like `/me`: their one dealership, or
        # None for head office and for somebody placed at several.
        unit_id=dealership.id if dealership else None,
        unit_name=dealership.name if dealership else None,
        role=standing(membership),
        # `invited` is not reachable here: C51 put pending people in the other
        # table, and `MembershipStatus.INVITED` went with it.
        status=membership.status,
        # NOT THE ADMINISTRATION GRANT (C72 step 2c). The frontend's edit form
        # sends this list back as `apps`, and `_resolve_grants` refuses
        # Administration there -- it arrives through `role: "admin"` instead.
        # Listing it would make every save of an organisation admin a 4xx.
        apps=[_grant(g.app_id, g.role) for g in grants if g.app_id != AppCode.ADMIN],
        created_at=membership.created_at,
        administers=_administers(
            standing(membership), reach(membership) is not None, [g.role for g in grants]
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
        apps=[_grant(g.app_id, g.role) for g in grants],
        created_at=invitation.created_at,
        administers=_administers(
            invitation.role, invitation.unit_id is not None, [g.role for g in grants]
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


def _administers(standing: str, at_a_dealership: bool, roles: list) -> str | None:
    """
    Whether this person administers, and what.

    ORDER MATTERS. Standing is checked first because an owner or org admin
    administers the whole organization whatever roles they hold -- and an
    Organisation admin's grant sits at the root, so the second branch could
    never fire for them anyway.

    For a membership, `standing` and `at_a_dealership` come from the grants
    (C72 step 2c); for an invitation, from its own fields until piece 5.

    `role.administers` is derived from the permissions the role grants (C44),
    so this cannot drift from what the role actually confers. Prefetch
    `role__permissions` before calling it in a loop.
    """
    if standing in (MembershipRole.OWNER, MembershipRole.ADMIN):
        return "organisation"

    if at_a_dealership and any(role.administers for role in roles):
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
