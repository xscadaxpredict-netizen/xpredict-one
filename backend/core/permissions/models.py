"""
What an app is, what a permission is, what a role grants, and which apps a
person may open.

PERMISSIONS ARE ROWS, NOT A PYTHON CONSTANT. C42 chose a code registry and C44
reversed it: the owner wants the list queryable and visible in Workbench rather
than readable only by someone who knows where to look in the source. For a team
coming to this fresh, a table you can open and sort beats an elegant constant.

The trade is real and worth knowing: adding a capability is now a data migration
rather than a reviewable diff, two environments can disagree about what a role
grants, and `/me` joins through `role_permission` on every build. The first is
mitigated by seeding in migrations so the history is still in git; the last by
caching the answer per role.
"""

from __future__ import annotations

from django.db import models

from shared.base_models import BaseModel


class AppCode(models.TextChoices):
    """
    Every app the platform knows, including Administration.

    ADMINISTRATION IS HERE BUT IS NOT GRANTABLE, and that distinction used to be
    expressed by leaving it out of this enum entirely. It is back because
    `admin.*` permissions are real and need an app; what stops it being granted
    is now a check constraint on `AppAccess` and on `AppSubscription`, which is
    the better place for it. One vocabulary, narrowed where it narrows, rather
    than two enums that have to agree.
    """

    ADMIN = "admin", "Administration"
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


class Permission(BaseModel):
    """
    One thing somebody can do, named `app.resource.action`.

    `module` IS WHAT MAKES A SCREEN APPEAR, and it is the reason this column
    exists rather than being parsed out of the code. Module visibility is
    DERIVED (C42): a module shows when the role holds at least one permission
    inside it. There is therefore no "modules" table and nothing stores which
    modules a role can see --- so a role cannot own an empty screen, and cannot
    hold buttons on a page it may not reach. One list, nothing to disagree.

    `group` and `label` are for the Roles page, which DISPLAYS a permission
    rather than checking one (C28). The frontend never parses `code` to make
    something readable --- the vocabulary is the backend's (C19), so the backend
    sends the words.

    SEEDED BY DATA MIGRATION, never written through the API. Nobody authors
    permissions at runtime; they arrive with a release, like a column does.
    """

    code = models.CharField(max_length=80, unique=True)
    app = models.CharField(max_length=20, choices=AppCode.choices)
    module = models.CharField(
        max_length=40,
        help_text="Which module this makes visible: sales, service, users, dealers...",
    )
    group = models.CharField(max_length=60, help_text='Display grouping: "Enquiries".')
    label = models.CharField(max_length=120, help_text='What it lets you do: "Create an enquiry".')

    class Meta:
        ordering = ["app", "module", "group", "code"]
        indexes = [
            # Deriving a person's modules asks "which modules do these
            # permissions touch", so the lookup leads with app.
            models.Index(fields=["app", "module"]),
        ]

    def __str__(self) -> str:
        return self.code


class Role(BaseModel):
    """
    A named bundle of permissions inside one app.

    SEEDED BY DATA MIGRATION, never written through the API. Organizations do
    not author roles (C28), which is why there is no `organization` column here
    --- the same nine rows serve every tenant.

    THERE IS NO `administers` COLUMN, and there used to be. C40 removed it:
    whether a role confers administration is "does it grant any `admin.*`
    permission", which is now a question this table can answer by joining rather
    than a flag somebody has to remember to set. The API still returns an
    `administers` field for the Roles page's badge; it is computed, so it cannot
    fall out of step with what the role actually grants.
    """

    code = models.CharField(max_length=60)
    name = models.CharField(max_length=100)
    app = models.CharField(max_length=20, choices=AppCode.choices)
    level = models.CharField(max_length=10, choices=RoleLevel.choices)
    summary = models.CharField(max_length=300)

    permissions = models.ManyToManyField(
        Permission,
        through="RolePermission",
        related_name="roles",
        blank=True,
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["app", "code"], name="role_unique_app_code"),
        ]
        ordering = ["app", "level", "name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.app})"

    @property
    def administers(self) -> bool:
        """
        Whether holding this role lets somebody administer their scope.

        Derived, never stored (C40). An organization admin gets this from
        standing instead; a dealer admin gets it from holding a role --- the DMS
        System administrator --- that grants `admin.*` permissions, narrowed to
        their own dealership by `Membership.unit_id`.

        Prefetch `permissions` before asking this for a list of roles, or it is
        a query each.
        """
        return any(permission.app == AppCode.ADMIN for permission in self.permissions.all())


class RolePermission(BaseModel):
    """
    One permission granted by one role.

    AN EXPLICIT THROUGH MODEL rather than letting Django build the join table,
    for one reason: an implicit table gets an auto-incrementing integer key, and
    this project uses UUIDs everywhere. Inheriting `BaseModel` also means the
    row carries when it was created and by whom, which for a table that decides
    what people can do is worth having.
    """

    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="role_permissions")
    permission = models.ForeignKey(
        Permission, on_delete=models.PROTECT, related_name="role_permissions"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["role", "permission"], name="rolepermission_unique_role_permission"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.role_id} grants {self.permission_id}"


class AppAccess(BaseModel):
    """
    One app a membership holds, and the role they hold it with.

    `membership` is a string reference rather than an import because
    `core.organizations` imports `AppCode` from this module. A direct import
    both ways is a cycle; Django resolves "app_label.Model" lazily, so only one
    side needs to be a real import.

    NEVER A ROW FOR ADMINISTRATION, and the check constraint below is what says
    so. Administration comes from standing, or from a role that grants `admin.*`
    permissions (C40), and `/me` builds that entry rather than reading it. A row
    here would be a second, conflicting source.

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
            models.CheckConstraint(
                condition=~models.Q(app=AppCode.ADMIN),
                name="appaccess_never_administration",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.membership_id} -> {self.app}"
