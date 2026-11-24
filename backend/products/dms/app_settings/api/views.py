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
from core.organizations.models import GrantStatus
from core.organizations.selectors import app_users, invitable_roles, roles_for_app_person
from core.organizations.services import (
    invite_to_app,
    remove_from_app,
    set_app_status,
    update_app_user,
)
from core.permissions.models import AppCode
from shared.exceptions import not_found

from .serializers import (
    AppUserSerializer,
    DmsEditSerializer,
    DmsInviteSerializer,
    InvitableRoleSerializer,
)


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


def _row(organization, person_id) -> dict:
    """The person as the list draws them, after a change -- so the two cannot disagree."""
    person = next(p for p in app_users(organization, AppCode.DMS) if str(p.id) == str(person_id))
    return AppUserSerializer(person).data


class DmsUserDetailView(OrgScopedAPIView):
    """
    One person on DMS settings -> Users (the owner, 2026-11-24). ALL ON THEIR
    DMS, not their account (the owner's choice):

    - `PUT` -- Edit: first name, last name, email and DMS role
      (`update_app_user()`). Answers with their row.
    - `DELETE` -- Delete: take DMS away (`remove_from_app()`); they stay in the
      organisation. A pending person left with no app is cancelled. 204.

    The page's view, then each act (C81). All held by no role: the owner alone.
    """

    required_permissions: ClassVar[list[str]] = ["dms.user.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {
        "PUT": ["dms.user.update"],
        "DELETE": ["dms.user.delete"],
    }

    def put(self, request: Request, org_slug: str, user_id: str) -> Response:
        payload = DmsEditSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        update_app_user(
            actor=self.membership,
            organization=self.organization,
            app=AppCode.DMS,
            person_id=user_id,
            **payload.validated_data,
        )
        return Response(_row(self.organization, user_id))

    def delete(self, request: Request, org_slug: str, user_id: str) -> Response:
        remove_from_app(
            actor=self.membership,
            organization=self.organization,
            person_id=user_id,
            app=AppCode.DMS,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class DmsUserStatusView(OrgScopedAPIView):
    """
    Deactivate or Activate somebody's DMS: `POST .../users/<id>/deactivate/` or
    `.../activate/` -- the app tile's Disable / Enable (`set_app_status()`).
    Their role and territory are kept, so Activate gives everything back; their
    account and other apps are untouched. One URL per act, as the Admin panel's.
    """

    required_permissions: ClassVar[list[str]] = ["dms.user.view", "dms.user.deactivate"]

    # The whole vocabulary; anything else is a URL that does not exist.
    _STATUSES: ClassVar[dict[str, str]] = {
        "activate": GrantStatus.ACTIVE,
        "deactivate": GrantStatus.DISABLED,
    }

    def post(self, request: Request, org_slug: str, user_id: str, action: str) -> Response:
        if action not in self._STATUSES:
            raise not_found("User")

        set_app_status(
            actor=self.membership,
            organization=self.organization,
            person_id=user_id,
            app=AppCode.DMS,
            status=self._STATUSES[action],
        )
        return Response(_row(self.organization, user_id))


class DmsUserRolesView(OrgScopedAPIView):
    """
    `GET .../users/<id>/roles/` -- the roles Edit may give THIS person: DMS's
    roles at the level they are placed (`roles_for_app_person()`), so the
    picker offers exactly what the save accepts.
    """

    required_permissions: ClassVar[list[str]] = ["dms.user.view", "dms.user.update"]

    def get(self, request: Request, org_slug: str, user_id: str) -> Response:
        roles = roles_for_app_person(self.organization, AppCode.DMS, user_id)
        return Response(InvitableRoleSerializer(roles, many=True).data)
