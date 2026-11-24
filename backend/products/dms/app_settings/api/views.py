"""
DMS settings endpoints. Permission -> deserialise -> call the service or
selector -> serialise; nothing else (CLAUDE.md, "Where code goes").
"""

from __future__ import annotations

from typing import ClassVar

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response

from core.organizations.api.base import OrgScopedAPIView
from core.organizations.selectors import app_users, invitable_roles
from core.organizations.services import invite_to_app
from core.permissions.models import AppCode

from .serializers import AppUserSerializer, DmsInviteSerializer, InvitableRoleSerializer


class DmsUsersView(OrgScopedAPIView):
    """
    `GET .../dms/settings/users/` -- DMS settings -> Users & Roles -> Users:
    everybody who holds DMS, the owner first and always, with each person's
    DMS role, places and status (active, inactive or pending).

    `POST` -- Add User: a person and their DMS role (`invite_to_app()`);
    they get DMS because they are invited from it. Answers 201 with the new
    row, as the list draws it.

    `OrgScopedAPIView`, NOT `TenantAPIView`: the people are control-plane rows,
    so nothing here touches the organisation's own database.

    `dms.user.view` AND `dms.user.create` ARE HELD BY NO ROLE (`permissions/0021`,
    `0022`): the owner has them by rule, so the owner alone reaches this until
    the app-admin role is designed (Q63) -- the same answer the gear and the
    route give in the browser. A VIEW THAT READS AND WRITES NAMES ITS WRITE
    (C81).
    """

    required_permissions: ClassVar[list[str]] = ["dms.user.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {
        "POST": ["dms.user.create"],
    }

    def get(self, request: Request, org_slug: str) -> Response:
        people = app_users(self.organization, AppCode.DMS)
        return Response(AppUserSerializer(people, many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        payload = DmsInviteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        invitation = invite_to_app(
            actor=self.membership,
            organization=self.organization,
            app=AppCode.DMS,
            **payload.validated_data,
        )

        # The new row as the list would show it, so create and list cannot
        # disagree about the shape -- as the Admin panel's Add User does.
        row = next(p for p in app_users(self.organization, AppCode.DMS) if p.id == invitation.pk)
        return Response(AppUserSerializer(row).data, status=status.HTTP_201_CREATED)


class DmsInviteRolesView(OrgScopedAPIView):
    """
    `GET .../dms/settings/invite-roles/` -- the roles Add User may give:
    DMS's organisation-level roles, built-in or this organisation's own
    (`invitable_roles()`). Whoever may invite may read them.
    """

    required_permissions: ClassVar[list[str]] = ["dms.user.create"]

    def get(self, request: Request, org_slug: str) -> Response:
        roles = invitable_roles(self.organization, AppCode.DMS)
        return Response(InvitableRoleSerializer(roles, many=True).data)
