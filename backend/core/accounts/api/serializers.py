"""
Shape and field-level validation for the auth endpoints.

No business rules here, and no credential checking — a serializer says whether
the request looks like a login attempt, not whether it is a valid one.
"""

from __future__ import annotations

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
    # No length cap and no complexity rules here: whatever Django's configured
    # validators say is the rule, and duplicating them in a serializer makes
    # two places that disagree the first time AUTH_PASSWORD_VALIDATORS changes.
    password = serializers.CharField(trim_whitespace=False, style={"input_type": "password"})


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
