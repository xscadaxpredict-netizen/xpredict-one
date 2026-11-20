"""
Read logic for the role catalogue.

BUILT-IN ROLES ARE REFERENCE DATA; AN ORGANISATION'S OWN ARE NOT. Since the
role builder (C72 piece 5, 2026-11-20) an organisation may make roles and only
it may see them, so the catalogue is asked FOR an organisation, through
`roles_for_organization()`.
"""

from __future__ import annotations

import uuid

from core.permissions.models import AppCode, Role, roles_for_organization


def role_catalogue(organization_id: uuid.UUID | None = None) -> list[Role]:
    """
    Every built-in role, in the order the frontend should read them.

    `Role.administers` is a PROPERTY that walks `permissions`, so the prefetch
    is not an optimization -- without it this is a query per role, and the
    Roles page would issue ten to render a list of nine. `Role.Meta.ordering`
    is `app, level, name`, which is the grouping the picker already shows.

    NO FILTERING BY APP OR SUBSCRIPTION, deliberately. The caller asks for the
    catalogue and narrows it itself: `rolesFor(roles, app, unitScoped)` in
    `shell/admin/api/roles.ts` already picks the ones valid for a given app and
    scope, and it has to, because the invite form changes that selection as
    somebody ticks apps. Filtering here as well would mean two rules about
    which roles are offerable, and the day they disagree the form offers a role
    the backend then refuses.
    """
    # EXCEPT ADMINISTRATION'S OWN ROLES, until C72 piece 7. "Organisation
    # admin" (Q60) is given through the form's `role: "admin"` and never
    # picked from a list, and the Roles page already describes organisation
    # admins in its own words (C53). Listing it would put a second
    # "Organisation admin" on that page as if it were an app role. Piece 7's
    # role builder is where it appears.
    #
    # Built-in roles and THIS organisation's own -- never another's.
    return list(
        roles_for_organization(organization_id)
        .prefetch_related("permissions")
        .exclude(app_id=AppCode.ADMIN)
    )
