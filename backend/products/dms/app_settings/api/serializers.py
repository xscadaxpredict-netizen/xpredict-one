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
