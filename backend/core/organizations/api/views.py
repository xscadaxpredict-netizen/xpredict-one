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

from rest_framework.request import Request
from rest_framework.response import Response

from core.organizations.api.base import OrgScopedAPIView


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
