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
