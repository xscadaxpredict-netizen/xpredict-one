"""
DMS settings endpoints. Permission -> call the selector -> serialise; nothing
else (CLAUDE.md, "Where code goes").
"""

from __future__ import annotations

from typing import ClassVar

from rest_framework.request import Request
from rest_framework.response import Response

from core.organizations.api.base import OrgScopedAPIView
from core.organizations.selectors import app_users
from core.permissions.models import AppCode

from .serializers import AppUserSerializer


class DmsUsersView(OrgScopedAPIView):
    """
    `GET .../dms/settings/users/` -- DMS settings -> Users & Roles -> Users:
    everybody who holds DMS, the owner first and always, with each person's
    DMS role, places and status (active, inactive or pending). Read-only.

    `OrgScopedAPIView`, NOT `TenantAPIView`: the people are control-plane rows,
    so nothing here touches the organisation's own database.

    `dms.user.view` IS HELD BY NO ROLE (`permissions/0021`): the owner has it by
    rule, so the owner alone reaches this until the app-admin role is designed
    (Q63) -- the same answer the gear and the route give in the browser.
    """

    required_permissions: ClassVar[list[str]] = ["dms.user.view"]

    def get(self, request: Request, org_slug: str) -> Response:
        people = app_users(self.organization, AppCode.DMS)
        return Response(AppUserSerializer(people, many=True).data)
