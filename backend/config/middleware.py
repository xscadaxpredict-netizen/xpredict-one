"""
Tenant resolution. The sibling of `config.routers.TenantRouter`.

The router answers "which database does this model go to?" by reading a
contextvar. This is what sets it: one organization per request, resolved from
the URL path (C3), verified against an active membership, and **always reset in
a `finally` block**.

WHY IT LIVES IN `config` AND NOT IN `core.organizations`. `config.urls` imports
from `core`, so a `core` -> `config` import would close a package cycle --- and
this needs `current_tenant_db`, which belongs to the router. It is wiring, like
the router, so it sits next to it.

IT CANNOT USE THE DRF EXCEPTION HANDLER, and that is the thing to understand
before changing it. `config.exception_handler` is reached because DRF catches
whatever a view raises; middleware is called by Django, before any view is
chosen, so nothing here is inside that try/except. A `DomainError` raised in
this file would propagate to Django and become a 500 with a traceback page in
DEBUG. So this file builds its own problem+json responses, deliberately in the
same shape, and returns them rather than raising.
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from django.http import HttpRequest, HttpResponse, JsonResponse

from config.routers import current_tenant_db
from core.organizations.models import Organization, OrganizationStatus
from core.organizations.tenancy import register_tenant_connection
from shared.base_models import allowed_units

# Everything org-scoped lives under /api/v1/orgs/<slug>/. Auth and /me do not,
# because they are what tell the browser which slugs exist.
_ORG_PATH = re.compile(r"^/api/v1/orgs/(?P<slug>[^/]+)/")

ERROR_TYPE_BASE = "https://api.xpredict.one/errors"


def _problem(status: int, code: str, detail: str, request: HttpRequest) -> JsonResponse:
    """
    The same body `config.exception_handler` produces, built by hand.

    Duplicated shape, and the duplication is the lesser evil: the alternative
    is middleware that answers in a different format from every other error,
    so the frontend would need a second branch for errors that happen to come
    from here.
    """
    return JsonResponse(
        {
            "type": f"{ERROR_TYPE_BASE}/{code.replace('_', '-')}",
            "title": {401: "Authentication required", 404: "Not found"}.get(status, "Error"),
            "status": status,
            "detail": detail,
            "code": code,
            "trace_id": uuid.uuid4().hex,
            "instance": request.path,
        },
        status=status,
        content_type="application/problem+json",
    )


class TenantMiddleware:
    """
    Bind one organization to this request, or refuse it.

    Placed AFTER authentication in `MIDDLEWARE`: it needs `request.user` to
    check membership. DRF's authentication runs later still, inside the view,
    so `request.user` here is Django's session user and is `AnonymousUser` for
    a cookie-JWT caller --- which is why membership is NOT checked here. See
    `_resolve` for what that means and who does check.
    """

    def __init__(self, get_response: Any) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        match = _ORG_PATH.match(request.path)

        if match is None:
            # Not an org-scoped URL. No context is bound, and the router then
            # REFUSES any tenant model touched during this request rather than
            # falling back to `default`. That is the fail-closed rule: a
            # missing binding must raise, never quietly read the control DB.
            return self.get_response(request)

        organization = self._resolve(match.group("slug"))

        if organization is None:
            # IT DOES NOT ANSWER 404 HERE, AND THAT IS THE WHOLE POINT.
            #
            # It did, and probing the running server showed the leak: an
            # unknown slug answered 404 while a real one answered 401, because
            # the middleware refused before DRF had authenticated anybody. So
            # an anonymous caller could tell a real organisation from a
            # made-up one and enumerate which companies use the platform ---
            # exactly what the 404-not-403 rule exists to prevent (C3).
            #
            # Middleware cannot fix that by authenticating: DRF does that
            # inside the view. So it binds nothing, lets the request through,
            # and `require_organization_member()` refuses it AFTER
            # authentication --- at which point anonymous gets 401 and a
            # stranger gets 404, whether or not the slug was real.
            #
            # Binding nothing is safe because the router fails closed: a
            # tenant model touched during this request raises rather than
            # quietly reading the control database.
            request.organization = None  # type: ignore[attr-defined]
            return self.get_response(request)

        token = current_tenant_db.set(register_tenant_connection(organization))
        # Cleared per request as well. `allowed_units` is set per app by the
        # view layer from `resolve_allowed_units()`; binding nothing here means
        # a view that forgets to set it gets "unrestricted", which is wrong but
        # LOUD -- a dealer seeing every dealership is noticed. Leaving a
        # previous request's value in place would be quiet and worse.
        units_token = allowed_units.set(None)

        request.organization = organization  # type: ignore[attr-defined]

        try:
            return self.get_response(request)
        finally:
            # ALWAYS, and this is the single most important line in the file.
            # Threads are reused across requests, and a contextvar left set
            # would hand the next request on this thread the previous tenant's
            # database. The symptom is one customer seeing another's data
            # under load and nothing at all in testing.
            current_tenant_db.reset(token)
            allowed_units.reset(units_token)

    def _resolve(self, slug: str) -> Organization | None:
        """
        The organization for this slug, or None if the request must 404.

        MEMBERSHIP IS NOT CHECKED HERE, and that is a real limitation rather
        than an omission. Authentication is DRF's `CookieJWTAuthentication`,
        which runs inside the view --- so at middleware time `request.user` is
        `AnonymousUser` for every cookie-JWT caller and there is nobody to
        check. Checking against an anonymous user would reject every request.

        So this binds the DATABASE and the view enforces WHO. That split is
        safe only because the router fails closed and because every org-scoped
        endpoint checks the caller's membership before returning anything ---
        which is the authorization chain in Phase 3, and the thing that must
        not be skipped per endpoint. A suspended organization is refused here,
        because that needs no user.

        The alternative, authenticating in middleware, means a second copy of
        the JWT and CSRF logic that has to agree with the first. Worth
        revisiting if DRF's authentication ever moves out of the view, and not
        before.
        """
        organization = Organization.objects.filter(slug=slug).first()

        if organization is None:
            return None

        if organization.status != OrganizationStatus.ACTIVE:
            # Suspended customers are refused at the door. Deliberately the
            # same 404 as "no such slug": whether a named organization is
            # suspended is their business, not a stranger's.
            return None

        return organization
