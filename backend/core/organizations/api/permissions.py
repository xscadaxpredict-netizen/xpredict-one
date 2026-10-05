"""
The one check every organization-scoped endpoint owes.

THIS IS AN OBLIGATION, NOT A CONVENIENCE, and it is worth knowing why it is a
function the view calls rather than something the middleware already did.

`config.middleware.TenantMiddleware` resolves the slug and binds that
organization's database, but it CANNOT check the caller: DRF authenticates
inside the view, so `request.user` is still anonymous at middleware time. And
it deliberately does not refuse an unknown slug either --- doing so leaked
which organisations exist, because an anonymous caller got 404 for a made-up
slug and 401 for a real one.

So the middleware binds the DATABASE and this decides WHO. Until the Phase 3
authorization chain makes it structural, every endpoint under
`/api/v1/orgs/<slug>/` has to call this first. An endpoint that forgets it is
either readable by a stranger, or --- if it touches a tenant model with nothing
bound --- raises `TenantContextMissingError` and answers 500, which is at least
loud.
"""

from __future__ import annotations

from rest_framework.request import Request

from core.organizations.models import Membership, MembershipStatus, Organization
from shared.exceptions import not_found


def require_organization_member(request: Request) -> Organization:
    """
    The organization for this request, or raise `NotFoundError`.

    ONE ANSWER FOR THREE DIFFERENT REFUSALS, on purpose: an unknown slug, a
    suspended organization, and a real organization the caller has nothing to
    do with are all 404 with the same body. Anything else turns the slug into
    a way to find out which companies are customers, which of them are
    suspended, and when each signed up.

    Note what this means for ordering: DRF checks `IsAuthenticated` before the
    handler runs, so an anonymous caller gets 401 whatever slug they tried, and
    an authenticated stranger gets 404 whatever slug they tried. Neither can
    distinguish a real organization from a fictional one.
    """
    organization = getattr(request, "organization", None)

    if organization is None:
        raise not_found("Organization")

    is_member = Membership.objects.filter(
        user=request.user,
        organization=organization,
        status=MembershipStatus.ACTIVE,
    ).exists()

    if not is_member:
        # 404, never 403. 403 would confirm the organization exists and that
        # somebody else works there.
        raise not_found("Organization")

    return organization
