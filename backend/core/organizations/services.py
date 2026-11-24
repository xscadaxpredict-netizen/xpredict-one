"""
Write logic for founding an organization.

One public function per user action, one transaction (CLAUDE.md). Nothing here
is HTTP-aware: `sign_up()` is called by a DRF view today and must stay callable
from a management command, a Celery task and a test.

WHAT THIS DOES NOT DO YET: provision the tenant database. C14's third step is
a Celery task fired on `transaction.on_commit` that creates the database named
by `Organization.db_name` and migrates it. Until that exists, signup leaves an
organization whose `db_name` points at a database that is not there. That is
survivable precisely because `/me` and Administration are control-plane only
--- the first DMS query is what needs the tenant database, and there are no DMS
models yet. It is NOT survivable once there are, so provisioning lands before
Phase 5.
"""

from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify
from treebeard.exceptions import InvalidMoveToDescendant

from core.accounts.models import User
from core.billing.models import AppSubscription, SubscriptionStatus
from core.organizations.exceptions import (
    ActivationCodeExpiredError,
    ActivationCodeInvalidError,
    ActivationCodeSpentError,
    AdminAtDealershipError,
    AdministrationNotGrantableError,
    AdminNotJoinedError,
    AlreadyAnAdminError,
    AppAlreadyHeldError,
    AppNotSubscribedError,
    AppNotYetInUseError,
    BuiltInRoleUnchangeableError,
    DealerAlreadyClosedError,
    DealerAlreadyOpenError,
    DealerCodeTakenError,
    DealerNameTakenError,
    DealerScopedAppError,
    EmailAlreadyRegisteredError,
    GrantNeedsTerritoryError,
    InvitationAlreadyAcceptedError,
    InvitationExpiredError,
    InvitationNeedsSignInError,
    InvitationWrongAccountError,
    NotAnAdminError,
    NotAnInvitationError,
    OrganizationNameUnusableError,
    OwnAdminRoleError,
    OwnerHoldsEveryAppError,
    OwnerProtectedError,
    PersonEmailTakenError,
    RoleBeyondOwnAccessError,
    RoleInUseError,
    RoleNameTakenError,
    RoleNotInAppError,
    RoleScopeMismatchError,
    SignInAddressLockedError,
    TerritoryAlreadyClosedError,
    TerritoryAlreadyOpenError,
    TerritoryCodeTakenError,
    TerritoryGstinRequiredError,
    TerritoryIsTheOrganisationError,
    TerritoryMoveIntoItselfError,
    TerritoryNameTakenError,
    TerritoryOfAnotherAppError,
    TerritoryPlacementError,
)
from core.organizations.identifiers import extract_pan
from core.organizations.models import (
    ActivationCode,
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
from core.organizations.selectors import (
    GRANTS_PREFETCH,
    ORGANISATION_ADMIN_ROLE,
    admin_panel_role,
    can_manage,
    can_manage_person,
    permissions_for,
    reach,
)
from core.organizations.tasks import schedule_provisioning
from core.permissions.models import (
    VIEW_ACTION,
    App,
    AppCode,
    Permission,
    Role,
    RoleLevel,
    RolePermission,
    roles_for_organization,
)
from shared.exceptions import AuthorizationError, FieldError, InvalidInputError, not_found

# WHAT A NEW ORGANIZATION IS SUBSCRIBED TO. DMS only, because DMS is the
# product being built (C4 commits to CRM and E-commerce; neither exists). It is
# a parameter rather than a constant inside the function so that the day this
# becomes a sales decision --- different plans buying different apps --- the
# caller decides and this function does not change.
DEFAULT_SUBSCRIBED_APPS: tuple[str, ...] = (AppCode.DMS,)

# The role the founding owner is given in each app (C41).
#
# EXPLICIT PER APP, not "the first org-level role we find". DMS has two
# org-level roles --- Fleet viewer reads and Group operations works --- and
# picking by a heuristic would silently hand over whichever happened to sort
# first. C41 names Group operations: they own the place, and downgrading
# themselves is one edit.
#
# E-commerce is absent because it is deferred and has no roles at all (Q15).
# Subscribing an app with no entry here raises rather than creating a
# membership that cannot open the app it was just sold.
OWNER_SEED_ROLE: dict[str, str] = {
    AppCode.DMS: "dms.group_operations",
    AppCode.CRM: "crm.member",
}

# MySQL caps an identifier at 64 characters (C46). `db_name` is this prefix
# plus the slug, and the prefix is not decorative: the dev grant is on
# `xpredict\_%`, so a database named anything else cannot be created by the
# application at all.
DB_NAME_PREFIX = "xpredict_"
DB_NAME_MAX_LENGTH = 64

SLUG_MAX_LENGTH = 60


@dataclass(frozen=True)
class SignupResult:
    """What signup created, for the caller to serialise or log."""

    user: User
    organization: Organization
    membership: Membership


@transaction.atomic
def sign_up(
    *,
    activation_code: str,
    organization_name: str,
    email: str,
    password: str,
    first_name: str = "",
    last_name: str = "",
    subscribed_apps: tuple[str, ...] = DEFAULT_SUBSCRIBED_APPS,
) -> SignupResult:
    """
    Found an organization and its owner, once, against a single-use code (C14).

    Everything or nothing: the account, the organization, the owner membership,
    the subscriptions, the app grants and the spending of the code are one
    transaction. A partial signup would leave either a code that is spent with
    no organization, or an organization nobody can sign in to.
    """
    email = User.objects.normalize_email(email).lower()

    # Checked before the code is claimed, so a bad email does not burn a code.
    if User.objects.filter(email=email).exists():
        raise EmailAlreadyRegisteredError(context_email=email)

    code = _claim_activation_code(activation_code)

    slug = _derive_unique_slug(organization_name)
    db_name = _derive_db_name(slug)

    user = User.objects.create_user(
        email=email,
        password=password,
        first_name=first_name,
        last_name=last_name,
    )

    organization = Organization.objects.create(
        name=organization_name.strip(),
        slug=slug,
        db_name=db_name,
        # From settings, once, at creation (C46). The ROW is the only source of
        # a tenant host from here on --- nothing reads settings for it again,
        # which is what stops the two drifting.
        db_host=settings.DATABASES["default"]["HOST"],
        db_port=int(settings.DATABASES["default"]["PORT"] or 3306),
    )

    # DMS'S TERRITORY TREE STARTS HERE (C72; per app since 2026-11-24): its
    # root box, kind `organisation`, created with the organisation in the same
    # transaction. Every other app's root is made on first use (`root_for`).
    Territory.objects.root_for(organization, AppCode.DMS)

    membership = Membership.objects.create(
        user=user,
        organization=organization,
        status=MembershipStatus.ACTIVE,
        # Exactly one owner per organization, expressed the MySQL way: True for
        # the owner and NULL for everyone else, unique on (organization,
        # is_owner). Set HERE rather than left to a signal.
        is_owner=True,
        # An owner is organisation-wide by rule (C72): no place to record.
        created_by_user_id=user.id,
    )

    # NO HEAD OFFICE IS MADE HERE (merge with `main`, 2026-11-23): `main`
    # created one per organisation (C-local-4); the ROOT made above is the head
    # office now (C82 amended, the owner).

    for app in subscribed_apps:
        _subscribe_and_grant(organization, membership, app, actor_id=user.id)

    code.spent_at = timezone.now()
    code.organization = organization
    code.save(update_fields=["spent_at", "organization", "updated_at"])

    # AFTER COMMIT, never inside this transaction (C1, C14 step three).
    # `CREATE DATABASE` is DDL that MySQL cannot roll back, so a task that ran
    # inline would leave an orphan database behind if anything below it failed
    # -- and a worker could pick the job up before this row was even visible.
    schedule_provisioning(organization)

    return SignupResult(user=user, organization=organization, membership=membership)


def check_activation_code(raw: str) -> None:
    """
    Would this code be accepted right now? Raises if not, returns nothing.

    READ-ONLY, AND IT PROMISES NOTHING ABOUT LATER. It takes no lock and
    changes nothing, so a code that passes here can still be spent by somebody
    else before the signup form is submitted. That race is real and it is
    fine: it is C14's first step existing to avoid making a customer fill in a
    long form before being told the code is wrong, not a reservation.
    `sign_up()` re-checks under a lock, which is the check that counts.

    It shares `_assert_code_usable` with the claiming path so the three
    failures cannot drift into two different answers for the same code.
    """
    try:
        code = ActivationCode.objects.get(code=raw.strip())
    except ActivationCode.DoesNotExist as exc:
        raise ActivationCodeInvalidError() from exc

    _assert_code_usable(code)


def _claim_activation_code(raw: str) -> ActivationCode:
    """
    Take exclusive hold of an unspent code, or raise saying exactly why.

    `select_for_update` IS LOAD-BEARING, not defensive habit. The unique index
    on `code` does not help here: two simultaneous signups would both read the
    same unspent row, both see `spent_at IS NULL`, and both proceed. The row
    lock makes the second wait and then find it spent.
    """
    try:
        code = ActivationCode.objects.select_for_update().get(code=raw.strip())
    except ActivationCode.DoesNotExist as exc:
        raise ActivationCodeInvalidError() from exc

    _assert_code_usable(code)
    return code


def _assert_code_usable(code: ActivationCode) -> None:
    """
    THREE DISTINCT FAILURES, on purpose (C14). Login is vague because an
    attacker is guessing; this is the opposite --- the code was handed to this
    customer, and "invalid" when they mean "already used" is a support call.
    """
    if code.spent_at is not None:
        raise ActivationCodeSpentError(code_id=str(code.id))

    if code.expires_at is not None and code.expires_at <= timezone.now():
        raise ActivationCodeExpiredError(code_id=str(code.id))


def _derive_unique_slug(organization_name: str) -> str:
    """
    The slug from the name, made unique by suffixing.

    IT IS IN EVERY URL THEY WILL EVER USE (C14 shows it during signup for that
    reason), and the org comes from the path rather than the token (C3), so it
    cannot be changed casually later. A collision suffix is appended rather
    than refusing the name: two real companies may share a name, and telling
    the second one to pick a different one is absurd.
    """
    base = slugify(organization_name)[:SLUG_MAX_LENGTH].strip("-")

    if not base:
        # Names that slugify to nothing: punctuation, or a script slugify does
        # not transliterate. A real case, not a hypothetical, and the honest
        # answer is to ask for something usable rather than invent one.
        raise OrganizationNameUnusableError(
            "That organisation name cannot be turned into a web address. "
            "Please include some letters or numbers.",
            code="organization_name_unslugifiable",
        )

    candidate = base
    suffix = 2
    while Organization.objects.filter(slug=candidate).exists():
        tail = f"-{suffix}"
        candidate = f"{base[: SLUG_MAX_LENGTH - len(tail)]}{tail}"
        suffix += 1

    return candidate


def _derive_db_name(slug: str) -> str:
    """
    The tenant database name for a slug.

    CHECKED ON WRITE, which is the whole point (C46). MySQL caps an identifier
    at 64 characters; discovering that at provisioning time means a Celery task
    failing minutes after a customer finished signing up, by which time the
    organization exists and the code is spent.
    """
    db_name = f"{DB_NAME_PREFIX}{slug.replace('-', '_')}"

    if len(db_name) > DB_NAME_MAX_LENGTH:
        raise OrganizationNameUnusableError(
            "That organisation name is too long. Please use a shorter one.",
            code="organization_name_too_long",
            db_name_length=len(db_name),
        )

    return db_name


def _subscribe_and_grant(
    organization: Organization,
    membership: Membership,
    app: str,
    *,
    actor_id,
) -> None:
    """
    Buy an app for the organization and let the owner into it (C16, C41).

    `AppSubscription` says the organization pays; the grant says where the
    owner sits in it.

    C41 REJECTED AN IMPLICIT "OR is_owner" AND C72 REVERSED THAT: since step
    2c the owner holds every permission of every subscribed app by rule
    (`_membership_data`), so the grant written here no longer decides what the
    owner can do. It stays until step 2d retires the old tables, and keeps the
    owner's data shaped like everybody else's in the meantime.
    """
    if app == AppCode.ADMIN:
        # Administration is neither sold nor granted: it comes with the
        # platform and is gated by standing and permissions (C40). Both tables
        # have a check constraint refusing it, so this would be an IntegrityError
        # rather than a quiet mistake --- but failing here says why.
        raise ValueError(
            "Administration is not subscribable or grantable (C40). "
            "The owner holds it by rule, through is_owner (C72)."
        )

    try:
        role_code = OWNER_SEED_ROLE[app]
    except KeyError as exc:
        raise ValueError(
            f"No owner seed role is defined for {app!r}. Add one to "
            "OWNER_SEED_ROLE, or do not subscribe an app whose roles do not "
            "exist yet."
        ) from exc

    AppSubscription.objects.create(
        organization=organization, app_id=app, created_by_user_id=actor_id
    )

    role = Role.objects.get(app=app, code=role_code)
    # THE GRANT ONLY (C72 step 2d-2) -- no `AppAccess` row. The owner is
    # organisation-wide, so they are placed at the organisation's root.
    grant_app_access(
        membership=membership,
        app=app,
        role=role,
        territories=[Territory.objects.root_for(organization, app)],
        actor_id=actor_id,
    )


# ---------------------------------------------------------------------------
# Dealerships.
#
# ORGANIZATION-LEVEL, ON PURPOSE (C3, C23). The organization creates and edits
# its dealerships; each dealership then manages its own people. That is why
# `admin.dealer.*` is held by org standing alone and the DMS System
# administrator role does not grant it -- a dealer admin running one branch
# cannot invent another.
#
# NO CLOSE OR REOPEN HERE, and that is C52 rather than an omission. What
# closing a dealership does to its people and its records is Q21 and is
# unanswered; the endpoints are already named `/close` and `/reopen` on the
# assumption that it is a transition with rules, and writing them now would
# settle Q21 by default. `status` is therefore read-only through the API and
# every dealership created here is active.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# The territory tree (C72 piece 1).
#
# THE ORGANISATION IS THE ROOT (the owner, 2026-11-06). Every organisation has
# one root box of kind `organisation` (`Territory.objects.root_for`), and every
# other territory sits under it. A `parent_id` of None means "directly under
# the organisation", which is the root.
#
# WHAT MAY SIT UNDER WHAT, in one place. Every write that places a territory --
# creating one, moving one -- asks `assert_placement_allowed`, so the rule
# cannot be honoured by one door and forgotten by another.
#
# Version 1, the owner's tree from C72: regions may nest; a dealer sits under
# the organisation or in a region; a branch only inside a dealer; a warehouse
# anywhere. No dealer inside a dealer until Q57 says sub-dealers exist. Nothing
# is ever placed AS an organisation: there is one, and sign-up made it.
# ---------------------------------------------------------------------------

_ALLOWED_PARENTS: dict[str, frozenset[str]] = {
    TerritoryKind.ORGANISATION: frozenset(),
    TerritoryKind.REGION: frozenset({TerritoryKind.ORGANISATION, TerritoryKind.REGION}),
    TerritoryKind.DEALER: frozenset({TerritoryKind.ORGANISATION, TerritoryKind.REGION}),
    TerritoryKind.BRANCH: frozenset({TerritoryKind.DEALER}),
    TerritoryKind.WAREHOUSE: frozenset(
        {
            TerritoryKind.ORGANISATION,
            TerritoryKind.REGION,
            TerritoryKind.DEALER,
            TerritoryKind.BRANCH,
        }
    ),
}


def assert_placement_allowed(kind: str, parent: Territory) -> None:
    """Refuse a territory of this kind under this parent (C72). 409."""
    if parent.kind not in _ALLOWED_PARENTS[kind]:
        raise TerritoryPlacementError


def _resolve_parent(organization: Organization, parent_id: uuid.UUID | None) -> Territory:
    """
    The parent territory -- the organisation's root when `parent_id` is None.

    FILTERED BY ORGANIZATION, and another organization's territory is a 404,
    not a placement error: a box the caller cannot see must look like one that
    does not exist. Paths are unique across the whole table, so without this
    filter a guessed UUID would graft one customer's dealership into another
    customer's tree.
    """
    if parent_id is None:
        return Territory.objects.root_for(organization, AppCode.DMS)
    try:
        # DMS'S TREE: territories are drawn in DMS only (C82); a box in another
        # app's tree is "no such territory" here, the same 404.
        return Territory.objects.get(id=parent_id, organization=organization, app_id=AppCode.DMS)
    except (Territory.DoesNotExist, DjangoValidationError, ValueError):
        raise not_found("Territory") from None


def _assert_not_the_root(territory: Territory) -> None:
    """
    The root IS the organisation: it is renamed by renaming the organisation,
    it has nowhere to move to, and nothing may be moved into its place.
    """
    if territory.is_root:
        raise TerritoryIsTheOrganisationError


def _add_territory(organization: Organization, parent: Territory, fields: dict) -> Territory:
    """
    Insert a territory under its parent. The caller has checked the rules.

    `add_child` locks the parent row first, so two territories added under one
    parent at once queue rather than computing the same path. Under the root,
    that serialises one organisation's own additions -- and no other
    organisation's, since each has its own root.
    """
    return Territory.objects.add_child(parent, {"organization": organization, **fields})


def _assert_territory_name_free(
    organization: Organization, name: str, excluding: uuid.UUID | None = None
) -> None:
    existing = Territory.objects.of(organization, AppCode.DMS).filter(name=name)
    if excluding is not None:
        existing = existing.exclude(pk=excluding)
    if existing.exists():
        raise TerritoryNameTakenError


@transaction.atomic
def create_territory(
    *,
    organization: Organization,
    kind: str,
    name: str,
    parent_id: uuid.UUID | None = None,
) -> Territory:
    """
    Add a region, branch or warehouse to the organization's tree.

    Dealerships have their own door, `create_dealer`, because they carry the
    GSTIN and the rest of the dealer details the dealers screen edits. Both
    doors place through the same rule.
    """
    parent = _resolve_parent(organization, parent_id)
    assert_placement_allowed(kind, parent)
    _assert_territory_name_free(organization, name)

    return _add_territory(organization, parent, {"kind": kind, "name": name})


@transaction.atomic
def rename_territory(*, territory: Territory, name: str) -> Territory:
    """Change a territory's name -- any kind but the root. Unique across the tree."""
    _assert_not_the_root(territory)
    _assert_territory_name_free(territory.organization, name, excluding=territory.pk)
    territory.name = name
    territory.save(update_fields=["name", "updated_at"])
    return territory


@transaction.atomic
def move_territory(*, territory: Territory, parent_id: uuid.UUID | None) -> Territory:
    """
    Put a territory -- and everything under it -- somewhere else in the tree.

    `parent_id` None moves it directly under the organisation. This is how the
    dealerships that existed before regions get organised: every one of them
    sits directly under the organisation (`organizations/0014`).

    EVERYTHING UNDER IT MOVES TOO, and nothing under it needs checking: the
    rules depend only on a box and its own parent, and those pairs do not
    change in a move. Only the moved box's new parent is checked.

    IDS DO NOT CHANGE, ONLY PATHS. Every tenant record and every membership
    points at a territory by id, so moving a dealership into a region moves
    nothing else.
    """
    _assert_not_the_root(territory)
    parent = _resolve_parent(territory.organization, parent_id)
    assert_placement_allowed(territory.kind, parent)

    if parent.pk == territory.pk or parent.path.startswith(territory.path):
        raise TerritoryMoveIntoItselfError

    try:
        Territory.objects.move(territory, parent, "last-child")
    except InvalidMoveToDescendant:
        raise TerritoryMoveIntoItselfError from None

    return Territory.objects.get(pk=territory.pk)


# ---------------------------------------------------------------------------
# DMS settings -> Territory Management (the owner, 2026-11-24).
#
# ONE DOOR FOR EVERY KIND, with every detail. C82 amended: any territory may
# carry a code, GSTIN, PAN, contact and address, and an Active / Closed status
# -- what only a dealership had. `create_territory` / `create_dealer` and the
# dealer edits stay for the Admin panel's screens until they go (Q79).
#
# The same rules as those doors, from the same helpers: placement by
# `assert_placement_allowed`, one name and one code per DMS tree, the PAN
# derived from the GSTIN when none is given, and a dealer needs its GSTIN.
# ---------------------------------------------------------------------------


def _assert_territory_code_free(
    organization: Organization, code: str | None, excluding: uuid.UUID | None = None
) -> None:
    # Optional, so only a GIVEN code can collide; any number may have none.
    if not code:
        return
    existing = Territory.objects.of(organization, AppCode.DMS).filter(code=code)
    if excluding is not None:
        existing = existing.exclude(pk=excluding)
    if existing.exists():
        raise TerritoryCodeTakenError


def _assert_gstin_if_dealer(kind: str, gstin: str) -> None:
    """A dealer needs its GSTIN, as it always has; the other kinds need not (422)."""
    if kind == TerritoryKind.DEALER and not gstin:
        raise TerritoryGstinRequiredError


@transaction.atomic
def add_territory(
    *,
    organization: Organization,
    kind: str,
    name: str,
    parent_id: uuid.UUID | None = None,
    code: str | None = None,
    gstin: str = "",
    pan: str = "",
    contact_person: str = "",
    email: str = "",
    phone: str = "",
    city: str = "",
    state: str = "",
    postal_code: str = "",
) -> Territory:
    """
    New Territory: a region, dealer, branch or warehouse in DMS's tree, under
    a parent its kind may sit in (`parent_id` None = the organisation).

    KEYWORD-ONLY, for `create_dealer`'s reason: most arguments are strings,
    and a positional call that swapped city and state would be silently wrong.
    """
    parent = _resolve_parent(organization, parent_id)
    assert_placement_allowed(kind, parent)
    _assert_territory_name_free(organization, name)
    _assert_territory_code_free(organization, code)
    _assert_gstin_if_dealer(kind, gstin)

    return _add_territory(
        organization,
        parent,
        {
            "kind": kind,
            "name": name,
            # NULL, never "": MySQL's unique index treats NULLs as distinct.
            "code": code or None,
            "gstin": gstin,
            "pan": pan or extract_pan(gstin),
            "contact_person": contact_person,
            "email": email,
            "phone": phone,
            "city": city,
            "state": state,
            "postal_code": postal_code,
        },
    )


@transaction.atomic
def update_territory(*, territory: Territory, **fields: str | None) -> Territory:
    """
    Edit a territory's details: name, code, GSTIN, PAN, contact and address.

    NOT ITS KIND, PLACE OR STATUS: the payload carries none of them. A kind
    never changes (what may sit under it depends on it); moving is its own act
    (`move_territory`, a later step on this screen); closing is its own
    endpoint. NOT THE ROOT: it is the organisation, named by the organisation.

    The PAN comes back from the GSTIN when it is cleared, as `update_dealer`.
    """
    _assert_not_the_root(territory)

    name = fields.get("name")
    if name is not None:
        _assert_territory_name_free(territory.organization, name, excluding=territory.pk)
    if "code" in fields:
        _assert_territory_code_free(territory.organization, fields["code"], excluding=territory.pk)

    gstin = fields.get("gstin", territory.gstin) or ""
    _assert_gstin_if_dealer(territory.kind, gstin)
    if not fields.get("pan"):
        fields["pan"] = extract_pan(gstin)

    for field, value in fields.items():
        setattr(territory, field, (value or None) if field == "code" else value)

    territory.save()
    return territory


@transaction.atomic
def close_territory(*, territory: Territory) -> Territory:
    """
    Close a territory, of any kind (C63, which was a dealership's; C82
    amended gives every territory a status).

    ONE COLUMN ON ONE ROW, as `close_dealer`: nothing is written to people or
    records, so reopening restores exactly what was there. Somebody all of
    whose places are closed is shut out (`is_shut_out_by_closure`).

    WHAT IS UNDER IT STAYS OPEN. Closing North does not close Delhi Motors in
    it: each box has its own status, and the tree shows which are closed.
    NOT THE ROOT: closing the organisation is not this.
    """
    _assert_not_the_root(territory)
    if territory.status == UnitStatus.DISABLED:
        raise TerritoryAlreadyClosedError

    territory.status = UnitStatus.DISABLED
    territory.save(update_fields=["status", "updated_at"])
    return territory


@transaction.atomic
def reopen_territory(*, territory: Territory) -> Territory:
    """Open a closed territory again -- symmetrical, because closing touched nothing else."""
    _assert_not_the_root(territory)
    if territory.status == UnitStatus.ACTIVE:
        raise TerritoryAlreadyOpenError

    territory.status = UnitStatus.ACTIVE
    territory.save(update_fields=["status", "updated_at"])
    return territory


# ---------------------------------------------------------------------------
# Per-app grants (C72 piece 2).
#
# `grant_app_access()` IS THE ONLY WRITER of `MembershipAppAccess`,
# `MembershipAppRole` and `MembershipAppTerritory`. The rules it enforces are
# the ones the database cannot: the role belongs to the app; there is at least
# one territory; every territory is in the person's own organisation; and a
# dealership person holds only apps that use territories (C27, Q53).
#
# THE GRANTS ARE THE ONLY RECORD. `AppAccess`, `Membership.role` and
# `Membership.unit` stopped being written in step 2d-2 and were dropped in 2d-3.
# ---------------------------------------------------------------------------


def _is_dealership_place(territory: Territory) -> bool:
    """
    Is this a place that belongs to a dealership -- a dealer, a branch, or
    anything (a warehouse) inside a dealer?

    Somebody placed at one is a dealership's person, and Q53 says a
    dealership's people get DMS and nothing else.
    """
    if territory.kind in (TerritoryKind.DEALER, TerritoryKind.BRANCH):
        return True
    step = Territory.steplen
    ancestors = [territory.path[:end] for end in range(step, len(territory.path), step)]
    return Territory.objects.filter(
        organization_id=territory.organization_id, path__in=ancestors, kind=TerritoryKind.DEALER
    ).exists()


@transaction.atomic
def grant_app_access(
    *,
    membership: Membership,
    app: str,
    role: Role,
    territories: list[Territory],
    actor_id: uuid.UUID | None = None,
) -> MembershipAppAccess:
    """
    Give this membership `app`, as `role`, placed at `territories` -- or replace
    what they had in that app. One user action, one transaction (CLAUDE.md).

    REPLACES, NEVER MERGES. Calling it again for the same app sets the role and
    the territories to exactly what is passed; a territory left out is a
    territory removed. Merging would mean a placement could only ever grow.
    """
    if role.app_id != app:
        raise RoleNotInAppError
    if not territories:
        raise GrantNeedsTerritoryError
    if any(t.organization_id != membership.organization_id for t in territories):
        # Another organisation's territory is one the caller cannot see (C49).
        raise not_found("Territory")
    app_uses_territories = App.objects.filter(code=app, unit_aware=True).exists()
    placed_at_a_dealership = any(_is_dealership_place(t) for t in territories)

    # C27 / Q53, BOTH WAYS ROUND, across the person's other grants: a
    # dealership's person may not hold an app that ignores territories, and a
    # person holding such an app may not be placed at a dealership elsewhere.
    others = MembershipAppAccess.objects.filter(membership=membership).exclude(app_id=app)
    if placed_at_a_dealership and (
        not app_uses_territories or others.filter(app__unit_aware=False).exists()
    ):
        raise DealerScopedAppError
    if not app_uses_territories and any(
        _is_dealership_place(placement.territory)
        for placement in MembershipAppTerritory.objects.filter(
            app_access__in=others
        ).select_related("territory")
    ):
        raise DealerScopedAppError
    if any(t.app_id != app for t in territories):
        # EVERY APP HAS ITS OWN TREE (2026-11-24): a DMS grant placed at the
        # Admin panel's root, say, is refused -- here, the one place every
        # placement is written, so nothing gets round it. After C27, so a CRM
        # grant at a dealership is still refused by the dealership rule.
        raise TerritoryOfAnotherAppError

    grant, _ = MembershipAppAccess.objects.get_or_create(
        membership=membership, app_id=app, defaults={"created_by_user_id": actor_id}
    )
    # WHO GAVE IT (Q71): the role row names its maker on creation and whoever
    # last changed it, as the grant and its places already did.
    MembershipAppRole.objects.update_or_create(
        app_access=grant,
        defaults={"role": role, "updated_by_user_id": actor_id},
        create_defaults={"role": role, "created_by_user_id": actor_id},
    )
    grant.territories.all().delete()
    for territory in {t.pk: t for t in territories}.values():
        MembershipAppTerritory.objects.create(
            app_access=grant, territory=territory, created_by_user_id=actor_id
        )
    return grant


@transaction.atomic
def revoke_app_access(*, membership: Membership, app: str) -> None:
    """Take an app away. The role and the territories go with it (cascade)."""
    MembershipAppAccess.objects.filter(membership=membership, app_id=app).delete()


def _placement(
    organization: Organization, app: str, unit: Territory | None
) -> list[Territory]:
    """
    Where the FORM puts this person in `app`: the dealership it names, or that
    app's root when it names none (every app has its own tree, 2026-11-24).

    FROM THE FORM, NOT FROM `Membership.unit` (C72 step 2d-2). Until this step
    the services saved the dealership on the membership and then read it back
    to place the grants; now it goes straight into the grants and the old
    field is not written at all. The form still sends one dealership --
    several places per person is piece 7's screen.
    """
    if unit is not None:
        return [unit]
    return [Territory.objects.root_for(organization, app)]


def _assert_organisation_wide(standing: str, unit_id: uuid.UUID | None) -> None:
    """
    An owner or an admin is never placed at one dealership.

    THIS USED TO BE THE DATABASE'S JOB, and badly: the check constraint on
    `Membership` refused `admin` with a `unit`, so an admin invitation naming
    a dealership was accepted at invite time and blew up as a 500 when the
    person clicked the link. Step 2d-2 stops writing `Membership.unit`, which
    would have retired that constraint silently. So the rule lives here now,
    as a 409, checked at invite, at edit and again at accept.

    A dealership's administrator holds DMS System administrator there (C40);
    "admin" on the form means the Organisation admin, who is at the root.
    """
    if unit_id is not None and standing in (MembershipRole.OWNER, MembershipRole.ADMIN):
        raise RoleScopeMismatchError


def _grant_administration_if_admin(
    membership: Membership, standing: str, *, actor_id=None
) -> None:
    """
    The form's `role: "admin"` -> an Administration grant, role "Organisation
    admin", placed at the organisation's root. The owner gets none: they hold
    Administration by rule (`is_owner`), whatever the form says.

    `standing` IS THE FORM'S WORD, passed in, not `membership.role` -- which
    step 2d-2 no longer writes. The frontend keeps sending "admin" | "member"
    until piece 7.

    ONLY EVER ADDS, because both callers start from a person with no
    Administration grant -- accepting creates the membership, and editing has
    just deleted every grant it had. A demoted admin therefore loses it by that
    delete, not here. A new caller that does NOT start clean must revoke first.
    """
    if membership.is_owner:
        return
    if standing == MembershipRole.ADMIN:
        grant_app_access(
            membership=membership,
            app=AppCode.ADMIN,
            role=Role.objects.get(app_id=AppCode.ADMIN, code=ORGANISATION_ADMIN_ROLE),
            territories=[Territory.objects.root_for(membership.organization, AppCode.ADMIN)],
            actor_id=actor_id,
        )


@transaction.atomic
def create_dealer(
    *,
    organization: Organization,
    name: str,
    parent_id: uuid.UUID | None = None,
    code: str | None = None,
    gstin: str = "",
    pan: str = "",
    contact_person: str = "",
    email: str = "",
    phone: str = "",
    city: str = "",
    state: str = "",
    postal_code: str = "",
) -> Territory:
    """
    Add a dealership to this organization.

    KEYWORD-ONLY, because ten of the eleven arguments are strings and a
    positional call that transposed `city` and `state` would be silently wrong
    in a way no type checker could see.

    The uniqueness checks below duplicate constraints the database also
    enforces. That is deliberate: the constraint is what makes the rule true
    under a race, and this is what makes the refusal say which field was wrong
    instead of surfacing as a 500 (C9 -- a 5xx body carries no detail, so an
    IntegrityError reaching the handler tells the caller nothing at all).

    NO UNIQUENESS CHECK ON THE GSTIN, and that is a decision rather than an
    omission: one registration legitimately covers several branches in the same
    state as additional places of business, so refusing a duplicate would
    refuse real data. The PAN is shared across every branch of one company in
    any case.

    `parent_id` PUTS IT INSIDE A REGION (C72); omitted, it sits at the top
    level, as every dealership did before the tree existed.
    """
    parent = _resolve_parent(organization, parent_id)
    assert_placement_allowed(TerritoryKind.DEALER, parent)
    _assert_dealer_name_free(organization, name)
    _assert_dealer_code_free(organization, code)

    return _add_territory(
        organization,
        parent,
        {
            "kind": TerritoryKind.DEALER,
            "name": name,
            # NULL, never "", and the model comment explains why: MySQL treats
            # every NULL in a unique index as distinct but two empty strings as
            # a duplicate, so storing "" would let the first dealership without
            # a code be created and refuse the second.
            "code": code or None,
            "gstin": gstin,
            # DERIVED HERE, not in the browser. Characters 3-12 of a GSTIN are
            # the holder's PAN, so a caller who sends one is overriding a
            # default rather than supplying a fact we did not have -- and the
            # default has to exist somewhere both a form and a shell session
            # reach.
            "pan": pan or extract_pan(gstin),
            "contact_person": contact_person,
            "email": email,
            "phone": phone,
            "city": city,
            "state": state,
            "postal_code": postal_code,
        },
    )


@transaction.atomic
def update_dealer(*, dealer: Territory, **fields: str | None) -> Territory:
    """
    Change a dealership's details.

    NOT ITS STATUS, and not its organization. The payload carries neither, so
    "correct a typo in the address" and "shut the branch" cannot be the same
    request -- which is the frontend's reasoning for two endpoints and holds
    just as well here.
    """
    name = fields.get("name")
    if name is not None:
        _assert_dealer_name_free(dealer.organization, name, excluding=dealer.pk)

    if "code" in fields:
        _assert_dealer_code_free(dealer.organization, fields["code"], excluding=dealer.pk)

    # THE SAME DERIVATION AS CREATE, for the same reason. Clearing the PAN on
    # an edit means "give me the one in the GSTIN back", not "store nothing" --
    # otherwise the only way to recover the default is to retype it, and a
    # field that cannot return to its default is a one-way door of the kind
    # C55 was about.
    if not fields.get("pan"):
        gstin = fields.get("gstin", dealer.gstin) or ""
        fields["pan"] = extract_pan(gstin)

    for field, value in fields.items():
        setattr(dealer, field, value or None if field == "code" else value)

    dealer.save()
    return dealer


@transaction.atomic
def close_dealer(*, dealer: Territory) -> Territory:
    """
    Shut a dealership (C63, answering Q21).

    NOTHING IS WRITTEN TO ITS PEOPLE, AND THAT IS THE WHOLE DESIGN. One column
    changes on one row; every membership, invitation, grant and record stays
    exactly as it was.

    The obvious alternative -- walk the memberships and set each to `disabled`
    -- fails on the way back. Reopening would have to switch them on again, and
    by then nothing distinguishes somebody switched off BECAUSE the branch
    closed from somebody an admin deactivated individually last month. The
    second person would quietly return to work. Deriving the refusal instead
    (`OrgScopedAPIView` refuses a membership whose unit is closed) means
    reopening restores precisely what was there, because nothing was disturbed.

    SO THIS IS NOT "DEACTIVATE EVERYONE" WITH A TIDIER NAME. It is a statement
    about the branch, and the consequences for its people are read from it.

    THE RECORDS STAY, AND STAY VISIBLE (C63). A closed dealership's enquiries,
    quotations and job cards are history the organisation still reports on, so
    organisation-level people keep reading them; what stops is writing, and the
    first DMS model is where that rule has to be honoured. There is no delete,
    ever -- a dealership with history cannot be removed without taking the
    history with it.
    """
    if dealer.status == UnitStatus.DISABLED:
        raise DealerAlreadyClosedError

    dealer.status = UnitStatus.DISABLED
    dealer.save(update_fields=["status"])
    return dealer


@transaction.atomic
def reopen_dealer(*, dealer: Territory) -> Territory:
    """
    Open a dealership again.

    SYMMETRICAL, because `close_dealer` touched nothing else (C63). There are
    no grants to reinstate and no people to switch back on: the moment the
    status changes, every membership scoped here resolves the way it did
    before, including the ones an admin had deactivated separately, which stay
    deactivated.

    That symmetry is the test worth keeping. A future change that makes closing
    write to anything else has to make reopening undo it, and the pair of tests
    in `test_dealers_api.py` is what will say so.
    """
    if dealer.status == UnitStatus.ACTIVE:
        raise DealerAlreadyOpenError

    dealer.status = UnitStatus.ACTIVE
    dealer.save(update_fields=["status"])
    return dealer


def _assert_dealer_name_free(
    organization: Organization, name: str, excluding: uuid.UUID | None = None
) -> None:
    existing = Territory.objects.of(organization, AppCode.DMS).filter(name=name)
    # EXCLUDE THE ROW BEING EDITED, or saving a dealership without touching its
    # name collides with itself -- the bug the frontend fake had to fix twice.
    if excluding is not None:
        existing = existing.exclude(pk=excluding)

    if existing.exists():
        raise DealerNameTakenError


def _assert_dealer_code_free(
    organization: Organization, code: str | None, excluding: uuid.UUID | None = None
) -> None:
    # The code is optional, so only a GIVEN one can collide. Clearing it is
    # always allowed, however many other dealerships also have none.
    if not code:
        return

    existing = Territory.objects.of(organization, AppCode.DMS).filter(code=code)
    if excluding is not None:
        existing = existing.exclude(pk=excluding)

    if existing.exists():
        raise DealerCodeTakenError


# ---------------------------------------------------------------------------
# People.
#
# EVERY FUNCTION HERE TAKES THE ACTOR'S MEMBERSHIP, not only the target. Who
# may manage whom is the whole of two-level administration (C3, C23), and a
# service that took only a target would be correct exactly as long as every
# caller remembered to check first --- which is the shape C49 removed one
# layer up.
#
# SCOPE FAILURES RAISE `NotFoundError`, NOT `AuthorizationError`. A person
# outside the caller's dealership has to be indistinguishable from one who does
# not exist, or a dealer admin can map another dealership's staff by probing
# ids and noting which answer 403.
# ---------------------------------------------------------------------------

# Long enough that guessing one is hopeless, short enough to survive an email
# client wrapping the line. The same reasoning as C47's activation codes.
INVITATION_TOKEN_BYTES = 32

# SEVEN DAYS, AND THE NUMBER FOLLOWS FROM WHERE THE LINK LIVES (C62, Q40).
# It was 14 while the plan still said the token would be emailed; C56 moved it
# into a chat message, which is backed up, searchable and forwardable in ways a
# mailbox is not --- so the window in which a leaked link still works is the
# whole of the exposure. `resend_invitation` mints a new token for anybody who
# misses it, so shortening this costs a click, not an admin's afternoon.
#
# PINNED BY A TEST, because nothing pinned it before: the lifetime is a
# decision rather than an implementation detail, and the two callers below
# derive from it. A test written against this constant could not fail when the
# constant changed, so the test asserts the number.
INVITATION_LIFETIME = timedelta(days=7)


def _assert_can_manage(actor: Membership, target_unit_id: uuid.UUID | None) -> None:
    """For a PLACE the form names -- where somebody is being invited or moved to."""
    if not can_manage(actor, target_unit_id):
        raise not_found("User")


def _assert_can_manage_person(actor: Membership, person: Membership | Invitation) -> None:
    """For a PERSON who already exists, judged by their grants (C72 step 2d)."""
    if not can_manage_person(actor, person):
        raise not_found("User")


def _assert_grants_are_legal(
    organization: Organization, unit_id: uuid.UUID | None, grants: list[tuple[str, Role]]
) -> None:
    """
    Every rule about whether a grant makes sense: is it bought, does the scope
    allow it, and is the role one that exists at that scope.

    IN ONE PLACE SO INVITE AND UPDATE CANNOT DISAGREE. They already did once in
    the frontend: the invite dialog gained the C27 rule and the edit dialog
    did not.
    """
    subscribed = set(
        AppSubscription.objects.filter(
            organization=organization, status=SubscriptionStatus.ACTIVE
        ).values_list("app", flat=True)
    )

    for app, role in grants:
        if app not in subscribed:
            # THE OTHER HALF OF C16, and it was missing until the owner found
            # its mirror image in the UI. A grant and a subscription are two
            # facts and both are required; `/me` enforced one direction (a
            # grant left on a lapsed subscription opens nothing) while nothing
            # stopped the grant being made for an app never bought.
            #
            # Administration never reaches here: `_resolve_grants` refuses it
            # outright, because it is not sold (C44).
            raise AppNotSubscribedError

        if unit_id is not None and app != AppCode.DMS:
            # C27. CRM does no unit filtering and has no column to filter on,
            # so a dealer-scoped person holding it sees every dealership's
            # customers.
            raise DealerScopedAppError

        wanted = RoleLevel.UNIT if unit_id is not None else RoleLevel.ORG
        if role.level != wanted:
            raise RoleScopeMismatchError


def _assert_email_free(
    organization: Organization, email: str, excluding_invitation: uuid.UUID | None = None
) -> None:
    """
    Nobody else in THIS organization uses this address.

    BOTH TABLES, because C51 split people across them: an address already
    invited is as taken as one already a member, and checking only memberships
    lets two invitations go to the same person.

    Per organization, not globally. One person may belong to several
    organizations on one account (C1, C27), so a global check would refuse an
    invitation to somebody who already works somewhere else on the platform.
    """
    if Membership.objects.filter(organization=organization, user__email__iexact=email).exists():
        raise PersonEmailTakenError

    pending = Invitation.objects.filter(
        organization=organization, email__iexact=email, accepted_at__isnull=True
    )
    if excluding_invitation is not None:
        pending = pending.exclude(pk=excluding_invitation)

    if pending.exists():
        raise PersonEmailTakenError


def _resolve_unit(organization: Organization, unit_id: uuid.UUID | None) -> Territory | None:
    if unit_id is None:
        return None
    try:
        # DEALERS ONLY until C72 piece 2: a person is placed at a dealership or
        # at nothing. A region's id here is "no such dealer", the same 404 --
        # and so is one of `main`'s head offices until they are retired.
        return Territory.objects.get(
            id=unit_id,
            organization=organization,
            app_id=AppCode.DMS,
            kind=TerritoryKind.DEALER,
            is_head_office__isnull=True,
        )
    except (Territory.DoesNotExist, DjangoValidationError, ValueError):
        # Another organization's dealership is not bad input to report back, it
        # is a dealership this caller cannot see.
        raise not_found("Dealer") from None


def _resolve_grants(organization: Organization, apps: list[dict]) -> list[tuple[str, Role]]:
    """
    Turn `[{"app": "dms", "role": "dms.manager"}]` into rows.

    ADMINISTRATION IS REFUSED OUTRIGHT, not filtered out. It is never an
    `AppAccess` row --- the check constraint says so --- because it comes from
    standing or from a role granting `admin.*` (C40). A payload asking for it
    is a caller working from the wrong model, and dropping it quietly would
    leave them believing it had been granted.
    """
    grants: list[tuple[str, Role]] = []
    for entry in apps:
        app = entry["app"]
        if app == AppCode.ADMIN:
            raise AdministrationNotGrantableError
        try:
            # BUILT-IN OR THIS ORGANISATION'S OWN, never another's (the role
            # builder): a custom role's code is not a secret, so a request
            # naming another organisation's must find nothing.
            role = roles_for_organization(organization.id).get(code=entry["role"], app=app)
            grants.append((app, role))
        except Role.DoesNotExist:
            raise RoleScopeMismatchError from None
    return grants


def find_person(organization: Organization, person_id: uuid.UUID) -> Membership | Invitation:
    """
    One row of the users list, from whichever table it came from.

    THE PRICE OF C51's UNION, paid in one place. An active person's id is a
    membership id and a pending one's is an invitation id, so a lookup has to
    try both --- and doing that at each call site is how an endpoint ends up
    silently handling only half the list.

    FILTERED BY ORGANIZATION, which is the isolation. 404 for an id belonging
    to another customer, and the same 404 for an id that is not a UUID at all:
    a 400 there would confirm that well-formed ids are the thing being looked
    up.
    """
    try:
        return (
            Membership.objects.select_related("user")
            .prefetch_related(*GRANTS_PREFETCH)
            .get(id=person_id, organization=organization)
        )
    except (Membership.DoesNotExist, DjangoValidationError, ValueError):
        pass

    try:
        return Invitation.objects.get(
            id=person_id, organization=organization, accepted_at__isnull=True
        )
    except (Invitation.DoesNotExist, DjangoValidationError, ValueError):
        raise not_found("User") from None


@transaction.atomic
def invite_person(
    *,
    actor: Membership,
    organization: Organization,
    email: str,
    first_name: str,
    last_name: str,
) -> Invitation:
    """
    Invite somebody into this organisation: a PERSON -- first name, last name,
    email -- and nothing else (the owner, 2026-11-20, as Zoho's admin panel).

    NO APP, NO ROLE, NO PLACE. The Admin panel invites a person; apps are
    assigned afterwards (Assign app, or Edit), and an APP's own invite -- built
    with that app's Users screen -- will carry that app's role (C72 piece 5).
    Accepting with no apps makes a member who can open nothing yet, and the
    launcher tells them so. `Invitation.role` and `.unit` are gone (C83).

    CREATES AN INVITATION, NOT A MEMBERSHIP (C51). There is no account yet and
    there may never be one; accepting creates the membership.

    ORGANISATION-WIDE ADMINS ONLY, for now. An invited person sits nowhere, so
    only somebody who administers everywhere can manage them; a dealer admin,
    placed narrower (`reach()`), is refused -- a capability answer, 403, which
    discloses nothing. Territories are being redesigned per app (C82).
    """
    if reach(actor) is not None:
        raise AuthorizationError

    _assert_email_free(organization, email)

    return Invitation.objects.create(
        organization=organization,
        email=email,
        first_name=first_name,
        last_name=last_name,
        token=secrets.token_urlsafe(INVITATION_TOKEN_BYTES),
        expires_at=timezone.now() + INVITATION_LIFETIME,
        invited_by=actor.user,
    )


@transaction.atomic
def update_person_details(
    *,
    actor: Membership,
    organization: Organization,
    person_id: uuid.UUID,
    first_name: str,
    last_name: str,
    email: str,
) -> Membership | Invitation:
    """
    Edit in the Admin panel (the owner, 2026-11-20): somebody's BASIC
    INFORMATION -- first name, last name, email -- and nothing else, as Zoho's.

    NOTHING ELSE IS TOUCHED. Their apps, place and standing are not in the
    request, so a save cannot wipe them; each has its own action (Assign
    applications, and the app tile's Edit | Unassign and Assign Admin to come).
    That also closes Q36: an admin can no longer remove their own admin role
    by editing themselves.

    The address follows C25: a member's is how they sign in and is refused if
    changed; a pending person's may still be corrected.
    """
    person = find_person(organization, person_id)
    _assert_can_manage_person(actor, person)

    if isinstance(person, Invitation):
        if email.lower() != person.email.lower():
            _assert_email_free(organization, email, excluding_invitation=person.pk)
            person.email = email
        person.first_name = first_name
        person.last_name = last_name
        person.save(update_fields=["email", "first_name", "last_name", "updated_at"])
        return person

    if email.lower() != person.user.email.lower():
        raise SignInAddressLockedError

    person.user.first_name = first_name
    person.user.last_name = last_name
    person.user.save(update_fields=["first_name", "last_name"])
    return person


@transaction.atomic
def update_person(
    *,
    actor: Membership,
    organization: Organization,
    person_id: uuid.UUID,
    first_name: str,
    last_name: str,
    email: str,
    unit_id: uuid.UUID | None,
    role: str,
    apps: list[dict],
) -> Membership | Invitation:
    """
    Change somebody's membership --- not their account.

    NO ENDPOINT CALLS THIS SINCE EDIT BECAME BASIC INFORMATION ONLY
    (`update_person_details`, 2026-11-20). It stays, with its tests, for the
    rules it enforces until Assign Admin and the app tile's Edit | Unassign
    replace it; then it goes.

    `first_name` and `last_name` belong to the PERSON and change everywhere;
    the scope, the apps and the standing belong to this organization's
    relationship with them (C25).

    MOVING SOMEBODY BETWEEN DEALERSHIPS IS CHECKED AT BOTH ENDS. A dealer admin
    must not move one of their people out, nor pull somebody in from another
    dealership --- checking only the target permits the first and checking only
    the source permits the second.
    """
    person = find_person(organization, person_id)
    _assert_can_manage_person(actor, person)
    _assert_can_manage(actor, unit_id)

    if role == MembershipRole.ADMIN and reach(actor) is not None:
        raise AuthorizationError

    if isinstance(person, Invitation):
        # A PENDING PERSON IS JUST A PERSON (C83): no standing and no place
        # until they join. Being made an admin waits until they have; their
        # apps -- organisation-level roles only -- wait on the invitation.
        _assert_pending_person_is_unplaced(role, unit_id)

    unit = _resolve_unit(organization, unit_id)
    is_the_owner = isinstance(person, Membership) and person.is_owner
    _assert_organisation_wide(MembershipRole.OWNER if is_the_owner else role, unit_id)
    grants = _resolve_grants(organization, apps)
    # NO "AT LEAST ONE APP" (C73 retired, the owner 2026-11-20): taking every
    # app away leaves a person who can open nothing, which is allowed.
    _assert_grants_are_legal(organization, unit_id, grants)

    if isinstance(person, Invitation):
        _update_invitation(person, organization, first_name, last_name, email, grants)
    else:
        _update_membership(person, first_name, last_name, email, unit, role, grants)

    return person


def _update_membership(
    membership: Membership,
    first_name: str,
    last_name: str,
    email: str,
    unit: Territory | None,
    role: str,
    grants: list[tuple[str, Role]],
) -> None:
    if email.lower() != membership.user.email.lower():
        # C25: an accepted address is how they sign in, so changing it from an
        # admin screen is an account takeover with extra steps.
        raise SignInAddressLockedError

    membership.user.first_name = first_name
    membership.user.last_name = last_name
    membership.user.save(update_fields=["first_name", "last_name"])

    # THE GRANTS ARE THE WHOLE RECORD (C72 step 2d). There is no standing
    # field for the form to overwrite, so the owner cannot be demoted by one.
    #
    # DELETE THEN CREATE, inside the caller's transaction. Updating in place
    # would mean working out which grants went away, and a missed one leaves
    # somebody holding an app the form says they lost --- the stale-grant shape
    # C16 already had to catch once in billing.
    membership.grants.all().delete()
    for app, granted_role in grants:
        grant_app_access(
            membership=membership,
            app=app,
            role=granted_role,
            territories=_placement(membership.organization, app, unit),
        )
    # The delete above took any Administration grant with it, so the form
    # decides afresh whether there is one (a demotion ends here).
    _grant_administration_if_admin(membership, role)


def _assert_pending_person_is_unplaced(role: str, unit_id: uuid.UUID | None) -> None:
    """
    An invitation has no standing and no place any more (C83). Asking for
    either is refused by name rather than dropped, so the form cannot believe
    somebody was made an admin -- or put at a dealership -- before joining.
    """
    errors = []
    if role == MembershipRole.ADMIN:
        errors.append(
            FieldError(
                field="role",
                code="pending",
                detail="Make this person an admin once they have joined.",
            )
        )
    if unit_id is not None:
        errors.append(
            FieldError(
                field="unit_id",
                code="pending",
                detail="A person who has not joined yet is not placed anywhere.",
            )
        )
    if errors:
        raise InvalidInputError(field_errors=errors)


def _update_invitation(
    invitation: Invitation,
    organization: Organization,
    first_name: str,
    last_name: str,
    email: str,
    grants: list[tuple[str, Role]],
) -> None:
    # THE ONE CASE WHERE AN ADDRESS MAY CHANGE (C25). Nobody signs in with it
    # yet, so correcting a typo before somebody accepts is an ordinary edit
    # rather than a takeover.
    if email.lower() != invitation.email.lower():
        _assert_email_free(organization, email, excluding_invitation=invitation.pk)
        invitation.email = email

    invitation.first_name = first_name
    invitation.last_name = last_name
    invitation.save()

    invitation.app_grants.all().delete()
    for app, granted_role in grants:
        InvitationAppGrant.objects.create(invitation=invitation, app_id=app, role=granted_role)


@transaction.atomic
def invite_to_app(
    *,
    actor: Membership,
    organization: Organization,
    app: str,
    email: str,
    first_name: str,
    last_name: str,
    role: str,
) -> Invitation:
    """
    AN APP'S OWN ADD USER (the owner, 2026-11-24: DMS settings -> Users -> Add
    User): a person, AND the app they are invited from, with that app's role.
    "Since the user is getting created in the app they will get the app in
    which they are created."

    EXACTLY THE ADMIN PANEL'S TWO ACTS, in one transaction: `invite_person()`
    (Add User) then `assign_apps()` (Assign applications) -- so every rule of
    both holds here and cannot drift: organisation-wide inviters only, a free
    address, a subscribed app, never Administration, a role that exists for
    this organisation, and -- because an invitation is placed at the root on
    accepting (C83) -- an ORGANISATION-LEVEL role only. A dealership role is
    refused (`RoleScopeMismatchError`, 409) and, the transaction being whole,
    no invitation is left behind.
    """
    invitation = invite_person(
        actor=actor,
        organization=organization,
        email=email,
        first_name=first_name,
        last_name=last_name,
    )
    assign_apps(
        actor=actor,
        organization=organization,
        person_id=invitation.pk,
        apps=[{"app": app, "role": role}],
    )
    return invitation


@transaction.atomic
def assign_apps(
    *,
    actor: Membership,
    organization: Organization,
    person_id: uuid.UUID,
    apps: list[dict],
) -> Membership | Invitation:
    """
    Give a person one or more apps, each with its role (the owner, 2026-11-20:
    Admin panel -> Users -> a person -> Applications -> Assign applications).

    ADDS, NEVER REPLACES. An app the person already has is refused
    (`AppAlreadyHeldError`): changing a role is that app's own Edit.

    ALL OR NOTHING: one transaction, every rule checked before anything is
    written, so one bad app assigns none of them.

    PLACED AT THE ORGANISATION'S ROOT -- organisation-wide, so only an
    organisation-level role is legal -- until each app has its own territories
    (C82). A person already at a dealership (through DMS) keeps C27: no
    organisation-wide app beside it -- `grant_app_access()` refuses it.

    A PENDING PERSON gets the apps on their invitation (`InvitationAppGrant`);
    accepting turns them into grants, as an app's own invite will.

    Not the owner (`OwnerHoldsEveryAppError`), never Administration
    (`_resolve_grants`), and only somebody the actor may manage -- else 404.
    """
    person = find_person(organization, person_id)
    _assert_can_manage_person(actor, person)

    is_member = isinstance(person, Membership)
    if is_member and person.is_owner:
        raise OwnerHoldsEveryAppError

    grants = _resolve_grants(organization, apps)
    requested = [app for app, _role in grants]
    if len(set(requested)) != len(requested):
        raise InvalidInputError(
            field_errors=[
                FieldError(field="apps", code="duplicate", detail="Name each app once.")
            ]
        )

    held = set(
        (person.grants if is_member else person.app_grants).values_list("app_id", flat=True)
    )
    if held & set(requested):
        raise AppAlreadyHeldError

    # C27 (somebody at a dealership holds no organisation-wide app) is
    # `grant_app_access()`'s own rule, enforced where every grant is written --
    # not repeated here, where a copy could drift.
    _assert_grants_are_legal(organization, None, grants)

    for app, role in grants:
        if is_member:
            grant_app_access(
                membership=person,
                app=app,
                role=role,
                territories=_placement(organization, app, None),
                actor_id=actor.user_id,
            )
        else:
            InvitationAppGrant.objects.create(invitation=person, app_id=app, role=role)
    return person


@transaction.atomic
def assign_users_to_app(
    *,
    actor: Membership,
    organization: Organization,
    app: str,
    person_ids: list[uuid.UUID],
    role: str,
) -> None:
    """
    Applications -> an app -> Assign users (the owner, 2026-11-20): give one app
    to several people, all with the same role.

    THE SAME ACT AS ASSIGN APPLICATIONS, seen from the app's side, so it is
    `assign_apps()` once per person -- every rule there holds here: bought,
    organisation-level role, C27, not the owner, not an app they already hold,
    and only people the actor may manage (else 404).

    ALL OR NOTHING: one transaction around them all, so one person who cannot
    be given the app means nobody is.
    """
    if len(set(person_ids)) != len(person_ids):
        raise InvalidInputError(
            field_errors=[
                FieldError(field="users", code="duplicate", detail="Name each person once.")
            ]
        )
    for person_id in person_ids:
        assign_apps(
            actor=actor,
            organization=organization,
            person_id=person_id,
            apps=[{"app": app, "role": role}],
        )


# ---------------------------------------------------------------------------
# ONE APP OF ONE PERSON: the app tile's Edit | Disable | Unassign (the owner,
# 2026-11-20, as Zoho's). Each is its own action with its own permission.
#
# THE SAME THREE REFUSALS OPEN EACH ONE: somebody the actor may not manage is
# 404; the owner holds every app by rule, so there is nothing of theirs to
# change (409); Administration is not an app, and making or unmaking an admin
# is Assign Admin's job (409).
# ---------------------------------------------------------------------------


def _person_for_app_action(
    actor: Membership, organization: Organization, person_id: uuid.UUID, app: str
) -> Membership | Invitation:
    person = find_person(organization, person_id)
    _assert_can_manage_person(actor, person)
    if isinstance(person, Membership) and person.is_owner:
        raise OwnerHoldsEveryAppError
    if app == AppCode.ADMIN:
        raise AdministrationNotGrantableError
    return person


def _held_grant(membership: Membership, app: str) -> MembershipAppAccess:
    """Their grant for `app`, disabled or not -- 404 if they hold none."""
    try:
        return MembershipAppAccess.objects.get(membership=membership, app_id=app)
    except MembershipAppAccess.DoesNotExist:
        raise not_found("App") from None


@transaction.atomic
def change_app_role(
    *,
    actor: Membership,
    organization: Organization,
    person_id: uuid.UUID,
    app: str,
    role: str,
) -> Membership | Invitation:
    """
    The app tile's Edit: change the role somebody holds in one app.

    ONLY THE ROLE. Their places in the app stay as they are, and the new role
    must fit them (C27): an organisation-level role for somebody placed at the
    organisation, a dealership role for somebody at a dealership. A disabled
    grant stays disabled.
    """
    person = _person_for_app_action(actor, organization, person_id, app)
    [(_, new_role)] = _resolve_grants(organization, [{"app": app, "role": role}])

    if isinstance(person, Invitation):
        # Pending people's apps are organisation-wide until they join (C83).
        try:
            pending = person.app_grants.get(app_id=app)
        except InvitationAppGrant.DoesNotExist:
            raise not_found("App") from None
        _assert_grants_are_legal(organization, None, [(app, new_role)])
        pending.role = new_role
        pending.save(update_fields=["role", "updated_at"])
        return person

    grant = _held_grant(person, app)
    places = [p.territory for p in grant.territories.select_related("territory")]
    at_the_root = any(territory.is_root for territory in places)
    _assert_grants_are_legal(
        organization, None if at_the_root else places[0].id, [(app, new_role)]
    )
    grant_app_access(
        membership=person, app=app, role=new_role, territories=places, actor_id=actor.user_id
    )
    return person


@transaction.atomic
def set_app_status(
    *,
    actor: Membership,
    organization: Organization,
    person_id: uuid.UUID,
    app: str,
    status: str,
) -> Membership:
    """
    The app tile's Disable, or Enable to undo it.

    A DISABLED GRANT KEEPS EVERYTHING -- role and places -- so Enable gives back
    exactly what was there. While disabled it opens nothing and permits nothing
    (`selectors._membership_data`), and the person still belongs where they
    are placed, so the same admins still manage them.

    Members only: a pending person's apps open nothing yet (`AppNotYetInUseError`).
    """
    person = _person_for_app_action(actor, organization, person_id, app)
    if isinstance(person, Invitation):
        raise AppNotYetInUseError

    grant = _held_grant(person, app)
    if grant.status != status:
        grant.status = status
        grant.updated_by_user_id = actor.user_id
        grant.save(update_fields=["status", "updated_by_user_id", "updated_at"])
    return person


@transaction.atomic
def unassign_app(
    *,
    actor: Membership,
    organization: Organization,
    person_id: uuid.UUID,
    app: str,
) -> Membership | Invitation:
    """
    The app tile's Unassign: take one app away. Its role and places go with it
    (`revoke_app_access`). A person may be left with no app at all (C73
    retired). For a pending person, the app comes off their invitation.
    """
    person = _person_for_app_action(actor, organization, person_id, app)

    if isinstance(person, Invitation):
        deleted, _ = person.app_grants.filter(app_id=app).delete()
        if not deleted:
            raise not_found("App")
        return person

    _held_grant(person, app)
    revoke_app_access(membership=person, app=app)
    return person


@transaction.atomic
def update_app_user(
    *,
    actor: Membership,
    organization: Organization,
    app: str,
    person_id: uuid.UUID,
    first_name: str,
    last_name: str,
    email: str,
    role: str,
) -> Membership | Invitation:
    """
    AN APP'S OWN EDIT (the owner, 2026-11-24: DMS settings -> Users -> Edit):
    the person's basic information AND their role in this app, in one save.

    EXACTLY TWO EXISTING ACTS in one transaction, so their rules hold and
    cannot drift: `update_person_details()` (the Admin panel's Edit -- a
    member's email is how they sign in and is refused if changed, C25) and
    `change_app_role()` (the app tile's Edit -- the role must fit where they
    are placed). Never the owner, who holds every app by rule
    (`OwnerHoldsEveryAppError`); 404 for somebody not holding the app.
    """
    person = _person_for_app_action(actor, organization, person_id, app)
    if isinstance(person, Membership):
        _held_grant(person, app)
    elif not person.app_grants.filter(app_id=app).exists():
        raise not_found("App")

    update_person_details(
        actor=actor,
        organization=organization,
        person_id=person_id,
        first_name=first_name,
        last_name=last_name,
        email=email,
    )
    return change_app_role(
        actor=actor, organization=organization, person_id=person_id, app=app, role=role
    )


@transaction.atomic
def remove_from_app(
    *, actor: Membership, organization: Organization, person_id: uuid.UUID, app: str
) -> None:
    """
    AN APP'S OWN DELETE (the owner, 2026-11-24: DMS settings -> Users ->
    Delete): take the app away -- `unassign_app()`, the app tile's Unassign --
    and nothing else. A member stays in the organisation with their other apps.

    A PENDING PERSON LEFT HOLDING NO APP IS CANCELLED: somebody added from the
    app and removed from it again has nothing left to be invited to, and an
    empty invitation would sit in the Admin panel's Users as a person nobody
    meant to add. One holding another app keeps their invitation.
    """
    person = unassign_app(actor=actor, organization=organization, person_id=person_id, app=app)
    if isinstance(person, Invitation) and not person.app_grants.exists():
        person.delete()


@transaction.atomic
def remove_person(*, actor: Membership, organization: Organization, person_id: uuid.UUID) -> None:
    """
    Take somebody out of this organization.

    NOT "delete the user" (C24). Their account lives in the control database
    and may belong to other organizations; what goes is the MEMBERSHIP. Their
    name therefore stays on what they did --- an enquiry raised by A. Fernandes
    still says so after she leaves, because it references a person who still
    exists.

    For somebody who never accepted, this is simply cancelling the invitation:
    there is no account yet and nothing references them.
    """
    person = find_person(organization, person_id)
    _assert_can_manage_person(actor, person)

    if isinstance(person, Membership) and person.is_owner:
        # Checked here as well as hidden in the UI: an organization with no
        # owner has nobody who could appoint one (C14), and a request does not
        # have to come from our menu.
        raise OwnerProtectedError

    person.delete()


@transaction.atomic
def set_person_status(
    *, actor: Membership, organization: Organization, person_id: uuid.UUID, status: str
) -> Membership:
    """
    Switch somebody off, or back on.

    MEMBERS ONLY. There is nothing to disable about an invitation --- it has
    been sent or it has not --- so this refuses rather than inventing a third
    state for a row that cannot hold one. C51 is what makes that clean: pending
    people are not memberships, so there is no `status` on them to misuse.

    Q17 settled what disabling costs somebody: simplejwt loads the user row on
    every request and refuses an inactive one, so it takes effect on their NEXT
    REQUEST rather than when their token expires.
    """
    person = find_person(organization, person_id)
    _assert_can_manage_person(actor, person)

    if isinstance(person, Invitation):
        raise NotAnInvitationError

    if person.is_owner:
        # An organization whose owner is switched off has nobody who could
        # switch them back on.
        raise OwnerProtectedError

    person.status = status
    person.save(update_fields=["status"])
    return person


@transaction.atomic
def _pending_invitation(
    *, actor: Membership, organization: Organization, person_id: uuid.UUID
) -> Invitation:
    """
    The outstanding invitation behind a row in the users list, or a refusal.

    THREE REFUSALS AND THEY ARE DIFFERENT (C56). An id from another
    dealership is 404 via `_assert_can_manage`, because a person the caller
    may not see must look like one who does not exist. An id belonging to
    somebody who has already accepted is 409, because the row is real and the
    screen is stale.

    Shared by resend and the link, so the two cannot disagree about who may
    act on whose invitation --- the kind of drift C54 found between two forms
    asking one question.
    """
    person = find_person(organization, person_id)
    _assert_can_manage_person(actor, person)

    if not isinstance(person, Invitation):
        raise NotAnInvitationError

    return person


def invitation_for_link(
    *, actor: Membership, organization: Organization, person_id: uuid.UUID
) -> Invitation:
    """
    Fetch a pending invitation so its link can be shown again (C56).

    A READ, deliberately separate from `resend_invitation()`. Copying the
    link must not change the token --- an admin who presses Copy twice has
    sent one link to one person, and re-minting on read would invalidate the
    message they sent thirty seconds ago.
    """
    return _pending_invitation(actor=actor, organization=organization, person_id=person_id)


def resend_invitation(
    *, actor: Membership, organization: Organization, person_id: uuid.UUID
) -> Invitation:
    """
    Send somebody's invitation again, with a fresh token and a new expiry.

    A NEW TOKEN, not the old one sent twice. The old one stops working, so an
    invitation forwarded to the wrong person cannot still be accepted after an
    admin has resent it to the right one.

    IT SENDS NO EMAIL. The delivery half of the invitation flow does not exist
    --- Phase 2 still owes invite-to-accept end to end --- so this refreshes
    the row and nothing leaves the building. That is deliberately not faked:
    the half this does is the half that has to be right, and a mocked send
    would make the gap invisible.
    """
    person = _pending_invitation(actor=actor, organization=organization, person_id=person_id)

    person.token = secrets.token_urlsafe(INVITATION_TOKEN_BYTES)
    person.expires_at = timezone.now() + INVITATION_LIFETIME
    person.save(update_fields=["token", "expires_at"])
    return person


# ---------------------------------------------------------------------------
# Accepting an invitation (C56).
#
# THERE IS NO EMAIL. The link is handed to the admin and delivered by hand ---
# pasted into a chat, read out, whatever the organisation already uses --- so
# the token in it IS the credential and nothing else guards the door. That is
# true of every "set your password" link ever sent; the only difference here is
# the channel, which is why `invitation_link()` is the one place the URL is
# built and why resending INVALIDATES rather than repeats (C56).
#
# NOT ORG-SCOPED, and it cannot be. Everything under /orgs/<slug>/ inherits
# `OrgScopedAPIView`, which verifies an active membership before the handler
# runs (C49) --- and the person holding this link is precisely somebody with no
# membership yet. So these two live at /api/v1/invitations/<token>/ and the
# token is the only thing that names the organisation.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AcceptResult:
    """
    What accepting created.

    `account_created` is False when the person already had an account and
    signed in to accept, which is the C1 case: one login spanning several
    organisations.
    """

    user: User
    organization: Organization
    membership: Membership
    account_created: bool


def invitation_link(invitation: Invitation) -> str:
    """
    The URL to hand to whoever is being invited.

    ONE PLACE, because the token is a credential and a second place that
    assembles this URL is a second place that can leak it into a log or build
    it against the wrong host. `FRONTEND_BASE_URL` is read from settings and
    must be set: a relative link pasted into a chat message is not a link at
    all, and defaulting to localhost in production would hand every new
    employee an address that only works on the server.
    """
    base = getattr(settings, "FRONTEND_BASE_URL", "") or ""
    if not base:
        # Loud, immediately, rather than returning something broken. This
        # project has lost hours three times to a setting that looked
        # configured and did nothing (BLACKLIST_AFTER_ROTATION, an ESLint
        # extglob, CSRF_TRUSTED_ORIGINS), and an invitation link is noticed
        # only by the person who cannot use it.
        raise ImproperlyConfigured(
            "FRONTEND_BASE_URL is not set, so no invitation link can be built. "
            "Set it to the origin the SPA is served from."
        )
    return f"{base.rstrip('/')}/invite/{invitation.token}"


@transaction.atomic
def accept_invitation(
    *,
    token: str,
    password: str | None = None,
    user: User | None = None,
) -> AcceptResult:
    """
    Redeem an invitation: create the account if there is not one, then join.

    `select_for_update` IS THE POINT OF THIS FUNCTION. A link clicked twice ---
    an impatient double click, a browser prefetching, a chat app unfurling a
    preview --- must not produce two memberships, and the unique constraint on
    (user, organization) would turn the second into an IntegrityError and a
    500. The row is locked before anything is read, so the second caller waits
    and then finds `accepted_at` set.

    TWO WAYS IN, and they are not interchangeable (C56):

    - No account for this address: `password` creates one.
    - An account exists: the caller must BE that account, already signed in.
      Setting a password here would be a password reset triggered by a link,
      which is the account takeover Q23 refuses from the admin side.

    EVERY RULE IS RE-CHECKED, not trusted from invite time. An invitation can
    sit for a week, and in that time the app can be unsubscribed or the
    address can be given a membership another way. So `_assert_email_free` and
    `_assert_grants_are_legal` both run again, and both refuse rather than
    quietly dropping what they cannot honour --- somebody who joins with less
    access than they were promised has nothing to tell them so.
    """
    try:
        invitation = (
            Invitation.objects.select_for_update()
            .select_related("organization")
            .get(token=token)
        )

    except (Invitation.DoesNotExist, DjangoValidationError, ValueError):
        # A token nobody holds is not bad input to report back on; it is an
        # invitation that does not exist for this caller. Same answer as a
        # token that was never minted at all.
        raise not_found("Invitation") from None

    if invitation.accepted_at is not None:
        raise InvitationAlreadyAcceptedError

    if invitation.expires_at <= timezone.now():
        raise InvitationExpiredError

    organization = invitation.organization
    email = User.objects.normalize_email(invitation.email).lower()

    # Somebody may have been added to this organisation by another route while
    # the invitation was outstanding. 409, with the invitation left unspent, so
    # an admin can see both rows and cancel one.
    _assert_email_free(organization, email, excluding_invitation=invitation.id)

    grants = [
        (grant.app_id, grant.role)
        for grant in invitation.app_grants.select_related("role").all()
    ]
    # Re-checked like the rest. An invitation has no place (C83), so its apps
    # are organisation-wide: an organisation-level role each.
    _assert_grants_are_legal(organization, None, grants)

    existing = User.objects.filter(email__iexact=email).first()

    if existing is not None:
        if user is None or not user.is_authenticated:
            raise InvitationNeedsSignInError
        if user.pk != existing.pk:
            raise InvitationWrongAccountError
        account = existing
        account_created = False
    else:
        if user is not None and user.is_authenticated:
            # Signed in as somebody who is not the invited address, and the
            # invited address has no account at all. Accepting would attach
            # this organisation to the wrong person.
            raise InvitationWrongAccountError
        if not password:
            # The serializer asks for it too, but this function has to be
            # callable from a shell and a test, so the rule lives here as well.
            raise InvalidInputError(
                field_errors=[
                    FieldError(
                        field="password",
                        code="required",
                        detail="Choose a password to finish setting up your account.",
                    )
                ]
            )
        account = User.objects.create_user(
            email=email,
            password=password,
            first_name=invitation.first_name,
            last_name=invitation.last_name,
        )
        account_created = True

    membership = Membership.objects.create(
        user=account,
        organization=organization,
        status=MembershipStatus.ACTIVE,
        # NO `role`, NO `unit` (C72 step 2d-2): where they sit and whether they
        # administer are the grants below. `role` takes its column default.
        #
        # NOT the owner. An owner is founded with the organisation and never
        # invited into it (C41) --- `invite_person` refuses the role outright,
        # so `is_owner` stays NULL here and the one-owner constraint is
        # untouched.
        is_owner=None,
        created_by_user_id=invitation.invited_by_id,
    )

    for app, role in grants:
        grant_app_access(
            membership=membership,
            app=app,
            role=role,
            territories=_placement(organization, app, None),
            actor_id=invitation.invited_by_id,
        )
    # NO ADMINISTRATION FROM AN INVITATION (C83): an invitation is a person,
    # and being made an admin is done once they have joined.

    invitation.accepted_at = timezone.now()
    invitation.save(update_fields=["accepted_at", "updated_at"])

    return AcceptResult(
        user=account,
        organization=organization,
        membership=membership,
        account_created=account_created,
    )


# ---------------------------------------------------------------------------
# THE ROLE BUILDER (C72 piece 5; the owner, 2026-11-20, as Zoho's New Role):
# Admins and Roles -> Roles -> Add Role.
# ---------------------------------------------------------------------------

# Names people already see on the Roles tab for the built-in rows, in both
# spellings: a custom role must not look like one of them in a picker.
_BUILT_IN_PANEL_ROLE_NAMES = {
    "organization owner",
    "organisation owner",
    "organization admin",
    "organisation admin",
}


@transaction.atomic
def create_admin_role(
    *,
    actor: Membership,
    organization: Organization,
    name: str,
    description: str,
    permissions: list[str],
) -> Role:
    """
    Make one of this organisation's own Admin panel roles.

    Every rule is `_checked_admin_role()`'s, shared with Edit Role. The role
    belongs to this organisation only (`organization_id`); its code is
    generated, so it can never collide with a built-in one.
    """
    name, chosen = _checked_admin_role(
        actor=actor, organization=organization, name=name, permissions=permissions
    )

    role = Role.objects.create(
        code=f"admin.custom_{uuid.uuid4().hex[:12]}",
        name=name,
        app_id=AppCode.ADMIN,
        level=RoleLevel.ORG,
        summary=description.strip(),
        organization_id=organization.id,
        display_order=100,
        created_by_user_id=actor.user_id,
        updated_by_user_id=actor.user_id,
    )
    RolePermission.objects.bulk_create(
        [
            RolePermission(role=role, permission=permission, created_by_user_id=actor.user_id)
            for permission in chosen
        ]
    )
    return role


@transaction.atomic
def update_admin_role(
    *,
    actor: Membership,
    organization: Organization,
    code: str,
    name: str,
    description: str,
    permissions: list[str],
) -> Role:
    """
    Edit Role: one of this organisation's own Admin panel roles gets a new
    name, description and permission list (the list REPLACES the old one).

    THE SAME RULES AS NEW ROLE (`_checked_admin_role()`), because an edited role
    is saved exactly like a new one -- an Edit that skipped a rule would be the
    way round it. The name may stay its own.

    "Never beyond your own access" reads the WHOLE new list, not only what was
    added: you may not save a role more powerful than you are, even by
    renaming one.

    Whoever holds the role gets the new permissions on their next request --
    permissions are read from the role, never copied onto the person.
    """
    role = _own_admin_role(organization, code)
    name, chosen = _checked_admin_role(
        actor=actor,
        organization=organization,
        name=name,
        permissions=permissions,
        keeping=role,
    )

    role.name = name
    role.summary = description.strip()
    role.updated_by_user_id = actor.user_id
    role.save(update_fields=["name", "summary", "updated_by_user_id", "updated_at"])

    # Only what changed: a permission kept keeps its row (and who added it).
    wanted = {permission.id: permission for permission in chosen}
    current = set(role.role_permissions.values_list("permission_id", flat=True))
    role.role_permissions.exclude(permission_id__in=wanted).delete()
    RolePermission.objects.bulk_create(
        [
            RolePermission(role=role, permission=permission, created_by_user_id=actor.user_id)
            for permission_id, permission in wanted.items()
            if permission_id not in current
        ]
    )
    return role


@transaction.atomic
def delete_admin_role(*, organization: Organization, code: str) -> None:
    """
    Delete Role: one of this organisation's own Admin panel roles, REFUSED
    WHILE ANYBODY HOLDS IT (409, `RoleInUseError`).

    "Holds" is both kinds of person:

    - a MEMBER, through their grant (`MembershipAppRole`);
    - a PENDING person, through their invitation (`InvitationAppGrant`).

    Both point at the role with PROTECT. Counting only one of them would send
    the other into the database's refusal -- a `ProtectedError`, an
    IntegrityError, which the handler logs as an error and answers with a
    generic "conflicts with the current state" that tells the admin nothing.
    (Revert-checked: without the invitation count, the pending-person test
    gets exactly that.)

    An ACCEPTED invitation's grant is a spent offer: accepting copied it into
    the member's own grant, which is what is counted. Those rows go with the
    role, or PROTECT would make a role nobody holds undeletable forever.

    THE ROLE ROW IS LOCKED FIRST. A grant being written at the same moment
    checks its foreign key against that row and waits, so nobody can be given
    the role between the count and the delete.
    """
    role = _own_admin_role(organization, code)

    members = (
        MembershipAppRole.objects.filter(role=role)
        .values("app_access__membership")
        .distinct()
        .count()
    )
    pending = InvitationAppGrant.objects.filter(
        role=role, invitation__accepted_at__isnull=True
    ).count()
    if members or pending:
        people = members + pending
        held_by = "1 person" if people == 1 else f"{people} people"
        waiting = f" ({pending} pending)" if pending else ""
        raise RoleInUseError(
            f"{role.name} is held by {held_by}{waiting}. Take the role away from them first.",
            role_id=str(role.id),
            members=members,
            pending=pending,
        )

    InvitationAppGrant.objects.filter(role=role, invitation__accepted_at__isnull=False).delete()
    role.delete()  # its RolePermission rows cascade


def _own_admin_role(organization: Organization, code: str) -> Role:
    """
    The Admin panel role Edit / Delete Role named, LOCKED for the rest of the
    transaction.

    LOOKED UP THROUGH `roles_for_organization()`: another organisation's role
    is not found (404), however well its code is known. A built-in role IS
    found -- everybody sees it on the Roles tab -- and refused for what it is
    (409). Organization Owner is not a role row at all ("owner" is the Roles
    tab's code for the rule), so it is refused the same way.
    """
    if code == "owner":
        raise BuiltInRoleUnchangeableError
    role = (
        roles_for_organization(organization.id)
        .select_for_update()
        .filter(app_id=AppCode.ADMIN, code=code)
        .first()
    )
    if role is None:
        raise not_found("Role")
    if role.is_built_in:
        raise BuiltInRoleUnchangeableError
    return role


def _checked_admin_role(
    *,
    actor: Membership,
    organization: Organization,
    name: str,
    permissions: list[str],
    keeping: Role | None = None,
) -> tuple[str, list[Permission]]:
    """
    EVERY RULE A SAVED ADMIN PANEL ROLE OBEYS -- New Role's and Edit Role's,
    from one place, so a rule added later binds both. Checked here because a
    request does not have to come from the grid:

    - a name;
    - only the Admin panel's permissions that are on the section tree (C79);
    - at least one;
    - RULE 5: anything on a page needs that page's View;
    - NEVER BEYOND THE BUILDER'S OWN ACCESS: a role cannot grant what its
      builder does not hold (the owner holds everything by rule);
    - a name not already used by this organisation's roles, or the built-ins'.
      `keeping` is the role being edited, which may keep its own name.

    Returns the cleaned name and the permission rows. Saves nothing.
    """
    name = name.strip()
    if not name:
        raise InvalidInputError(
            field_errors=[FieldError(field="name", code="required", detail="Enter a role name.")]
        )

    codes = list(dict.fromkeys(permissions))
    if not codes:
        raise InvalidInputError(
            field_errors=[
                FieldError(
                    field="permissions", code="required", detail="Tick at least one permission."
                )
            ]
        )

    chosen = list(
        Permission.objects.filter(code__in=codes, app_id=AppCode.ADMIN, section__isnull=False)
    )
    if len(chosen) != len(codes):
        raise InvalidInputError(
            field_errors=[
                FieldError(
                    field="permissions",
                    code="invalid",
                    detail="Only the Admin panel's own permissions can be given.",
                )
            ]
        )

    viewed = {p.section_id for p in chosen if p.action_id == VIEW_ACTION}
    if any(p.section_id not in viewed for p in chosen):
        raise InvalidInputError(
            field_errors=[
                FieldError(
                    field="permissions",
                    code="needs_view",
                    detail="Anything on a page needs that page's View too.",
                )
            ]
        )

    if not actor.is_owner and not set(codes) <= permissions_for(actor):
        raise RoleBeyondOwnAccessError

    others = roles_for_organization(organization.id).filter(
        app_id=AppCode.ADMIN, name__iexact=name
    )
    if keeping is not None:
        others = others.exclude(pk=keeping.pk)
    if name.lower() in _BUILT_IN_PANEL_ROLE_NAMES or others.exists():
        raise RoleNameTakenError

    return name, chosen


# ---------------------------------------------------------------------------
# ASSIGN ADMIN (the owner, 2026-11-23, from Zoho's): Admins and Roles -> Admins
# -> Assign Admin, or a custom role's panel -> Assign Users. Several people, one
# Admin panel role.
# ---------------------------------------------------------------------------


@transaction.atomic
def assign_admin_role(
    *,
    actor: Membership,
    organization: Organization,
    person_ids: list[uuid.UUID],
    role_code: str,
) -> None:
    """
    Give each of these people the same Admin panel role -- Organization Admin
    or one of the organisation's own (C89) -- at the organisation's root.

    ALL OR NOTHING: one transaction, so one person who cannot be given it means
    nobody is.

    THE ROLE:
    - looked up through `roles_for_organization()`, Admin panel roles only:
      another organisation's role, a DMS role, "owner" or a made-up code is not
      found (404);
    - NEVER BEYOND THE GIVER'S OWN ACCESS (the owner chose (b), 2026-11-23):
      anybody with `admin.admin.assign_admin` may give any Admin panel role --
      Organization Admin included -- that grants nothing they do not hold
      themselves (403). The owner holds everything by rule.

    EACH PERSON, refused with the reason (409) unless they are:
    - somebody the actor may manage (404 otherwise, as everywhere);
    - a member who has joined -- not a pending invitation (C83);
    - not the owner, who holds everything by rule;
    - holding no Admin panel role yet -- one per person; Assign Admin only
      ADDS, changing one is the admin row's Manage Roles;
    - not placed at a dealership: an Admin panel role reaches the whole
      organisation (C89), which `grant_app_access()` also refuses (C27).
    """
    if not person_ids:
        raise InvalidInputError(
            field_errors=[FieldError(field="users", code="required", detail="Pick somebody.")]
        )
    if len(set(person_ids)) != len(person_ids):
        raise InvalidInputError(
            field_errors=[
                FieldError(field="users", code="duplicate", detail="Name each person once.")
            ]
        )

    role = (
        roles_for_organization(organization.id)
        .filter(app_id=AppCode.ADMIN, code=role_code)
        .prefetch_related("permissions")
        .first()
    )
    if role is None:
        raise not_found("Role")
    if not actor.is_owner and not (
        {p.code for p in role.permissions.all()} <= permissions_for(actor)
    ):
        raise RoleBeyondOwnAccessError(
            "You cannot give a role with permissions you do not hold yourself."
        )

    root = Territory.objects.root_for(organization, AppCode.ADMIN)
    for person_id in person_ids:
        person = find_person(organization, person_id)
        _assert_can_manage_person(actor, person)
        if isinstance(person, Invitation):
            raise AdminNotJoinedError
        if person.is_owner:
            raise OwnerHoldsEveryAppError
        if admin_panel_role(person) is not None:
            raise AlreadyAnAdminError
        if any(
            _is_dealership_place(placement.territory)
            for grant in person.grants.all()
            for placement in grant.territories.all()
        ):
            raise AdminAtDealershipError

        grant_app_access(
            membership=person,
            app=AppCode.ADMIN,
            role=role,
            territories=[root],
            actor_id=actor.user_id,
        )


# ---------------------------------------------------------------------------
# MANAGE ROLES / UNASSIGN (the owner, 2026-11-23): an admin's row on the Admins
# tab -> ⋮. Change the one Admin panel role somebody holds, or take it away.
# ---------------------------------------------------------------------------


def _admin_to_act_on(
    actor: Membership, organization: Organization, person_id: uuid.UUID
) -> tuple[Membership, Role]:
    """
    The admin Manage Roles / Unassign names, and the role they hold -- after
    every refusal both share, in this order:

    - somebody the actor may not manage, or not in this organisation: 404;
    - the owner (holds everything by rule; nothing to change): 409;
    - somebody holding no Admin panel role (use Assign Admin): 409;
    - THE ACTOR THEMSELVES (the owner's choice, 2026-11-23): 409 -- taking
      your own role away locks you out with no way back;
    - somebody whose CURRENT role grants more than the actor holds (the
      owner's choice): 403 -- "never beyond your own access" applied to the
      person acted on, or an "Application Admin" with `unassign_admin` could
      strip a full Organization Admin. The owner may act on anybody.
    """
    person = find_person(organization, person_id)
    _assert_can_manage_person(actor, person)
    if isinstance(person, Invitation):
        raise NotAnAdminError
    if person.is_owner:
        raise OwnerHoldsEveryAppError
    current = admin_panel_role(person)
    if current is None:
        raise NotAnAdminError
    if person.pk == actor.pk:
        raise OwnAdminRoleError
    if not actor.is_owner and not (
        {p.code for p in current.permissions.all()} <= permissions_for(actor)
    ):
        raise RoleBeyondOwnAccessError(
            "Their role grants more than you hold, so you cannot change it."
        )
    return person, current


@transaction.atomic
def change_admin_role(
    *,
    actor: Membership,
    organization: Organization,
    person_id: uuid.UUID,
    role_code: str,
) -> Membership:
    """
    Manage Roles: replace the Admin panel role somebody holds (one per person,
    C89) -- every `_admin_to_act_on()` refusal, then the new role the same way
    Assign Admin checks it: an Admin panel role of this organisation's (404
    otherwise) that grants nothing beyond the actor's access (403). Their grant
    stays at the root; the role row records who changed it (Q71).
    """
    person, _current = _admin_to_act_on(actor, organization, person_id)

    role = (
        roles_for_organization(organization.id)
        .filter(app_id=AppCode.ADMIN, code=role_code)
        .prefetch_related("permissions")
        .first()
    )
    if role is None:
        raise not_found("Role")
    if not actor.is_owner and not (
        {p.code for p in role.permissions.all()} <= permissions_for(actor)
    ):
        raise RoleBeyondOwnAccessError(
            "You cannot give a role with permissions you do not hold yourself."
        )

    grant_app_access(
        membership=person,
        app=AppCode.ADMIN,
        role=role,
        territories=[Territory.objects.root_for(organization, AppCode.ADMIN)],
        actor_id=actor.user_id,
    )
    return person


@transaction.atomic
def unassign_admin_role(
    *, actor: Membership, organization: Organization, person_id: uuid.UUID
) -> Membership:
    """
    Unassign: take somebody's Admin panel role away -- every
    `_admin_to_act_on()` refusal first. They stay a member with every other
    app; they leave the Admins tab, and their role's count drops. Their next
    request no longer carries the role's permissions.
    """
    person, _current = _admin_to_act_on(actor, organization, person_id)
    revoke_app_access(membership=person, app=AppCode.ADMIN)
    return person
