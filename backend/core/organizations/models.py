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
from django.db import models

from core.permissions.models import AppCode
from shared.base_models import BaseModel


class OrganizationStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    SUSPENDED = "suspended", "Suspended"


class UnitStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    DISABLED = "disabled", "Closed"


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
    ACTIVE = "active", "Active"
    INVITED = "invited", "Invited"
    DISABLED = "disabled", "Disabled"


class Organization(BaseModel):
    """
    The tenant. One organization, one database (C1).

    `db_name` is the tenant registry: the middleware resolves the organization
    from the URL slug and registers this connection before any business query
    runs. MySQL caps an identifier at 64 characters, so whatever derives
    `db_name` from the slug must check the length on write rather than discover
    it at provisioning time.

    `db_host` and `db_port` are **Q28, still open.** They let a tenant move to a
    different MySQL server by changing a row rather than shipping code, which
    matters the first time one organization outgrows the shared instance. Today
    every tenant sits beside the control database, so both columns hold the same
    value on every row --- and duplicated constant data is how rows start
    disagreeing with the settings file nobody updated. Drop them for `db_name`
    alone if that trade is not wanted; adding them back later is one migration.
    """

    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=60, unique=True)

    db_name = models.CharField(max_length=64, unique=True)
    db_host = models.CharField(max_length=255)
    db_port = models.PositiveIntegerField(default=3306)

    status = models.CharField(
        max_length=20, choices=OrganizationStatus.choices, default=OrganizationStatus.ACTIVE
    )

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class BusinessUnit(BaseModel):
    """
    A dealership.

    FLAT, NOT A TREE (C29). There is no `parent` field: the question of what a
    parent dealership would actually confer was never answered, and a field that
    is stored and displayed and means nothing is decoration. It was removed
    rather than hidden.

    Only DMS is unit-aware (C5). CRM and E-commerce ignore these entirely, which
    is why unit scope lives on `Membership` and is read through one resolver
    rather than being assumed everywhere.
    """

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="business_units"
    )

    name = models.CharField(max_length=200)
    # NULL, not the empty string, and ruff DJ001 is wrong about this one.
    # The unique constraint below is (organization, code). MySQL treats every
    # NULL in a unique index as distinct but two empty strings as a duplicate,
    # so defaulting to "" would let the FIRST dealership without a code be
    # created and refuse the second.
    code = models.CharField(max_length=40, null=True, blank=True)  # noqa: DJ001

    contact_person = models.CharField(max_length=150, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=32, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)

    status = models.CharField(max_length=20, choices=UnitStatus.choices, default=UnitStatus.ACTIVE)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["organization", "code"], name="unit_unique_org_code"),
        ]

    def __str__(self) -> str:
        return self.name


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
        BusinessUnit,
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

    owner_marker = models.BooleanField(
        null=True,
        blank=True,
        editable=False,
        help_text="True for the owner, NULL for everyone else. Never set by hand.",
    )
    """
    THIS COLUMN LOOKS WRONG AND IS NOT. It exists to express "exactly one owner
    per organization" on MySQL, which has no partial unique indexes (C39).

    On PostgreSQL this would be a unique index on `organization` with a
    `WHERE role = 'owner'` condition. MySQL cannot do that. What it CAN do is
    treat every NULL in a unique index as distinct --- so the marker is True for
    the owner and NULL for everybody else, and a unique index across
    (organization, owner_marker) lets any number of members coexist while
    refusing a second True.

    The cost is that it must be kept in step with `role` by hand, in the same
    transaction, including on ownership transfer. The check constraint below is
    what stops the two drifting.
    """

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "organization"], name="membership_unique_user_org"
            ),
            # The one-owner rule. See owner_marker above for why it is shaped
            # like this rather than as a conditional index.
            models.UniqueConstraint(
                fields=["organization", "owner_marker"], name="membership_one_owner_per_org"
            ),
            # owner_marker is True exactly when role is owner, and NULL
            # otherwise. Without this the marker is a second source of truth
            # that nothing forces to agree with the first.
            models.CheckConstraint(
                condition=(
                    models.Q(role=MembershipRole.OWNER, owner_marker=True)
                    | (~models.Q(role=MembershipRole.OWNER) & models.Q(owner_marker__isnull=True))
                ),
                name="membership_owner_marker_matches_role",
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
        BusinessUnit,
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
    app = models.CharField(max_length=20, choices=AppCode.choices)
    role = models.ForeignKey("permissions.Role", on_delete=models.PROTECT, related_name="+")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["invitation", "app"], name="invitegrant_unique_invitation_app"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.invitation_id} -> {self.app}"
