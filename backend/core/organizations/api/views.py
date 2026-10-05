"""
Organization-scoped endpoints, mounted under /api/v1/orgs/<slug>/.

Permission -> deserialize -> call a selector or service -> serialize. No
business rules here; an `if` about a rule belongs in `services.py`.

EVERY VIEW IN THIS DIRECTORY CALLS `require_organization_member()` FIRST. The
middleware bound the database but could not check the caller, because DRF
authenticates inside the view. See `api/permissions.py` for the full reason.
"""

from __future__ import annotations

from typing import ClassVar

from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from core.organizations.api.permissions import require_organization_member


class ProvisioningView(APIView):
    """
    Has this organization's database finished being created? (C14, step three.)

    POLLED BY THE SIGNUP SCREEN, every second or so, between signup committing
    and the workspace existing. It answers one boolean because that is all the
    screen needs: there is no progress to report, and inventing a percentage
    for a `CREATE DATABASE` plus a `migrate` would be a number nobody could
    justify.

    NOTHING HERE IS ORG-SPECIFIC EXCEPT THE MEMBERSHIP CHECK. `provisioned_at`
    lives in the control database, so this endpoint works perfectly well while
    the tenant database it reports on does not exist --- which is the entire
    situation it exists to describe.
    """

    permission_classes: ClassVar[list] = [IsAuthenticated]

    # `org_slug` is captured by the URL and therefore handed to every view
    # under /orgs/<slug>/, so it has to be accepted. It is deliberately NOT
    # used: the middleware has already turned it into `request.organization`,
    # and resolving it again here would be a second lookup that could disagree
    # with the one the database binding was made from.
    def get(self, request: Request, org_slug: str) -> Response:
        organization = require_organization_member(request)

        return Response({"is_ready": organization.is_ready})
