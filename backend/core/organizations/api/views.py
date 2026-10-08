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
    DealerDetailsSerializer,
    DealerSerializer,
    InviteLinkSerializer,
    OrgUserSerializer,
    PersonDetailsSerializer,
)
from core.organizations.models import BusinessUnit, MembershipStatus
from core.organizations.selectors import dealers_for, org_users
from core.organizations.services import (
    create_dealer,
    invitation_for_link,
    invitation_link,
    invite_person,
    remove_person,
    resend_invitation,
    set_person_status,
    update_dealer,
    update_person,
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
        payload = DealerDetailsSerializer(data=request.data)
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

    required_permissions: ClassVar[list[str]] = ["admin.dealer.update"]

    def put(self, request: Request, org_slug: str, dealer_id: str) -> Response:
        dealer = self._get_dealer(dealer_id)

        payload = DealerDetailsSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        update_dealer(dealer=dealer, **payload.validated_data)

        updated = next(d for d in dealers_for(self.organization) if d.pk == dealer.pk)
        return Response(DealerSerializer(updated).data)

    def _get_dealer(self, dealer_id: str) -> BusinessUnit:
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
            return BusinessUnit.objects.get(id=dealer_id, organization=self.organization)
        except (BusinessUnit.DoesNotExist, ValidationError, ValueError):
            raise not_found("Dealer") from None


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

    required_permissions: ClassVar[list[str]] = ["admin.person.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {
        "POST": ["admin.person.invite"],
    }

    def get(self, request: Request, org_slug: str) -> Response:
        people = org_users(self.organization, self.membership)
        return Response(OrgUserSerializer(people, many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        payload = PersonDetailsSerializer(data=request.data)
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

    required_permissions: ClassVar[list[str]] = ["admin.person.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {
        "PUT": ["admin.person.update"],
        "DELETE": ["admin.person.remove"],
    }

    def put(self, request: Request, org_slug: str, user_id: str) -> Response:
        payload = PersonDetailsSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        update_person(
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

    required_permissions: ClassVar[list[str]] = ["admin.person.set_status"]

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

    required_permissions: ClassVar[list[str]] = ["admin.person.resend_invitation"]

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

    `admin.person.invite`, NOT `admin.person.view`. Reading the list tells you
    somebody was invited; this hands over the credential that joins the
    organisation as them, and the permission that creates an invitation is the
    one that should be able to re-read it. A dealer admin holds it and
    `can_manage` still decides WHOSE --- somebody else's dealership answers
    404, like everywhere else.
    """

    required_permissions: ClassVar[list[str]] = ["admin.person.invite"]

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
