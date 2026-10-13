from core.organizations.api.base import OrgScopedAPIView
from core.organizations.models import BusinessUnit


class TenantAPIView(OrgScopedAPIView):
    """
    Base view for all DMS organization-scoped endpoints.

    Builds on main's `OrgScopedAPIView`, which verifies an active membership,
    refuses users of a closed dealership (C63) and requires the permission
    declaration below, all before the handler runs.

    On top of that it sets `request.membership` and `request.unit_id` -- the
    dealership new unit-scoped rows are written to.

    Unit-level members always write to their own unit. Org-level members
    (owner/admin) have no unit on their membership by design (DB constraint
    `membership_org_standing_has_no_unit`), so they may pick one with the
    `X-Unit-Id` header; otherwise the organization's first unit is used.
    """

    # Membership alone is enough for DMS endpoints for now: the permission
    # catalogue has no codes for site-services, e-commerce, tools or settings
    # yet. Tighten per view with `required_permissions` / `method_permissions`
    # once those codes exist.
    required_permissions: list[str] = []

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        request.membership = self.membership
        request.unit_id = self._resolve_unit_id(request, self.organization)

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
