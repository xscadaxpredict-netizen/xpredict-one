from rest_framework.views import APIView

from core.organizations.api.permissions import require_organization_member
from core.organizations.models import BusinessUnit


class TenantAPIView(APIView):
    """
    Base view for all organization-scoped endpoints.

    Ensures that the request is authorized, sets `request.membership`, and
    sets `request.unit_id` -- the dealership new unit-scoped rows are written to.

    Unit-level members always write to their own unit. Org-level members
    (owner/admin) have no unit on their membership by design (DB constraint
    `membership_org_standing_has_no_unit`), so they may pick one with the
    `X-Unit-Id` header; otherwise the organization's first unit is used.
    """

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        organization = require_organization_member(request)
        request.unit_id = self._resolve_unit_id(request, organization)

    @staticmethod
    def _resolve_unit_id(request, organization):
        membership = request.membership
        if membership.unit_id:
            return membership.unit_id

        units = BusinessUnit.objects.filter(organization=organization)
        requested = request.headers.get("X-Unit-Id")
        if requested:
            unit = units.filter(id=requested).first()
            if unit:
                return unit.id

        first = units.order_by("created_at").first()
        return first.id if first else None
