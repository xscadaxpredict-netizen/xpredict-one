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

from django.core.exceptions import ImproperlyConfigured
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from core.organizations.exceptions import UnitClosedError
from core.organizations.models import Membership, MembershipStatus, Organization, UnitStatus
from core.organizations.selectors import permissions_for
from shared.exceptions import AuthorizationError, not_found

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

    required_permissions: ClassVar[list[str] | None] = None
    """
    The permission codes the caller must hold, ALL of them, or 403.

    `None` IS NOT "no permissions needed" --- it is "nobody has said", and it
    raises. An endpoint that simply does not need one declares `[]` with a
    line saying why, which is a sentence somebody wrote on purpose rather
    than a field nobody filled in.

    That asymmetry is the same lesson as C49 one layer down. Organization
    access could be made structural, because every endpoint under
    `/orgs/<slug>/` needs the identical check; permissions cannot, because
    each endpoint needs a DIFFERENT one, so the base class can only insist
    that the question was answered. A default of `[]` would have been the
    friendlier design and would fail exactly the way the old per-view
    membership check failed: silently, and only for the endpoints somebody
    forgot.

    Scope is a separate question, answered by `can_manage()` and raising 404
    rather than 403 --- holding `admin.person.update` does not say WHOSE
    record you may touch.
    """

    required_any_permission: ClassVar[list[str]] = []
    """
    Permission codes of which the caller needs AT LEAST ONE.

    For an endpoint two different kinds of administrator reach for two
    different reasons --- the role catalogue being the first, read by the Roles
    page and by every role picker. Checked in ADDITION to
    `required_permissions`, so an endpoint can demand a floor and an
    alternative at once; empty means no such requirement.

    It is a declaration rather than an `if` in the handler on purpose. The
    handler check was written first and is the same mistake one level up: the
    requirement stops being visible from the class, which is exactly how the
    membership check went missing before C49.
    """

    method_permissions: ClassVar[dict[str, list[str]]] = {}
    """
    Extra permissions for ONE HTTP method, on top of `required_permissions`.

    For a view whose methods are not equally privileged --- the dealer list,
    where reading needs `admin.dealer.view` and adding one needs
    `admin.dealer.create`. `required_permissions` is the floor that every
    method shares; this adds to it for the method named.

    Keys are upper-case method names ("POST", "DELETE"). A method with no
    entry needs only the floor.

    CHECKED BEFORE THE HANDLER RUNS, like everything else here, which is the
    reason it is a declaration and not a line at the top of `post()`. A
    handler that refuses from inside itself has already started, and the
    refusal tests in `tests/test_org_scoped_view.py` assert the opposite --
    that a refused request never reaches a handler body at all.
    """

    def initial(self, request: Request, *args, **kwargs) -> None:
        # super() first: it authenticates, applies permission_classes and
        # enforces throttles. Checking membership before that would mean
        # deciding what an anonymous caller may see, which is backwards.
        super().initial(request, *args, **kwargs)
        self._membership = self._require_membership(request)
        self._organization = self._membership.organization
        self._require_permissions(request)

    @property
    def organization(self) -> Organization:
        """
        The organization this request is scoped to.

        Only exists once `initial()` has run, which means only once membership
        has been verified. There is no other accessor on purpose.
        """
        return self._organization

    @property
    def membership(self) -> Membership:
        """
        The CALLER's membership here: their standing, and their dealership.

        What every scope decision is made against --- `can_manage()` takes it
        --- and the reason `_require_membership()` fetches the row instead of
        asking `.exists()`. A view that needed it otherwise had to query for
        the thing the base class had just looked up, and the second lookup is
        where a filter gets forgotten.
        """
        return self._membership

    def _require_permissions(self, request: Request) -> None:
        if self.required_permissions is None:
            # A 500, deliberately, and it fires on the first request to the
            # endpoint rather than the first request from somebody
            # unprivileged. An endpoint that quietly permitted everybody would
            # look correct for exactly as long as only admins used it.
            raise ImproperlyConfigured(
                f"{type(self).__name__} must declare `required_permissions`. "
                f"Use [] if membership alone is enough, and say why."
            )

        # `request.method` is upper-case and always present by this point;
        # `or ""` only keeps the lookup total for a hand-built request object.
        for_this_method = self.method_permissions.get(request.method or "", [])
        required = [*self.required_permissions, *for_this_method]

        if not required and not self.required_any_permission:
            return

        held = permissions_for(self._membership)

        # 403 in both branches, not 404. The caller is entitled to be here --
        # they are a member of this organization -- and the answer to this
        # particular action is still no, which is the one case
        # `AuthorizationError` is for. Scope failures are the 404s.
        if not held.issuperset(required):
            raise AuthorizationError

        if self.required_any_permission and not held.intersection(self.required_any_permission):
            raise AuthorizationError

    def _require_membership(self, request: Request) -> Membership:
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

        membership = (
            Membership.objects.filter(
                user=request.user,
                organization=organization,
                status=MembershipStatus.ACTIVE,
            )
            # The row itself, not `.exists()`: `self.membership` is what scope
            # decisions are made against, and `permissions_for()` walks these
            # relations on every request that declares a required permission.
            .select_related("organization", "unit")
            .prefetch_related("app_access__role__permissions")
            .first()
        )

        if membership is None:
            # 404, never 403. 403 confirms the organization exists and that
            # somebody else works there.
            raise not_found("Organization")

        # A CLOSED DEALERSHIP REFUSES ITS OWN PEOPLE, EVERYWHERE AT ONCE (C63).
        #
        # Here rather than in each endpoint, for the reason this whole class
        # exists: a rule applied per view is a rule somebody forgets on the one
        # view that mattered, and the failure is silent. Every endpoint under
        # `/orgs/<slug>/` runs this, so closing a branch shuts every door in the
        # product in one statement -- including doors added later by somebody
        # who has never read C63.
        #
        # ORGANISATION-LEVEL PEOPLE ARE UNAFFECTED, and the `unit_id is None`
        # test is the whole of it: they are not scoped to any dealership, so
        # closing one does not touch them. That is what lets them go on reading
        # the closed branch's records, which is the other half of C63.
        #
        # NOT STORED ANYWHERE. This is computed from the dealership's status on
        # every request, which is why reopening restores exactly what was there
        # -- see `close_dealer` for why the alternative does not.
        #
        # AND IT IS NOT REDUNDANT WITH THE PERMISSION LAYER, which was the first
        # thing a revert suggested. `permissions_for()` goes through
        # `_membership_data()`, so a closed dealership already empties it and
        # most endpoints answer 403 `not_permitted` without this line. Two
        # things it does that that cannot: an endpoint declaring
        # `required_permissions = []` -- membership alone is enough, like the
        # provisioning poll -- is not covered by permissions at all, and the
        # refusal here carries `unit_closed`, which is a reason the shell can
        # act on rather than a generic no.
        if membership.unit_id is not None and membership.unit.status == UnitStatus.DISABLED:
            raise UnitClosedError

        return membership
