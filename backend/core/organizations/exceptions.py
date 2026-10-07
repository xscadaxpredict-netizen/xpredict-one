"""
Failures specific to founding an organization and joining one.

Each subclasses a category from `shared.exceptions`, so
`config.exception_handler` already knows the status code and nothing here
imports DRF. Named after the business situation rather than the HTTP shape:
`ActivationCodeSpentError`, not `SignupConflict`.
"""

from __future__ import annotations

from shared.exceptions import ConflictError, InvalidInputError


class ActivationCodeInvalidError(InvalidInputError):
    """
    No such code.

    422, NOT 404, and the frontend decided this before the backend existed.
    404 would be defensible --- a code is a secret and an unknown one should
    not be distinguishable from somebody else's --- but there is no scoping
    here to leak: codes belong to nobody until they are spent. The submitted
    value is simply not valid input, which is what 422 means.

    THE `code` STRING IS THE CONTRACT, not the status. The frontend switches
    on it to choose its own wording, so these three strings match
    `shell/api/signup.ts` exactly. A rename here is a silent fallback to a
    generic message there, which is the whole cost C43 took on.
    """

    code = "activation_code_invalid"
    message = "That activation code is not valid."


class ActivationCodeSpentError(ConflictError):
    """
    The code was real and has already founded an organization.

    DELIBERATELY DISTINGUISHED FROM "invalid" (C14). Login is vague on purpose
    because an attacker is guessing; this is the opposite situation --- you
    handed this code to this customer, so telling them it is already used
    answers their question instead of generating a support call.
    """

    code = "activation_code_used"
    message = "That activation code has already been used."


class ActivationCodeExpiredError(ConflictError):
    """
    The code was real, unspent, and is past its expiry.

    A THIRD STATE THE FRONTEND DOES NOT YET HANDLE. C14 named two --- invalid
    and already used --- because expiry was Q20 and unanswered at the time.
    Q20 chose 90 days (C47), so this is now reachable, and `signup.ts` has no
    case for the string: the signup screen will show its generic fallback
    rather than "your code expired, ask for a new one". Worth a line of
    frontend copy, and deliberately not folded into `invalid` --- telling a
    customer their real code is invalid is the support call C14 set out to
    avoid.
    """

    code = "activation_code_expired"
    message = "That activation code has expired."


class EmailAlreadyRegisteredError(ConflictError):
    """
    Somebody already signs in with this address.

    SIGNUP REFUSES RATHER THAN ATTACHING A NEW ORGANIZATION TO THE EXISTING
    ACCOUNT, and that is a security decision, not a limitation. Signup is
    unauthenticated: anybody holding a valid activation code could otherwise
    create an organization owned by an address they do not control. They would
    not gain access --- they do not have the password --- but they would have
    founded an organization in somebody else's name, and the real owner would
    discover it by surprise.

    An existing user founding a SECOND organization is a real case (C27: a
    dealership wanting other apps founds its own organization, same account,
    one login). It is a different flow, because it must happen while signed in.
    """

    code = "email_taken"
    message = "An account with that email address already exists. Sign in instead."


class OrganizationNameUnusableError(InvalidInputError):
    """
    The name produces no usable slug, or no database name that fits.

    MySQL caps an identifier at 64 characters (C46), and `db_name` is derived
    from the slug, so a long name is caught HERE --- on write, with a message
    about the name --- rather than at provisioning time, where it would surface
    as a failed Celery task nobody is watching.
    """

    code = "organization_name_unusable"
    message = "That organisation name cannot be used."


class DealerNameTakenError(ConflictError):
    """
    Another dealership in this organization already answers to this name.

    CASE-INSENSITIVE, and not because the service lowercases anything. MySQL's
    `utf8mb4_0900_ai_ci` collation compares that way, so the unique constraint
    refuses "Chennai - Guindy" and "chennai - guindy" as the same name without
    being asked to. The service checks first only so the caller gets this
    message instead of a 500 from an IntegrityError.

    THE `code` STRING IS THE CONTRACT. `shell/admin/api/dealers.ts` switches on
    it to choose which field to mark, so renaming it here is a silent fallback
    to a generic message there.
    """

    code = "dealer_name_taken"
    message = "Another dealership already uses that name."


