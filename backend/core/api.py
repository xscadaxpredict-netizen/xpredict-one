from core.organizations.api.base import OrgScopedAPIView
from core.organizations.models import Territory, TerritoryKind
from core.organizations.selectors import (
    permissions_for,
    placements_for,
    resolve_allowed_territories,
)
from core.permissions.models import AppCode
from shared.base_models import allowed_territories

# Where a record may live (C72 piece 3 step 2): never the root, never a warehouse.
FILING_KINDS = (TerritoryKind.REGION, TerritoryKind.DEALER, TerritoryKind.BRANCH)


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
        The territory a new record is filed at -- its HOME (C72 piece 3 step 2).

        Records live where things are sold or managed: a dealership, a branch,
        or a region -- a region being the "regional pool" for enquiries no
        dealership has been chosen for yet (the owner, 2026-11-13, after Zoho).
        Never the root (head-office records are step 3) and never a warehouse.

        In this order:

        1. `X-Unit-Id`, if it names such a place INSIDE the person's subtree.
           One outside it is ignored, never honoured: it is how a person would
           otherwise file a record somewhere they cannot see.
        2. PLACED AT EXACTLY ONE DEALERSHIP OR BRANCH: there. No question to
           ask. (A branch person's records used to have no home at all --
           only dealerships were candidates -- and the save failed.)
        3. OTHERWISE -- a region, the root, or several places -- the first
           dealership created inside their subtree. TEMPORARY, AND A GUESS:
           the frontend sends no `X-Unit-Id`, so this is today's behaviour,
           kept until the create forms gain a "dealership or branch" choice
           and this step is removed with it (C72 piece 3, its own step).
        """
        allowed = resolve_allowed_territories(request.membership, app)
        places = Territory.objects.filter(organization=organization)
        if allowed is not None:
            places = places.filter(id__in=allowed)

        requested = request.headers.get("X-Unit-Id")
        if requested:
            chosen = places.filter(id=requested, kind__in=FILING_KINDS).first()
            if chosen:
                return chosen.id

        own = placements_for(request.membership, app)
        if len(own) == 1 and own[0].kind in (TerritoryKind.DEALER, TerritoryKind.BRANCH):
            return own[0].id

        first = places.filter(kind=TerritoryKind.DEALER).order_by("created_at").first()
        return first.id if first else None
