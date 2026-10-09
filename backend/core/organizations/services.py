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

from core.accounts.models import User
from core.billing.models import AppSubscription, SubscriptionStatus
from core.organizations.exceptions import (
    ActivationCodeExpiredError,
    ActivationCodeInvalidError,
    ActivationCodeSpentError,
    AdministrationNotGrantableError,
    AppNotSubscribedError,
    DealerCodeTakenError,
    DealerNameTakenError,
    DealerScopedAppError,
    EmailAlreadyRegisteredError,
    InvitationAlreadyAcceptedError,
    InvitationExpiredError,
    InvitationNeedsSignInError,
    InvitationWrongAccountError,
    NotAnInvitationError,
    OrganizationNameUnusableError,
    OwnerProtectedError,
    PersonEmailTakenError,
    RoleScopeMismatchError,
    SignInAddressLockedError,
)
from core.organizations.identifiers import extract_pan
from core.organizations.models import (
    ActivationCode,
    BusinessUnit,
    Invitation,
    InvitationAppGrant,
    Membership,
    MembershipRole,
    MembershipStatus,
    Organization,
)
from core.organizations.selectors import can_manage
from core.organizations.tasks import schedule_provisioning
from core.permissions.models import AppAccess, AppCode, Role, RoleLevel
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

    membership = Membership.objects.create(
        user=user,
        organization=organization,
        role=MembershipRole.OWNER,
        status=MembershipStatus.ACTIVE,
        # Exactly one owner per organization, expressed the MySQL way: True for
        # the owner and NULL for everyone else, unique on (organization,
        # owner_marker). The check constraint refuses the two drifting apart,
        # so this is set HERE rather than left to a signal.
        owner_marker=True,
        # An owner is organization-wide. The check constraint enforces it, and
        # C40 is the reason: somebody who administers one dealership holds the
        # DMS System administrator role instead.
        unit=None,
        created_by_user_id=user.id,
    )

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

    TWO ROWS, NEVER ONE. `AppSubscription` says the organization pays;
    `AppAccess` says this person may open it. The owner is not exempt from the
    second --- C41 rejected an implicit "or is_owner" because an escape hatch
    in every permission check is where that kind of bug lives, and because the
    owner is the one account that cannot be deactivated.
    """
    if app == AppCode.ADMIN:
        # Administration is neither sold nor granted: it comes with the
        # platform and is gated by standing and permissions (C40). Both tables
        # have a check constraint refusing it, so this would be an IntegrityError
        # rather than a quiet mistake --- but failing here says why.
        raise ValueError(
            "Administration is not subscribable or grantable (C40). "
            "The owner reaches it through standing."
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
        organization=organization, app=app, created_by_user_id=actor_id
    )

    AppAccess.objects.create(
        membership=membership,
        app=app,
        role=Role.objects.get(app=app, code=role_code),
        created_by_user_id=actor_id,
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


@transaction.atomic
def create_dealer(
    *,
    organization: Organization,
    name: str,
    code: str | None = None,
    gstin: str = "",
    pan: str = "",
    contact_person: str = "",
    email: str = "",
    phone: str = "",
    city: str = "",
    state: str = "",
    postal_code: str = "",
) -> BusinessUnit:
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
    """
    _assert_dealer_name_free(organization, name)
    _assert_dealer_code_free(organization, code)

    return BusinessUnit.objects.create(
        organization=organization,
        name=name,
        # NULL, never "", and the model comment explains why: MySQL treats
        # every NULL in a unique index as distinct but two empty strings as a
        # duplicate, so storing "" would let the first dealership without a
        # code be created and refuse the second.
        code=code or None,
        gstin=gstin,
        # DERIVED HERE, not in the browser. Characters 3-12 of a GSTIN are the
        # holder's PAN, so a caller who sends one is overriding a default
        # rather than supplying a fact we did not have -- and the default has
        # to exist somewhere both a form and a shell session reach.
        pan=pan or extract_pan(gstin),
        contact_person=contact_person,
        email=email,
        phone=phone,
        city=city,
        state=state,
        postal_code=postal_code,
    )


