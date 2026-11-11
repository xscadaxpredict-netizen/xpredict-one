"""
The tenant, its dealerships, and who belongs to it.

Everything here lives in the CONTROL database. Business records live in each
organization's own database and reference these rows by plain UUID, never by
foreign key --- MySQL cannot enforce a relation across that boundary, which is
why validating a referenced dealership happens in the service layer on every
write (C1).

Foreign keys BETWEEN the models in this file are ordinary and encouraged: they
are all in the same database.
"""

from __future__ import annotations

from django.conf import settings
from django.db import IntegrityError, models, transaction
from treebeard.mp_tree import MP_Node, MP_NodeManager

from shared.base_models import BaseModel


class OrganizationStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    SUSPENDED = "suspended", "Suspended"


class UnitStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    DISABLED = "disabled", "Closed"


class TerritoryKind(models.TextChoices):
    """
    What a box in the territory tree is (C72).

    THE ORGANISATION IS THE ROOT, one per organisation (the owner, 2026-11-06,
    reversing piece 1's first design, which had no box for it). Every other
    territory sits somewhere under it, and from C72 piece 2 a person placed
    "organisation-wide" is placed AT the root -- so a missing placement can be
    refused instead of silently meaning "everything".

    The root does not store the organisation's name: `display_name` reads it
    from the organisation, so there is one copy and nothing to drift.

    Which kind may sit under which is one rule in `services.py`, not here.
    """

    ORGANISATION = "organisation", "Organisation"
    REGION = "region", "Region"
    DEALER = "dealer", "Dealer"
    BRANCH = "branch", "Branch"
    WAREHOUSE = "warehouse", "Warehouse"


# Two organisations signing up in the same instant can compute the same root
# path -- every organisation's root is a treebeard root, and roots share one
# sequence. The second insert fails the unique index on `path`; retrying
# computes a fresh one. This is now the ONLY place a root is made.
_ROOT_PATH_ATTEMPTS = 3


class TerritoryManager(MP_NodeManager):
    """
    Treebeard's manager -- which since treebeard 6.0 a tree model's default
    manager MUST be -- plus the organisation's root.

    `root_for(organization)` IS THE ORGANISATION'S BOX, created on first use.
    Sign-up creates it; the lazy path exists for organisations made any other
    way (tests, the shell) and is serialised by a lock on the organisation row,
    so two first uses cannot make two roots -- and the database refuses a
    second one anyway (`territory_one_root_per_org`).

    `create()` ADDS A TERRITORY DIRECTLY UNDER THE ORGANISATION. A box in a
    materialised-path tree cannot simply be inserted: it needs a `path` saying
    where it sits. So `create()` goes through treebeard's `add_child()` on the
    root, and a territory under any other parent goes through
    `add_child(parent, {...})`. Every existing caller -- `create_dealer()` and
    roughly a hundred test lines that make a dealership -- meant "a dealership
    with nothing above it but the organisation", which is exactly that.

    TREEBEARD SORTS BY `path`, NOT BY NAME. Anything that needs alphabetical
    order says `.order_by("name")`; the model's `Meta.ordering` is overridden
    by this manager and must not be relied on.
    """

    def root_for(self, organization) -> Territory:
        root = self.filter(organization=organization, is_root=True).first()
        if root is not None:
            return root

        with transaction.atomic():
            # Lock the organisation, then look again: whoever waited behind the
            # lock finds the root the first caller made.
            type(organization).objects.select_for_update().get(pk=organization.pk)
            root = self.filter(organization=organization, is_root=True).first()
            if root is not None:
                return root
            return self._add_root_with_retry(
                {
                    "organization": organization,
                    "kind": TerritoryKind.ORGANISATION,
                    "name": "",
                    "is_root": True,
                }
            )

    def create(self, **kwargs):
        return self.add_child(self.root_for(kwargs["organization"]), kwargs)

    def _add_root_with_retry(self, create_kwargs: dict) -> Territory:
        """
        Add a root, retrying a collision on `path` in a savepoint.

        RECOGNISED BY THE INDEX NAME, which is what MySQL reports -- "for key
        'organizations_territory.organizations_territory_path_<hash>_uniq'",
        never the column. Django names a `unique=True` field's index
        `<table>_<column>_<hash>_uniq`, so the prefix is stable; a test pins it
        against the real server, because the first version looked for `.path'`
        and could never have fired.
        """
        path_index = f"{self.model._meta.db_table}_path_"
        for attempt in range(_ROOT_PATH_ATTEMPTS):
            try:
                with transaction.atomic():
                    return self.add_root(create_kwargs)
            except IntegrityError as exc:
                if path_index not in str(exc) or attempt == _ROOT_PATH_ATTEMPTS - 1:
                    raise
        raise AssertionError("unreachable")  # pragma: no cover


