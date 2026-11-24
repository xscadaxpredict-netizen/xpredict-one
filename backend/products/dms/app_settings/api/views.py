"""
DMS settings endpoints. Permission -> deserialise -> call the service or
selector -> serialise; nothing else (CLAUDE.md, "Where code goes").
"""

from __future__ import annotations

from typing import ClassVar

from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response

from core.organizations.api.base import OrgScopedAPIView
from core.organizations.models import GrantStatus, Territory
from core.organizations.selectors import (
    app_users,
    invitable_roles,
    roles_for_app_person,
    territory_people,
    territory_tree,
)
from core.organizations.services import (
    add_territory,
    assign_to_territory,
    close_territory,
    edit_territory,
    invite_to_app,
    move_to_territory,
    remove_from_app,
    remove_from_territory,
    reopen_territory,
    set_app_status,
    update_app_user,
)
from core.permissions.models import AppCode
from shared.exceptions import not_found

from .serializers import (
    AppUserSerializer,
    AssignPeopleSerializer,
    DmsEditSerializer,
    DmsInviteSerializer,
    DmsTerritoryEditSerializer,
    DmsTerritoryNewSerializer,
    DmsTerritorySerializer,
    InvitableRoleSerializer,
    MovePersonSerializer,
    TerritoryPersonSerializer,
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

        data = dict(payload.validated_data)
        territory_ids = data.pop("territories", None)
        update_app_user(
            actor=self.membership,
            organization=self.organization,
            app=AppCode.DMS,
            person_id=user_id,
            territory_ids=territory_ids,
            **data,
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


# ---------------------------------------------------------------------------
# Security & Controls -> Territory Management (the owner, 2026-11-24).
#
# DMS's territory tree: see it, add to it, edit a box's details, close and
# reopen a box. `dms.territory.*`, HELD BY NO ROLE (`permissions/0024`): the
# owner alone, like the rest of DMS settings, until the app-admin role is
# designed (Q63). Moving a box comes in a later step.
# ---------------------------------------------------------------------------


def _territory(organization, territory_id: str) -> Territory:
    """
    A box of THIS organisation's DMS tree, or 404. Paths are unique across
    every organisation, so an id alone would reach another customer's tree;
    another app's root is "no such territory" here too. A malformed id is the
    same 404, so a 400 cannot confirm the shape of what is being looked up.
    """
    try:
        return Territory.objects.get(
            id=territory_id, organization=organization, app_id=AppCode.DMS
        )
    except (Territory.DoesNotExist, ValidationError, ValueError):
        raise not_found("Territory") from None


def _territory_row(organization, territory_id) -> dict:
    """The box as the tree draws it, after a change -- so the two cannot disagree."""
    box = next(t for t in territory_tree(organization) if str(t.pk) == str(territory_id))
    return DmsTerritorySerializer(box).data


class DmsTerritoriesView(OrgScopedAPIView):
    """
    `GET .../dms/settings/territories/` -- DMS's whole tree, in tree order,
    every box with its details and the people placed at it.

    `POST` -- New Territory: a region, dealer, branch or warehouse under a
    parent its kind may sit in (`add_territory()`). 201 with the new box.

    Control plane only (`OrgScopedAPIView`): territories are not tenant rows.
    The page's view, and the write named (C81).
    """

    required_permissions: ClassVar[list[str]] = ["dms.territory.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {
        "POST": ["dms.territory.create"],
    }

    def get(self, request: Request, org_slug: str) -> Response:
        return Response(DmsTerritorySerializer(territory_tree(self.organization), many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        payload = DmsTerritoryNewSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        territory = add_territory(organization=self.organization, **payload.validated_data)
        return Response(
            _territory_row(self.organization, territory.pk), status=status.HTTP_201_CREATED
        )


class DmsTerritoryDetailView(OrgScopedAPIView):
    """
    `PUT .../territories/<id>/` -- Edit: name, code, GSTIN, PAN, contact,
    address AND its parent territory (`edit_territory()`; a new parent moves it
    and everything under it -- no separate Move, the owner 2026-11-24). Not the
    kind or the status, and never the root (409: it is the organisation).
    Answers with the box.
    """

    required_permissions: ClassVar[list[str]] = ["dms.territory.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {
        "PUT": ["dms.territory.update"],
    }

    def put(self, request: Request, org_slug: str, territory_id: str) -> Response:
        territory = _territory(self.organization, territory_id)

        payload = DmsTerritoryEditSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        data = dict(payload.validated_data)
        if "parent_id" in data:
            edit_territory(territory=territory, parent_id=data.pop("parent_id"), **data)
        else:
            edit_territory(territory=territory, **data)
        return Response(_territory_row(self.organization, territory.pk))


class DmsTerritoryStatusView(OrgScopedAPIView):
    """
    `POST .../territories/<id>/close/` or `.../reopen/` -- any kind but the
    root (`close_territory()` / `reopen_territory()`). One URL per act, as the
    Dealers screen's; anything else is a URL that does not exist.
    """

    required_permissions: ClassVar[list[str]] = ["dms.territory.view", "dms.territory.set_status"]

    _ACTIONS: ClassVar[dict[str, object]] = {
        "close": close_territory,
        "reopen": reopen_territory,
    }

    def post(self, request: Request, org_slug: str, territory_id: str, action: str) -> Response:
        if action not in self._ACTIONS:
            raise not_found("Territory")

        territory = _territory(self.organization, territory_id)
        self._ACTIONS[action](territory=territory)
        return Response(_territory_row(self.organization, territory.pk))


# ---------------------------------------------------------------------------
# A territory's People tab (the owner, 2026-11-24): who works here, Assign
# users (adds this place), Remove, Move. Placing somebody changes THEIR DMS,
# so it is `dms.user.update` -- the same act as DMS Users -> Edit's Territory
# field. Seeing the tab needs the tree's view and the users' view.
# ---------------------------------------------------------------------------

_PEOPLE_VIEW = ["dms.territory.view", "dms.user.view"]


class DmsTerritoryPeopleView(OrgScopedAPIView):
    """
    `GET .../territories/<id>/people/` -- the people placed AT this territory.
    `POST` `{users: [ids]}` -- Assign users: ADD this territory to where each
    works (`assign_to_territory()`), all or nothing. Answers with the list.
    """

    required_permissions: ClassVar[list[str]] = _PEOPLE_VIEW
    method_permissions: ClassVar[dict[str, list[str]]] = {
        "POST": ["dms.user.update"],
    }

    def get(self, request: Request, org_slug: str, territory_id: str) -> Response:
        territory = _territory(self.organization, territory_id)
        people = territory_people(self.organization, territory)
        return Response(TerritoryPersonSerializer(people, many=True).data)

    def post(self, request: Request, org_slug: str, territory_id: str) -> Response:
        territory = _territory(self.organization, territory_id)
        payload = AssignPeopleSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        assign_to_territory(
            actor=self.membership,
            organization=self.organization,
            territory=territory,
            person_ids=payload.validated_data["users"],
        )
        people = territory_people(self.organization, territory)
        return Response(TerritoryPersonSerializer(people, many=True).data)


class DmsTerritoryPersonView(OrgScopedAPIView):
    """
    `DELETE .../territories/<id>/people/<person>/` -- Remove: this territory
    comes off where they work; their last place may go. 204.
    """

    required_permissions: ClassVar[list[str]] = [*_PEOPLE_VIEW, "dms.user.update"]

    def delete(
        self, request: Request, org_slug: str, territory_id: str, person_id: str
    ) -> Response:
        territory = _territory(self.organization, territory_id)
        remove_from_territory(
            actor=self.membership,
            organization=self.organization,
            territory=territory,
            person_id=person_id,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class DmsTerritoryPersonMoveView(OrgScopedAPIView):
    """
    `POST .../territories/<id>/people/<person>/move/` `{to: id}` -- Move: this
    place swapped for another, their role and other places untouched. 204.
    """

    required_permissions: ClassVar[list[str]] = [*_PEOPLE_VIEW, "dms.user.update"]

    def post(
        self, request: Request, org_slug: str, territory_id: str, person_id: str
    ) -> Response:
        territory = _territory(self.organization, territory_id)
        payload = MovePersonSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        move_to_territory(
            actor=self.membership,
            organization=self.organization,
            territory=territory,
            person_id=person_id,
            to_territory_id=payload.validated_data["to"],
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
