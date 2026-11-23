import uuid

from core.organizations.api.base import OrgScopedAPIView
from core.organizations.models import (
    Membership,
    MembershipRole,
    Organization,
    Territory,
    TerritoryKind,
)
from core.organizations.selectors import (
    permissions_for,
    placements_for,
    resolve_allowed_territories,
    standing,
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

        # WHERE THIS PERSON WORKS, for code that asks one place for the whole
        # request -- `main`'s `request.unit_id` (Nishanth's DMS views), kept
        # under its territory name in the merge (2026-11-23). The root for the
        # owner and organisation-level people (the head office, C82 amended);
        # their own place for everybody else. None when they have nowhere.
        # A NEW record should still ask `self.home_for(Model)`.
        try:
            request.territory_id = self.home_for(_AnyPlace)
        except ConflictError:
            request.territory_id = None

    @property
    def is_org_admin(self) -> bool:
        """
        The owner or an Organization Admin (C89) -- `main`'s
        `membership.role in ("owner", "admin") and membership.unit_id is None`,
        both of which this branch dropped (C72 2d). Organisation-wide by rule.
        """
        return self.membership.is_owner or standing(self.membership) == MembershipRole.ADMIN

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


class _AnyPlace:
    """`request.territory_id`'s stand-in record type: may live anywhere."""

    home_follows = None
    home_kinds = tuple(TerritoryKind.values)


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
    2. PLACED AT EXACTLY ONE PLACE this record may live at: there -- a
       dealership or a branch, a region, or THE ROOT, which is the head office
       (C82 amended, the owner 2026-11-23). An organisation-level person's work
       is the organisation's own, filed at the root.
    3. OTHERWISE (several places): the first of their own places, by depth then
       age, that this record may live at.
    4. Nowhere: a 409. It used to be `None`, which the database refused with a
       500 on the insert.

    THIS USED TO FILE AN ORGANISATION-LEVEL PERSON'S WORK AT THE FIRST
    DEALERSHIP CREATED -- in that dealer's books, and nowhere at all in an
    organisation with no dealership yet. `main` fixed it with a "head office"
    unit (C-local-4, Nishanth); the merge (2026-11-23) keeps the fix, filed at
    the root instead.
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

    # The owner holds every app by rule with no grant (C72 2c): their place is
    # the root.
    own = (
        [Territory.objects.root_for(organization)]
        if membership.is_owner
        else placements_for(membership, app)
    )
    fitting = sorted(
        (place for place in own if place.kind in kinds),
        key=lambda place: (place.depth, place.created_at),
    )
    if fitting:
        return fitting[0].id

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