@transaction.atomic
def update_dealer(*, dealer: BusinessUnit, **fields: str | None) -> BusinessUnit:
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


def _assert_dealer_name_free(
    organization: Organization, name: str, excluding: uuid.UUID | None = None
) -> None:
    existing = BusinessUnit.objects.filter(organization=organization, name=name)
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

    existing = BusinessUnit.objects.filter(organization=organization, code=code)
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
    if not can_manage(actor, target_unit_id):
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


def _resolve_unit(organization: Organization, unit_id: uuid.UUID | None) -> BusinessUnit | None:
    if unit_id is None:
        return None
    try:
        return BusinessUnit.objects.get(id=unit_id, organization=organization)
    except (BusinessUnit.DoesNotExist, DjangoValidationError, ValueError):
        # Another organization's dealership is not bad input to report back, it
        # is a dealership this caller cannot see.
        raise not_found("Dealer") from None


def _resolve_grants(apps: list[dict]) -> list[tuple[str, Role]]:
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
            grants.append((app, Role.objects.get(code=entry["role"], app=app)))
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
        return Membership.objects.select_related("user", "unit").get(
            id=person_id, organization=organization
        )
    except (Membership.DoesNotExist, DjangoValidationError, ValueError):
        pass

    try:
        return Invitation.objects.select_related("unit").get(
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
    unit_id: uuid.UUID | None,
    role: str,
    apps: list[dict],
) -> Invitation:
    """
    Invite somebody into this organization.

    CREATES AN INVITATION, NOT A MEMBERSHIP (C51). There is no account yet and
    there may never be one; accepting creates the membership, in its own
    transaction.

    A DEALER ADMIN CANNOT APPOINT AN ORGANIZATION ADMIN. `_assert_can_manage`
    covers the dealership; the standing check covers the ladder. An `admin`
    invitation is organization-wide by definition --- the check constraint
    refuses `admin` with a unit attached --- so a dealer admin issuing one
    would be promoting a stranger above themselves.
    """
    if role == MembershipRole.OWNER:
        # Not a permission failure. An owner is founded with the organization
        # and never invited into it (C41), so there is no standing that allows
        # this at all.
        raise OwnerProtectedError

    # THESE TWO COME BEFORE THE SCOPE CHECK, and the order is the difference
    # between a 403 and a 404.
    #
    # A create has no existing record to hide, so "you may not appoint
    # administrators" and "organization-wide people are not yours to create"
    # are capability answers -- 403 -- and they disclose nothing: `admin` and
    # `None` are not ids that might or might not exist.
    #
    # A SPECIFIC `unit_id` IS DIFFERENT and stays a 404 below. Answering 403
    # for a real dealership the caller may not use, while `_resolve_unit()`
    # answers 404 for one that does not exist, would let a dealer admin
    # enumerate the organization's dealerships by watching which status comes
    # back. Both have to be the same refusal.
    if actor.unit_id is not None:
        if role == MembershipRole.ADMIN:
            raise AuthorizationError
        if unit_id is None:
            raise AuthorizationError

    _assert_can_manage(actor, unit_id)

    unit = _resolve_unit(organization, unit_id)
    grants = _resolve_grants(apps)
    _assert_grants_are_legal(organization, unit_id, grants)
    _assert_email_free(organization, email)

    invitation = Invitation.objects.create(
        organization=organization,
        unit=unit,
        email=email,
        first_name=first_name,
        last_name=last_name,
        role=role,
        token=secrets.token_urlsafe(INVITATION_TOKEN_BYTES),
        expires_at=timezone.now() + INVITATION_LIFETIME,
        invited_by=actor.user,
    )

    for app, granted_role in grants:
        InvitationAppGrant.objects.create(invitation=invitation, app=app, role=granted_role)

    return invitation


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

    `first_name` and `last_name` belong to the PERSON and change everywhere;
    the scope, the apps and the standing belong to this organization's
    relationship with them (C25).

    MOVING SOMEBODY BETWEEN DEALERSHIPS IS CHECKED AT BOTH ENDS. A dealer admin
    must not move one of their people out, nor pull somebody in from another
    dealership --- checking only the target permits the first and checking only
    the source permits the second.
    """
    person = find_person(organization, person_id)
    _assert_can_manage(actor, person.unit_id)
    _assert_can_manage(actor, unit_id)

    if role == MembershipRole.ADMIN and actor.unit_id is not None:
        raise AuthorizationError

    unit = _resolve_unit(organization, unit_id)
    grants = _resolve_grants(apps)
    _assert_grants_are_legal(organization, unit_id, grants)

    if isinstance(person, Invitation):
        _update_invitation(person, organization, first_name, last_name, email, unit, role, grants)
    else:
        _update_membership(person, first_name, last_name, email, unit, role, grants)

    return person


def _update_membership(
    membership: Membership,
    first_name: str,
    last_name: str,
    email: str,
    unit: BusinessUnit | None,
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

    # THE OWNER'S STANDING SURVIVES WHATEVER IS SENT. The form never offers
    # "owner" and there is exactly one per organization (C14), so taking the
    # submitted value here would quietly demote them --- and the owner marker
    # would then disagree with the role, which the check constraint refuses.
    if membership.role != MembershipRole.OWNER:
        membership.role = role

    membership.unit = unit
    membership.save(update_fields=["role", "unit"])

    # DELETE THEN CREATE, inside the caller's transaction. Updating in place
    # would mean working out which grants went away, and a missed one leaves
    # somebody holding an app the form says they lost --- the stale-grant shape
    # C16 already had to catch once in billing.
    membership.app_access.all().delete()
    for app, granted_role in grants:
        AppAccess.objects.create(membership=membership, app=app, role=granted_role)


def _update_invitation(
    invitation: Invitation,
    organization: Organization,
    first_name: str,
    last_name: str,
    email: str,
    unit: BusinessUnit | None,
    role: str,
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
    invitation.unit = unit
    invitation.role = role
    invitation.save()

    invitation.app_grants.all().delete()
    for app, granted_role in grants:
        InvitationAppGrant.objects.create(invitation=invitation, app=app, role=granted_role)


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
    _assert_can_manage(actor, person.unit_id)

    if isinstance(person, Membership) and person.role == MembershipRole.OWNER:
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
    _assert_can_manage(actor, person.unit_id)

    if isinstance(person, Invitation):
        raise NotAnInvitationError

    if person.role == MembershipRole.OWNER:
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
    _assert_can_manage(actor, person.unit_id)

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
            .select_related("organization", "unit")
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
        (grant.app, grant.role)
        for grant in invitation.app_grants.select_related("role").all()
    ]
    _assert_grants_are_legal(organization, invitation.unit_id, grants)

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
        role=invitation.role,
        status=MembershipStatus.ACTIVE,
        unit=invitation.unit,
        # NOT the owner. An owner is founded with the organisation and never
        # invited into it (C41) --- `invite_person` refuses the role outright,
        # so `owner_marker` stays NULL here and the one-owner constraint is
        # untouched.
        owner_marker=None,
        created_by_user_id=invitation.invited_by_id,
    )

    for app, role in grants:
        AppAccess.objects.create(
            membership=membership,
            app=app,
            role=role,
            created_by_user_id=invitation.invited_by_id,
        )

    invitation.accepted_at = timezone.now()
    invitation.save(update_fields=["accepted_at", "updated_at"])

    return AcceptResult(
        user=account,
        organization=organization,
        membership=membership,
        account_created=account_created,
    )
