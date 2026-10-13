"""
Shape for the role catalogue. No business rules here.
"""

from __future__ import annotations

from rest_framework import serializers


class RoleSerializer(serializers.Serializer):
    """
    One built-in role, as the Roles page and every role picker read it.

    THIS CLASS IS THE CONTRACT. C43 removed drf-spectacular, so the matching
    TypeScript in `apps/web/src/shell/admin/api/roles.ts` is hand-written and
    nothing checks that the two agree. Renaming a field here is a frontend
    change, and the only thing that will tell you is an empty picker.

    `administers` IS COMPUTED, NOT STORED (C40, C44). The model property asks
    "does this role grant any `admin.*` permission", so the badge on the Roles
    page cannot disagree with what the role actually confers -- which a
    boolean column somebody had to remember to set eventually would.

    WHAT EACH ROLE GRANTS IS NOT HERE. The Roles page is a reference showing
    names and summaries (C28, C37); the permission list behind a role is a
    bigger payload and a separate question, and nothing asks for it yet.
    """

    code = serializers.CharField(read_only=True)
    name = serializers.CharField(read_only=True)
    app = serializers.CharField(read_only=True)
    level = serializers.CharField(read_only=True)
    summary = serializers.CharField(read_only=True)
    administers = serializers.BooleanField(read_only=True)
