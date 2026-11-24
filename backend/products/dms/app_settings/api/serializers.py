"""Shapes for DMS settings. Field-level only; no rules live here."""

from __future__ import annotations

from rest_framework import serializers


class AppRoleSerializer(serializers.Serializer):
    code = serializers.CharField(read_only=True)
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
    status = serializers.CharField(read_only=True)


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
