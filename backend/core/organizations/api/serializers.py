"""
Shape and field-level validation for the Administration endpoints.

No business rules. A serializer says whether the request LOOKS like a request
to add a dealership; whether that name is already taken is the service's
question, because it needs the database and it needs a transaction.

THESE CLASSES ARE THE CONTRACT. C43 removed drf-spectacular, so the matching
TypeScript in `apps/web/src/shell/admin/api/*.ts` is hand-written and nothing
checks that the two agree. A renamed field here is a frontend change, and the
only thing that will tell you is a column going blank.
"""

from __future__ import annotations

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers


class DealerSerializer(serializers.Serializer):
    """
    One dealership, as the Dealers screen reads it. Mirrors `Dealer` in
    `shell/admin/api/dealers.ts`.
    """

    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)
    code = serializers.CharField(read_only=True, allow_null=True)

    contact_person = serializers.CharField(read_only=True)
    email = serializers.CharField(read_only=True)
    phone = serializers.CharField(read_only=True)

    city = serializers.CharField(read_only=True)
    state = serializers.CharField(read_only=True)
    postal_code = serializers.CharField(read_only=True)

    status = serializers.CharField(read_only=True)

    # Annotated by `dealers_for()`, not a column. Memberships plus outstanding
    # invitations, so it agrees with what the Users screen lists.
    user_count = serializers.IntegerField(read_only=True)

    created_at = serializers.DateTimeField(read_only=True)


class DealerDetailsSerializer(serializers.Serializer):
    """
    The writable fields of a dealership. Create and update take the same set,
    so the form is written once and used twice.

    WHAT IS ABSENT IS THE POINT. `status` is not here, so "correct a typo in
    the address" and "shut the branch" cannot be the same request -- closing is
    its own endpoint with its own rule, once Q21 says what the rule is (C52).
    `user_count` is not here because it is a fact, not a setting.
    """

    name = serializers.CharField(max_length=200)

    # `allow_null` AND `allow_blank`: the form sends "" for an untouched
    # optional field and the service stores NULL either way. Refusing "" would
    # make the frontend responsible for a distinction the database cares about
    # and a person filling in a form does not.
    code = serializers.CharField(
        max_length=40, required=False, allow_null=True, allow_blank=True, default=None
    )

    contact_person = serializers.CharField(max_length=150, required=False, allow_blank=True)
    # NOT `EmailField`. This is where official correspondence goes and it is
    # optional; an EmailField refuses "" even with `allow_blank` unset, which
    # turns "we have not got their address yet" into a validation error.
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)

    city = serializers.CharField(max_length=100, required=False, allow_blank=True)
    state = serializers.CharField(max_length=100, required=False, allow_blank=True)
    postal_code = serializers.CharField(max_length=20, required=False, allow_blank=True)


class AppGrantSerializer(serializers.Serializer):
    """
    One app somebody holds, and the role they hold it with.

    BOTH THE CODE AND THE NAME, which is a change from the fake. The list
    displays the name and the edit form matches the code; sending only the name
    made that form compare display strings to decide which role somebody
    already held --- it said so in a comment, and it breaks silently the first
    time a role is renamed.
    """

    app = serializers.CharField(read_only=True)
    role_code = serializers.CharField(read_only=True)
    role_name = serializers.CharField(read_only=True)


class OrgUserSerializer(serializers.Serializer):
    """
    One row of the Administration users list.

    A UNION OF TWO TABLES (C51), so `id` is a membership id for an active or
    disabled person and an INVITATION id for a pending one. `status` is what
    says which, and every write endpoint resolves it through `find_person()`.
    """

    id = serializers.UUIDField(read_only=True)
    first_name = serializers.CharField(read_only=True)
    last_name = serializers.CharField(read_only=True)
    email = serializers.CharField(read_only=True)

    unit_id = serializers.UUIDField(read_only=True, allow_null=True)
    # The label as well as the id, because an id is not a name. The server does
    # this with a join, which is why the field exists at all -- the frontend
    # fake kept its own hardcoded map and reported `null` for any dealership
    # created in the session, which looks exactly like a scoping bug.
    unit_name = serializers.CharField(read_only=True, allow_null=True)

    role = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    apps = AppGrantSerializer(many=True, read_only=True)

    # "organisation", "dealer", or null -- the FACT, not the words (C53). The
    # browser turns this into "Organisation admin" or "Dealer admin", because
    # there is no Role row for Administration and those strings are copy
    # describing a derived state.
    administers = serializers.CharField(read_only=True, allow_null=True)


