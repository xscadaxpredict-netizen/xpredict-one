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
    GrantStatus,
    Invitation,
    InvitationAppGrant,
    Membership,
    MembershipAppAccess,
    MembershipAppRole,
    MembershipAppTerritory,
    MembershipRole,
    MembershipStatus,
    Organization,
    Territory,
    TerritoryKind,
    UnitStatus,
)
from core.permissions.models import (
    VIEW_ACTION,
    App,
    AppCode,
    AppSection,
    Permission,
    Role,
    roles_for_organization,
)
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
    # A DISABLED GRANT SEES NOTHING: restricted to nothing, like no grant.
    grant = next((g for g in membership.grants.all() if g.app_id == app and g.is_active), None)
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
    step 2c), no longer from `Membership.role`. Kept as these three words
    because `/me` and the users list still send them to a frontend that reads
    them, until piece 7.

    `admin` IS THE BUILT-IN ORGANISATION ADMIN ROLE ONLY (C89, answering Q70).
    It used to be ANY Administration grant, which was the same thing while that
    role was the only one; once an organisation's own Admin panel roles can be
    held (C88), somebody given "Application Admin" would have been labelled,
    counted and treated as a full Organization Admin. They are `member` here,
    and what they hold is `admin_role_of()`.
    """
    if membership.is_owner:
        return MembershipRole.OWNER
    role = admin_panel_role(membership)
    if role is not None and role.code == ORGANISATION_ADMIN_ROLE:
        return MembershipRole.ADMIN
    return MembershipRole.MEMBER


def admin_panel_role(membership: Membership) -> Role | None:
    """
    The role on this person's Administration grant -- Organisation admin or one
    of the organisation's own -- or None (C89). One role per grant
    (`grant_one_role_per_grant`). Callers prefetch `GRANTS_PREFETCH`.
    """
    for grant in membership.grants.all():
        if grant.app_id == AppCode.ADMIN:
            for held in grant.roles.all():
                return held.role
    return None


@dataclass(frozen=True)
class AdminRoleData:
    """
    The Admin panel role somebody holds, AS THE ROLES TAB NAMES IT (C89):
    `code` is the Roles tab row's code, so a role's Users tab finds its holders
    by it. The owner is `"owner"`, a rule rather than a role row.
    """

    code: str
    name: str


# What the Roles tab calls the two built-ins. "Organization Admin" is not the
# role row's own name ("Organisation admin"): the owner's spelling, from Zoho.
OWNER_ROLE_NAME = "Organization Owner"
ORGANISATION_ADMIN_NAME = "Organization Admin"


def admin_role_of(membership: Membership) -> AdminRoleData | None:
    """
    WHAT THIS PERSON IS IN THE ADMIN PANEL, by the role they actually hold
    (C89): Organization Owner, Organization Admin, one of the organisation's
    own roles by its name -- or None. Every label and count reads this, never
    "holds Administration at all".
    """
    if membership.is_owner:
        return AdminRoleData(code="owner", name=OWNER_ROLE_NAME)
    role = admin_panel_role(membership)
    if role is None:
        return None
    name = ORGANISATION_ADMIN_NAME if role.code == ORGANISATION_ADMIN_ROLE else role.name
    return AdminRoleData(code=role.code, name=name)


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
class SubModuleData:
    """A sub-module the person may see, with its visible tabs (C79)."""

    code: str
    tabs: list[str]


@dataclass(frozen=True)
class ModuleData:
    """A module the person may see, with its visible sub-modules (C79)."""

    code: str
    sub_modules: list[SubModuleData]


@dataclass(frozen=True)
class AppAccessData:
    """One app's availability for one membership. Mirrors `AppAccess` in auth.ts."""

    key: str
    subscribed: bool
    accessible: bool
    summary: str | None

    modules: list[ModuleData]
    """
    WHAT THE PERSON MAY SEE, AS THE APP'S OWN TREE (C79, the owner 2026-11-19):
    module -> sub-module -> tab, only the parts they may see, in menu order.
    See `module_tree()`. Every app has this shape; DMS's modules have no
    sub-modules until DMS moves onto the section tree.
    """

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
    THE ADMIN PANEL ROLE THEY HOLD (C89) -- Organization Owner, Organization
    Admin, one of the organisation's own -- or None. `role` stays the
    owner/admin/member word; this is what the screens NAME them.
    """
    admin_role: AdminRoleData | None

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

    # Every app's section tree, fetched once for the same reason: tens of rows,
    # platform-wide, and walked in memory for each membership (C79).
    sections = {section.id: section for section in AppSection.objects.all()}

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
            _membership_data(membership, catalogue, sections, active_subscriptions)
            for membership in memberships
        ],
    )


def _membership_data(
    membership: Membership,
    catalogue: list[Permission],
    sections: dict[uuid.UUID, AppSection] | None,
    active_subscriptions: set[tuple[uuid.UUID, str]],
) -> MembershipData:
    # Every permission this person holds here, from BOTH sources -- the
    # owner rule and their grants -- bucketed by the app the permission belongs
    # to, which is not always the app of the role that granted it. The DMS
    # System administrator role grants `admin.user.*`, and that is how a
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
        if not grant.is_active:
            # DISABLED (the app tile's Disable): it opens nothing and permits
            # nothing, while keeping its role and places for Enable.
            continue
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
        admin_role=admin_role_of(membership),
        unit_id=dealership.id if dealership else None,
        unit_name=dealership.name if dealership else None,
        # `organization` is select_related in `me()`, so this costs no query.
        is_ready=membership.organization.is_ready,
        unit_closed=unit_closed,
        apps=[
            _app_data(
                app, membership, held, sections, granted_apps, active_subscriptions, unit_closed
            )
            for app in AppCode
        ],
    )


def _app_data(
    app: str,
    membership: Membership,
    held: dict[str, set[Permission]],
    sections: dict[uuid.UUID, AppSection] | None,
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
        # None from `permissions_for()`, which never reads the tree (see there).
        modules=module_tree(app, permissions, sections) if sections is not None else [],
        permissions=sorted(permission.code for permission in permissions),
    )


def module_tree(
    app: str, permissions: set[Permission], sections: dict[uuid.UUID, AppSection]
) -> list[ModuleData]:
    """
    The parts of `app` these permissions let somebody SEE, as the app's own
    tree: modules, each with its sub-modules, each with its tabs (C79; the
    shape the owner chose for `/me`, 2026-11-19).

    AN APP ON THE SECTION TREE (the Admin panel) is answered from it, by
    `_visible_section_ids()`'s rules, in the menu's own order (`display_order`).
    A permission with no section -- the Admin panel's Dealers and Territories
    (Q64) -- shows nothing here.

    AN APP NOT ON IT YET (DMS, C79 amended) is answered the old way: the
    `module` of each permission held, as modules with no sub-modules, sorted.
    The same words as before, in the same shape as every other app, until DMS
    moves onto the tree and this branch goes.
    """
    if not any(section.app_id == app for section in sections.values()):
        return [
            ModuleData(code=code, sub_modules=[])
            for code in sorted({permission.module for permission in permissions})
        ]

    children: dict[uuid.UUID | None, list[AppSection]] = {}
    for section_id in _visible_section_ids(permissions, sections):
        section = sections[section_id]
        children.setdefault(section.parent_id, []).append(section)

    def under(parent_id: uuid.UUID | None) -> list[AppSection]:
        return sorted(children.get(parent_id, []), key=lambda s: (s.display_order, s.code))

    return [
        ModuleData(
            code=module.code,
            sub_modules=[
                SubModuleData(code=sub.code, tabs=[tab.code for tab in under(sub.id)])
                for sub in under(module.id)
            ],
        )
        for module in under(None)
    ]


def _visible_section_ids(
    permissions: set[Permission], sections: dict[uuid.UUID, AppSection]
) -> set[uuid.UUID]:
    """
    The sections these permissions let somebody SEE (C79, "what shows").

    A LEAF SHOWS IF THEY HOLD ITS `view`, and only its view: holding another
    action of a leaf without its view opens nothing (C79 rule 5) -- you cannot
    act on a page you cannot see.

    A SUB-MODULE OR MODULE SHOWS IF ANYTHING UNDER IT DOES. Nobody is granted
    a container, so each visible leaf brings every section above it, which is
    what lets a menu draw the path down to it.
    """
    visible: set[uuid.UUID] = set()
    for permission in permissions:
        if permission.action_id != VIEW_ACTION or permission.section_id is None:
            continue
        section_id: uuid.UUID | None = permission.section_id
        # Stop at a section already added: everything above it is in too.
        while section_id is not None and section_id not in visible:
            visible.add(section_id)
            section_id = sections[section_id].parent_id
    return visible


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
    # and "4 dealerships" must not count the region they sit in -- nor one of
    # `main`'s head offices until they are retired (`is_head_office`).
    count = Territory.objects.filter(
        organization_id=membership.organization_id,
        kind=TerritoryKind.DEALER,
        is_head_office__isnull=True,
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
    whose organization cancelled DMS therefore keeps `admin.user.*`, because
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

    # NO SECTIONS (`None`): a permission check never reads them, and this runs
    # on every request -- fetching the tree here would be a query for nothing.
    data = _membership_data(membership, catalogue, None, active_subscriptions)

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

    THIS ANSWERS SCOPE ONLY, never capability. Holding `admin.user.update` is
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

    AN INVITATION SITS NOWHERE (C83: no `unit` any more) -- like a member with
    no grants, only organisation-wide admins reach it.
    """
    if isinstance(person, Invitation):
        return can_manage(actor, None)
    return _person_inside(administers_within(actor), person)


