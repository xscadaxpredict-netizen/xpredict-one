"""
`AppSection` -- each app's modules, sub-modules and tabs (C79).

Two layers, both tested, because rows can arrive by either route:

- THE DATABASE refuses what it can see in one row -- a duplicate code in an app,
  an unknown level, a module with a parent or anything else without one. Tested
  with `bulk_create`, which skips `save()`, so it is the database answering.
- `save()` refuses what needs the parent row too -- the wrong level of parent,
  or a parent from another app.
"""

from __future__ import annotations

import pytest
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError

from core.permissions.models import App, AppSection, SectionLevel

pytestmark = pytest.mark.django_db


def module(code="x_user_management", app="admin", **extra):
    return AppSection.objects.create(
        app_id=app, level=SectionLevel.MODULE, code=code, name=code.title(), **extra
    )


def sub_module(parent, code="x_admins_and_roles", **extra):
    return AppSection.objects.create(
        app_id=parent.app_id,
        parent=parent,
        level=SectionLevel.SUB_MODULE,
        code=code,
        name=code.title(),
        **extra,
    )


def tab(parent, code="x_role"):
    return AppSection.objects.create(
        app_id=parent.app_id, parent=parent, level=SectionLevel.TAB, code=code, name=code.title()
    )


def refused_by_the_database(row: AppSection) -> None:
    """`bulk_create` skips `save()`: only the database can say no."""
    with pytest.raises(IntegrityError), transaction.atomic():
        AppSection.objects.bulk_create([row])


class TestTheTree:
    def test_module_sub_module_tab(self):
        users = module()
        both = sub_module(users)
        roles = tab(both)

        assert roles.parent == both
        assert both.parent == users
        assert list(users.children.all()) == [both]
        assert str(roles) == "admin.x_role"

    def test_a_sub_module_with_no_tabs_is_simply_a_leaf(self):
        users = module()
        person = sub_module(users, code="x_person")

        assert not person.children.exists()

    def test_siblings_come_in_display_order(self):
        users = module()
        sub_module(users, code="second", display_order=2)
        sub_module(users, code="first", display_order=1)

        assert [s.code for s in users.children.order_by("display_order")] == ["first", "second"]


class TestTheDatabaseRefuses:
    def test_the_same_code_twice_in_one_app(self):
        module(code="x_organization")

        refused_by_the_database(
            AppSection(app_id="admin", level=SectionLevel.MODULE, code="x_organization", name="X")
        )

    def test_but_allows_the_same_code_in_another_app(self):
        module(code="settings", app="admin")
        module(code="settings", app="dms")

        assert AppSection.objects.filter(code="settings").count() == 2

    def test_a_module_with_a_parent(self):
        top = module()

        refused_by_the_database(
            AppSection(
                app_id="admin", parent=top, level=SectionLevel.MODULE, code="nested", name="X"
            )
        )

    def test_a_sub_module_or_tab_with_no_parent(self):
        for level in (SectionLevel.SUB_MODULE, SectionLevel.TAB):
            refused_by_the_database(
                AppSection(app_id="admin", level=level, code=f"orphan_{level}", name="X")
            )

    def test_a_level_that_does_not_exist(self):
        # Given a parent, so the top-level rule is satisfied and only the
        # level rule can be the one saying no.
        top = module()

        refused_by_the_database(
            AppSection(app_id="admin", parent=top, level="page", code="page", name="X")
        )


class TestSaveRefuses:
    def test_a_module_with_a_parent(self):
        top = module()

        with pytest.raises(ValueError, match="A module has no parent"):
            AppSection.objects.create(
                app_id="admin", parent=top, level=SectionLevel.MODULE, code="nested", name="X"
            )

    def test_a_sub_module_with_no_parent(self):
        with pytest.raises(ValueError, match="needs a parent module"):
            AppSection.objects.create(
                app_id="admin", level=SectionLevel.SUB_MODULE, code="orphan", name="X"
            )

    def test_a_tab_straight_under_a_module(self):
        top = module()

        with pytest.raises(ValueError, match="A tab sits under a sub_module"):
            tab(top)

    def test_a_sub_module_under_another_sub_module(self):
        both = sub_module(module())

        with pytest.raises(ValueError, match="A sub_module sits under a module"):
            sub_module(both, code="deeper")

    def test_a_parent_from_another_app(self):
        dms_top = module(code="sales", app="dms")

        with pytest.raises(ValueError, match="belongs to 'admin' but its parent"):
            AppSection.objects.create(
                app_id="admin",
                parent=dms_top,
                level=SectionLevel.SUB_MODULE,
                code="stray",
                name="X",
            )


class TestNothingIsDeletedOutFromUnder:
    def test_a_section_with_sections_under_it(self):
        users = module()
        sub_module(users)

        with pytest.raises(ProtectedError):
            users.delete()

    def test_an_app_with_sections(self):
        # A fresh app with nothing but a section, so the section is the only
        # thing that can be standing in the way (a real app's permissions and
        # roles would refuse the delete on their own).
        bare = App.objects.create(code="bare", name="Bare")
        module(code="only", app=bare.code)

        with pytest.raises(ProtectedError):
            bare.delete()
