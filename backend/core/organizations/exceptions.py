"""
Failures specific to founding an organization and joining one.

Each subclasses a category from `shared.exceptions`, so
`config.exception_handler` already knows the status code and nothing here
imports DRF. Named after the business situation rather than the HTTP shape:
`ActivationCodeSpentError`, not `SignupConflict`.
"""

from __future__ import annotations

from shared.exceptions import ConflictError, InvalidInputError, NotFoundError


class ActivationCodeInvalidError(NotFoundError):
    """
    No such code.

    404 rather than 403, for the usual reason: an unknown code and a code
    belonging to somebody else must look identical.
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

    code = "activation_code_spent"
    message = "That activation code has already been used."


class ActivationCodeExpiredError(ConflictError):
    """The code was real, unspent, and is past its expiry."""

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

    code = "email_already_registered"
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