class MembershipRole(models.TextChoices):
    """
    Standing in the ORGANIZATION. Not what you do inside an app (C40).

    `AppAccess.role` is the other thing called "role" and the two never touch:
    neither is derived from the other, and nothing writes one when the other
    changes. A dealer admin is simply somebody holding the DMS System
    administrator role; their standing stays `member`.
    """

    OWNER = "owner", "Owner"
    ADMIN = "admin", "Administrator"
    MEMBER = "member", "Member"


class MembershipStatus(models.TextChoices):
    """
    TWO STATES, NOT THREE. `INVITED` was here and was removed by C51.

    A person who has not accepted yet may have no account at all, and `user`
    below is a non-null foreign key --- so there is no row to put them on. They
    live in `Invitation` until they accept, and accepting is what creates the
    membership. Keeping both would have meant two columns that can each claim
    somebody is invited, with nothing forcing them to agree.
    """

    ACTIVE = "active", "Active"
    DISABLED = "disabled", "Disabled"


class Organization(BaseModel):
    """
    The tenant. One organization, one database (C1).

    `db_name` is the tenant registry: the middleware resolves the organization
    from the URL slug and registers this connection before any business query
    runs. MySQL caps an identifier at 64 characters, so whatever derives
    `db_name` from the slug must check the length on write rather than discover
    it at provisioning time.

    `db_host` and `db_port` STAY, and Q28 is answered (C46, 2026-10-04). The tenant
    middleware builds each connection from THIS ROW, never from settings, so one
    organization can be moved to its own MySQL server by editing a row --- no code
    change, no redeploy, which is most of the point of a database per tenant (C1).

    The duplication objection was real: today every row holds the same host and port.
    What answers it is that settings carry no tenant host at all, so this row is the
    only source and there is no second value to drift from. Provisioning writes both
    columns once, from settings, at creation.
    """

    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=60, unique=True)

    db_name = models.CharField(max_length=64, unique=True)
    db_host = models.CharField(max_length=255)
    db_port = models.PositiveIntegerField(default=3306)

    status = models.CharField(
        max_length=20, choices=OrganizationStatus.choices, default=OrganizationStatus.ACTIVE
    )

    provisioned_at = models.DateTimeField(
        null=True,
        blank=True,
        editable=False,
        help_text="When this organization's database was created and migrated.",
    )
    """
    NULL UNTIL THE TENANT DATABASE EXISTS, and a separate column from `status`
    on purpose.

    `status` answers "is this customer active or suspended", which is a
    commercial question. This answers "is their database there yet", which is a
    mechanical one. They are independent --- a suspended organization still has
    a database, and a brand-new one is active while its database is seconds
    from existing --- so one column could not carry both without a state nobody
    could name.

    It is what `is_ready` reports, and it exists because of C1: signup commits
    and a Celery task then creates the database, so for a few seconds the
    account exists and its workspace does not. C14 gave that its own screen
    rather than sending somebody into an app that is not there.
    """

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    @property
    def is_ready(self) -> bool:
        """Whether this organization's database has been provisioned."""
        return self.provisioned_at is not None


