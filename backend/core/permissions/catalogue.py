"""
The permission catalogue, and which role grants what (C42).

THIS IS DATA, NOT A REGISTRY. Permissions live in the database (C44); this
module is the readable statement of what they should be, kept beside the models
so it can be read, diffed and reviewed like anything else. Changing it changes
nothing until a migration applies it.

NO MIGRATION READS THIS FILE ANY MORE (2026-11-05). `0002` and `0003` used to
import it, which made every database built from scratch replay TODAY's lists
inside a migration dated 2026-10-03; they read the frozen
`migrations/_catalogue_2026_10_03.py` now, and a test refuses any migration that
imports this module again.

ADDING A CAPABILITY IS TWO STEPS, and that is the cost C44 accepted: edit the
lists here, then write a NEW migration that carries its own data and applies
the difference, as `0004` does -- never one that imports this file, and never an
edit to an old one. An applied migration is history, and rewriting it leaves
every environment that already ran it silently out of step.

The strings themselves, and the reasoning behind them, are C42.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Permissions: (code, app, module, group, label)
#
# `module` is what makes a screen appear -- a module shows when the role holds at
# least one permission inside it. `group` and `label` are for the Roles page,
# which DISPLAYS a permission rather than checking one (C28).
# ---------------------------------------------------------------------------

PERMISSIONS: list[tuple[str, str, str, str, str]] = [
    # --- Administration -----------------------------------------------------
    #
    # Held by organisation admins through standing, and by the DMS System
    # administrator role narrowed to one dealership (C40). The strings are the
    # same either way: scope decides whose people they reach, not the name.
    # Renamed from `admin.person.*` (and `admin.organization.view`) by
    # `permissions/0018` -- the owner's final list, C79. Same rows, so the roles
    # holding them kept them.
    ("admin.user.view", "admin", "users", "People", "See the people in this organisation"),
    ("admin.user.create", "admin", "users", "People", "Invite somebody"),
    ("admin.user.update", "admin", "users", "People", "Change somebody's access"),
    # Was `admin.person.remove`; the basic Delete for Users since C79
    # (`permissions/0017`). Same row, so the roles holding it kept it.
    ("admin.user.delete", "admin", "users", "People", "Remove somebody"),
    ("admin.user.deactivate", "admin", "users", "People", "Switch somebody off, or back on"),
    (
        "admin.user.resend_invitation",
        "admin",
        "users",
        "People",
        "Send an invitation again",
    ),
    ("admin.dealer.view", "admin", "dealers", "Dealerships", "See the dealerships"),
    ("admin.dealer.create", "admin", "dealers", "Dealerships", "Add a dealership"),
    ("admin.dealer.update", "admin", "dealers", "Dealerships", "Edit a dealership"),
    ("admin.dealer.set_status", "admin", "dealers", "Dealerships", "Close or reopen a dealership"),
    # The territory tree (C72 piece 1, `permissions/0009`). In the `dealers`
    # module because the tree is shown where dealerships are.
    ("admin.territory.view", "admin", "dealers", "Territories", "See the territory tree"),
    (
        "admin.territory.create",
        "admin",
        "dealers",
        "Territories",
        "Add a region, branch or warehouse",
    ),
    ("admin.territory.update", "admin", "dealers", "Territories", "Rename or move a territory"),
    ("admin.role.view", "admin", "roles", "Roles", "Read what each role grants"),
    # The Admin panel's Organization -> Profile page (C78, `permissions/0012`).
    (
        "admin.organization_info.view",
        "admin",
        "organization",
        "Organization",
        "See the organization's profile",
    ),
    # The Admin panel's App Management -> Applications page (C78, `permissions/0013`).
    (
        "admin.application.view",
        "admin",
        "applications",
        "Applications",
        "See the organization's applications",
    ),
    # --- The owner's final Admin panel list (C79, `permissions/0018`) --------
    ("admin.application.create", "admin", "applications", "Applications", "Add apps"),
    (
        "admin.application.view_users",
        "admin",
        "applications",
        "Applications",
        "See an app's members",
    ),
    (
        "admin.application.view_conditional_assignment",
        "admin",
        "applications",
        "Applications",
        "See an app's conditional assignment",
    ),
    ("admin.user.assign_app", "admin", "users", "People", "Give somebody an app"),
    ("admin.user.unassign_app", "admin", "users", "People", "Take an app away from somebody"),
    ("admin.user.disable_app", "admin", "users", "People", "Disable somebody's app"),
    # The app tile's Edit -- the role held in one app. Its own permission, not
    # `admin.user.update` (Edit user: name and email), since `permissions/0019`.
    (
        "admin.user.edit_app",
        "admin",
        "users",
        "People",
        "Change somebody's role in an app",
    ),
    ("admin.admin.view", "admin", "roles", "Admins", "See the organisation's admins"),
    ("admin.admin.assign_admin", "admin", "roles", "Admins", "Make somebody an admin"),
    ("admin.admin.unassign_admin", "admin", "roles", "Admins", "Remove somebody's admin role"),
    ("admin.app_admin.view", "admin", "roles", "App admins", "See the app admins"),
    ("admin.role.create", "admin", "roles", "Roles", "Build a role"),
    ("admin.role.update", "admin", "roles", "Roles", "Edit a role"),
    ("admin.role.delete", "admin", "roles", "Roles", "Delete a role"),
    # --- DMS: Sales ---------------------------------------------------------
    ("dms.enquiry.view", "dms", "sales", "Enquiries", "See enquiries"),
    ("dms.enquiry.create", "dms", "sales", "Enquiries", "Raise an enquiry"),
    ("dms.enquiry.update", "dms", "sales", "Enquiries", "Edit an enquiry"),
    ("dms.enquiry.assign", "dms", "sales", "Enquiries", "Assign an enquiry to somebody"),
    ("dms.enquiry.close", "dms", "sales", "Enquiries", "Close an enquiry"),
    ("dms.enquiry.export", "dms", "sales", "Enquiries", "Download enquiries as a file"),
    ("dms.quotation.view", "dms", "sales", "Quotations", "See quotations"),
    ("dms.quotation.create", "dms", "sales", "Quotations", "Raise a quotation"),
    ("dms.quotation.update", "dms", "sales", "Quotations", "Edit a quotation"),
    ("dms.quotation.approve", "dms", "sales", "Quotations", "Approve a quotation"),
    ("dms.quotation.export", "dms", "sales", "Quotations", "Download quotations as a file"),
    ("dms.order.view", "dms", "sales", "Orders", "See orders"),
    ("dms.order.create", "dms", "sales", "Orders", "Raise an order"),
    ("dms.order.confirm", "dms", "sales", "Orders", "Confirm an order"),
    ("dms.order.export", "dms", "sales", "Orders", "Download orders as a file"),
    ("dms.customer.view", "dms", "sales", "Customers", "See customers"),
    ("dms.customer.create", "dms", "sales", "Customers", "Add a customer"),
    ("dms.customer.update", "dms", "sales", "Customers", "Edit a customer"),
    # --- DMS: Service -------------------------------------------------------
    ("dms.appointment.view", "dms", "service", "Appointments", "See appointments"),
    ("dms.appointment.create", "dms", "service", "Appointments", "Book an appointment"),
    ("dms.appointment.update", "dms", "service", "Appointments", "Change an appointment"),
    ("dms.appointment.cancel", "dms", "service", "Appointments", "Cancel an appointment"),
    ("dms.jobcard.view", "dms", "service", "Job cards", "See job cards"),
    ("dms.jobcard.create", "dms", "service", "Job cards", "Open a job card"),
    ("dms.jobcard.update", "dms", "service", "Job cards", "Edit a job card"),
    ("dms.jobcard.close", "dms", "service", "Job cards", "Close a job card"),
    ("dms.jobcard.export", "dms", "service", "Job cards", "Download job cards as a file"),
    ("dms.vehicle.view", "dms", "service", "Vehicles", "See vehicles"),
    ("dms.vehicle.create", "dms", "service", "Vehicles", "Add a vehicle"),
    ("dms.vehicle.update", "dms", "service", "Vehicles", "Edit a vehicle"),
    # --- DMS: Tech support --------------------------------------------------
    ("dms.ticket.view", "dms", "tech-support", "Tickets", "See support tickets"),
    ("dms.ticket.create", "dms", "tech-support", "Tickets", "Raise a ticket"),
    ("dms.ticket.update", "dms", "tech-support", "Tickets", "Edit a ticket"),
    ("dms.ticket.assign", "dms", "tech-support", "Tickets", "Assign a ticket to somebody"),
    ("dms.ticket.close", "dms", "tech-support", "Tickets", "Close a ticket"),
    ("dms.ticket.export", "dms", "tech-support", "Tickets", "Download tickets as a file"),
    # --- DMS: the reference library -----------------------------------------
    #
    # WHY `manage` RATHER THAN `create` AND `delete`, which is the convention
    # everywhere above. There is no screen that lets somebody add a manual and
    # not remove one: the Settings tab shows an upload button and a bin on the
    # same row, to the same audience. Two codes that are always granted and
    # always checked together describe a distinction that does not exist, and
    # the Roles page would show a pair nobody can meaningfully split.
    #
    # The fine-grained verbs above are not decoration -- `dms.order.create`
    # without `dms.order.confirm` is the whole shape of a sales rep -- so this
    # is a deliberate exception where that reasoning does not apply, not a
    # relaxation of C42.
    ("dms.manual.manage", "dms", "tech-support", "Library", "Add or remove user manuals"),
    ("dms.video.manage", "dms", "tech-support", "Library", "Add or remove machine videos"),
    # --- DMS: Tools ---------------------------------------------------------
    (
        "dms.marketing_asset.manage",
        "dms",
        "tools",
        "Marketing",
        "Add or remove marketing material",
    ),
    (
        "dms.calculator.manage",
        "dms",
        "tools",
        "Calculator",
        "Change the capacity calculator's constants",
    ),
    (
        "dms.timer_calculation.delete",
        "dms",
        "tools",
        "Calculator",
        "Remove a saved calculation",
    ),
    # --- DMS: E-commerce ----------------------------------------------------
    #
    # THIS IS THE `ecommerce` MODULE INSIDE DMS, not the deferred E-commerce
    # suite app (C64). The store a dealership buys from, not a storefront sold
    # to a customer.
    ("dms.store_order.create", "dms", "ecommerce", "Store orders", "Place a store order"),
    (
        "dms.store_order.manage",
        "dms",
        "ecommerce",
        "Store orders",
        "Cancel a store order, or move it along",
    ),
    # --- DMS: settings (behind the gear, C78 amended) ------------------------
    #
    # DMS's own Users page (`permissions/0021`, 2026-11-23). OWNER ONLY: no
    # role holds it (see `_OWNER_ONLY` below) until the app-admin role is
    # designed (Q63). Module `users`, not `settings` -- that is Load Master Data.
    ("dms.user.view", "dms", "users", "Users", "See DMS's users"),
    # Invite User on that page (`permissions/0022`, 2026-11-24). Owner only too.
    ("dms.user.create", "dms", "users", "Users", "Invite somebody into DMS"),
    # A row's Edit, Deactivate and Delete (`permissions/0023`, 2026-11-24) -- on
    # the person's DMS, not their account. Owner only too.
    ("dms.user.update", "dms", "users", "Users", "Edit somebody's details and DMS role"),
    ("dms.user.deactivate", "dms", "users", "Users", "Switch somebody's DMS off or back on"),
    ("dms.user.delete", "dms", "users", "Users", "Take DMS away from somebody"),
    # Security & Controls -> Territory Management (`permissions/0024`,
    # 2026-11-24): DMS's territory tree. Owner only too.
    ("dms.territory.view", "dms", "territories", "Territories", "See DMS's territory tree"),
    ("dms.territory.create", "dms", "territories", "Territories", "Add a territory to DMS's tree"),
    ("dms.territory.update", "dms", "territories", "Territories", "Edit a territory's details"),
    (
        "dms.territory.set_status",
        "dms",
        "territories",
        "Territories",
        "Close a territory, or reopen it",
    ),
    # Delete territory (`permissions/0025`, 2026-11-24): records and people move first.
    (
        "dms.territory.delete",
        "dms",
        "territories",
        "Territories",
        "Delete a territory, moving its records and people",
    ),
    # --- CRM ----------------------------------------------------------------
    #
    # ONE PERMISSION, deliberately. CRM is built after DMS ships, and designing
    # its list now would be guessing -- the same reason E-commerce has none at
    # all. The mechanism is per-app; the list simply is not needed yet.
    ("crm.lead.view", "crm", "leads", "Leads", "See leads"),
]


# ---------------------------------------------------------------------------
# Convenience groups, so the role map below reads as jobs rather than strings.
# ---------------------------------------------------------------------------

_SALES = [code for code, _app, module, *_ in PERMISSIONS if module == "sales"]
_SERVICE = [code for code, _app, module, *_ in PERMISSIONS if module == "service"]
# THE TICKET CODES, NOT THE WHOLE `tech-support` MODULE. This read
# `module == "tech-support"` until 2026-11-05, and the module also holds the
# organisation library (`dms.manual.manage`, `dms.video.manage`, above) -- so
# Tech support, a dealership role, was quietly handed the cross-dealership
# edits C67 forbids. A module is a screen, not a job.
_TICKETS = [code for code, *_rest in PERMISSIONS if code.startswith("dms.ticket.")]
# Written out, not "everything in the users module": the owner's final list
# (C79, `permissions/0018`) added assign_app / unassign_app / disable_app to
# Users, and the DMS System administrator keeps exactly what it had.
_ADMIN_PEOPLE = [
    "admin.user.view",
    "admin.user.create",
    "admin.user.update",
    "admin.user.delete",
    "admin.user.deactivate",
    "admin.user.resend_invitation",
]

# HELD BY NO ROLE: the owner has them by rule, and nobody else yet. Kept out of
# the "every DMS read" group below, which would otherwise hand DMS's settings to
# the Fleet viewer just because the code ends in `.view`.
_OWNER_ONLY = [
    "dms.user.view",
    "dms.user.create",
    "dms.user.update",
    "dms.user.deactivate",
    "dms.user.delete",
    "dms.territory.view",
    "dms.territory.create",
    "dms.territory.update",
    "dms.territory.set_status",
    "dms.territory.delete",
]

_DMS_READS = [
    code
    for code, app, *_rest in PERMISSIONS
    if app == "dms" and code.endswith(".view") and code not in _OWNER_ONLY
]
_DMS_EXPORTS = [
    code for code, app, *_rest in PERMISSIONS if app == "dms" and code.endswith(".export")
]

# Manager runs the BUSINESS at one dealership; System administrator runs the
# SOFTWARE there (C36). So Manager gets everything operational and none of the
# user management, and tech support is handled rather than staffed.
_MANAGER = [
    *_SALES,
    *_SERVICE,
    "dms.ticket.view",
    "dms.ticket.assign",
    "dms.ticket.close",
    # The two UNIT-SCOPED tools. A store order and a saved calculation both
    # belong to one dealership, so a dealership's manager is the right person
    # and `allowed_territories` keeps them to their own either way.
    "dms.store_order.create",
    "dms.store_order.manage",
    "dms.timer_calculation.delete",
]

# WHAT THE WHOLE ORGANISATION SHARES, and why it is not in `_MANAGER`.
#
# `UserManual`, `MachineVideo`, `MarketingAsset` and `CalculatorSettings` all
# inherit `BaseModel`, not `TerritoryScopedModel` -- they have no `unit_id`. So
# `allowed_territories` does not filter them and cannot: there is one copy per
# organisation and every dealership reads it.
#
# That makes a unit-level grant the wrong shape rather than merely generous.
# A Manager at one dealership holding these would reach every other
# dealership's screens through a row they are allowed to edit, which is the
# exact reach C5 and C40 exist to prevent -- and the calculator constants
# decide how every quotation in the organisation is sized.
#
# So they are granted at ORGANISATION level only, where the audience matches
# the data. If that proves too tight in practice -- the likeliest complaint is
# a dealer admin who cannot upload a manual -- the answer is another migration
# granting them to `dms.system_admin` too, not moving them here.
_ORG_LIBRARY = [
    "dms.manual.manage",
    "dms.video.manage",
    "dms.marketing_asset.manage",
    "dms.calculator.manage",
]


# ---------------------------------------------------------------------------
# Roles: code -> (name, app, level, summary, permissions)
#
# The summaries match the ones the frontend already shows. They are copy, not
# data: changing one changes what a person reads when choosing a role.
# ---------------------------------------------------------------------------

ROLES: dict[str, tuple[str, str, str, str, list[str]]] = {
    "dms.manager": (
        "Manager",
        "dms",
        "unit",
        "Everything at this dealer except its user accounts.",
        _MANAGER,
    ),
    "dms.system_admin": (
        "System administrator",
        "dms",
        "unit",
        "Creates user profiles and assigns roles at this dealer.",
        # THE ONLY ROLE THAT GRANTS admin.* -- which is what makes somebody a
        # dealer admin (C40), narrowed to their own dealership by
        # Membership.unit_id. It is also why `Role.administers` can be derived
        # rather than stored.
        #
        # The three reads are not decoration: this role is granted THROUGH DMS,
        # so without them the app it arrives with would show an empty sidebar.
        # Supporting software you cannot see is not a job.
        [*_ADMIN_PEOPLE, "dms.enquiry.view", "dms.jobcard.view", "dms.ticket.view"],
    ),
    "dms.sales_representative": (
        "Sales representative",
        "dms",
        "unit",
        "Enquiries, quotations, orders and follow-ups.",
        [
            "dms.enquiry.view",
            "dms.enquiry.create",
            "dms.enquiry.update",
            "dms.enquiry.export",
            "dms.quotation.view",
            "dms.quotation.create",
            "dms.quotation.update",
            "dms.quotation.export",
            # Raises an order; confirming one is the Manager's call.
            "dms.order.view",
            "dms.order.create",
            "dms.customer.view",
            "dms.customer.create",
            "dms.customer.update",
        ],
    ),
    "dms.service_advisor": (
        "Service advisor",
        "dms",
        "unit",
        "Books appointments and raises job cards.",
        # Front of house: books the work and opens the card. Closing it belongs
        # to whoever did the work.
        [
            "dms.appointment.view",
            "dms.appointment.create",
            "dms.appointment.update",
            "dms.appointment.cancel",
            "dms.jobcard.view",
            "dms.jobcard.create",
            "dms.jobcard.update",
            "dms.jobcard.export",
            "dms.vehicle.view",
            "dms.vehicle.create",
            "dms.vehicle.update",
            "dms.customer.view",
        ],
    ),
    "dms.technician": (
        "Technician",
        "dms",
        "unit",
        "Carries out the work recorded on job cards.",
        ["dms.jobcard.view", "dms.jobcard.update", "dms.jobcard.close", "dms.vehicle.view"],
    ),
    "dms.tech_support": (
        "Tech support",
        "dms",
        "unit",
        "Support tickets.",
        [*_TICKETS, "dms.customer.view"],
    ),
    "dms.fleet_viewer": (
        "Fleet viewer",
        "dms",
        "org",
        "Reads every dealership. Changes nothing.",
        # Read-only is the only safe shape for somebody with no dealership:
        # resolve_allowed_territories() returns unrestricted, so they see everything.
        # Exports are included because reporting across the group is the whole
        # point of the role -- "changes nothing" is about writes.
        [*_DMS_READS, *_DMS_EXPORTS],
    ),
    "dms.group_operations": (
        "Group operations",
        "dms",
        "org",
        "Works across every dealership, not just one.",
        # MANAGER'S SET PLUS THE FOUR ORGANISATION-LEVEL ONES.
        #
        # It used to be Manager's set EXACTLY, and that was the clearest proof
        # the two axes are separate: identical permissions, different unit_id,
        # completely different reach. That demonstration is worth less than
        # putting org-wide data in the hands of the org-level role, so it is
        # recorded here rather than preserved -- `_MANAGER` is still the whole
        # of what a dealership can do, and the difference is exactly the four
        # resources that have no dealership.
        #
        # This remains the only WRITING role at organisation level.
        [*_MANAGER, *_ORG_LIBRARY],
    ),
    "crm.member": (
        "CRM user",
        "crm",
        "org",
        "The whole organisation's contacts and deals.",
        ["crm.lead.view"],
    ),
    "admin.org_admin": (
        "Organisation admin",
        "admin",
        "org",
        "Runs the organisation: its people, dealerships and territories.",
        # EVERY `admin.*` PERMISSION (Q60, answered 2026-11-11: one built-in
        # Administration role). It is today's "admin" standing as a role, so
        # it holds exactly what that standing conferred. Granted in the
        # Administration app, placed at the organisation's root
        # (`permissions/0010`, `organizations/0019`).
        #
        # A NEW `admin.*` PERMISSION MUST BE ADDED HERE AND TO THE ROLE IN THE
        # SAME MIGRATION, or Organisation admins quietly lack it. The owner
        # needs nothing: they hold every permission by rule (C72).
        [code for code, app, *_rest in PERMISSIONS if app == "admin"],
    ),
}
