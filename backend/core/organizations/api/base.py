"""
The base view every organization-scoped endpoint inherits (C49).

WHY A BASE CLASS RATHER THAN A FUNCTION EACH VIEW CALLS. It was a function, and
the failure mode was silent in every direction: forget the call and any
signed-in stranger can read another organization's rows, while the tests pass
(you naturally test as a member), lint passes, and the code still reads as
guarded because `IsAuthenticated` is sitting right there. No error, ever --
just 200 with somebody else's data.

THE POINT IS THAT `self.organization` IS THE ONLY WAY TO REACH IT. The
middleware stows the organization privately and this class is what hands it
over, after checking membership. A view that skips the check does not get an
insecure endpoint; it gets one that cannot see the organization at all, which
is noticed immediately.

It is also the first link of the Phase 3 authorization chain -- user -> org ->
app -> role -> records. The rest hangs off this.
"""

from __future__ import annotations

from typing import ClassVar

from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from core.organizations.models import Membership, MembershipStatus, Organization
from shared.exceptions import not_found

# Where `config.middleware.TenantMiddleware` leaves the resolved organization.
#
# UNDERSCORED BECAUSE IT IS NOT THE PUBLIC ROUTE. Reading it directly skips the
# membership check, which is the whole thing this file exists to make
# impossible to do by accident. `self.organization` is the way.
REQUEST_ORGANIZATION_ATTR = "_resolved_organization"


class OrgScopedAPIView(APIView):
    """
    An endpoint under `/api/v1/orgs/<slug>/`.

    Membership is verified in `initial()`, which DRF runs after authentication
    and before the handler -- the earliest point where `request.user` is real.
    That is also why the middleware cannot do this job: it runs before any view
    is chosen, when the caller is still anonymous.
    """

    permission_classes: ClassVar[list] = [IsAuthenticated]

    def initial(self, request: Request, *args, **kwargs) -> None:
        # super() first: it authenticates, applies permission_classes and
        # enforces throttles. Checking membership before that would mean
        # deciding what an anonymous caller may see, which is backwards.
        super().initial(request, *args, **kwargs)
        self._organization = self._require_membership(request)

    @property
    def organization(self) -> Organization:
        """
        The organization this request is scoped to.

        Only exists once `initial()` has run, which means only once membership
        has been verified. There is no other accessor on purpose.
        """
        return self._organization

    def _require_membership(self, request: Request) -> Organization:
        """
        ONE ANSWER FOR THREE DIFFERENT REFUSALS, deliberately: an unknown slug,
        a suspended organization, and a real organization the caller has
        nothing to do with are all 404 with the same body.

        Anything else turns the slug into a way to find out which companies are
        customers, which of them are suspended, and when each signed up. And
        note the ordering DRF gives us for free: `IsAuthenticated` runs in
        `super().initial()`, so an anonymous caller gets 401 whatever slug they
        tried, and an authenticated stranger gets 404 whatever slug they tried.
        Neither can tell a real organization from a fictional one.
        """
        organization = getattr(request, REQUEST_ORGANIZATION_ATTR, None)

        if organization is None:
            # The middleware could not resolve the slug, or refused it. It
            # deliberately does not answer 404 itself -- doing so leaked which
            # organizations exist, because that refusal landed before
            # authentication.
            raise not_found("Organization")

        is_member = Membership.objects.filter(
            user=request.user,
            organization=organization,
            status=MembershipStatus.ACTIVE,
        ).exists()

        if not is_member:
            # 404, never 403. 403 confirms the organization exists and that
            # somebody else works there.
            raise not_found("Organization")

        return organization
