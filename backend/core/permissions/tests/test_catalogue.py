"""
The seeded catalogue, checked against what C42 actually decided.

These run against a database the test run builds and throws away, so the
migration is genuinely applied -- the rows below were written by
`0002_seed_catalogue`, not by a fixture standing in for it.

WHAT THESE DELIBERATELY DO NOT DO is re-state `catalogue.py` and compare it to
itself. Asserting that the database holds whatever the module says would pass for
any content at all, including an empty list. Every number and every name below is
written out, so the test fails if the catalogue changes without the decision
changing.
"""

from __future__ import annotations

import pytest

from core.permissions.models import AppCode, Permission, Role

pytestmark = pytest.mark.django_db


class TestPermissions:
    def test_there_are_55(self):
        """
        C42 settled on 48 and C67 added seven. A number that drifts is a
        decision nobody made -- which is exactly what this assertion is for,
        and it did its job: the seven codes were added with a comment saying
        the catalogue had grown and this test was not updated with them.
        """
        assert Permission.objects.count() == 55

    def test_split_by_app_as_decided(self):
        """
        DMS went 36 -> 43 with C67's seven: two for the reference library
        (manuals, videos), three for tools (marketing material, the calculator
        constants, deleting a saved calculation) and two for store orders.
        Administration and CRM are untouched, which is the point of asserting
        them separately -- a DMS change must not quietly reach either.
        """
        assert Permission.objects.filter(app=AppCode.ADMIN).count() == 11
        assert Permission.objects.filter(app=AppCode.DMS).count() == 43
        assert Permission.objects.filter(app=AppCode.CRM).count() == 1

    def test_every_code_is_app_resource_action(self):
        """
        The shape is the contract. A code with the wrong number of segments
        cannot be grouped, and one whose first segment is not its app makes
        `app` a second source of truth that can disagree.
        """
        for permission in Permission.objects.all():
            segments = permission.code.split(".")
            assert len(segments) == 3, permission.code
            assert segments[0] == permission.app, permission.code

    def test_export_is_its_own_action_on_five_resources(self):
        """
        Reading twenty rows and downloading fifty thousand are different risks,
        so export is never inherited from view (C42).

        FIVE, NOT FOUR. C42's prose said four and omitted orders, while its own
        enumerated list included `order.export` and the total of 48 depended on
        it. This assertion found the contradiction; the prose was corrected,
        because an order list is exactly the thing somebody downloads.
        """
        exports = set(
            Permission.objects.filter(code__endswith=".export").values_list("code", flat=True)
        )

        assert exports == {
            "dms.enquiry.export",
            "dms.quotation.export",
            "dms.order.export",
            "dms.jobcard.export",
            "dms.ticket.export",
        }

    def test_scope_is_not_in_any_name(self):
        """
        One permission set, narrowed by `Membership.unit_id` (C42). An earlier
        proposal had `org.person.invite` and `unit.person.invite` as separate
        strings; spelling scope into the name makes two things that must agree.
        """
        codes = Permission.objects.values_list("code", flat=True)

        assert not [code for code in codes if code.startswith(("org.", "unit."))]

    def test_every_permission_carries_display_copy(self):
        """
        The Roles page displays a permission rather than checking one (C28), and
        the frontend never parses a code to make it readable (C19). Empty copy
        there is a blank row on screen.
        """
        assert not Permission.objects.filter(label="").exists()
        assert not Permission.objects.filter(group="").exists()
        assert not Permission.objects.filter(module="").exists()


class TestRoles:
    def test_there_are_nine(self):
        assert Role.objects.count() == 9

    def test_the_six_dealer_roles_are_the_real_jobs(self):
        """C35/C36: the roles are the jobs people actually hold at a dealership."""
        names = set(Role.objects.filter(level="unit").values_list("name", flat=True))

        assert names == {
            "Manager",
            "System administrator",
            "Sales representative",
            "Service advisor",
            "Technician",
            "Tech support",
        }

    def test_only_system_administrator_administers(self):
        """
        `administers` is derived from holding any `admin.*` permission (C40), so
        this asserts the derivation AND the grant at once. Manager runs the
        business; System administrator runs the software (C36).
        """
        administering = {role.code for role in Role.objects.all() if role.administers}

        assert administering == {"dms.system_admin"}

    def test_manager_has_no_user_management(self):
        """
        The one most likely to be assumed to administer -- it carried
        `administers` for an hour once, which is why it is pinned here.
        """
        manager = Role.objects.get(code="dms.manager")

        assert not manager.permissions.filter(app=AppCode.ADMIN).exists()

    def test_group_operations_is_managers_set_plus_the_organisation_wide_four(self):
        """
        IT USED TO BE MANAGER'S SET EXACTLY, and that was the clearest proof the
        two axes are separate: identical permissions, different `unit_id`,
        completely different reach. C67 ended that equality deliberately.

        The four resources in the difference have no dealership. `UserManual`,
        `MachineVideo`, `MarketingAsset` and `CalculatorSettings` inherit
        `BaseModel`, so there is one copy per organisation and `allowed_units`
        does not confine them -- a unit-level grant would let one dealership's
        Manager change what every other dealership sees.

        THE ASSERTION IS THE DIFFERENCE, NOT THE COUNTS, which is what makes it
        worth keeping. Adding an organisation-wide code to `_MANAGER` by mistake
        fails here, and so does granting Group operations a dealership-level
        capability Manager does not have. The two numbers would both still add
        up.
        """
        manager = Role.objects.get(code="dms.manager")
        group_ops = Role.objects.get(code="dms.group_operations")

        manager_codes = set(manager.permissions.values_list("code", flat=True))
        group_ops_codes = set(group_ops.permissions.values_list("code", flat=True))

        assert group_ops_codes - manager_codes == {
            "dms.manual.manage",
            "dms.video.manage",
            "dms.marketing_asset.manage",
            "dms.calculator.manage",
        }
        # Nothing the other way: a dealership can do everything the group can,
        # within its own dealership.
        assert manager_codes - group_ops_codes == set()
        assert manager.level == "unit"
        assert group_ops.level == "org"

    def test_fleet_viewer_reads_and_exports_but_writes_nothing(self):
        """
        "Changes nothing" is about writes. Reporting across the group is the
        role's whole purpose, so the exports belong.
        """
        codes = set(
            Role.objects.get(code="dms.fleet_viewer").permissions.values_list("code", flat=True)
        )

        assert codes
        for code in codes:
            assert code.endswith((".view", ".export")), code

    def test_system_administrator_can_see_the_app_it_arrives_through(self):
        """
        It is granted THROUGH DMS, so with no DMS permissions the app would open
        on an empty sidebar. Supporting software you cannot see is not a job.
        """
        codes = set(
            Role.objects.get(code="dms.system_admin").permissions.values_list("code", flat=True)
        )

        assert "dms.enquiry.view" in codes
        assert "admin.person.invite" in codes

    def test_a_dealer_role_never_grants_dealership_management(self):
        """
        A dealer admin manages PEOPLE at their dealership. Creating or closing
        dealerships is the organisation's job, and no `unit` role may do it.
        """
        for role in Role.objects.filter(level="unit"):
            granted = set(role.permissions.values_list("code", flat=True))
            assert not {code for code in granted if code.startswith("admin.dealer.")}, role.code


