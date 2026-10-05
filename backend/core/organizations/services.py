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

from dataclasses import dataclass

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from core.accounts.models import User
from core.billing.models import AppSubscription
from core.organizations.exceptions import (
    ActivationCodeExpiredError,
    ActivationCodeInvalidError,
    ActivationCodeSpentError,
    EmailAlreadyRegisteredError,
    OrganizationNameUnusableError,
)
from core.organizations.models import (
    ActivationCode,
    Membership,
    MembershipRole,
    MembershipStatus,
    Organization,
)
from core.permissions.models import AppAccess, AppCode, Role

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
