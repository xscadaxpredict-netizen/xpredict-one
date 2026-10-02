"""
What an app is, what a role is, and which apps a person may open.

THERE IS NO `Permission` MODEL HERE, and that is deliberate. The 48 permission
strings and the role that holds each one live in a Python registry (C42), not in
tables: they are identical for every organization, nobody edits them at runtime,
and roles are read-only in the product (C28). A table would mean a data
migration to add a capability, a join on the hot path, and two environments that
can disagree. A constant means a reviewable diff.

`Role` stays a table so `AppAccess.role_id` has a real foreign key and nobody
can point at a role that does not exist.
"""

from __future__ import annotations

from django.db import models

from shared.base_models import BaseModel


class AppCode(models.TextChoices):
    """
    The apps a person can be granted.

    ADMINISTRATION IS NOT HERE, and its absence is C40. Administration is never
    granted through an `AppAccess` row: it comes from standing on the membership
    for an organization admin, and from holding a role that grants `admin.*`
    permissions for a dealer admin. `/me` builds that entry rather than reading
    it, so a row for it would be a second, conflicting source.
    """

    DMS = "dms", "DMS"
    CRM = "crm", "CRM"
    ECOMMERCE = "ecommerce", "E-commerce"


class RoleLevel(models.TextChoices):
    """
    Whether a role scopes its holder to one dealership or to the whole
    organization (C7).

    It is what keeps the role picker honest: a dealer-scoped person can hold
    only a `unit` role, and somebody organization-wide only an `org` one.
    Offering the wrong ones produces records the backend is right to refuse.
    """

    ORG = "org", "Organisation"
    UNIT = "unit", "Dealership"


class Role(BaseModel):
    """
    A named bundle of permissions inside one app.

    SEEDED BY DATA MIGRATION, never written through the API. Organizations do
    not author roles (C28), which is why there is no `organization` column here
    --- the same nine rows serve every tenant.

    THERE IS NO `administers` COLUMN, and there used to be. C40 removed it:
    whether a role confers administration is now "does it grant any `admin.*`
    permission", read from the registry. The API still returns an `administers`
    field for the Roles page's badge; it is computed, so it cannot fall out of
    step with what the role actually grants.
    """

    code = models.CharField(max_length=60)
    name = models.CharField(max_length=100)
    app = models.CharField(max_length=20, choices=AppCode.choices)
    level = models.CharField(max_length=10, choices=RoleLevel.choices)
    summary = models.CharField(max_length=300)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["app", "code"], name="role_unique_app_code"),
        ]
        ordering = ["app", "level", "name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.app})"


class AppAccess(BaseModel):
    """
    One app a membership holds, and the role they hold it with.

    `membership` is a string reference rather than an import because
    `core.organizations` imports `AppCode` from this module. A direct import
    both ways is a cycle; Django resolves "app_label.Model" lazily, so only one
    side needs to be a real import.

    NEVER A ROW FOR ADMINISTRATION --- see `AppCode`.

    SUBSCRIPTION IS A SEPARATE FACT (C16). A row here says this person may open
    the app; `billing.AppSubscription` says the organization pays for it. Both
    are required and they fail differently: an unpaid app is shown disabled,
    because nobody can ask for a product they do not know exists, while an app
    the person is not granted is hidden entirely. A stale grant left on a
    cancelled subscription must open nothing.
    """

    membership = models.ForeignKey(
        "organizations.Membership",
        on_delete=models.CASCADE,
        related_name="app_access",
    )
    app = models.CharField(max_length=20, choices=AppCode.choices)
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name="+")

    class Meta:
        verbose_name_plural = "app access"
        constraints = [
            models.UniqueConstraint(
                fields=["membership", "app"], name="appaccess_unique_membership_app"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.membership_id} -> {self.app}"
