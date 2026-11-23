"""
Organization-scoped endpoints, mounted under /api/v1/orgs/<slug>/.

Permission -> deserialize -> call a selector or service -> serialize. No
business rules here; an `if` about a rule belongs in `services.py`.

EVERY VIEW IN THIS DIRECTORY INHERITS `OrgScopedAPIView` (C49). It verifies
membership before the handler runs and is the only way to reach the
organization, so a view written without it cannot see one. See `api/base.py`
for why that is a base class rather than a line each view remembers.
"""

from __future__ import annotations

from typing import ClassVar

from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response

from core.organizations.api.base import OrgScopedAPIView
from core.organizations.api.serializers import (
    AdminSerializer,
    ApplicationMemberSerializer,
    ApplicationSerializer,
    AppRoleSerializer,
    AssignAdminSerializer,
    AssignAppsSerializer,
    AssignUsersSerializer,
    DealerCreateSerializer,
    DealerDetailsSerializer,
    DealerSerializer,
    InviteLinkSerializer,
    InviteSerializer,
    NewPanelRoleSerializer,
    OrganizationProfileSerializer,
    OrgUserSerializer,
    PanelRoleSerializer,
    PersonDetailsSerializer,
    RoleBuilderSerializer,
    TerritoryCreateSerializer,
    TerritoryMoveSerializer,
    TerritoryRenameSerializer,
    TerritorySerializer,
)
from core.organizations.models import GrantStatus, MembershipStatus, Territory, TerritoryKind
from core.organizations.selectors import (
    admin_panel_roles,
    admins_for,
    application_members,
    applications_for,
    dealers_for,
    org_users,
    organization_profile,
    role_builder,
    territories_for,
)
from core.organizations.services import (
    assign_admin_role,
    assign_apps,
    assign_users_to_app,
    change_app_role,
    close_dealer,
    create_admin_role,
    create_dealer,
    create_territory,
    delete_admin_role,
    invitation_for_link,
    invitation_link,
    invite_person,
    move_territory,
    remove_person,
    rename_territory,
    reopen_dealer,
    resend_invitation,
    set_app_status,
    set_person_status,
    unassign_app,
    update_admin_role,
    update_dealer,
    update_person_details,
)
from shared.exceptions import not_found


class ProvisioningView(OrgScopedAPIView):
    """
    Has this organization's database finished being created? (C14, step three.)

    POLLED BY THE SIGNUP SCREEN, every second or so, between signup committing
    and the workspace existing. It answers one boolean because that is all the
    screen needs: there is no progress to report, and inventing a percentage
    for a `CREATE DATABASE` plus a `migrate` would be a number nobody could
    justify.

    NOTHING HERE READS THE TENANT DATABASE. `provisioned_at` lives in the
    control database, so this endpoint works perfectly well while the database
    it reports on does not exist -- which is the entire situation it describes.
    """

    # MEMBERSHIP ALONE IS ENOUGH, and this is the endpoint that case was left
    # open for. It is polled by the signup screen seconds after an
    # organization is founded, before any role could have been granted, and it
    # discloses one boolean about the asker's own workspace. Requiring a
    # permission here would mean the owner cannot watch their own organization
    # being created.
    required_permissions: ClassVar[list[str]] = []

    # `org_slug` is captured by the URL and therefore handed to every view
    # under /orgs/<slug>/, so it has to be accepted. It is deliberately NOT
    # used: the middleware already resolved it, and resolving it again here
    # would be a second lookup that could disagree with the one the database
    # binding was made from.
    def get(self, request: Request, org_slug: str) -> Response:
        return Response({"is_ready": self.organization.is_ready})


