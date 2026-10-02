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
