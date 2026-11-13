from core.organizations.api.base import OrgScopedAPIView
from core.organizations.models import Territory, TerritoryKind
from core.organizations.selectors import permissions_for, resolve_allowed_territories
from core.permissions.models import AppCode
from shared.base_models import allowed_territories


class TenantAPIView(OrgScopedAPIView):
    """
    Base view for all DMS organization-scoped endpoints.

    Builds on main's `OrgScopedAPIView`, which verifies an active membership,
    refuses users of a closed dealership (C63) and requires the permission
    declaration below, all before the handler runs.

    On top of that it sets `request.membership` and `request.territory_id` -- the
    dealership new unit-scoped rows are written to -- both read from the
    person's DMS grant (C72 step 2b; see `_resolve_territory_id`).
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
        request.territory_id = self._resolve_territory_id(request, self.organization)

        # Enforce dealer isolation for all unit-scoped models (Enquiries, Quotations, Job cards,
        # etc.)
        allowed = resolve_allowed_territories(self.membership, self.app_code)
        allowed_territories.set(allowed)

    @property
    def is_manager_or_admin(self) -> bool:
        # PERMISSIONS ONLY since C72 step 2c: the owner holds all of them by
        # rule, and an organisation admin holds `admin.person.invite` through
        # their "Organisation admin" grant. `Membership.role` decides nothing.
        held = permissions_for(self.membership)
        return bool(
            held.intersection({
                "dms.enquiry.close",
                "dms.order.confirm",
                "admin.person.invite",
            })
        )

    @staticmethod
    def _resolve_territory_id(request, organization, app: str = AppCode.DMS):
        """
        The dealership this request writes new records to.

        CHOSEN AMONG THE DEALERSHIPS THE PERSON'S GRANT ALLOWS (C72 step 2b),
        read through `resolve_allowed_territories()` rather than `Membership.unit`.
        Placed at one dealership, that is the only candidate -- the answer it
        always was. Placed at the root, every dealership is a candidate, and
        `X-Unit-Id` picks one, else the first created -- as before. Placed at
        several (C72, Q10), the header picks among those.

        A header naming a dealership outside the candidates is ignored, never
        honoured: it is how a person would otherwise file a record somewhere
        they cannot see.
        """
        allowed = resolve_allowed_territories(request.membership, app)
        dealers = Territory.objects.filter(organization=organization, kind=TerritoryKind.DEALER)
        if allowed is not None:
            dealers = dealers.filter(id__in=allowed)

        requested = request.headers.get("X-Unit-Id")
        if requested:
            chosen = dealers.filter(id=requested).first()
            if chosen:
                return chosen.id

        first = dealers.order_by("created_at").first()
        return first.id if first else None
