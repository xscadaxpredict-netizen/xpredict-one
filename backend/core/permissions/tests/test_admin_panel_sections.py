"""
The Admin panel's sections, actions and permissions as the owner set them
(C79; `permissions/0017` and `0018`, 2026-11-18).

WRITTEN AGAINST THE OWNER'S FINAL LIST, not against the migrations' own lists --
a test that read the same list it checks would pass for anything.
"""

from __future__ import annotations

import pytest

from core.permissions.models import Action, ActionKind, AppSection, Permission, Role

pytestmark = pytest.mark.django_db

# The owner's final list: permission -> (section code, action code).
FINAL = {
    "admin.organization_info.view": ("organization_info", "view"),
    "admin.application.view": ("application", "view"),
    "admin.application.create": ("application", "create"),
    "admin.application.view_users": ("application", "view_users"),
    "admin.application.view_conditional_assignment": (
        "application",
        "view_conditional_assignment",
    ),
    "admin.user.view": ("user", "view"),
    "admin.user.create": ("user", "create"),
    "admin.user.update": ("user", "update"),
    "admin.user.delete": ("user", "delete"),
    "admin.user.deactivate": ("user", "deactivate"),
    "admin.user.resend_invitation": ("user", "resend_invitation"),
    "admin.user.assign_app": ("user", "assign_app"),
    "admin.user.unassign_app": ("user", "unassign_app"),
    "admin.user.disable_app": ("user", "disable_app"),
    "admin.admin.view": ("admin", "view"),
    "admin.admin.assign_admin": ("admin", "assign_admin"),
    "admin.admin.unassign_admin": ("admin", "unassign_admin"),
    "admin.app_admin.view": ("app_admin", "view"),
    "admin.role.view": ("role", "view"),
    "admin.role.create": ("role", "create"),
    "admin.role.update": ("role", "update"),
    "admin.role.delete": ("role", "delete"),
}


def tree(app: str) -> list[tuple[str, str, str, str | None]]:
    """(level, code, name, parent code), parents first, siblings in order."""
    rows = []

    def walk(parent):
        for section in AppSection.objects.filter(app_id=app, parent=parent).order_by(
            "display_order"
        ):
            rows.append((section.level, section.code, section.name, parent and parent.code))
            walk(section)

    walk(None)
    return rows


class TestTheActions:
    def test_the_four_basic_then_the_nine_special(self):
        assert list(Action.objects.values_list("code", "kind")) == [
            ("view", ActionKind.BASIC),
            ("create", ActionKind.BASIC),
            ("update", ActionKind.BASIC),
            ("delete", ActionKind.BASIC),
            ("view_users", ActionKind.SPECIAL),
            ("view_conditional_assignment", ActionKind.SPECIAL),
            ("deactivate", ActionKind.SPECIAL),
            ("resend_invitation", ActionKind.SPECIAL),
            ("assign_app", ActionKind.SPECIAL),
            ("unassign_app", ActionKind.SPECIAL),
            ("disable_app", ActionKind.SPECIAL),
            ("assign_admin", ActionKind.SPECIAL),
            ("unassign_admin", ActionKind.SPECIAL),
        ]


class TestTheAdminPanelsSections:
    def test_are_the_owners_tree(self):
        assert tree("admin") == [
            ("module", "organization", "Organization", None),
            ("sub_module", "profile", "Profile", "organization"),
            ("tab", "organization_info", "Organization Info", "profile"),
            ("module", "app_management", "App Management", None),
            ("sub_module", "application", "Applications", "app_management"),
            ("module", "user_management", "User Management", None),
            ("sub_module", "user", "Users", "user_management"),
            ("sub_module", "admins_and_roles", "Admins and Roles", "user_management"),
            ("tab", "admin", "Admins", "admins_and_roles"),
            ("tab", "app_admin", "App Admins", "admins_and_roles"),
            ("tab", "role", "Roles", "admins_and_roles"),
        ]

    def test_dms_has_none_yet(self):
        """C79, amended: DMS joins when the owner restructures it."""
        assert not AppSection.objects.filter(app_id="dms").exists()


class TestThePermissions:
    def test_are_the_owners_final_list_each_linked(self):
        linked = {
            p.code: (p.section.code, p.action_id)
            for p in Permission.objects.filter(section__isnull=False).select_related("section")
        }

        assert linked == FINAL

    def test_the_old_names_are_gone(self):
        old = [
            "admin.person.view",
            "admin.person.invite",
            "admin.person.update",
            "admin.person.remove",
            "admin.person.delete",
            "admin.person.set_status",
            "admin.person.resend_invitation",
            "admin.organization.view",
        ]

        assert not Permission.objects.filter(code__in=old).exists()

    def test_dealers_and_territories_stay_unlinked(self):
        unlinked = set(
            Permission.objects.filter(app_id="admin", section__isnull=True).values_list(
                "code", flat=True
            )
        )

        assert unlinked == {
            "admin.dealer.view",
            "admin.dealer.create",
            "admin.dealer.update",
            "admin.dealer.set_status",
            "admin.territory.view",
            "admin.territory.create",
            "admin.territory.update",
        }

    def test_dms_stays_unlinked(self):
        assert not Permission.objects.filter(app_id="dms", section__isnull=False).exists()


class TestWhoHoldsThem:
    def test_the_organisation_admin_holds_every_one(self):
        held = set(
            Role.objects.get(code="admin.org_admin").permissions.values_list("code", flat=True)
        )

        assert set(FINAL) <= held

    def test_a_dealer_admin_keeps_exactly_the_users_permissions_it_had(self):
        held = set(
            Role.objects.get(code="dms.system_admin")
            .permissions.filter(app_id="admin")
            .values_list("code", flat=True)
        )

        assert held == {
            "admin.user.view",
            "admin.user.create",
            "admin.user.update",
            "admin.user.delete",
            "admin.user.deactivate",
            "admin.user.resend_invitation",
        }
