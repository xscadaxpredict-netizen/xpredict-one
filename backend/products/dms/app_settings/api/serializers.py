"""Shapes for DMS settings. Field-level only; no rules live here."""

from __future__ import annotations

from rest_framework import serializers

from core.organizations.identifiers import is_valid_gstin, is_valid_pan


class AppRoleSerializer(serializers.Serializer):
    code = serializers.CharField(read_only=True)
    name = serializers.CharField(read_only=True)


class PlaceSerializer(serializers.Serializer):
    """A territory somebody works at: id and name."""

    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)


class AppUserSerializer(serializers.Serializer):
    """
    One row of DMS settings -> Users. Mirrors `AppUser` in
    `frontend/apps/web/src/products/dms/app-settings/api.ts`.
    """

    id = serializers.UUIDField(read_only=True)
    first_name = serializers.CharField(read_only=True)
    last_name = serializers.CharField(read_only=True)
    email = serializers.EmailField(read_only=True)
    is_owner = serializers.BooleanField(read_only=True)
    role = AppRoleSerializer(read_only=True, allow_null=True)
    territories = serializers.ListField(child=serializers.CharField(), read_only=True)
    # The same places with their ids, for Edit's Territory field (2026-11-24).
    places = PlaceSerializer(many=True, read_only=True)
    status = serializers.CharField(read_only=True)
    access_status = serializers.CharField(read_only=True, allow_null=True)


class DmsInviteSerializer(serializers.Serializer):
    """
    Add User in DMS settings (the owner, 2026-11-24): a person and their DMS
    role. DMS itself is implied -- they are invited FROM DMS, so they get DMS.

    REFUSED, NOT IGNORED, like the Admin panel's Add User: a request naming
    `app`, `unit_id` or `territories` must not believe it set them.
    """

    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150, allow_blank=True)
    email = serializers.EmailField()
    role = serializers.CharField(max_length=80)

    def validate(self, attrs: dict) -> dict:
        unexpected = sorted(set(self.initial_data) - set(self.fields))
        if unexpected:
            raise serializers.ValidationError(
                dict.fromkeys(
                    unexpected, "Add User takes first name, last name, email and role only."
                )
            )
        return attrs


class InvitableRoleSerializer(serializers.Serializer):
    """A role Add User may give. Mirrors `InvitableRole` in `api.ts`."""

    code = serializers.CharField(read_only=True)
    name = serializers.CharField(read_only=True)
    summary = serializers.CharField(read_only=True)


class DmsEditSerializer(serializers.Serializer):
    """
    Edit in DMS settings (the owner, 2026-11-24): basic information AND their
    DMS role -- the Admin panel's Edit plus the app tile's role change.

    REFUSED, NOT IGNORED: a request naming `app`, `status` or `territories`
    must not believe it set them.
    """

    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150, allow_blank=True)
    email = serializers.EmailField()
    role = serializers.CharField(max_length=80)
    # WHERE THEY WORK (2026-11-24): exactly these territories, none allowed.
    # Left out, their places stay as they are.
    territories = serializers.ListField(
        child=serializers.UUIDField(), required=False, allow_empty=True
    )

    def validate(self, attrs: dict) -> dict:
        unexpected = sorted(set(self.initial_data) - set(self.fields))
        if unexpected:
            raise serializers.ValidationError(
                dict.fromkeys(
                    unexpected,
                    "Edit takes first name, last name, email, role and territories only.",
                )
            )
        return attrs


# ---------------------------------------------------------------------------
# Territory Management (2026-11-24). Mirrors `DmsTerritory` in the frontend's
# `products/dms/app-settings/territories.ts`.
# ---------------------------------------------------------------------------


