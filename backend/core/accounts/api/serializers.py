"""
Shape and field-level validation for the auth endpoints.

No business rules here, and no credential checking — a serializer says whether
the request looks like a login attempt, not whether it is a valid one.
"""

from __future__ import annotations

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers


class LoginSerializer(serializers.Serializer):
    """Credentials, as the sign-in form sends them."""

    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False, style={"input_type": "password"})


class SignedInUserSerializer(serializers.Serializer):
    """
    What login answers with.

    NO TOKEN FIELD, and that is the point of C12 — the tokens went out as
    httpOnly cookies. Adding one here would hand JavaScript the credential the
    cookie exists to keep from it.
    """

    id = serializers.UUIDField(read_only=True)
    email = serializers.EmailField(read_only=True)
    first_name = serializers.CharField(read_only=True)
    last_name = serializers.CharField(read_only=True)


class ActivationCodeSerializer(serializers.Serializer):
    """Just the code, for the first step of signup (C14)."""

    code = serializers.CharField(max_length=64, trim_whitespace=True)


class SignupSerializer(serializers.Serializer):
    """
    What the signup form sends.

    `organisation_name` IS SPELLED THE BRITISH WAY because that is what
    `shell/api/signup.ts` already sends, and the frontend was written first.
    The service parameter behind it is `organization_name`, matching the model
    and the rest of the Python; this serializer is the one place the two
    spellings meet, which is better than a codebase that uses both.
    """

    activation_code = serializers.CharField(max_length=64, trim_whitespace=True)
    organisation_name = serializers.CharField(max_length=200)
    first_name = serializers.CharField(max_length=150, allow_blank=True, default="")
    last_name = serializers.CharField(max_length=150, allow_blank=True, default="")
    email = serializers.EmailField()
    # No length cap and no complexity rules written out here: whatever
    # AUTH_PASSWORD_VALIDATORS says is the rule, and duplicating it in a
    # serializer makes two places that disagree the first time it changes.
    password = serializers.CharField(trim_whitespace=False, style={"input_type": "password"})

    def validate_password(self, value: str) -> str:
        """
        THIS CALL DID NOT EXIST UNTIL 2026-10-08, and the comment above claimed
        it did.

        `AUTH_PASSWORD_VALIDATORS` has been configured since Phase 1 and no code
        path ever reached it, so the rules it describes applied to nobody:
        signup accepted `12345678` for a founder's account. It is the same shape
        as `BLACKLIST_AFTER_ROTATION` without its app and `CSRF_TRUSTED_ORIGINS`
        unset --- a setting that reads as configured and does nothing.

        It surfaced from the other end: accepting an invitation validates
        passwords, so an invited colleague was held to rules the owner who
        invited them was not.
        """
        return validate_password_strength(value)


def validate_password_strength(value: str) -> str:
    """
    Run Django's configured password validators, as a DRF field validator.

    IN ONE PLACE SO SIGNUP AND ACCEPTING AN INVITATION CANNOT DISAGREE. They
    are the only two ways anybody ever sets a password here, and they already
    diverged once --- accepting enforced these rules from the day it was
    written and signup never had.

    It lives in `core.accounts` because that is the app that owns `User`;
    `core.organizations` imports it for the accept form, the same direction its
    services already import `User`.

    DRF's `ValidationError`, not a domain one. These messages belong beside an
    input, and `config.exception_handler` flattens them into the response's
    `errors` list for the form to place --- which is the half the accept screen
    was missing when a refused password read as "the given data is invalid".
    """
    try:
        validate_password(value)
    except DjangoValidationError as exc:
        # `exc.messages`, not `str(exc)`: there can be SEVERAL reasons at once
        # ("too common" and "entirely numeric" for 12345678) and the form shows
        # all of them rather than whichever came first.
        raise serializers.ValidationError(list(exc.messages)) from None
    return value


class SignupResultSerializer(serializers.Serializer):
    """
    What signup answers with.

    `is_ready` IS FALSE AND HONEST. Each organization gets its own database
    (C1), created after signup commits, so for a few seconds the account
    exists and its workspace does not --- which is why C14 made provisioning
    its own step with its own screen. The provisioning task does not exist
    yet, so today this is false and stays false; see the note on
    `sign_up()` about what that does and does not break.
    """

    org_slug = serializers.CharField(read_only=True)
    is_ready = serializers.BooleanField(read_only=True)


class AppAccessSerializer(serializers.Serializer):
    """
    One app's availability inside one organization.

    SUBSCRIBED AND ACCESSIBLE ARE TWO FIELDS, never collapsed into one
    `visible` (C16). An unsubscribed app is shown disabled, because nobody can
    ask for a product they do not know exists; an inaccessible one is hidden,
    because advertising it is not a sales opportunity. One boolean cannot say
    both, and the half that would be lost is the one that leaks who-can-do-what.
    """

    key = serializers.CharField(read_only=True)
    subscribed = serializers.BooleanField(read_only=True)
    accessible = serializers.BooleanField(read_only=True)
    summary = serializers.CharField(read_only=True, allow_null=True)
    modules = serializers.ListField(child=serializers.CharField(), read_only=True)
    permissions = serializers.ListField(child=serializers.CharField(), read_only=True)


class MembershipSerializer(serializers.Serializer):
    """
    One organization this person belongs to.

    `role` IS STANDING ONLY, and reading it alone will mislead you (C40). A
    dealer admin is `member` with a `unit_id`, holding the DMS System
    administrator role --- so what somebody DOES is in `apps[].permissions`,
    not here. A Users list that showed standing alone displayed dealer admins
    as "Member", which the owner reported as a bug before C40 was written.
    """

    org_id = serializers.UUIDField(read_only=True)
    org_name = serializers.CharField(read_only=True)
    org_slug = serializers.CharField(read_only=True)
    role = serializers.CharField(read_only=True)
    unit_id = serializers.UUIDField(read_only=True, allow_null=True)
    unit_name = serializers.CharField(read_only=True, allow_null=True)
    # Whether this organization's own database exists yet (C50, C1). The
    # launcher refuses to open an app while this is false.
    is_ready = serializers.BooleanField(read_only=True)
    # Whether this person's dealership has been closed (C63). Always false for
    # somebody organisation-wide. When true every app below is inaccessible,
    # and this is what lets the shell say WHY rather than showing an empty
    # launcher -- the failure C58 was written to remove, one cause along.
    unit_closed = serializers.BooleanField(read_only=True)
    apps = AppAccessSerializer(many=True, read_only=True)


class MeSerializer(serializers.Serializer):
    """
    The whole answer to "who am I and what may I open".

    THIS CLASS IS THE CONTRACT. C43 removed drf-spectacular, so there is no
    generated schema and no generated client: the frontend's matching types in
    `apps/web/src/shell/api/auth.ts` are hand-written, and nothing checks that
    the two agree. Changing a field name here is a frontend change, and the
    only thing that will tell you is the screen going blank.
    """

    id = serializers.UUIDField(read_only=True)
    email = serializers.EmailField(read_only=True)
    first_name = serializers.CharField(read_only=True)
    last_name = serializers.CharField(read_only=True)
    memberships = MembershipSerializer(many=True, read_only=True)
