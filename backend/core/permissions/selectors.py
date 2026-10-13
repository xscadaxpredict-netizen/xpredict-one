"""
Read logic for the role catalogue.

REFERENCE DATA, NOT TENANT DATA. Organizations do not author roles (C28), so
the same nine rows answer for every customer and there is no `organization`
filter to forget here. The endpoint that serves this is still organization-
scoped, because the screen lives inside an organization and the caller has to
be a member to ask -- but the answer does not vary by who asks.
"""

from __future__ import annotations

from core.permissions.models import Role


def role_catalogue() -> list[Role]:
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
    return list(Role.objects.prefetch_related("permissions").all())