class ActivationCode(BaseModel):
    """
    A single-use licence to found one organization (C14).

    ONE CODE CREATES ONE ORGANIZATION, THEN IT IS SPENT. Reusable codes were
    rejected in C14 on blast radius: a leaked single-use code costs one bogus
    organization, a leaked reusable one costs unlimited organizations on your
    infrastructure until somebody notices. `spend_activation_code()` claims a row
    under `select_for_update`, so two simultaneous signups cannot both win --- the
    unique index on `code` is not enough on its own, because both would be reading
    an unspent row before either wrote.

    THE CODE IS STORED RAW, matching `Invitation.token` directly above the same way
    for the same reason: both are bearer secrets with an expiry, and having one of
    the two hashed and the other not is how somebody later "fixes" the wrong one.
    It does mean a read of this table yields every unspent code. Worth revisiting
    for both tables together, never for one.

    `label` is the "where are they recorded?" half of **Q20** --- who the code was
    issued to, so support can answer "is ours used yet" without a guessing game.
    The REST of Q20 is still open and deliberately not decided here: code length and
    entropy, whether an unused code should expire, and the rate limiting on the
    public validation endpoint, which is the part that actually matters because that
    endpoint is unauthenticated and checks a secret. `expires_at` is nullable so
    that NULL means "no expiry" and a policy can be applied later without a
    migration.
    """

    code = models.CharField(max_length=64, unique=True)
    label = models.CharField(max_length=200, blank=True)

    expires_at = models.DateTimeField(null=True, blank=True)
    spent_at = models.DateTimeField(null=True, blank=True)

    organization = models.OneToOneField(
        Organization,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activation_code",
        help_text="The organization this code founded. Set when the code is spent.",
    )

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # Attached to an organization implies spent. Only this direction:
            # SET_NULL above means a deleted organization leaves a spent code with
            # no organization, which is honest history, not a broken row.
            models.CheckConstraint(
                condition=(
                    models.Q(organization__isnull=True) | models.Q(spent_at__isnull=False)
                ),
                name="activationcode_attached_implies_spent",
            ),
        ]

    def __str__(self) -> str:
        state = "spent" if self.spent_at else "unspent"
        return f"{self.label or self.pk} ({state})"

