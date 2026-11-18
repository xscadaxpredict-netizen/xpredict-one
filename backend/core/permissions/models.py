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
    Names for the rows of `App`, so code says `AppCode.DMS` rather than "dms".

    THE `App` TABLE IS THE LIST; THIS IS ONLY ITS SPELLING IN PYTHON (C71). It is
    no longer `choices=` on any column --- every `app` column is a foreign key to
    `App` now, which is what makes MySQL refuse a code that is not an app. A test
    asserts the two list exactly the same codes, so adding an app is a row in a
    data migration AND a line here, and forgetting either fails the suite.

    ADMINISTRATION IS HERE BUT IS NOT SOLD. A check constraint on
    `AppSubscription` refuses it (C44). It IS granted since C72 -- the
    "Organisation admin" grant at the root -- but only by the services, never
    from the form's list of apps (`_resolve_grants()` refuses it).
    """

    ADMIN = "admin", "Administration"
    DMS = "dms", "DMS"
    CRM = "crm", "CRM"
    ECOMMERCE = "ecommerce", "E-commerce"


class App(BaseModel):
    """
    One app the platform offers: DMS, CRM, Administration...

    A TABLE RATHER THAN AN ENUM, for C44's reason: the owner wants the list, and
    the facts about each app, readable in Workbench rather than spread through
    Python. It is also the first piece of C71, whose grant tables point here.

    `code` IS WHAT EVERY OTHER TABLE STORES. The foreign keys use
    `to_field="code"`, so a row in `permissions_role` still reads `app = 'dms'`
    rather than a UUID nobody can recognise, and moving to this table rewrote no
    data. Codes are therefore permanent: renaming one is a migration across five
    tables, which is what changing a primary key always costs.

    SEEDED BY DATA MIGRATION, never written through the API --- an app arrives
    with a release, like a column does.
    """

    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=60)
    unit_aware = models.BooleanField(
        default=False,
        help_text="Whether this app's records belong to a dealership (C5).",
    )
    """
    UNIT-AWARENESS IS A PROPERTY OF THE APP, NOT OF THE PERSON (C5). DMS splits
    its records by dealership; CRM has no dealerships at all, so a unit means
    nothing there. Declaring it once, here, is the point: inferring it from
    whether somebody happens to have a unit gets DMS right and CRM silently
    wrong --- a dealership person's CRM queries filtered by a column CRM does
    not have.
    """
    display_order = models.PositiveSmallIntegerField(
        default=0,
        help_text="Order in lists of apps. Ties fall back to the code.",
    )

    class Meta:
        ordering = ["display_order", "code"]

    def __str__(self) -> str:
        return self.code


class SectionLevel(models.TextChoices):
    MODULE = "module", "Module"
    SUB_MODULE = "sub_module", "Sub-module"
    TAB = "tab", "Tab"


# Which level a section's parent must be. A module has none.
PARENT_LEVEL: dict[str, str | None] = {
    SectionLevel.MODULE: None,
    SectionLevel.SUB_MODULE: SectionLevel.MODULE,
    SectionLevel.TAB: SectionLevel.SUB_MODULE,
}


class AppSection(BaseModel):
    """
    One section of an app: a MODULE, a SUB-MODULE or a TAB (C79).

    THE SAME SHAPE IN EVERY APP. An app has modules; a module is a group of
    sub-modules; a sub-module is a group of tabs, or has none and is then its
    own single tab. Permissions attach to the bottom level -- the LEAF -- and
    everything above is a container that shows when anything under it does.

        admin   User Management                     module
                  Users                (person)     sub-module, a leaf
                  Admins and Roles                  sub-module
                    Admins             (admin)      tab, a leaf
                    Roles              (role)       tab, a leaf

    SELF-REFERENCING: `parent` is another row of this table. A plain parent
    column, not django-treebeard like `Territory`: this tree is OURS -- at most
    three deep, written only by migrations, tens of rows -- where the
    territory tree is every customer's, any depth, and edited live.

    `code` IS THE LEAF'S NAME IN ITS PERMISSIONS: section `enquiry` holds
    `dms.enquiry.view`. It is unique within an app and never carries the menu
    path, so moving a section is a change of `parent` and no permission code
    changes. `name` is what people see -- the Users section's code is `person`
    because its permissions were already `admin.user.*`.

    THE RULES. The database enforces what it can see in one row: `app` + `code`
    is unique, and a module has no parent while every other level has one.
    `save()` enforces what needs the parent row too -- a sub-module sits under
    a module, a tab under a sub-module, and both rows belong to the same app --
    and refuses with a `ValueError` at the line that went wrong, as
    `Territory.save()` does. Rows arrive by data migration; nobody writes them
    at runtime.

    NAMED `AppSection` by the owner (2026-11-18). "Feature" said nothing about
    what a row is; "Module" is one of the levels; "Resource" is the code's
    middle part; "MenuItem" would tie a permissions table to the menu.
    """

    app = models.ForeignKey(
        App,
        to_field="code",
        db_column="app",
        on_delete=models.PROTECT,
        related_name="sections",
    )
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        # A section with sections under it cannot be deleted out from under
        # them: move or delete the children first.
        on_delete=models.PROTECT,
        related_name="children",
    )
    level = models.CharField(max_length=12, choices=SectionLevel.choices)
    code = models.CharField(
        max_length=40,
        help_text="Unique in its app; a leaf's code is the middle of its permission codes.",
    )
    name = models.CharField(max_length=60, help_text='What people see: "User Management".')
    display_order = models.PositiveSmallIntegerField(
        default=0, help_text="Position among its siblings in the sidebar or tab row."
    )
    icon = models.CharField(
        max_length=30, blank=True, default="", help_text="The sidebar icon, for a module."
    )

    class Meta:
        ordering = ["app_id", "display_order", "code"]
        constraints = [
            models.UniqueConstraint(fields=["app", "code"], name="appsection_unique_app_code"),
            models.CheckConstraint(
                condition=models.Q(level__in=SectionLevel.values),
                name="appsection_level_known",
            ),
            # One row's worth of the tree's shape: modules are the top, and
            # nothing else is.
            models.CheckConstraint(
                condition=(
                    models.Q(level=SectionLevel.MODULE, parent__isnull=True)
                    | (~models.Q(level=SectionLevel.MODULE) & models.Q(parent__isnull=False))
                ),
                name="appsection_only_modules_are_top_level",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.app_id}.{self.code}"

    def save(self, *args, **kwargs) -> None:
        self._check_place()
        super().save(*args, **kwargs)

    def _check_place(self) -> None:
        """The rules that need the parent row, which a database check cannot read."""
        wanted = PARENT_LEVEL.get(self.level)
        if wanted is None:
            if self.parent_id is not None:
                raise ValueError(f"A module has no parent; {self.code!r} was given one.")
            return

        if self.parent is None:
            raise ValueError(f"A {self.level} needs a parent {wanted}; {self.code!r} has none.")
        if self.parent.level != wanted:
            raise ValueError(
                f"A {self.level} sits under a {wanted}; {self.code!r} was put under the "
                f"{self.parent.level} {self.parent.code!r}."
            )
        if self.parent.app_id != self.app_id:
            raise ValueError(
                f"{self.code!r} belongs to {self.app_id!r} but its parent "
                f"{self.parent.code!r} belongs to {self.parent.app_id!r}."
            )


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


class ActionKind(models.TextChoices):
    BASIC = "basic", "Basic"
    SPECIAL = "special", "Special"


# THE BASIC FOUR, in the role builder's column order (C79, amended 2026-11-18).
# Every other verb is special.
BASIC_ACTIONS: tuple[str, ...] = ("view", "create", "update", "delete")


class Action(BaseModel):
    """
    One verb a permission can name: view, create, export, assign... (C79).

    The last part of a permission's code (`dms.enquiry.EXPORT`), and a column
    of the role builder -- sections as rows, actions as tick-boxes -- which is
    what `name` and `display_order` are for (View first).

    BASIC OR SPECIAL (the owner, 2026-11-18). Exactly four are basic -- view,
    create, update, delete -- and the role builder always shows them as four
    fixed columns, greyed where a section lacks one. Every other verb is
    special, listed beside them only for the sections that have it. `save()`
    works the kind out from the code, and the database refuses a row where the
    two disagree, so "export is basic" cannot happen by either route.

    Permissions link to it BY CODE, as they link to `App`, so a row in
    `permissions_permission` reads `action = 'view'` in Workbench rather than
    an id. Seeded by data migration with the verbs in use; nobody adds one at
    runtime.
    """

    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=40, help_text='The role builder\'s column: "Export".')
    kind = models.CharField(
        max_length=10,
        choices=ActionKind.choices,
        default=ActionKind.SPECIAL,
        help_text="basic for view, create, update and delete; special for every other verb.",
    )
    display_order = models.PositiveSmallIntegerField(
        default=0, help_text="Column order in the role builder; View first."
    )

    class Meta:
        ordering = ["display_order", "code"]
        constraints = [
            # Basic means exactly the four, and the four are exactly basic.
            models.CheckConstraint(
                condition=(
                    models.Q(code__in=BASIC_ACTIONS, kind=ActionKind.BASIC)
                    | (~models.Q(code__in=BASIC_ACTIONS) & models.Q(kind=ActionKind.SPECIAL))
                ),
                name="action_kind_matches_code",
            ),
        ]

    def __str__(self) -> str:
        return self.code

    def save(self, *args, **kwargs) -> None:
        self.kind = ActionKind.BASIC if self.code in BASIC_ACTIONS else ActionKind.SPECIAL
        super().save(*args, **kwargs)


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

    `section` AND `action` (C79): the LEAF section it acts on -- a tab, or a
    sub-module with no tabs -- and the verb. OPTIONAL WHILE DMS IS OUTSIDE THE
    SECTION TREE (C79, amended 2026-11-18): the Admin panel's permissions get
    both; DMS's keep neither, and their `module` and `group`, until the owner
    restructures DMS. Then both become required and `module` / `group` go.

    THE RULES, once a permission has a section. The database: both or neither,
    and one permission per section and action. `save()`: the section is a leaf
    in the same app, and the code is exactly `<app>.<section code>.<action>` --
    so the code a view checks and the row the role editor ticks can never
    describe two different things.
    """

    code = models.CharField(max_length=80, unique=True)
    app = models.ForeignKey(
        App,
        to_field="code",
        db_column="app",
        on_delete=models.PROTECT,
        related_name="permissions",
    )
    module = models.CharField(
        max_length=40,
        help_text="Which module this makes visible: sales, service, users, dealers...",
    )
    group = models.CharField(max_length=60, help_text='Display grouping: "Enquiries".')
    label = models.CharField(max_length=120, help_text='What it lets you do: "Create an enquiry".')
    section = models.ForeignKey(
        AppSection,
        null=True,
        blank=True,
        # A section that permissions point at cannot be deleted out from
        # under them.
        on_delete=models.PROTECT,
        related_name="permissions",
        help_text="The leaf section it acts on (C79). Empty for DMS until it moves over.",
    )
    action = models.ForeignKey(
        Action,
        null=True,
        blank=True,
        to_field="code",
        db_column="action",
        on_delete=models.PROTECT,
        related_name="permissions",
        help_text="The verb: view, create, export... Empty for DMS until it moves over.",
    )

    class Meta:
        ordering = ["app_id", "module", "group", "code"]
        indexes = [
            # Deriving a person's modules asks "which modules do these
            # permissions touch", so the lookup leads with app.
            models.Index(fields=["app", "module"]),
        ]
        constraints = [
            # A section with no verb, or a verb on nothing, describes nothing.
            models.CheckConstraint(
                condition=(
                    models.Q(section__isnull=True, action__isnull=True)
                    | models.Q(section__isnull=False, action__isnull=False)
                ),
                name="permission_section_and_action_together",
            ),
            models.UniqueConstraint(
                fields=["section", "action"], name="permission_unique_section_action"
            ),
        ]

    def __str__(self) -> str:
        return self.code

    def save(self, *args, **kwargs) -> None:
        self._check_section()
        super().save(*args, **kwargs)

    def _check_section(self) -> None:
        """The rules that need the section's row, which a database check cannot read."""
        if self.section_id is None:
            return  # DMS, until it moves into the tree (C79, amended).

        section = self.section
        if section.app_id != self.app_id:
            raise ValueError(
                f"{self.code!r} belongs to {self.app_id!r} but its section "
                f"{section.code!r} belongs to {section.app_id!r}."
            )
        if section.children.exists():
            raise ValueError(
                f"{self.code!r} points at {section.code!r}, which has sections under it: "
                "permissions belong to a leaf -- a tab, or a sub-module with no tabs."
            )
        expected = f"{self.app_id}.{section.code}.{self.action_id}"
        if self.code != expected:
            raise ValueError(
                f"{self.code!r} must be {expected!r}: <app>.<section code>.<action>."
            )


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
    app = models.ForeignKey(
        App,
        to_field="code",
        db_column="app",
        on_delete=models.PROTECT,
        related_name="roles",
    )
    level = models.CharField(max_length=10, choices=RoleLevel.choices)
    summary = models.CharField(max_length=300)

    display_order = models.PositiveSmallIntegerField(
        default=0,
        help_text="Order within one app and level. Seeded from the catalogue.",
    )
    """
    THE ORDER A PICKER READS IN, and it is a column because the alphabet gets
    it wrong.

    `ordering` used to end in `name`, which sorted the six dealership roles as
    Manager, Sales representative, Service advisor, System administrator, Tech
    support, Technician. That separates the two roles that RUN a dealership ---
    Manager and System administrator, the pair C36 deliberately created by
    splitting them --- and puts "Tech support" ahead of "Technician", which
    reads like a typo. The intended order groups the two senior roles first and
    then the operational ones, which is the order `catalogue.py` declares them
    in and the order the frontend's tests already pinned.

    STORED RATHER THAN DERIVED IN PYTHON, following C44. Sorting by the
    catalogue's declaration order in the selector would have worked and needed
    no migration, and it was rejected for the reason C44 reversed C42: the
    owner wants this readable in Workbench, not only by somebody who knows
    which module to open. An order that exists nowhere in the data is also
    invisible to anything that queries these rows without going through the
    selector.

    NOT UNIQUE, and not a sequence to be careful with. Ties simply fall back to
    `name`, so a duplicate or a gap is untidy rather than broken.
    """

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
        # `name` stays as the tie-breaker, so two roles sharing a
        # `display_order` are still returned in a stable order rather than
        # whatever MySQL feels like.
        ordering = ["app_id", "level", "display_order", "name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.app_id})"

    @property
    def administers(self) -> bool:
        """
        Whether holding this role lets somebody administer their scope.

        Derived, never stored (C40). An organization admin gets this from the
        "Organisation admin" role at the root; a dealer admin from holding a role
        --- the DMS System administrator --- that grants `admin.*` permissions,
        narrowed to the places their grant puts them (C72).

        Prefetch `permissions` before asking this for a list of roles, or it is
        a query each.
        """
        return any(permission.app_id == AppCode.ADMIN for permission in self.permissions.all())


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