class TestModulesAreDerived:
    def test_a_role_sees_exactly_the_modules_it_has_permissions_in(self):
        """
        Module visibility is derived, never stored (C42). There is one list, so
        a role cannot see an empty screen or hold buttons on a page it cannot
        reach -- and this is the test that would fail if a `modules` column ever
        appeared and started to disagree.
        """
        sales_rep = Role.objects.get(code="dms.sales_representative")

        modules = set(sales_rep.permissions.values_list("module", flat=True))

        assert modules == {"sales"}

    def test_the_system_administrator_sees_users_and_the_dms_modules(self):
        modules = set(
            Role.objects.get(code="dms.system_admin").permissions.values_list("module", flat=True)
        )

        assert modules == {"users", "sales", "service", "tech-support"}

    def test_every_module_is_reachable_by_somebody(self):
        """
        A module nobody can see is a screen nobody can open.

        TWO WAYS TO REACH ONE, which is what this test had to learn. A role
        grants most of them. But `dealers` and `roles` are granted by NO role at
        all — organisation administrators hold every `admin.*` permission through
        STANDING, not through an `AppAccess` row (C40, C42), so nothing in the
        role map mentions them.

        That is not a gap in the seed; it is the design. It does mean the rule
        lives in the `/me` builder rather than in these tables, so this test is
        where it is written down.
        """
        all_modules = set(Permission.objects.values_list("module", flat=True))

        by_role = {
            module
            for role in Role.objects.all()
            for module in role.permissions.values_list("module", flat=True)
        }
        by_standing = set(
            Permission.objects.filter(app=AppCode.ADMIN).values_list("module", flat=True)
        )

        assert all_modules == by_role | by_standing

    def test_dealers_and_roles_belong_to_standing_alone(self):
        """
        Pinned explicitly, because it is the surprising half of the rule above:
        no role may manage dealerships or read the role catalogue. Those are the
        organisation's own jobs, and a dealer admin never gets them.
        """
        by_role = {
            module
            for role in Role.objects.all()
            for module in role.permissions.values_list("module", flat=True)
        }

        assert "dealers" not in by_role
        assert "roles" not in by_role


class TestTheSeedCanBeRunAgain:
    """
    MySQL cannot roll a failed migration back (C39), so "run it again" has to be
    safe. A seed that only works on an empty table cannot recover from a partial
    failure, and the recovery is the whole reason this matters.
    """

    @staticmethod
    def _seed():
        """Call the migration's own function, not a copy of it."""
        import importlib

        from django.apps import apps as django_apps

        module = importlib.import_module("core.permissions.migrations.0002_seed_catalogue")
        module.seed(django_apps, None)

    def test_running_it_again_changes_nothing(self):
        before = (Permission.objects.count(), Role.objects.count())

        self._seed()

        assert (Permission.objects.count(), Role.objects.count()) == before

    def test_it_repairs_a_half_applied_run(self):
        """
        The case this exists for: the migration died part way and left a role
        short of its grants. Running it again must restore them rather than
        leave the role quietly less able than the catalogue says.
        """
        sales_rep = Role.objects.get(code="dms.sales_representative")
        sales_rep.permissions.remove(Permission.objects.get(code="dms.enquiry.create"))

        assert not sales_rep.permissions.filter(code="dms.enquiry.create").exists()

        self._seed()

        assert sales_rep.permissions.filter(code="dms.enquiry.create").exists()

    def test_it_withdraws_a_grant_the_catalogue_no_longer_makes(self):
        """
        The other direction, and the one a seed usually forgets: narrowing a
        role has to take the old permission away. Without this, re-running
        leaves a capability the catalogue says was removed.
        """
        technician = Role.objects.get(code="dms.technician")
        technician.permissions.add(Permission.objects.get(code="admin.person.remove"))

        self._seed()

        assert not technician.permissions.filter(code="admin.person.remove").exists()