class DealerCodeTakenError(ConflictError):
    """
    Another dealership in this organization already uses this short code.

    The code is OPTIONAL, so only a given one can collide. It is also the thing
    that ends up on paperwork, and two branches answering to the same code is a
    filing problem nobody notices until an invoice goes to the wrong one.
    """

    code = "dealer_code_taken"
    message = "Another dealership already uses that code."


class OwnerProtectedError(ConflictError):
    """
    The owner cannot be removed, disabled, or demoted.

    An organization with no owner has nobody who could appoint one (C14), so
    this is not a permission question --- not even the owner themselves may do
    it, and no amount of standing makes it allowed. Changing who the owner is
    is a TRANSFER, which is Q23 and does not exist yet.

    THE FRONTEND ALREADY HIDES THESE CONTROLS. This exists because a request
    does not have to come from our menu.
    """

    code = "owner_protected"
    message = "The owner cannot be removed. Transfer ownership to somebody else first."


class PersonEmailTakenError(ConflictError):
    """
    Somebody in this organization already has this address.

    PER ORGANIZATION, not globally: one person may belong to several
    organizations with one account (C1, C27), so a global check would refuse
    an invitation to somebody who already works somewhere else on the platform.
    """

    code = "email_taken"
    message = "That email address already belongs to someone in this organisation."


class SignInAddressLockedError(ConflictError):
    """
    An accepted address is how somebody signs in, and an admin may not change it.

    Editable only while an invitation is outstanding (C25). Once somebody has
    accepted, changing their address from an admin screen is an account
    takeover with extra steps --- the real flow is the person changing it
    themselves with confirmation sent to the new address, which is Q23 and
    does not exist.
    """

    code = "sign_in_address_locked"
    message = "A sign-in address can only be changed while an invitation is outstanding."


class DealerScopedAppError(ConflictError):
    """
    A dealer-scoped person was granted an app that does not understand dealerships.

    C27. DMS is the only unit-aware app (C5), so somebody scoped to one
    dealership holding CRM would see EVERY dealership's customers --- CRM does
    no unit filtering and has no column to filter on. A dealership wanting
    other apps founds its own organization and subscribes; same account, one
    login.

    REFUSED HERE AS WELL AS HIDDEN IN THE FORM. The invite dialog disables the
    other apps once a dealership is picked, and that is a convenience, not the
    rule (C19).
    """

    code = "dealer_scoped_app"
    message = "Somebody at a dealership can only be given DMS."


class RoleScopeMismatchError(ConflictError):
    """
    An org-level role was given to a dealer-scoped person, or the reverse.

    `Role.level` says which one a role is for (C7, C32). A dealer-scoped person
    holding Group operations would act across every dealership, which is the
    scoping undone; an organization-wide person holding Sales representative
    would be scoped to a dealership they do not have.
    """

    code = "role_scope_mismatch"
    message = "That role cannot be held at that scope."


class NotAnInvitationError(ConflictError):
    """
    An invitation action was aimed at somebody who has already accepted.

    Resending is the obvious one: there is nothing to resend to a person who
    is already a member, and the request is almost certainly a stale screen.
    """

    code = "not_an_invitation"
    message = "That person has already accepted their invitation."


class AdministrationNotGrantableError(ConflictError):
    """
    A payload asked for Administration as if it were a product.

    It is not granted and never has an `AppAccess` row --- the check constraint
    refuses one, and `AppSubscription` refuses to sell it (C44). Administration
    comes from standing, or from a role that grants `admin.*` permissions
    (C40), and `/me` builds that entry rather than reading it.

    REFUSED RATHER THAN IGNORED. A caller sending this is working from the
    wrong model of how administration is conferred, and silently dropping the
    entry would leave them believing it had been granted.
    """

    code = "administration_not_grantable"
    message = "Administration is not an app that can be granted."
