from core.organizations.api.base import OrgScopedAPIView
from core.organizations.models import BusinessUnit
from core.organizations.selectors import permissions_for, resolve_allowed_units
from core.permissions.models import AppCode
from shared.base_models import allowed_units


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

    app_code: str = AppCode.DMS

    # NO `required_permissions` DEFAULT HERE, AND THAT IS THE POINT.
    #
    # This class used to set `= []`, which reads as a harmless convenience and
    # is the opposite. `OrgScopedAPIView` leaves it `None` so that a view
    # nobody finished raises ImproperlyConfigured on its FIRST request --
    # loudly, to whoever is building it -- instead of quietly permitting every
    # member of the organisation. Setting `[]` on the base class means nothing
    # is ever unanswered, so the check can never fire and "we decided this
    # needs nothing" becomes indistinguishable from "nobody got round to it".
    #
    # Thirteen DMS views were in the second state for the life of this branch,
    # nine of them writing: deleting a user manual, cancelling a store order,
    # rewriting the capacity calculator's constants. None of them looked
    # wrong, because a missing declaration looked exactly like a deliberate
    # one.
    #
    # An endpoint that genuinely needs no permission says `[]` ITSELF, with a
    # sentence saying why -- a thing somebody wrote on purpose.

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        request.membership = self.membership
        request.unit_id = self._resolve_unit_id(request, self.organization)

        # Enforce dealer isolation for all unit-scoped models (Enquiries, Quotations, Job cards,
        # etc.)
        allowed = resolve_allowed_units(self.membership, self.app_code)
        allowed_units.set(allowed)

    @property
    def is_manager_or_admin(self) -> bool:
        if self.membership.role in ("owner", "admin"):
            return True
        held = permissions_for(self.membership)
        return bool(
            held.intersection({
                "dms.enquiry.close",
                "dms.order.confirm",
                "admin.person.invite",
            })
        )

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
