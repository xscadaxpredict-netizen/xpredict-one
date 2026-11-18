"""
`Action`, and a permission's links to a section and an action (C79, step 1b).

Three layers, because rows reach `permissions_permission` three ways:

- THE DATABASE refuses what it sees in one row: a section without an action or
  the reverse, the same section and action twice, an action code twice.
  Tested with `bulk_create`, which skips `save()`.
- `save()` refuses what needs the section's row: another app's section, a
  section with sections under it, a code that is not `<app>.<section>.<action>`.
- DATA MIGRATIONS skip `save()` entirely -- they use historical models -- so
  the last test walks EVERY linked permission in the database and applies the
  same rules. It passes trivially today (nothing is linked yet) and is the
  guard the Admin panel's data migration (step 2) has to get past.
"""

from __future__ import annotations

import pytest
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError

from core.permissions.models import (
    BASIC_ACTIONS,
    Action,
    ActionKind,
    AppSection,
    Permission,
    SectionLevel,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def view() -> Action:
    # Seeded by `permissions/0017`.
    return Action.objects.get(code="view")


@pytest.fixture
def export() -> Action:
    # Not seeded yet (the owner adds special verbs as they are needed).
    return Action.objects.create(code="export", name="Export", display_order=5)


@pytest.fixture
def tree():
    """User Management > Admins and Roles > Roles, and a Users leaf."""
    top = AppSection.objects.create(
        app_id="admin", level=SectionLevel.MODULE, code="x_user_management", name="UM"
    )
    both = AppSection.objects.create(
        app_id="admin", parent=top, level=SectionLevel.SUB_MODULE, code="x_both", name="A&R"
    )
    roles = AppSection.objects.create(
        app_id="admin", parent=both, level=SectionLevel.TAB, code="x_role", name="Roles"
    )
    return {"module": top, "sub_module": both, "tab": roles}


def permission(section, action, code=None, app="admin", **extra):
    return Permission.objects.create(
        code=code or f"{app}.{section.code}.{action.code}",
        app_id=app,
        module="m",
        group="G",
        label="L",
        section=section,
        action=action,
        **extra,
    )


def refused_by_the_database(*rows) -> None:
    with pytest.raises(IntegrityError), transaction.atomic():
        type(rows[0]).objects.bulk_create(list(rows))


class TestActions:
    def test_an_action_code_once(self, view):
        refused_by_the_database(Action(code="view", name="View again"))

    def test_the_basic_four_come_first(self, view, export):
        codes = list(Action.objects.values_list("code", flat=True))

        assert codes[:4] == ["view", "create", "update", "delete"]
        assert "export" in codes[4:]


class TestBasicAndSpecial:
    """C79, amended 2026-11-18: exactly four basic actions, every other special."""

    def test_the_basic_four_in_column_order(self):
        assert BASIC_ACTIONS == ("view", "create", "update", "delete")

    def test_save_marks_the_four_basic(self):
        for code in BASIC_ACTIONS:
            action = Action.objects.get(code=code)
            action.kind = ActionKind.SPECIAL
            action.save()

            action.refresh_from_db()
            assert action.kind == ActionKind.BASIC

    def test_save_marks_every_other_verb_special(self):
        for code in ("export", "assign", "invite"):
            assert Action.objects.create(code=code, name=code.title()).kind == ActionKind.SPECIAL

    def test_save_ignores_a_kind_it_was_handed(self):
        made = Action.objects.create(code="export", name="Export", kind=ActionKind.BASIC)

        assert made.kind == ActionKind.SPECIAL

    def test_the_database_refuses_a_basic_verb_marked_special(self):
        refused_by_the_database(Action(code="delete", name="Delete", kind=ActionKind.SPECIAL))

    def test_the_database_refuses_another_verb_marked_basic(self):
        refused_by_the_database(Action(code="export", name="Export", kind=ActionKind.BASIC))


class TestLinkingAPermission:
    def test_to_a_leaf_with_the_matching_code(self, tree, view):
        made = permission(tree["tab"], view)

        assert made.code == "admin.x_role.view"
        assert list(tree["tab"].permissions.all()) == [made]
        assert made in view.permissions.all()

    def test_a_sub_module_with_no_tabs_is_a_leaf_too(self, tree, view):
        users = AppSection.objects.create(
            app_id="admin",
            parent=tree["module"],
            level=SectionLevel.SUB_MODULE,
            code="x_person",
            name="Users",
        )

        assert permission(users, view).code == "admin.x_person.view"

    def test_a_permission_with_neither_still_saves(self):
        """DMS, until it moves into the tree (C79, amended)."""
        made = Permission.objects.create(
            code="dms.x_thing.view", app_id="dms", module="sales", group="G", label="L"
        )

        assert made.section is None
        assert made.action is None


class TestTheDatabaseRefuses:
    def test_a_section_without_an_action(self, tree):
        refused_by_the_database(
            Permission(code="admin.x_role.view", app_id="admin", section=tree["tab"])
        )

    def test_an_action_without_a_section(self, view):
        refused_by_the_database(Permission(code="admin.x.view", app_id="admin", action=view))

    def test_the_same_section_and_action_twice(self, tree, view):
        permission(tree["tab"], view)

        refused_by_the_database(
            Permission(
                code="admin.x_role.view_again", app_id="admin", section=tree["tab"], action=view
            )
        )


class TestSaveRefuses:
    def test_a_section_with_sections_under_it(self, tree, view):
        with pytest.raises(ValueError, match="has sections under it"):
            permission(tree["sub_module"], view)

    def test_a_module(self, tree, view):
        with pytest.raises(ValueError, match="has sections under it"):
            permission(tree["module"], view)

    def test_a_section_from_another_app(self, tree, view):
        with pytest.raises(ValueError, match="belongs to 'dms' but its section"):
            permission(tree["tab"], view, code="dms.x_role.view", app="dms")

    def test_a_code_that_does_not_match(self, tree, view):
        with pytest.raises(ValueError, match=r"must be 'admin.x_role.view'"):
            permission(tree["tab"], view, code="admin.roles.view")


class TestNothingIsDeletedOutFromUnder:
    def test_a_section_with_permissions(self, tree, view):
        permission(tree["tab"], view)

        with pytest.raises(ProtectedError):
            tree["tab"].delete()

    def test_an_action_in_use(self, tree, view):
        permission(tree["tab"], view)

        with pytest.raises(ProtectedError):
            view.delete()


class TestEveryLinkedPermissionInTheDatabase:
    def test_obeys_the_rules_save_checks(self):
        """Data migrations skip `save()`, so their rows are checked here."""
        broken = []
        for perm in Permission.objects.filter(section__isnull=False).select_related("section"):
            section = perm.section
            if section.app_id != perm.app_id:
                broken.append(f"{perm.code}: section in another app")
            if section.children.exists():
                broken.append(f"{perm.code}: section is not a leaf")
            if perm.code != f"{perm.app_id}.{section.code}.{perm.action_id}":
                broken.append(f"{perm.code}: code does not match")

        assert broken == []
