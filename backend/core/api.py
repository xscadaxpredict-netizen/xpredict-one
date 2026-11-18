import uuid

from core.organizations.api.base import OrgScopedAPIView
from core.organizations.models import Membership, Organization, Territory, TerritoryKind
from core.organizations.selectors import (
    permissions_for,
    placements_for,
    resolve_allowed_territories,
)
from core.permissions.models import AppCode
from shared.base_models import allowed_territories
from shared.exceptions import ConflictError


class TenantAPIView(OrgScopedAPIView):
    """
    Base view for all DMS organization-scoped endpoints.

    Builds on main's `OrgScopedAPIView`, which verifies an active membership,
    refuses users of a closed dealership (C63) and requires the permission
    declaration below, all before the handler runs.

    On top of that it sets `request.membership` and the territories this
    person's records may be read from (`allowed_territories`), both from their
    grant for `app_code`. Where a NEW record goes is asked per record type:
    `self.home_for(Model)`.
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

        # Enforce dealer isolation for all unit-scoped models (Enquiries, Quotations, Job cards,
        # etc.)
        allowed = resolve_allowed_territories(self.membership, self.app_code)
        allowed_territories.set(allowed)

    def home_for(self, model) -> uuid.UUID:
        """Where a new `model` record filed by this request goes. See `home_for()`."""
        return home_for(
            model,
            membership=self.membership,
            organization=self.organization,
            requested=self.request.headers.get("X-Unit-Id"),
            app=self.app_code,
        )

    @property
    def is_manager_or_admin(self) -> bool:
        # PERMISSIONS ONLY since C72 step 2c: the owner holds all of them by
        # rule, and an organisation admin holds `admin.user.create` through
        # their "Organisation admin" grant. `Membership.role` decides nothing.
        held = permissions_for(self.membership)
        return bool(
            held.intersection({
                "dms.enquiry.close",
                "dms.order.confirm",
                "admin.user.create",
            })
        )


def home_for(
    model,
    *,
    membership: Membership,
    organization: Organization,
    requested: str | None,
    app: str,
) -> uuid.UUID:
    """
    The territory a new `model` record is filed at -- its HOME (C72 piece 3,
    step 2; per record type since step 3a).

    Only for records a PERSON files, which declare `home_kinds`. A record that
    hangs off another one (`home_follows`: a follow-up, a complaint) is never
    filed: its `save()` takes its parent's home, so asking here is a mistake.

    In this order, considering only places of the record type's `home_kinds`
    inside the person's subtree:

    1. `X-Unit-Id`, if it names such a place. Anything else -- outside the
       subtree, or a kind this record cannot live at (a warehouse, for an
       enquiry) -- is ignored, never honoured: it is how a person would
       otherwise file a record somewhere they cannot see, or somewhere it
       does not belong.
    2. PLACED AT EXACTLY ONE DEALERSHIP OR BRANCH: there. No question to ask.
    3. OTHERWISE -- a region, the root, or several places -- the first
       dealership created inside their subtree. TEMPORARY, AND A GUESS: the
       frontend sends no `X-Unit-Id`, so this is today's behaviour, kept until
       the create forms gain a "dealership or branch" choice and this step is
       removed with it (C72 piece 3, its own step).
    4. Nowhere: a 409. It used to be `None`, which the database refused with a
       500 on the insert.
    """
    if model.home_follows:
        raise TypeError(
            f"{model.__name__} takes its parent's home ({model.home_follows}); "
            "it is never filed by a person."
        )
    kinds = model.home_kinds

    allowed = resolve_allowed_territories(membership, app)
    places = Territory.objects.filter(organization=organization, kind__in=kinds)
    if allowed is not None:
        places = places.filter(id__in=allowed)

    wanted = _as_uuid(requested)
    chosen = places.filter(id=wanted).first() if wanted else None
    if chosen:
        return chosen.id

    own = placements_for(membership, app)
    if (
        len(own) == 1
        and own[0].kind in (TerritoryKind.DEALER, TerritoryKind.BRANCH)
        and own[0].kind in kinds
    ):
        return own[0].id

    first = places.filter(kind=TerritoryKind.DEALER).order_by("created_at").first()
    if first:
        return first.id

    raise ConflictError(
        code="no_home",
        message="There is nowhere you can file this record.",
        model=model.__name__,
        membership_id=str(membership.pk),
    )


def _as_uuid(value: str | None) -> uuid.UUID | None:
    """A header that is not a UUID names nothing -- ignored, not a 500."""
    try:
        return uuid.UUID(value) if value else None
    except ValueError:
        return None