class Territory(MP_Node, BaseModel):
    """
    One box in the organisation's territory tree (C72): a region, a dealer, a
    branch or a warehouse.

    A TREE SINCE 2026-11-06, reversing C29. Built on django-treebeard's
    materialised path (Q56): every box stores `path`, its position from the
    top, so "this box and everything under it" is `path LIKE 'prefix%'`.
    Treebeard keeps `path`, `depth` and `numchild` correct; nothing else
    writes them. Use the manager -- `Territory.objects.add_child(parent, {...})`,
    `.move(...)`, `.get_descendants(...)` -- never the per-box methods, which
    treebeard 7 deprecates and 8 removes.

    ONE TREE PER ORGANISATION, WITH THE ORGANISATION AT ITS ROOT. Each
    organisation has exactly one root box (kind `organisation`) and everything
    else sits under it, so an organisation's whole tree is one path prefix.
    Paths are still unique across the whole table -- the roots themselves are
    one sequence -- so every query filters by `organization`, as every query
    here always has; a tree question asked without it is a cross-tenant leak.

    RENAMED FROM `BusinessUnit` ON 2026-11-06, because the owner asked for the
    name to match the idea. The table moved with it; the rows, their ids and
    everything pointing at them did not change.

    "UNIT" STILL APPEARS ELSEWHERE, ON PURPOSE AND FOR NOW. `unit_id` on every
    tenant table, `Membership.unit`, `allowed_units` and `resolve_allowed_units()`
    all mean "territory". They are renamed in C72 piece 3 (the tenant column
    needs a tenant migration, run by hand on the server) and piece 7 (the API
    fields the frontend reads); `Membership.unit` goes away in piece 2.

    Only DMS is unit-aware (C5). CRM and E-commerce ignore these entirely, which
    is why unit scope lives on `Membership` and is read through one resolver
    rather than being assumed everywhere.

    THE DEALER-ONLY COLUMNS -- code, GSTIN, PAN, contact and address -- stay on
    every kind and are simply blank on a region. One table rather than one per
    kind is the point of C72's single tree; a warehouse may well want an
    address too.
    """

    # FIVE CHARACTERS PER LEVEL, not treebeard's four: about 60 million boxes
    # per level instead of 1.7 million, and up to 51 levels in the 255-character
    # path. Every organisation's root shares one sequence (see above), and the
    # owner chose treebeard so this can scale -- changing it later means
    # rewriting every path, so it is chosen generously now.
    steplen = 5

    kind = models.CharField(
        max_length=20, choices=TerritoryKind.choices, default=TerritoryKind.DEALER
    )

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="territories"
    )

    name = models.CharField(max_length=200)
    # NULL, not the empty string, and ruff DJ001 is wrong about this one.
    # The unique constraint below is (organization, code). MySQL treats every
    # NULL in a unique index as distinct but two empty strings as a duplicate,
    # so defaulting to "" would let the FIRST dealership without a code be
    # created and refuse the second.
    code = models.CharField(max_length=40, null=True, blank=True)  # noqa: DJ001

    # GSTIN AND PAN. India-specific, and deliberately so: unlike the phone and
    # postcode fields below, these two identifiers do not exist outside one
    # market, so a strict format cannot refuse a legitimate foreign value.
    # Validated in `api/serializers.py` -- shape, including GSTIN's check digit.
    #
    # `blank=True` DESCRIBES THE COLUMN, NOT THE RULE. The API requires a GSTIN
    # on every write, but dealerships created before this field existed hold ""
    # and must stay readable -- a `blank=False` here would be a promise the
    # stored data already breaks. Any dealership saved from now on gains one,
    # because the serializer refuses a write without it.
    gstin = models.CharField(max_length=15, blank=True)

    # DERIVED FROM THE GSTIN, THEN EDITABLE. Characters 3-12 of a GSTIN *are*
    # the holder's PAN, so storing it separately is a denormalisation -- taken
    # deliberately, because the owner wants it correctable: a dealership whose
    # GSTIN was issued against a predecessor entity's PAN is a real situation,
    # and the derivation is a convenience rather than a law. `create_dealer`
    # fills it in when a write leaves it out, so the default is always right
    # and nobody has to retype ten characters they already typed.
    pan = models.CharField(max_length=10, blank=True)

    contact_person = models.CharField(max_length=150, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=32, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)

    status = models.CharField(max_length=20, choices=UnitStatus.choices, default=UnitStatus.ACTIVE)

    is_root = models.BooleanField(
        null=True,
        blank=True,
        editable=False,
        help_text="True for the organisation's root box, NULL for every other. Never set by hand.",
    )
    """
    THE ONE-ROOT-PER-ORGANISATION MARKER, shaped like `Membership.is_owner`
    and for the same reason: MySQL has no partial unique index (C39). True for
    the root and NULL for everything else, and a unique index on
    (organization, is_root) lets any number of NULLs coexist while refusing a
    second True. The check constraint below keeps it in step with `kind`.
    """

    objects = TerritoryManager()

    class Meta:
        # OVERRIDDEN BY THE MANAGER, which sorts by `path`; kept for anything
        # that reads `_meta` (the admin, `latest()`). Order by name explicitly.
        ordering = ["name"]
        constraints = [
            # EXACTLY ONE ROOT PER ORGANISATION -- "at most one" here, and "at
            # least one" because sign-up creates it and `root_for()` creates
            # it on first use for anything made another way.
            models.UniqueConstraint(
                fields=["organization", "is_root"], name="territory_one_root_per_org"
            ),
            # THE ROOT IS THE ORGANISATION, AT THE TOP, AND NOTHING ELSE IS.
            # A root that is not kind `organisation`, an `organisation` box
            # below the top, or a region left at the top level beside the root
            # are all refused by the database, not just by the services.
            models.CheckConstraint(
                condition=(
                    models.Q(kind=TerritoryKind.ORGANISATION, is_root=True, depth=1)
                    | (
                        ~models.Q(kind=TerritoryKind.ORGANISATION)
                        & models.Q(is_root__isnull=True, depth__gte=2)
                    )
                ),
                name="territory_root_is_the_organisation",
            ),
            models.UniqueConstraint(
                fields=["organization", "code"], name="territory_unique_org_code"
            ),
            # NAME IS UNIQUE TOO, and case-insensitively, which costs nothing
            # here: MySQL's `utf8mb4_0900_ai_ci` collation compares that way, so
            # this refuses "Chennai - Guindy" and "chennai - guindy" as the same
            # name without a lowercased shadow column. On a case-sensitive
            # database it would need one.
            #
            # Unlike `code` this is NOT nullable, so there is no NULL-is-distinct
            # subtlety -- every dealership has a name and every name is checked.
            models.UniqueConstraint(
                fields=["organization", "name"], name="territory_unique_org_name"
            ),
        ]

    def __str__(self) -> str:
        return self.display_name

    @property
    def display_name(self) -> str:
        """
        The root shows the organisation's name; it stores none of its own.
        One copy of the name, so renaming the organisation renames its tree's
        top without anything to keep in step.
        """
        return self.organization.name if self.is_root else self.name

    def save(self, *args, **kwargs) -> None:
        """
        REFUSE A BOX WITH NO PLACE IN THE TREE.

        `QuerySet.create()` and `get_or_create()` bypass the manager's
        `create()` and would save a territory with an empty `path` -- the first
        one succeeding, the second colliding on the unique index as a 500, and
        the tree quietly corrupt in between. Treebeard sets `path` before it
        saves, so this only ever fires on a caller who went round it: loudly,
        at the line that did it.
        """
        if not self.path:
            raise ValueError(
                "A Territory needs a place in the tree: create it with "
                "Territory.objects.create() (directly under the organisation) or "
                "Territory.objects.add_child(parent, {...})."
            )
        super().save(*args, **kwargs)