def dealers_for(organization: Organization) -> list[Territory]:
    """
    Every dealership in this organization, with `user_count` annotated.

    `user_count` IS THE PEOPLE PLACED HERE by a grant. Pending invitations do
    not count: since C83 an invitation is a person with no place, so none is
    at a dealership until they have joined and been given an app there.

    DISABLED MEMBERSHIPS COUNT. They are switched off, not gone -- C24 is
    explicit that removing somebody deletes the membership -- so a dealership
    with three disabled people has three people, and reopening them changes no
    count.

    A SUBQUERY RATHER THAN A JOIN, so adding a second count later cannot
    multiply the rows (the annotate-twice bug this used to guard against).
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

    # ORDERED BY NAME EXPLICITLY. This used to come from `Meta.ordering`; the
    # territory manager now sorts by tree position, so alphabetical order has
    # to be asked for. DEALERS ONLY -- the dealers screen lists dealerships, and
    # the rest of the tree has its own endpoint (C72).
    return list(
        Territory.objects.filter(
            organization=organization, kind=TerritoryKind.DEALER, is_head_office__isnull=True
        )
        .annotate(
            user_count=Coalesce(Subquery(memberships, output_field=IntegerField()), Value(0))
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
    # "active" or "disabled" (the app tile's Disable). A pending person's
    # apps are always "active": there is nothing to disable before they join.
    status: str = "active"


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

    admin_role: AdminRoleData | None
    """
    The Admin panel role they hold, by name (C89) -- what the list and the
    panel CALL them. None for a pending person and for a dealer admin, whose
    administering comes from a DMS role, not the Admin panel.
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

    PENDING PEOPLE ARE SCOPED TOO. An invitation sits nowhere (C83), so only
    an organisation-wide viewer sees any; a dealer admin sees none. Forgetting
    the invitations here would be the same leak one table over.
    """
    memberships = (
        Membership.objects.filter(organization=organization)
        .select_related("user")
        .prefetch_related(*GRANTS_PREFETCH)
    )
    invitations = (
        Invitation.objects.filter(organization=organization, accepted_at__isnull=True)
        .prefetch_related("app_grants__role__permissions")
    )

    # BOTH SIDES FROM THE GRANTS (C72 step 2d): the same rule as managing a
    # person, so the list never shows somebody the actions would refuse. The
    # viewer's scope, subtrees included, is worked out ONCE -- not once per row.
    scope = administers_within(viewer)
    if scope is not None:
        invitations = invitations.none()
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
        SimpleNamespace(app_id=grant.app_id, role=held_role.role, status=grant.status)
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
        admin_role=admin_role_of(membership),
        # `invited` is not reachable here: C51 put pending people in the other
        # table, and `MembershipStatus.INVITED` went with it.
        status=membership.status,
        # NOT THE ADMINISTRATION GRANT (C72 step 2c). The frontend's edit form
        # sends this list back as `apps`, and `_resolve_grants` refuses
        # Administration there -- it arrives through `role: "admin"` instead.
        # Listing it would make every save of an organisation admin a 4xx.
        apps=[
            _grant(g.app_id, g.role, g.status) for g in grants if g.app_id != AppCode.ADMIN
        ],
        created_at=membership.created_at,
        # From ACTIVE grants: a dealer admin whose DMS is disabled administers
        # nothing, since the grant permits nothing.
        administers=_administers(
            membership.is_owner,
            reach(membership) is not None,
            [g.role for g in grants if g.status == GrantStatus.ACTIVE],
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
        # A PERSON, NOT YET PLACED OR APPOINTED (C83): no dealership, no
        # standing. The API's `role` word is "member" for them.
        unit_id=None,
        unit_name=None,
        role=MembershipRole.MEMBER,
        admin_role=None,
        status="invited",
        apps=[_grant(g.app_id, g.role) for g in grants],
        created_at=invitation.created_at,
        administers=None,
    )


def _grant(app: str, role, status: str = GrantStatus.ACTIVE) -> AppGrantData:
    """
    BOTH THE CODE AND THE NAME. The list displays the name and the edit form
    matches on the code; sending only the name made that form compare display
    strings, which it complained about in a comment and which breaks silently
    the first time a role is renamed.
    """
    return AppGrantData(app=app, role_code=role.code, role_name=role.name, status=str(status))


def _administers(is_owner: bool, at_a_dealership: bool, roles: list) -> str | None:
    """
    Whether this person administers, and WHERE -- not what they may do there.

    ORDER MATTERS. The owner, and anybody holding ANY Admin panel role, comes
    first: they administer organisation-wide whatever else they hold -- an
    Administration grant always sits at the root, so the second branch could
    never fire for them anyway.

    ANY ADMIN PANEL ROLE, NOT ONLY ORGANISATION ADMIN (C89). Somebody given the
    organisation's own "Application Admin" reaches the whole organisation, and
    does there only what that role permits. What they are CALLED is
    `admin_role_of()`; this is only the reach.

    `roles` are their ACTIVE grants' roles (C72 step 2c). An invitation
    administers nothing (C83) and does not ask.

    `role.administers` is derived from the permissions the role grants (C44),
    so this cannot drift from what the role actually confers. Prefetch
    `role__permissions` before calling it in a loop.
    """
    if is_owner or any(role.app_id == AppCode.ADMIN for role in roles):
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


# --- The organisation's profile (C78) -----------------------------------------


@dataclass(frozen=True)
class OwnerData:
    name: str
    email: str


@dataclass(frozen=True)
class OrganizationProfileData:
    name: str
    slug: str
    created_at: datetime
    is_ready: bool
    owner: OwnerData | None


def organization_profile(organization: Organization) -> OrganizationProfileData:
    """
    What the Admin panel's Organization -> Profile page shows: only what the
    platform already stores (the owner, 2026-11-17 -- nothing editable yet).

    `owner` is None only for an organisation with no owner row, which the
    database's one-owner rule makes a broken record rather than a real state;
    answering None keeps the page up instead of turning it into a 500.
    """
    owner = (
        Membership.objects.filter(organization=organization, is_owner=True)
        .select_related("user")
        .first()
    )
    return OrganizationProfileData(
        name=organization.name,
        slug=organization.slug,
        created_at=organization.created_at,
        is_ready=organization.is_ready,
        owner=_owner_data(owner.user) if owner else None,
    )


def _owner_data(user: User) -> OwnerData:
    # A name if they gave one, otherwise the address: never a blank line.
    full = f"{user.first_name} {user.last_name}".strip()
    return OwnerData(name=full or user.email, email=user.email)


# --- The organisation's applications (C78) ------------------------------------


@dataclass(frozen=True)
class ApplicationData:
    code: str
    name: str
    active: bool
    members: int
    owner: OwnerData | None


def applications_for(organization: Organization) -> list[ApplicationData]:
    """
    Every app the platform sells, as the Admin panel's Applications page lists
    it: whether this organisation subscribes, who owns it, and how many people
    can open it. Administration itself is not an app you buy, so it is not here.

    ACTIVE is an active subscription. A cancelled one is inactive, and its
    leftover grants open nothing (C16), so it counts no members.

    MEMBERS are the people who can open it today: active members holding a
    grant for it, plus the owner, who holds every app by rule (C72) and is
    counted once even if they also hold a grant.

    OWNER is the organisation's owner, on every active app -- the owner's
    choice, 2026-11-17, until apps have owners of their own.

    Three queries whatever the number of apps or people.
    """
    owner_row = (
        Membership.objects.filter(organization=organization, is_owner=True)
        .select_related("user")
        .first()
    )
    active = set(
        AppSubscription.objects.filter(
            organization=organization, status=SubscriptionStatus.ACTIVE
        ).values_list("app_id", flat=True)
    )
    holders: dict[str, set[uuid.UUID]] = {}
    for app_code, membership_id in MembershipAppAccess.objects.filter(
        membership__organization=organization,
        membership__status=MembershipStatus.ACTIVE,
    ).values_list("app_id", "membership_id"):
        holders.setdefault(app_code, set()).add(membership_id)

    result = []
    for app in App.objects.exclude(code=AppCode.ADMIN).order_by("display_order", "code"):
        is_active = app.code in active
        people = set(holders.get(app.code, set()))
        if owner_row is not None:
            people.add(owner_row.pk)
        result.append(
            ApplicationData(
                code=app.code,
                name=app.name,
                active=is_active,
                members=len(people) if is_active else 0,
                owner=_owner_data(owner_row.user) if is_active and owner_row else None,
            )
        )
    return result



@dataclass(frozen=True)
class ApplicationMemberData:
    id: uuid.UUID
    name: str
    email: str
    is_owner: bool
    role: str | None
    places: list[str]


def application_members(organization: Organization, app_code: str) -> list[ApplicationMemberData]:
    """
    The people who can open one app, for its panel on the Applications page
    (C78): exactly the people `applications_for()` counts as its members.

    Active members holding a grant for it, each with the role and the places
    that grant gives them, and the owner -- first, and once -- who holds every
    app by rule (C72) and so may have no grant of their own (`role` None).

    An app that is not subscribed opens for nobody (C16): an empty list.
    Administration, or a code that is not an app, is 404 -- it is not on the
    Applications page, so it has no panel.

    Three queries for the grants (with their roles and places) plus three for
    the app, its subscription and the owner, however many people.
    """
    app = App.objects.exclude(code=AppCode.ADMIN).filter(code=app_code).first()
    if app is None:
        raise not_found("Application")

    subscribed = AppSubscription.objects.filter(
        organization=organization, app=app, status=SubscriptionStatus.ACTIVE
    ).exists()
    if not subscribed:
        return []

    grants = (
        MembershipAppAccess.objects.filter(
            app=app,
            membership__organization=organization,
            membership__status=MembershipStatus.ACTIVE,
        )
        .select_related("membership__user")
        .prefetch_related(
            Prefetch("roles", queryset=MembershipAppRole.objects.select_related("role")),
            Prefetch(
                "territories",
                queryset=MembershipAppTerritory.objects.select_related(
                    "territory__organization"
                ),
            ),
        )
    )

    people: dict[uuid.UUID, ApplicationMemberData] = {}
    for grant in grants:
        membership = grant.membership
        role = next(iter(grant.roles.all()), None)
        people[membership.pk] = ApplicationMemberData(
            id=membership.pk,
            name=_owner_data(membership.user).name,
            email=membership.user.email,
            is_owner=bool(membership.is_owner),
            role=role.role.name if role else None,
            places=sorted(
                placement.territory.display_name for placement in grant.territories.all()
            ),
        )

    owner = (
        Membership.objects.filter(organization=organization, is_owner=True)
        .select_related("user")
        .first()
    )
    if owner is not None and owner.pk not in people:
        people[owner.pk] = ApplicationMemberData(
            id=owner.pk,
            name=_owner_data(owner.user).name,
            email=owner.user.email,
            is_owner=True,
            role=None,
            places=[],
        )

    return sorted(people.values(), key=lambda person: (not person.is_owner, person.name.lower()))


# --- An app's own Users page (C78 app settings; DMS first) ------------------


@dataclass(frozen=True)
class AppRoleData:
    code: str
    name: str


@dataclass(frozen=True)
class AppUserData:
    """
    One row of an app's own Users list (DMS settings -> Users & Roles -> Users).
    Mirrors `AppUser` in `products/dms/app-settings/api.ts`.
    """

    id: uuid.UUID
    """A MEMBERSHIP id -- or an INVITATION id for somebody pending (no membership yet)."""

    first_name: str
    last_name: str
    email: str
    is_owner: bool
    role: AppRoleData | None
    """Their role in THIS app. None for the owner, who holds every app by rule (C72)."""

    territories: list[str]
    """Where the grant places them. Empty for the owner (everywhere) and the pending."""

    status: str
    """
    `active`, `inactive` or `pending` -- whether they can open THIS app now.

    INACTIVE IS EITHER SWITCH: their account deactivated in the organisation,
    or their access to this app disabled (the app tile's Disable, C85). Both
    leave them unable to open the app, which is what this list is about.
    """

    created_at: datetime
    """Not displayed: the order, as the Admin panel's Users list (arrival, oldest first)."""


APP_USER_ACTIVE = "active"
APP_USER_INACTIVE = "inactive"
APP_USER_PENDING = "pending"


def app_users(organization: Organization, app_code: str) -> list[AppUserData]:
    """
    Everybody who holds one app, for that app's own Users page (the owner,
    2026-11-23): the OWNER FIRST AND ALWAYS -- every app has the owner by
    default -- then the people holding a grant for it, active or not, then the
    invitations that carry one, in the order they arrived.

    UNLIKE `application_members()`, which counts who can open the app now,
    this lists the switched-off and the pending too, each with a `status`, so
    the page's filter has something to filter.

    An app that is not subscribed opens for nobody (C16): an empty list.
    Administration, or a code that is not an app, is 404.

    WHOLE ORGANISATION, NOT SCOPED to the caller's places: only the owner
    reaches it today (`dms.user.view`, held by no role). An app admin narrowed
    to a territory will need scoping here before they are given it.
    """
    app = App.objects.exclude(code=AppCode.ADMIN).filter(code=app_code).first()
    if app is None:
        raise not_found("Application")

    subscribed = AppSubscription.objects.filter(
        organization=organization, app=app, status=SubscriptionStatus.ACTIVE
    ).exists()
    if not subscribed:
        return []

    owner = (
        Membership.objects.filter(organization=organization, is_owner=True)
        .select_related("user")
        .first()
    )

    grants = (
        MembershipAppAccess.objects.filter(app=app, membership__organization=organization)
        .exclude(membership__is_owner=True)
        .select_related("membership__user")
        .prefetch_related(
            Prefetch("roles", queryset=MembershipAppRole.objects.select_related("role")),
            Prefetch(
                "territories",
                queryset=MembershipAppTerritory.objects.select_related(
                    "territory__organization"
                ),
            ),
        )
    )
    invitation_grants = InvitationAppGrant.objects.filter(
        app=app,
        invitation__organization=organization,
        invitation__accepted_at__isnull=True,
    ).select_related("invitation", "role")

    people: list[AppUserData] = []
    for grant in grants:
        membership = grant.membership
        held = next(iter(grant.roles.all()), None)
        can_open = (
            membership.status == MembershipStatus.ACTIVE and grant.status == GrantStatus.ACTIVE
        )
        people.append(
            AppUserData(
                id=membership.pk,
                first_name=membership.user.first_name,
                last_name=membership.user.last_name,
                email=membership.user.email,
                is_owner=False,
                role=AppRoleData(held.role.code, held.role.name) if held else None,
                territories=sorted(
                    placement.territory.display_name for placement in grant.territories.all()
                ),
                status=APP_USER_ACTIVE if can_open else APP_USER_INACTIVE,
                created_at=membership.created_at,
            )
        )
    for invitation_grant in invitation_grants:
        invitation = invitation_grant.invitation
        people.append(
            AppUserData(
                id=invitation.pk,
                first_name=invitation.first_name,
                last_name=invitation.last_name,
                email=invitation.email,
                is_owner=False,
                role=AppRoleData(invitation_grant.role.code, invitation_grant.role.name),
                # AN INVITATION SITS NOWHERE (C83): placed when they join.
                territories=[],
                status=APP_USER_PENDING,
                created_at=invitation.created_at,
            )
        )

    # Arrival order, the id breaking ties (two rows in one transaction can
    # share a timestamp) -- as `org_users()` does, and for the same reason.
    people.sort(key=lambda person: (person.created_at, str(person.id)))

    if owner is None:
        return people
    owner_row = AppUserData(
        id=owner.pk,
        first_name=owner.user.first_name,
        last_name=owner.user.last_name,
        email=owner.user.email,
        is_owner=True,
        role=None,
        territories=[],
        status=APP_USER_ACTIVE,
        created_at=owner.created_at,
    )
    return [owner_row, *people]


# --- The Admin panel's roles (C78, Admins and Roles -> Roles) ---------------

# The one built-in Administration role (Q60; `permissions/0010`). Services
# reads it from here.
ORGANISATION_ADMIN_ROLE = "admin.org_admin"


def _owners(organization: Organization):
    """The organisation's owner, as a queryset (one row; `is_owner` is unique)."""
    return Membership.objects.filter(organization=organization, is_owner=True)


def _admin_members(organization: Organization):
    """
    Its ORGANISATION ADMINS -- active or deactivated: members holding the
    built-in Organisation admin role, the rule `standing()` reads (C89). NOT
    everybody with an Administration grant: a custom role's holders are
    counted on that role's own row. The owner is never one, as in `standing()`.
    One grant per person per app (`grant_unique_membership_app`), so no person
    comes back twice.
    """
    return _panel_role_holders(organization).filter(
        grants__roles__role__code=ORGANISATION_ADMIN_ROLE
    )


def _panel_role_holders(organization: Organization):
    """
    Everybody but the owner holding ANY Admin panel role -- Organisation admin
    or one of the organisation's own (C89): the Admins tab's people.
    """
    return Membership.objects.filter(
        organization=organization, is_owner__isnull=True, grants__app_id=AppCode.ADMIN
    )


@dataclass(frozen=True)
class PanelRoleData:
    code: str
    name: str
    summary: str
    built_in: bool
    users: int
    modified_by: str | None
    # Whether THE VIEWER may give it in Assign Admin (C89): it grants nothing
    # they do not hold. Never the owner's row -- ownership is not given.
    grantable: bool = False


def admin_panel_roles(
    organization: Organization, viewer: Membership | None = None
) -> list[PanelRoleData]:
    """
    The Admin panel's roles, as its Roles tab lists them (the owner,
    2026-11-18): Organization Owner, Organization Admin, then the
    organisation's own (C88). App roles (DMS's) are not here -- they belong to
    each app's own settings, which are not built yet (C78).

    ORGANIZATION OWNER IS NOT A `Role` ROW. The owner holds everything by rule
    (C72 step 2c), so its row is written here. ORGANIZATION ADMIN IS the
    "Organisation admin" role (Q60); its summary comes from that row.

    USERS COUNTS EVERYONE HOLDING IT (the owner, 2026-11-18): active,
    deactivated and pending -- exactly the people the Users page's "All users"
    filter and the Admins tab show with that role. EACH ROLE COUNTS ITS OWN
    HOLDERS (C89): Organization Admin is the built-in role's, never somebody
    holding a custom one, so nobody is counted twice. Nobody is invited AS an
    admin any more (C83), so pending invitations never count.

    THE SAME PEOPLE THE ADMINS TAB LISTS (`admins_for()`): both count from
    `_owners()` and `_admin_members()`, so the number here and the rows there
    cannot disagree.

    Three queries, however many people.
    """
    owners = _owners(organization).count()
    admin_members = _admin_members(organization).count()
    org_admin = Role.objects.prefetch_related("permissions").get(
        app_id=AppCode.ADMIN, code=ORGANISATION_ADMIN_ROLE
    )
    may_give = _may_give(viewer)

    return [
        PanelRoleData(
            code="owner",
            name=OWNER_ROLE_NAME,
            summary="Every permission, by rule — including the ones no role can give.",
            built_in=True,
            users=owners,
            modified_by=None,
        ),
        PanelRoleData(
            code=org_admin.code,
            name=ORGANISATION_ADMIN_NAME,
            summary=org_admin.summary,
            built_in=True,
            users=admin_members,
            modified_by=None,
            grantable=may_give(org_admin),
        ),
        *_custom_panel_roles(organization, may_give),
    ]


def _may_give(viewer: Membership | None):
    """
    Whether `viewer` may give a role in Assign Admin: never beyond their own
    access (the owner chose (b), 2026-11-23) -- the owner may give any. The
    same rule `assign_admin_role()` enforces; this only greys the picker.
    Prefetch the roles' `permissions`.
    """
    if viewer is None:
        return lambda role: False
    if viewer.is_owner:
        return lambda role: True
    held = permissions_for(viewer)
    return lambda role: {p.code for p in role.permissions.all()} <= held


def _custom_panel_roles(organization: Organization, may_give) -> list[PanelRoleData]:
    """
    The organisation's OWN Admin panel roles (the role builder, C72 piece 5),
    after the built-ins, oldest first. Users counts the members holding one;
    Modified By is whoever last saved it.
    """
    roles = list(
        Role.objects.filter(organization_id=organization.id, app_id=AppCode.ADMIN)
        .prefetch_related("permissions")
        .order_by("created_at", "name")
    )
    if not roles:
        return []

    holders = dict(
        MembershipAppRole.objects.filter(role__in=roles)
        .values("role_id")
        .annotate(n=Count("app_access__membership", distinct=True))
        .values_list("role_id", "n")
    )
    editor_ids = {r.updated_by_user_id or r.created_by_user_id for r in roles} - {None}
    editors = {user.id: _owner_data(user).name for user in User.objects.filter(id__in=editor_ids)}

    return [
        PanelRoleData(
            code=role.code,
            name=role.name,
            summary=role.summary,
            built_in=False,
            users=holders.get(role.id, 0),
            modified_by=editors.get(role.updated_by_user_id or role.created_by_user_id),
            grantable=may_give(role),
        )
        for role in roles
    ]


# --- The role builder (C72 piece 5): Admins and Roles -> Roles -> Add Role ----


@dataclass(frozen=True)
class BuilderActionData:
    code: str
    name: str
    kind: str
    permission: str


@dataclass(frozen=True)
class BuilderRowData:
    code: str
    name: str
    actions: list[BuilderActionData]


@dataclass(frozen=True)
class BuilderModuleData:
    code: str
    name: str
    rows: list[BuilderRowData]


@dataclass(frozen=True)
class BuilderTemplateData:
    code: str
    name: str
    permissions: list[str]


@dataclass(frozen=True)
class RoleBuilderData:
    modules: list[BuilderModuleData]
    templates: list[BuilderTemplateData]


def role_builder(organization: Organization) -> RoleBuilderData:
    """
    What the New Role grid draws (the owner, 2026-11-20, as Zoho's): the Admin
    panel's section tree, READ FROM THE TABLES (C79) -- each module a card,
    each leaf a row, each of the leaf's permissions an action (basic ones
    become the fixed columns, special ones "More Permissions"). A new page or
    action appears here with its migration; nothing is typed in twice.

    `templates` are what "Copy permissions from" offers: the built-in
    Organization Admin and the organisation's own Admin panel roles -- never
    another organisation's.

    Three queries.
    """
    sections = list(
        AppSection.objects.filter(app_id=AppCode.ADMIN).order_by("display_order", "name")
    )
    by_id = {section.id: section for section in sections}
    linked = (
        Permission.objects.filter(app_id=AppCode.ADMIN, section__isnull=False)
        .select_related("action")
        .order_by("action__display_order", "code")
    )
    actions_of: dict[uuid.UUID, list[BuilderActionData]] = {}
    for permission in linked:
        actions_of.setdefault(permission.section_id, []).append(
            BuilderActionData(
                code=permission.action_id,
                name=permission.action.name,
                kind=permission.action.kind,
                permission=permission.code,
            )
        )

    def top_of(section):
        while section.parent_id is not None:
            section = by_id[section.parent_id]
        return section

    def walk(parent_id):
        """Leaves under `parent_id`, in menu order, depth first."""
        for section in [s for s in sections if s.parent_id == parent_id]:
            if section.id in actions_of:
                yield section
            yield from walk(section.id)

    modules: dict[uuid.UUID, BuilderModuleData] = {}
    for leaf in walk(None):
        top = top_of(leaf)
        module = modules.setdefault(
            top.id, BuilderModuleData(code=top.code, name=top.name, rows=[])
        )
        module.rows.append(
            BuilderRowData(code=leaf.code, name=leaf.name, actions=actions_of[leaf.id])
        )

    on_tree = {permission.code for permission in linked}
    templates = [
        BuilderTemplateData(
            code=role.code,
            name=ORGANISATION_ADMIN_NAME if role.code == ORGANISATION_ADMIN_ROLE else role.name,
            permissions=sorted(p.code for p in role.permissions.all() if p.code in on_tree),
        )
        for role in roles_for_organization(organization.id)
        .filter(app_id=AppCode.ADMIN)
        .prefetch_related("permissions")
        .order_by("organization_id", "created_at")
    ]
    return RoleBuilderData(modules=list(modules.values()), templates=templates)


# --- The Admin panel's admins (C78, Admins and Roles -> Admins) -------------


@dataclass(frozen=True)
class ManagedAppData:
    code: str
    name: str


@dataclass(frozen=True)
class AdminData:
    id: uuid.UUID
    first_name: str
    last_name: str
    email: str
    # "owner", "admin" (Organisation admin) or "custom" (one of the
    # organisation's own Admin panel roles) -- the tab's filter (C89).
    role: str
    # The role itself, by the name the Roles tab gives it.
    admin_role: AdminRoleData
    status: str
    apps_managed: list[ManagedAppData]


def admins_for(organization: Organization) -> list[AdminData]:
    """
    The organisation's admins, as the Admins tab lists them (C78): its owner
    and EVERYBODY HOLDING AN ADMIN PANEL ROLE -- Organisation admin or one of
    the organisation's own (C89) -- active or deactivated, each named by the
    role they hold. Nobody is invited as an admin any more (C83), so there are
    no pending ones. Never a member, never a dealer admin (they administer one
    dealership through a DMS role, not the organisation).

    ITS OWN ENDPOINT, NOT THE USERS LIST (C79: the server checks what the
    screen does). It needs `admin.admin.view`, not `admin.user.view`, and it
    sends only these people and only what the tab and its panel show.

    THE SAME PEOPLE THE ROLES TAB COUNTS: built from `_owners()` and
    `_admin_members()`, like `admin_panel_roles()`.

    `id` is the membership's -- the same id the Users page uses for that
    person. `status` is `active` or `disabled`.

    APPS MANAGED is every app the organisation subscribes to for the owner
    (every app by rule) and an Organisation admin (the whole organisation; C72,
    the owner 2026-11-18) -- and NONE for a custom role's holder (C89), who
    does in the Admin panel only what that role permits and manages no app.
    Sent with the row, so the panel needs no second endpoint -- and no second
    permission.

    THE OWNER FIRST, then in the order people were added, like the Users page.
    A fixed number of queries, however many admins (the grants are prefetched).
    """
    active = set(
        AppSubscription.objects.filter(
            organization=organization, status=SubscriptionStatus.ACTIVE
        ).values_list("app_id", flat=True)
    )
    apps = [
        ManagedAppData(code=app.code, name=app.name)
        for app in App.objects.exclude(code=AppCode.ADMIN)
        .filter(code__in=active)
        .order_by("display_order", "code")
    ]

    def member_row(membership: Membership) -> AdminData:
        held = admin_role_of(membership)
        assert held is not None  # both querysets below hold an Admin panel role
        kind = (
            MembershipRole.OWNER
            if membership.is_owner
            else MembershipRole.ADMIN
            if held.code == ORGANISATION_ADMIN_ROLE
            else "custom"
        )
        return AdminData(
            id=membership.id,
            first_name=membership.user.first_name,
            last_name=membership.user.last_name,
            email=membership.user.email,
            role=kind,
            admin_role=held,
            status=membership.status,
            apps_managed=apps if kind != "custom" else [],
        )

    owners = [member_row(m) for m in _owners(organization).select_related("user")]
    admins = [
        (m.created_at, str(m.id), member_row(m))
        for m in _panel_role_holders(organization)
        .select_related("user")
        .prefetch_related(*GRANTS_PREFETCH)
    ]
    return owners + [row for _, _, row in sorted(admins, key=lambda entry: entry[:2])]



# ---------------------------------------------------------------------------
# People who can be given work on a DMS record (Nishanth's C-local-4, from
# `main`; rewritten on grants in the merge, 2026-11-23).
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class UnitPerson:
    user_id: uuid.UUID
    name: str
    email: str


def dms_people_for_territory(
    *, organization: Organization, territory_id: uuid.UUID | None
) -> list[UnitPerson]:
    """
    Who can be assigned work (a visit, a complaint) on a record filed at
    `territory_id`: the people whose ACTIVE DMS grant places them exactly
    there. At the ROOT -- the head office (C82 amended) -- that is the
    organisation's own people, and the owner, who holds DMS by rule.

    Never both: a dealer's visit is not handed to head-office staff, nor the
    other way round (Nishanth's rule, kept). EXACTLY there, not the subtree: a
    region's record goes to the people placed at that region -- whether it
    should also reach the dealerships under it is an open question in the
    merge plan.

    `main`'s version read `Membership.unit` and `AppAccess`, which this branch
    deleted (C72 step 2d); this reads the grants. A disabled grant opens and
    permits nothing (C85), so it puts nobody in the list. Which ROLE they hold
    is deliberately not a filter (Nishanth's rule, kept).
    """
    if territory_id is None:
        return []
    try:
        territory = Territory.objects.filter(id=territory_id, organization=organization).first()
    except (DjangoValidationError, ValueError):
        return []
    if territory is None:
        return []

    members = [
        grant.membership
        for grant in MembershipAppAccess.objects.filter(
            app_id=AppCode.DMS,
            status=GrantStatus.ACTIVE,
            membership__organization=organization,
            membership__status=MembershipStatus.ACTIVE,
            membership__user__is_active=True,
            territories__territory=territory,
        ).select_related("membership__user")
    ]
    if territory.is_root:
        owner = (
            Membership.objects.filter(
                organization=organization,
                is_owner=True,
                status=MembershipStatus.ACTIVE,
                user__is_active=True,
            )
            .select_related("user")
            .first()
        )
        if owner is not None:
            members.append(owner)

    people = {
        m.user_id: UnitPerson(
            user_id=m.user_id,
            name=f"{m.user.first_name} {m.user.last_name}".strip() or m.user.email,
            email=m.user.email,
        )
        for m in members
    }
    return sorted(people.values(), key=lambda p: p.name.lower())
