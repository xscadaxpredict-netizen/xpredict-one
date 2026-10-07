"""
The role catalogue endpoint, under /api/v1/orgs/<slug>/admin/roles.

Permission -> deserialize -> call a selector -> serialize. No business rules.

ORGANIZATION-SCOPED BUT NOT ORGANIZATION-SPECIFIC. It inherits
`OrgScopedAPIView` like everything under `/orgs/<slug>/` (C49), so the caller
must be a member to ask -- but roles are platform-wide reference data (C28) and
the answer is the same for every customer. The scoping here buys authorization,
not isolation, and there is nothing a cross-tenant request could learn.
"""

from __future__ import annotations

from typing import ClassVar

from rest_framework.request import Request
from rest_framework.response import Response

from core.organizations.api.base import OrgScopedAPIView
from core.permissions.api.serializers import RoleSerializer
from core.permissions.selectors import role_catalogue


class RolesView(OrgScopedAPIView):
    """
    Every built-in role: what it is called, which app it belongs to, whether it
    scopes to a dealership, and whether holding it administers that scope.

    TWO SCREENS READ THIS, which is why the requirement is an "any of" and not
    `admin.role.view` alone:

    - **The Roles page**, a read-only reference (C37). Reaching it needs
      `admin.role.view`, which is what puts the `roles` module in somebody's
      sidebar.
    - **The invite and edit forms**, which need role NAMES to render a picker.
      A dealer admin holds `admin.person.invite` and `admin.person.update` and
      deliberately does NOT hold `admin.role.view`: the DMS System
      administrator role grants the `users` module and not the `roles` one.

    Gating on `admin.role.view` alone would therefore have left a dealer admin
    able to invite somebody and unable to say what they would be -- an empty
    select, with no error to explain it. Assigning a role needs its name, which
    `roles.ts` has said in a docstring since before the backend existed.

    THE ALTERNATIVE WAS A DATA MIGRATION adding `admin.role.view` to the DMS
    System administrator role. Not taken: permissions drive module visibility
    (C42), so granting it would put a Roles item in every dealer admin's
    sidebar. That is a product decision about what C23's "narrowed"
    Administration contains, not a side effect to pick up while wiring an
    endpoint. Recorded as Q35.
    """

    required_any_permission: ClassVar[list[str]] = [
        "admin.role.view",
        "admin.person.invite",
        "admin.person.update",
    ]

    # Nothing on top of the "any of" above. Spelled out rather than left to
    # the default, because the base class treats an unanswered
    # `required_permissions` as a configuration error and this is the answer.
    required_permissions: ClassVar[list[str]] = []

    def get(self, request: Request, org_slug: str) -> Response:
        return Response(RoleSerializer(role_catalogue(), many=True).data)