class DmsTerritorySerializer(serializers.Serializer):
    """
    One box of DMS's tree with everything the side panel shows. A flat list in
    tree order -- each box after its parent -- so the screen builds the tree
    from `parent_id` in one pass. No `path`: it is treebeard's bookkeeping.
    """

    id = serializers.UUIDField(read_only=True)
    kind = serializers.CharField(read_only=True)
    # The root shows the organisation's name; it stores none of its own.
    name = serializers.CharField(source="display_name", read_only=True)
    parent_id = serializers.UUIDField(read_only=True, allow_null=True)
    is_root = serializers.SerializerMethodField()
    status = serializers.CharField(read_only=True)
    code = serializers.CharField(read_only=True, allow_null=True)
    gstin = serializers.CharField(read_only=True)
    pan = serializers.CharField(read_only=True)
    contact_person = serializers.CharField(read_only=True)
    email = serializers.CharField(read_only=True)
    phone = serializers.CharField(read_only=True)
    city = serializers.CharField(read_only=True)
    state = serializers.CharField(read_only=True)
    postal_code = serializers.CharField(read_only=True)
    # People placed AT this box by a DMS grant (`territory_tree()`).
    people_count = serializers.IntegerField(read_only=True)

    def get_is_root(self, territory) -> bool:
        # The column is True or NULL (MySQL has no partial unique index).
        return bool(territory.is_root)


class DmsTerritoryEditSerializer(serializers.Serializer):
    """
    Edit: the details. Not the kind, the place or the status -- the payload
    has none of them, so an edit cannot move or close anything. Every field is
    sent, as the form shows them all.
    """

    name = serializers.CharField(max_length=200)
    # `allow_blank`: the form sends "" for an empty code; the service stores NULL.
    code = serializers.CharField(max_length=40, allow_null=True, allow_blank=True, default=None)
    # Optional here; a DEALER needs one, which is the service's rule (it knows the kind).
    gstin = serializers.CharField(max_length=15, required=False, allow_blank=True, default="")
    # Blank = derived from the GSTIN by the service.
    pan = serializers.CharField(max_length=10, required=False, allow_blank=True, default="")
    contact_person = serializers.CharField(
        max_length=150, required=False, allow_blank=True, default=""
    )
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    city = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    state = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    postal_code = serializers.CharField(
        max_length=20, required=False, allow_blank=True, default=""
    )

    # The Dealers form's checks, word for word: uppercased first, one message
    # for a bad shape or a bad check digit.
    def validate_gstin(self, value: str) -> str:
        if not value:
            return ""
        gstin = value.upper()
        if not is_valid_gstin(gstin):
            raise serializers.ValidationError(
                "That is not a valid GSTIN. Check it against the registration certificate."
            )
        return gstin

    def validate_pan(self, value: str) -> str:
        if not value:
            return ""
        pan = value.upper()
        if not is_valid_pan(pan):
            raise serializers.ValidationError(
                "A PAN is five letters, four digits and one letter — AAPFU0939F."
            )
        return pan

    def validate(self, attrs: dict) -> dict:
        # REFUSED, NOT IGNORED: an edit naming `kind`, `parent_id` or `status`
        # must not believe it changed them.
        unexpected = sorted(set(self.initial_data) - set(self.fields))
        if unexpected:
            raise serializers.ValidationError(
                dict.fromkeys(unexpected, "This field cannot be set here.")
            )
        return attrs


class DmsTerritoryNewSerializer(DmsTerritoryEditSerializer):
    """
    New Territory: the details, plus its kind and where it sits. FIXED KINDS
    (the owner, 2026-11-24); never `organisation` -- there is one, sign-up
    made it. `parent_id` null = directly under the organisation.
    """

    kind = serializers.ChoiceField(choices=["region", "dealer", "branch", "warehouse"])
    parent_id = serializers.UUIDField(allow_null=True)


# ---------------------------------------------------------------------------
# A territory's People tab (2026-11-24). Mirrors `TerritoryPerson` in
# `territories.ts`.
# ---------------------------------------------------------------------------


class TerritoryPersonSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    first_name = serializers.CharField(read_only=True)
    last_name = serializers.CharField(read_only=True)
    email = serializers.EmailField(read_only=True)
    role = AppRoleSerializer(read_only=True, allow_null=True)
    other_places = serializers.ListField(child=serializers.CharField(), read_only=True)
    access_status = serializers.CharField(read_only=True)


class AssignPeopleSerializer(serializers.Serializer):
    """Assign users: who. No role (it came with DMS), no "current place" (it only adds)."""

    users = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)


class MovePersonSerializer(serializers.Serializer):
    """Move: to which territory."""

    to = serializers.UUIDField()