class Membership(BaseModel):
    """
    One person inside one organization: their standing, and their dealership.

    `unit_id` IS THE ONLY PLACE A PERSON'S DEALERSHIP IS STORED (C7). Null means
    organization-wide and `resolve_allowed_units()` returns unrestricted; a value
    means that dealership and nothing else. Nothing reads this field to make a
    scoping decision directly --- everything goes through the resolver, so there
    is one place to be right.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships"
    )
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="memberships"
    )
    unit = models.ForeignKey(
        Territory,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="memberships",
    )

    role = models.CharField(
        max_length=20, choices=MembershipRole.choices, default=MembershipRole.MEMBER
    )
    status = models.CharField(
        max_length=20, choices=MembershipStatus.choices, default=MembershipStatus.ACTIVE
    )

    is_owner = models.BooleanField(
        null=True,
        blank=True,
        editable=False,
        help_text="True for the owner, NULL for everyone else. Never set by hand.",
    )
    """
    WHO OWNS THIS ORGANISATION (C72 step 2c; was `owner_marker`). True for the
    owner, NULL -- never False -- for everybody else.

    READ IT AS A BOOLEAN AND IT IS ONE: `if membership.is_owner` is falsy for
    NULL. The three-valued shape exists for the database, not for callers:
    MySQL has no partial unique indexes (C39), but it treats every NULL in a
    unique index as distinct, so a unique index across (organization,
    is_owner) lets any number of members coexist while refusing a second True.
    "At most one owner" is the database's; "at least one" is the services'
    (the owner cannot be removed, disabled or demoted).

    THE OWNER HOLDS EVERYTHING BY RULE, NOT BY ROWS (C72): every permission in
    every app the organisation subscribes to, plus Administration, everywhere
    in the territory tree. `_membership_data()` and `resolve_allowed_units()`
    ask this flag first. Grant rows would need topping up whenever an app, role
    or permission is added, and the first one forgotten leaves the one account
    that can never be locked out short of something.

    UNTIL STEP 2d it must agree with `role == owner`; the check constraint
    below refuses the two drifting, and both are written together.
    """

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "organization"], name="membership_unique_user_org"
            ),
            # The one-owner rule. See is_owner above for why it is shaped
            # like this rather than as a conditional index.
            models.UniqueConstraint(
                fields=["organization", "is_owner"], name="membership_one_owner_per_org"
            ),
            # is_owner is True exactly when role is owner, and NULL otherwise.
            # Goes in step 2d with `role`; until then the two are written
            # together and this stops them drifting.
            models.CheckConstraint(
                condition=(
                    models.Q(role=MembershipRole.OWNER, is_owner=True)
                    | (~models.Q(role=MembershipRole.OWNER) & models.Q(is_owner__isnull=True))
                ),
                name="membership_is_owner_matches_role",
            ),
            # C40: an administrator of the ORGANIZATION is not scoped to one
            # dealership. Somebody who administers a single dealership holds the
            # DMS System administrator role instead, and their standing stays
            # `member`. This is what C31 used to say in prose.
            models.CheckConstraint(
                condition=(models.Q(role=MembershipRole.MEMBER) | models.Q(unit__isnull=True)),
                name="membership_org_standing_has_no_unit",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} @ {self.organization_id}"


class Invitation(BaseModel):
    """
    A pending membership.

    The fields mirror `Membership` because accepting one becomes the other, in a
    single transaction, under `select_for_update` so a token clicked twice
    cannot produce two memberships.

    NO OWNER HERE. An owner is founded with the organization, never invited into
    it (C41), so the role choices stop at admin.
    """

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="invitations"
    )
    unit = models.ForeignKey(
        Territory,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="invitations",
    )

    email = models.EmailField()
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)

    role = models.CharField(
        max_length=20,
        choices=[
            (MembershipRole.ADMIN, MembershipRole.ADMIN.label),
            (MembershipRole.MEMBER, MembershipRole.MEMBER.label),
        ],
        default=MembershipRole.MEMBER,
    )

    token = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)

    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invitations_sent",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.email} -> {self.organization_id}"


class InvitationAppGrant(BaseModel):
    """
    One app the invitation promises, and the role it comes with.

    A separate table because an invitation carries a LIST of apps, and a list
    needs rows. It mirrors `permissions.AppAccess` field for field, which is
    what makes acceptance a straight copy rather than a translation.
    """

    invitation = models.ForeignKey(Invitation, on_delete=models.CASCADE, related_name="app_grants")
    app = models.ForeignKey(
        "permissions.App",
        to_field="code",
        db_column="app",
        on_delete=models.PROTECT,
        related_name="+",
    )
    role = models.ForeignKey("permissions.Role", on_delete=models.PROTECT, related_name="+")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["invitation", "app"], name="invitegrant_unique_invitation_app"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.invitation_id} -> {self.app_id}"


# ---------------------------------------------------------------------------
# THE PER-APP GRANT (C72 piece 2). One person's access to one app, and
# everything about it: the role (WHAT), the territories (WHERE) and -- from
# piece 4 -- their position on that app's reporting chart (WHOSE).
#
# WRITTEN ONLY BY `services.grant_app_access()` / `revoke_app_access()`. The
# database can say "at most one grant per app" and "at most one role per
# grant"; it cannot say "every grant HAS a role and at least one territory".
# Writing all of it in one function, in one transaction, is what makes that
# true.
#
# STEP 2a: these tables are kept in step with the old ones (`AppAccess`,
# `Membership.unit`) by every service that writes those, and NOTHING READS
# THEM YET. Step 2b switches the readers; step 2d retires the old columns.
# ---------------------------------------------------------------------------


class MembershipAppAccess(BaseModel):
    """
    "This membership may use this app." One row per person per app.

    Deleting it takes the role and the territories with it (cascade), so
    removing somebody's access to an app can never leave a role or a placement
    behind. Subscription stays a separate fact (C16, C55): a grant on an app
    the organisation no longer pays for opens nothing.
    """

    membership = models.ForeignKey(Membership, on_delete=models.CASCADE, related_name="grants")
    app = models.ForeignKey(
        "permissions.App",
        to_field="code",
        db_column="app",
        on_delete=models.PROTECT,
        related_name="+",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["membership", "app"], name="grant_unique_membership_app"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.membership_id} may use {self.app_id}"


class MembershipAppRole(BaseModel):
    """
    The role held in that app (WHAT).

    ONE ROLE PER GRANT, FOR NOW (C71): the unique constraint is on the grant
    alone. Allowing "Sales executive AND Service advisor" later is relaxing it
    to (app_access, role) -- a constraint change, not a reshaping -- and then
    permissions are the union.

    The role must belong to the grant's app. The database cannot compare two
    rows' `app` columns, so `grant_app_access()` enforces it.
    """

    app_access = models.ForeignKey(
        MembershipAppAccess, on_delete=models.CASCADE, related_name="roles"
    )
    role = models.ForeignKey("permissions.Role", on_delete=models.PROTECT, related_name="+")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["app_access"], name="grant_one_role_per_grant"),
        ]

    def __str__(self) -> str:
        return f"{self.app_access_id} as {self.role_id}"


class MembershipAppTerritory(BaseModel):
    """
    One place this person sits in that app (WHERE).

    SEVERAL PER GRANT (the owner, 2026-11-06, answering Q10 and Q57): they see
    the union of the subtrees. AT LEAST ONE, always -- an organisation-wide
    person is placed AT the organisation's root, never "nowhere" (the owner's
    root decision), so a missing placement fails closed.

    PROTECT, not cascade, on the territory: a territory people are placed at
    cannot be deleted out from under them. (There is no delete for territories
    anyway -- C63 closes a dealership, it never removes one.)
    """

    app_access = models.ForeignKey(
        MembershipAppAccess, on_delete=models.CASCADE, related_name="territories"
    )
    territory = models.ForeignKey(Territory, on_delete=models.PROTECT, related_name="placements")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["app_access", "territory"], name="grant_unique_territory_per_grant"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.app_access_id} at {self.territory_id}"