class DealersView(OrgScopedAPIView):
    """
    List this organization's dealerships, or add one.

    ORG-LEVEL, NOT DEALER-LEVEL (C3, C23). Only org standing grants
    `admin.dealer.*` -- the DMS System administrator role grants the `users`
    module and nothing else -- so a dealer admin running one branch cannot
    invent another, and gets 403 here while managing their own people happily.

    NO SCOPE CHECK, and none is possible: a dealership IS the scope. The
    organization has been verified by the base class and every dealership
    returned belongs to it, which is the whole isolation story for this
    endpoint.
    """

    required_permissions: ClassVar[list[str]] = ["admin.dealer.view"]
    # Adding one needs more than reading the list, and the base class checks
    # this before `post()` is entered rather than inside it.
    method_permissions: ClassVar[dict[str, list[str]]] = {
        "POST": ["admin.dealer.create"],
    }

    def get(self, request: Request, org_slug: str) -> Response:
        dealers = dealers_for(self.organization)
        return Response(DealerSerializer(dealers, many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        # CREATE takes an optional `parent_id` -- the region it sits in (C72).
        # Editing does not: moving is the territories endpoint's job.
        payload = DealerCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        dealer = create_dealer(organization=self.organization, **payload.validated_data)

        # Re-read through the selector so the response carries `user_count`,
        # which is annotated rather than stored. Returning the created row
        # directly would answer without the field and the list would gain a
        # column the create response lacked.
        created = next(d for d in dealers_for(self.organization) if d.pk == dealer.pk)
        return Response(DealerSerializer(created).data, status=status.HTTP_201_CREATED)


class DealerDetailView(OrgScopedAPIView):
    """
    Edit one dealership.

    NO CLOSE OR REOPEN (C52). Q21 has not said what closing does to a
    dealership's people or its records, and `status` is therefore not writable
    through any endpoint -- the frontend keeps its fake for those two buttons.
    """

    # The page's view, then the act: you cannot act on a page you cannot see (C79 rule 5).
    required_permissions: ClassVar[list[str]] = ["admin.dealer.view", "admin.dealer.update"]

    def put(self, request: Request, org_slug: str, dealer_id: str) -> Response:
        dealer = self._get_dealer(dealer_id)

        payload = DealerDetailsSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        update_dealer(dealer=dealer, **payload.validated_data)

        updated = next(d for d in dealers_for(self.organization) if d.pk == dealer.pk)
        return Response(DealerSerializer(updated).data)

    def _get_dealer(self, dealer_id: str) -> Territory:
        """
        FILTERED BY ORGANIZATION, which is the isolation. A bare
        `get(pk=dealer_id)` would happily return another customer's dealership
        to anybody who guessed a UUID, and the only thing standing between
        those two lines is remembering to write this one.

        404 rather than 403 for a dealership in another organization: a record
        the caller may not see has to be indistinguishable from one that never
        existed. A malformed UUID is the same 404 for the same reason -- a 400
        would confirm that a well-formed id is the thing being looked up.
        """
        try:
            return Territory.objects.get(
                id=dealer_id, organization=self.organization, kind=TerritoryKind.DEALER
            )
        except (Territory.DoesNotExist, ValidationError, ValueError):
            raise not_found("Dealer") from None


class DealerStatusView(OrgScopedAPIView):
    """
    Close a dealership, or open it again (C63, answering Q21).

    THE TWO ENDPOINTS C52 DECLINED TO BUILD. They were held back for nine
    sessions because Q21 had not said what closing DOES -- and shipping the
    obvious status flag would have answered it by accident, which is a worse
    outcome than the frontend keeping a fake. The answer is now recorded: its
    people lose access entirely, its records persist and stay readable to
    organisation-level people, reopening restores exactly what was there, and
    there is no delete, ever.

    A SEPARATE PERMISSION FROM EDITING, and it already existed:
    `admin.dealer.set_status` has been in the catalogue since PR #13, seeded,
    granted, and used by nothing. Shutting a branch is not the same act as
    correcting its address, and the catalogue said so before there was anywhere
    to enforce it.

    ORG-LEVEL ONLY, which needs no check here. Only org standing grants
    `admin.dealer.*` (C3, C23) -- the DMS System administrator role grants the
    `users` module and nothing else -- so a dealer admin is refused by the
    permission layer, and cannot close their own branch to lock out a
    colleague.

    DEALERSHIP DETAILS STAY EDITABLE WHILE CLOSED (C63). Closing is about
    access and operations, not about freezing the record: a typo in a closed
    branch's name should not need reopening to fix. `DealerDetailView` is
    therefore unchanged, deliberately.
    """

    # The page's view, then the act (C79 rule 5).
    required_permissions: ClassVar[list[str]] = ["admin.dealer.view", "admin.dealer.set_status"]

    # The whole vocabulary this route accepts, in the shape `UserStatusView`
    # established: a bare `else` would turn a typo in a URL into "close", and
    # closing a branch by misspelling a word is not a mistake worth allowing.
    _ACTIONS: ClassVar[dict[str, object]] = {
        "close": close_dealer,
        "reopen": reopen_dealer,
    }

    def post(self, request: Request, org_slug: str, dealer_id: str, action: str) -> Response:
        if action not in self._ACTIONS:
            # 404, like any other URL that does not exist. The route is generic
            # enough to match it; the view is what makes it not exist.
            raise not_found("Dealer")

        dealer = self._get_dealer(dealer_id)
        self._ACTIONS[action](dealer=dealer)

        # Re-read through the selector so the response carries `user_count`,
        # which is annotated rather than stored -- the same reason the create
        # endpoint does it. The count is also what the screen shows beside the
        # status it has just changed, so answering without it would blank a
        # column on exactly the row somebody is looking at.
        updated = next(d for d in dealers_for(self.organization) if d.pk == dealer.pk)
        return Response(DealerSerializer(updated).data)

    def _get_dealer(self, dealer_id: str) -> Territory:
        """The same filter-by-organization isolation as `DealerDetailView`."""
        try:
            return Territory.objects.get(
                id=dealer_id, organization=self.organization, kind=TerritoryKind.DEALER
            )
        except (Territory.DoesNotExist, ValidationError, ValueError):
            raise not_found("Dealer") from None


class _TerritoryLookup:
    """The one way a territory view finds its territory: inside this organization, or 404."""

    def _get_territory(self, territory_id: str) -> Territory:
        # The same isolation as `_get_dealer`: paths are unique across every
        # organisation, so an id alone would reach another customer's tree.
        try:
            return Territory.objects.get(id=territory_id, organization=self.organization)
        except (Territory.DoesNotExist, ValidationError, ValueError):
            raise not_found("Territory") from None

    def _respond_with(
        self, territory: Territory, status_code: int = status.HTTP_200_OK
    ) -> Response:
        # Re-read through the selector so the response carries `parent_id`,
        # which is derived from the path rather than stored.
        fresh = next(t for t in territories_for(self.organization) if t.pk == territory.pk)
        return Response(TerritorySerializer(fresh).data, status=status_code)


class TerritoriesView(_TerritoryLookup, OrgScopedAPIView):
    """
    The organisation's territory tree, or a new region, branch or warehouse
    (C72 piece 1).

    ORGANISATION-LEVEL, like dealerships (C3): only standing grants
    `admin.territory.*`, so a dealer admin cannot redraw the tree they sit in.
    Dealerships are added through `/admin/dealers/`, which can place one in a
    region.
    """

    required_permissions: ClassVar[list[str]] = ["admin.territory.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {
        "POST": ["admin.territory.create"],
    }

    def get(self, request: Request, org_slug: str) -> Response:
        return Response(TerritorySerializer(territories_for(self.organization), many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        payload = TerritoryCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        territory = create_territory(organization=self.organization, **payload.validated_data)
        return self._respond_with(territory, status.HTTP_201_CREATED)


class TerritoryDetailView(_TerritoryLookup, OrgScopedAPIView):
    """Rename a territory -- any kind, dealerships included."""

    # The page's view, then the act (C79 rule 5).
    required_permissions: ClassVar[list[str]] = [
        "admin.territory.view",
        "admin.territory.update",
    ]

    def patch(self, request: Request, org_slug: str, territory_id: str) -> Response:
        territory = self._get_territory(territory_id)

        payload = TerritoryRenameSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        rename_territory(territory=territory, **payload.validated_data)
        return self._respond_with(territory)


class TerritoryMoveView(_TerritoryLookup, OrgScopedAPIView):
    """
    Put a territory, and everything under it, somewhere else in the tree.

    A POST TO ITS OWN URL, not a field on the rename: moving changes what every
    box underneath sits in, which is a different act from correcting a name,
    and one request is one user action (CLAUDE.md).
    """

    # The page's view, then the act (C79 rule 5).
    required_permissions: ClassVar[list[str]] = [
        "admin.territory.view",
        "admin.territory.update",
    ]

    def post(self, request: Request, org_slug: str, territory_id: str) -> Response:
        territory = self._get_territory(territory_id)

        payload = TerritoryMoveSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        moved = move_territory(territory=territory, **payload.validated_data)
        return self._respond_with(moved)


class UsersView(OrgScopedAPIView):
    """
    The people in this organization, and the invitation that adds one.

    SCOPED FROM THE CALLER'S MEMBERSHIP (C23). An organization admin sees
    everybody; a dealer admin sees their own dealership's people and nobody
    else's. `org_users()` does that from `self.membership`, never from
    anything the caller sent -- a scope taken from a parameter is a scope the
    caller chooses.

    THE LIST IS A UNION (C51): memberships for people who have accepted,
    invitations for people who have not.
    """

    required_permissions: ClassVar[list[str]] = ["admin.user.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {
        "POST": ["admin.user.create"],
    }

    def get(self, request: Request, org_slug: str) -> Response:
        people = org_users(self.organization, self.membership)
        return Response(OrgUserSerializer(people, many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        # A PERSON ONLY (C83): first name, last name, email.
        payload = InviteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        invite_person(
            actor=self.membership,
            organization=self.organization,
            **payload.validated_data,
        )

        # The new row as the list would show it, so the screen can insert it
        # without refetching -- and so create and list cannot disagree about
        # the shape, which is what `administers` and `unit_name` would do if
        # this serialized the invitation directly.
        return Response(self._row(payload.validated_data["email"]), status=status.HTTP_201_CREATED)

    def _row(self, email: str) -> dict:
        people = org_users(self.organization, self.membership)
        person = next(p for p in people if p.email.lower() == email.lower())
        return OrgUserSerializer(person).data


class UserDetailView(OrgScopedAPIView):
    """
    Edit somebody, or take them out of the organization.

    DELETE REMOVES THE MEMBERSHIP, NOT THE ACCOUNT (C24). It answers 204, which
    `readBody()` handles -- `response.json()` throws on an empty body, and that
    is what once reported a successful logout as a failure.
    """

    required_permissions: ClassVar[list[str]] = ["admin.user.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {
        "PUT": ["admin.user.update"],
        "DELETE": ["admin.user.delete"],
    }

    def put(self, request: Request, org_slug: str, user_id: str) -> Response:
        # BASIC INFORMATION ONLY (the owner, 2026-11-20): first name, last
        # name, email. Anything else in the body is refused, not ignored.
        payload = PersonDetailsSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        update_person_details(
            actor=self.membership,
            organization=self.organization,
            person_id=user_id,
            **payload.validated_data,
        )

        return Response(self._row(user_id))

    def delete(self, request: Request, org_slug: str, user_id: str) -> Response:
        remove_person(
            actor=self.membership,
            organization=self.organization,
            person_id=user_id,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _row(self, person_id: str) -> dict:
        people = org_users(self.organization, self.membership)
        person = next(p for p in people if str(p.id) == str(person_id))
        return OrgUserSerializer(person).data


class UserAppsView(OrgScopedAPIView):
    """
    Assign applications to a person (C83): `POST {"apps": [{"app", "role"}]}`.
    All or nothing; answers with the person's row as the Users list shows it.

    A write-only view: its floor is the page's view plus the act (C81).
    """

    # The page's view, then the act (C79 rule 5, C81).
    required_permissions: ClassVar[list[str]] = ["admin.user.view", "admin.user.assign_app"]

    def post(self, request: Request, org_slug: str, user_id: str) -> Response:
        payload = AssignAppsSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        assign_apps(
            actor=self.membership,
            organization=self.organization,
            person_id=user_id,
            apps=payload.validated_data["apps"],
        )

        people = org_users(self.organization, self.membership)
        person = next(p for p in people if str(p.id) == str(user_id))
        return Response(OrgUserSerializer(person).data)


class UserAppView(OrgScopedAPIView):
    """
    One app of one person -- the app tile (the owner, 2026-11-20):
    `PUT {"role"}` is Edit, `DELETE` is Unassign. Disable and Enable are
    `UserAppStatusView`. Each answers with the person's row as the Users list
    shows it (Unassign included, so the screen can drop the tile).

    A write-only view: its floor is the page's view; each method adds its act
    (C81).
    """

    required_permissions: ClassVar[list[str]] = ["admin.user.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {
        # The role in one app: its own permission, not Edit user's `update`.
        "PUT": ["admin.user.edit_app"],
        "DELETE": ["admin.user.unassign_app"],
    }

    def put(self, request: Request, org_slug: str, user_id: str, app: str) -> Response:
        payload = AppRoleSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        change_app_role(
            actor=self.membership,
            organization=self.organization,
            person_id=user_id,
            app=app,
            role=payload.validated_data["role"],
        )
        return Response(_person_row(self.organization, self.membership, user_id))

    def delete(self, request: Request, org_slug: str, user_id: str, app: str) -> Response:
        unassign_app(
            actor=self.membership,
            organization=self.organization,
            person_id=user_id,
            app=app,
        )
        return Response(_person_row(self.organization, self.membership, user_id))


class UserAppStatusView(OrgScopedAPIView):
    """
    The app tile's Disable, and Enable to undo it: `POST .../apps/<app>/disable/`
    or `.../enable/`. One endpoint per transition, as `UserStatusView`.
    """

    # The page's view, then the act (C79 rule 5, C81).
    required_permissions: ClassVar[list[str]] = ["admin.user.view", "admin.user.disable_app"]

    # The whole vocabulary. Anything else is a URL that does not exist.
    _STATUSES: ClassVar[dict[str, str]] = {
        "enable": GrantStatus.ACTIVE,
        "disable": GrantStatus.DISABLED,
    }

    def post(
        self, request: Request, org_slug: str, user_id: str, app: str, action: str
    ) -> Response:
        if action not in self._STATUSES:
            raise not_found("App")

        set_app_status(
            actor=self.membership,
            organization=self.organization,
            person_id=user_id,
            app=app,
            status=self._STATUSES[action],
        )
        return Response(_person_row(self.organization, self.membership, user_id))


def _person_row(organization, viewer, person_id: str) -> dict:
    """The person as the Users list shows them, after a change."""
    people = org_users(organization, viewer)
    person = next(p for p in people if str(p.id) == str(person_id))
    return OrgUserSerializer(person).data


class UserStatusView(OrgScopedAPIView):
    """
    Switch somebody off, or back on.

    TWO ENDPOINTS RATHER THAN A PATCH WITH A STATUS FIELD, which is the same
    reasoning the frontend gives for close/reopen: the backend has a rule per
    transition, and one endpoint per user action is what lets it enforce that
    rule by name. A generic patch turns "switch this person off" into "write
    any value into a column".

    `activate` and `deactivate` share this class because the rule is currently
    symmetrical. The moment it is not -- reactivating somebody whose
    dealership has since closed, say -- they split.
    """

    # The page's view, then the act (C79 rule 5).
    required_permissions: ClassVar[list[str]] = ["admin.user.view", "admin.user.deactivate"]

    # The whole vocabulary this route accepts. A bare `else` would turn every
    # unrecognised verb into "deactivate", so a typo in a URL would switch
    # somebody off.
    _STATUSES: ClassVar[dict[str, str]] = {
        "activate": MembershipStatus.ACTIVE,
        "deactivate": MembershipStatus.DISABLED,
    }

    def post(self, request: Request, org_slug: str, user_id: str, action: str) -> Response:
        if action not in self._STATUSES:
            # 404, like any other URL that does not exist. The route is generic
            # enough to match it; the view is what makes it not exist.
            raise not_found("User")

        set_person_status(
            actor=self.membership,
            organization=self.organization,
            person_id=user_id,
            status=self._STATUSES[action],
        )

        people = org_users(self.organization, self.membership)
        person = next(p for p in people if str(p.id) == str(user_id))
        return Response(OrgUserSerializer(person).data)


class ResendInvitationView(OrgScopedAPIView):
    """
    Send somebody's invitation again.

    IT SENDS NO EMAIL YET, and the service says so plainly rather than
    pretending. A fresh token is minted and the old one stops working, which is
    the half that has to be right; delivery is the rest of the invitation flow
    and Phase 2 still owes it.
    """

    # The page's view, then the act (C79 rule 5).
    required_permissions: ClassVar[list[str]] = [
        "admin.user.view",
        "admin.user.resend_invitation",
    ]

    def post(self, request: Request, org_slug: str, user_id: str) -> Response:
        resend_invitation(
            actor=self.membership,
            organization=self.organization,
            person_id=user_id,
        )
        # 204: there is nothing useful to say back, and the row has not changed
        # in any way the list displays.
        return Response(status=status.HTTP_204_NO_CONTENT)


class InviteLinkView(OrgScopedAPIView):
    """
    The invitation link, for an admin to copy and send however they like (C56).

    READABLE FOR AS LONG AS THE INVITATION IS PENDING, which the owner chose
    over revealing it once. Show-once sounds safer and sets a trap: the dialog
    is closed by accident, the admin presses Resend to get the link back, and
    the link they already sent stops working --- which reads as a broken
    invitation to the person holding it. So Copy and Resend became two
    different verbs: Copy sends the same link again, Resend kills it and mints
    another.

    `admin.user.create`, NOT `admin.user.view`. Reading the list tells you
    somebody was invited; this hands over the credential that joins the
    organisation as them, and the permission that creates an invitation is the
    one that should be able to re-read it. A dealer admin holds it and
    `can_manage` still decides WHOSE --- somebody else's dealership answers
    404, like everywhere else.
    """

    # The page's view, then the act (C79 rule 5).
    required_permissions: ClassVar[list[str]] = ["admin.user.view", "admin.user.create"]

    def get(self, request: Request, org_slug: str, user_id: str) -> Response:
        invitation = invitation_for_link(
            actor=self.membership,
            organization=self.organization,
            person_id=user_id,
        )
        return Response(
            InviteLinkSerializer(
                {"link": invitation_link(invitation), "expires_at": invitation.expires_at}
            ).data
        )


class OrganizationProfileView(OrgScopedAPIView):
    """
    The organisation's profile: name, web address, owner, when it was created
    and whether its workspace is ready (C78, Organization -> Profile).

    `admin.organization_info.view` is held by the owner and the Organisation admin
    role; a dealer admin does not hold it, and gets 403 -- they are a member,
    so the organisation is no secret to them, they just may not open this.
    """

    required_permissions: ClassVar[list[str]] = ["admin.organization_info.view"]

    def get(self, request: Request, org_slug: str) -> Response:
        profile = organization_profile(self.organization)
        return Response(OrganizationProfileSerializer(profile).data)


class ApplicationsView(OrgScopedAPIView):
    """
    The organisation's applications: each app, whether it is subscribed, its
    owner and how many people can open it (C78, App Management ->
    Applications). Read-only.

    `admin.application.view` is held by the owner and the Organisation admin
    role; a dealer admin gets 403.
    """

    required_permissions: ClassVar[list[str]] = ["admin.application.view"]

    def get(self, request: Request, org_slug: str) -> Response:
        rows = applications_for(self.organization)
        return Response(ApplicationSerializer(rows, many=True).data)


class AdminsView(OrgScopedAPIView):
    """
    The organisation's owner and admins -- active, deactivated and pending --
    with the apps they manage (C78, Admins and Roles -> Admins). Read-only.

    `admin.admin.view`, the Admins tab's own permission (C79): the server
    checks what the screen does. This used to be the Users list filtered in the
    browser, which needed `admin.user.view` and sent every person to show two.
    A dealer admin does not hold it and gets 403.
    """

    required_permissions: ClassVar[list[str]] = ["admin.admin.view"]
    # A VIEW THAT READS AND WRITES NAMES EVERY WRITE (C81). POST is Assign
    # Admin: its own act, and the Users list's view, since the page picks
    # people from it (as Assign users does, C87).
    method_permissions: ClassVar[dict[str, list[str]]] = {
        "POST": ["admin.admin.assign_admin", "admin.user.view"],
    }

    def get(self, request: Request, org_slug: str) -> Response:
        return Response(AdminSerializer(admins_for(self.organization), many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        """
        Assign Admin (C89): one Admin panel role for several people, all or
        nothing. Answers with the Admins tab as it now stands.
        """
        payload = AssignAdminSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        assign_admin_role(
            actor=self.membership,
            organization=self.organization,
            person_ids=payload.validated_data["users"],
            role_code=payload.validated_data["role"],
        )
        return Response(AdminSerializer(admins_for(self.organization), many=True).data)


class PanelRolesView(OrgScopedAPIView):
    """
    The Admin panel's roles -- Organization Owner, Organization Admin and the
    organisation's own -- with how many people hold each (C78, Admins and
    Roles -> Roles). POST is New Role (the role builder, C72 piece 5).

    `admin.role.view`, the Roles tab's own permission (C79): the server checks
    what the screen does. A dealer admin does not hold it and gets 403 -- the
    counts are organisation-wide, which is not theirs to read. The role
    PICKER on the invite and edit forms reads `/admin/roles/` instead, which
    they can reach (Q35).
    """

    required_permissions: ClassVar[list[str]] = ["admin.role.view"]
    # A VIEW THAT READS AND WRITES NAMES EVERY WRITE (C81).
    method_permissions: ClassVar[dict[str, list[str]]] = {"POST": ["admin.role.create"]}

    def get(self, request: Request, org_slug: str) -> Response:
        rows = admin_panel_roles(self.organization, self.membership)
        return Response(PanelRoleSerializer(rows, many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        """New Role: `{"name", "description", "permissions": [codes]}`."""
        payload = NewPanelRoleSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        role = create_admin_role(
            actor=self.membership,
            organization=self.organization,
            **payload.validated_data,
        )

        # The new row as the Roles tab shows it.
        rows = admin_panel_roles(self.organization, self.membership)
        row = next(r for r in rows if r.code == role.code)
        return Response(PanelRoleSerializer(row).data, status=status.HTTP_201_CREATED)


class PanelRoleDetailView(OrgScopedAPIView):
    """
    One of this organisation's own Admin panel roles: PUT is Edit Role, DELETE
    is Delete Role (C72 piece 5, after New Role).

    WRITE-ONLY, so the Roles tab's view sits beside each act (C81): you change
    a role from the screen that shows it. A built-in role is refused (409), and
    another organisation's role is not found (404) -- the service looks every
    code up through `roles_for_organization()`.
    """

    required_permissions: ClassVar[list[str]] = ["admin.role.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {
        "PUT": ["admin.role.update"],
        "DELETE": ["admin.role.delete"],
    }

    def put(self, request: Request, org_slug: str, role_code: str) -> Response:
        """Edit Role: `{"name", "description", "permissions": [codes]}`, as New Role."""
        payload = NewPanelRoleSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        role = update_admin_role(
            actor=self.membership,
            organization=self.organization,
            code=role_code,
            **payload.validated_data,
        )

        # The row as the Roles tab shows it, with its new Modified By.
        rows = admin_panel_roles(self.organization, self.membership)
        row = next(r for r in rows if r.code == role.code)
        return Response(PanelRoleSerializer(row).data)

    def delete(self, request: Request, org_slug: str, role_code: str) -> Response:
        """Delete Role: refused (409) while anybody holds it."""
        delete_admin_role(organization=self.organization, code=role_code)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RoleBuilderView(OrgScopedAPIView):
    """
    What the New Role grid draws: the Admin panel's section tree with each
    page's actions, and the roles "Copy permissions from" offers (C72 piece 5).

    The Roles tab's view, and the right to build or change a role.
    """

    required_permissions: ClassVar[list[str]] = ["admin.role.view"]
    required_any_permission: ClassVar[list[str]] = ["admin.role.create", "admin.role.update"]

    def get(self, request: Request, org_slug: str) -> Response:
        return Response(RoleBuilderSerializer(role_builder(self.organization)).data)


class ApplicationMembersView(OrgScopedAPIView):
    """
    The people who can open one app, with their role and places -- its panel
    on the Applications page (C78). Read-only.

    THE MEMBERS TAB'S OWN PERMISSION (C79, the owner's final list): seeing who
    is in an app is `admin.application.view_users`, a special action on top of
    seeing the list. Both are asked, because a special action never stands
    without its section's view.
    """

    required_permissions: ClassVar[list[str]] = ["admin.application.view"]
    # A VIEW THAT READS AND WRITES NAMES EVERY WRITE (C81). Reading the
    # members is the Members tab's own permission; assigning people is the
    # same act as Assign applications, so it is the same permission -- and
    # the Users list's view, since the dialog picks from it.
    method_permissions: ClassVar[dict[str, list[str]]] = {
        "GET": ["admin.application.view_users"],
        "POST": ["admin.user.view", "admin.user.assign_app"],
    }

    def get(self, request: Request, org_slug: str, app_code: str) -> Response:
        people = application_members(self.organization, app_code)
        return Response(ApplicationMemberSerializer(people, many=True).data)

    def post(self, request: Request, org_slug: str, app_code: str) -> Response:
        """Assign users: `{"users": [ids], "role": code}`, all or nothing."""
        payload = AssignUsersSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        assign_users_to_app(
            actor=self.membership,
            organization=self.organization,
            app=app_code,
            person_ids=payload.validated_data["users"],
            role=payload.validated_data["role"],
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