class AppGrantInputSerializer(serializers.Serializer):
    """One app being granted, and the role code to grant it with."""

    app = serializers.CharField(max_length=20)
    # A CODE, not a name. The backend owns the vocabulary (C19) and the form
    # sends what it was given in the catalogue.
    role = serializers.CharField(max_length=60)


class PersonDetailsSerializer(serializers.Serializer):
    """
    The writable fields of somebody's membership. Invite and edit take the same
    set, so one shape serves both.

    `role` EXCLUDES "owner" DELIBERATELY. There is exactly one owner per
    organization (C14), so appointing a new one is a transfer rather than an
    edit, and offering it here would quietly leave the organization with two or
    none. Transfer is Q23 and does not exist yet.

    `apps` NEVER CARRIES "admin". Administration follows from standing or from
    a role that grants `admin.*` (C40); the service refuses a payload that asks
    for it rather than dropping it, so a caller cannot believe it was granted.
    """

    first_name = serializers.CharField(max_length=150, allow_blank=True)
    last_name = serializers.CharField(max_length=150, allow_blank=True)
    email = serializers.EmailField()

    # `allow_null` is the organization-wide case, not a missing value: null
    # means "not limited to any one dealer", which is every owner, every org
    # admin and anybody holding an org-level role.
    unit_id = serializers.UUIDField(required=False, allow_null=True, default=None)

    role = serializers.ChoiceField(choices=["admin", "member"])
    apps = AppGrantInputSerializer(many=True)


# ---------------------------------------------------------------------------
# Invitations: the link, and redeeming it (C56).
# ---------------------------------------------------------------------------


class InviteLinkSerializer(serializers.Serializer):
    """
    The link an admin copies and sends by hand.

    THIS IS A CREDENTIAL IN A RESPONSE BODY, which is why it has its own
    endpoint instead of riding along on the users list. The list is fetched on
    every visit to the screen; this is fetched when somebody presses Copy, so
    the token travels when it is asked for and nowhere else --- and there is
    one place to hang an audit record on the day C38's audit log arrives.
    """

    link = serializers.CharField(read_only=True)
    expires_at = serializers.DateTimeField(read_only=True)


class InvitationPreviewSerializer(serializers.Serializer):
    """
    What the accept screen may show before anybody is authenticated.

    Deliberately thin --- see `selectors.invitation_preview`. The dealership,
    the apps and the role are all absent: they are the organisation's staffing
    arrangements, and the holder of a link does not need them to decide whether
    to accept.
    """

    organization_name = serializers.CharField(read_only=True)
    organization_slug = serializers.CharField(read_only=True)
    email = serializers.CharField(read_only=True)
    expires_at = serializers.DateTimeField(read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    is_accepted = serializers.BooleanField(read_only=True)
    requires_sign_in = serializers.BooleanField(read_only=True)
    invited_by = serializers.CharField(read_only=True)


class AcceptInvitationSerializer(serializers.Serializer):
    """
    What the accept form sends.

    THE PASSWORD IS OPTIONAL HERE AND THE SERVICE DECIDES. Somebody whose
    address already has an account signs in and sends nothing (C56); somebody
    new sends a password. A serializer cannot tell which case it is holding
    without hitting the database, and putting that query here would mean two
    places answering one question --- so this checks the shape and
    `accept_invitation()` checks the rule.

    VALIDATED AGAINST `AUTH_PASSWORD_VALIDATORS`, which until now nothing in
    this project called. The setting has been in `base.py` since Phase 1 and
    was never reached by any code path, so the rules it describes were not
    being applied anywhere --- the same shape as `BLACKLIST_AFTER_ROTATION`
    without its app. Signup still does not call it; see the note in the
    session log.
    """

    password = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=False,
        style={"input_type": "password"},
    )

    def validate_password(self, value: str) -> str:
        if value:
            # DRF's ValidationError, not a domain one: this is field shape, and
            # it belongs beside the input in the form.
            try:
                validate_password(value)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(list(exc.messages)) from None
        return value


class AcceptResultSerializer(serializers.Serializer):
    """
    Where to go next, and whether an account was made along the way.

    `org_slug` is what the frontend navigates to. NO TOKEN FIELD --- accepting
    signs the person in through the same httpOnly cookies as login and signup
    (C12), so there is nothing here for JavaScript to hold.
    """

    org_slug = serializers.CharField(read_only=True)
    account_created = serializers.BooleanField(read_only=True)
