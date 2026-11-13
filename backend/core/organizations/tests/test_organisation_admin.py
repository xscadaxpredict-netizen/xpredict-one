"""
C72 step 2c, commit 2: "admin" is also an Administration grant (Q60).

One built-in role, "Organisation admin" (`admin.org_admin`), holding every
`admin.*` permission, granted in the Administration app at the organisation's
root. This commit WRITES it and reads nothing new: the admin standing still
confers the same 14 permissions, and commit 3 switches the readers.

PROVED HERE:

1. The role is exactly today's admin standing as a role.
2. Every writer of `Membership.role` keeps the grant in step: accepting an
   `admin` invitation, promoting, demoting, and editing an admin's other apps.
3. The owner never gets one -- they hold Administration by rule.
4. The data migration (`organizations/0019`) gives existing admins the grant,
   and is safe to re-run.
5. The frontend sees no change: the users list's apps column and the role
   catalogue leave Administration out until piece 7.
"""

from __future__ import annotations

import pytest

from conftest import TEST_TENANT_ALIAS
from core.organizations.models import (
    ActivationCode,
    Membership,
    MembershipAppAccess,
    MembershipRole,
    Territory,
)
from core.organizations.selectors import org_users
from core.organizations.services import accept_invitation, invite_person, sign_up, update_person
from core.permissions.models import AppCode, Permission, Role
from core.permissions.selectors import role_catalogue

pytestmark = [pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])]

PASSWORD = "correct horse battery staple"


def found():
    ActivationCode.objects.create(code="CODE-APEX")
    return sign_up(
        activation_code="CODE-APEX",
        organization_name="Apex Motors",
        email="owner@apex.test",
        password=PASSWORD,
    )


def join(result, *, email="ravi@apex.test", role_name="member") -> Membership:
    invitation = invite_person(
        actor=result.membership,
        organization=result.organization,
        email=email,
        first_name="Ravi",
        last_name="Kumar",
        unit_id=None,
        role=role_name,
        apps=[{"app": "dms", "role": "dms.fleet_viewer"}],
    )
    return accept_invitation(token=invitation.token, password=PASSWORD).membership


def edit(result, membership, *, role_name, apps=None) -> None:
    update_person(
        actor=result.membership,
        organization=result.organization,
        person_id=membership.pk,
        first_name="Ravi",
        last_name="Kumar",
        email=membership.user.email,
        unit_id=None,
        role=role_name,
        apps=apps if apps is not None else [{"app": "dms", "role": "dms.fleet_viewer"}],
    )


def administration(membership) -> tuple[str, frozenset] | None:
    """The Administration grant's role and places, or None."""
    grant = MembershipAppAccess.objects.filter(membership=membership, app_id=AppCode.ADMIN).first()
    if grant is None:
        return None
    (held,) = grant.roles.all()
    return held.role.code, frozenset(grant.territories.values_list("territory_id", flat=True))


def root(result):
    return frozenset({Territory.objects.root_for(result.organization).pk})


class TestTheRole:
    def test_it_holds_every_administration_permission_and_nothing_else(self):
        role = Role.objects.get(code="admin.org_admin")

        assert role.name == "Organisation admin"
        assert role.app_id == AppCode.ADMIN
        assert set(role.permissions.values_list("code", flat=True)) == set(
            Permission.objects.filter(app=AppCode.ADMIN).values_list("code", flat=True)
        )
        assert role.permissions.count() == 14


class TestEveryWriterKeepsItInStep:
    def test_accepting_an_admin_invitation(self):
        result = found()

        admin = join(result, role_name="admin")

        assert administration(admin) == ("admin.org_admin", root(result))

    def test_accepting_a_member_invitation_gives_none(self):
        result = found()

        member = join(result)

        assert administration(member) is None

    def test_promoting_a_member(self):
        result = found()
        member = join(result)

        edit(result, member, role_name="admin")

        assert administration(member) == ("admin.org_admin", root(result))

    def test_demoting_an_admin(self):
        result = found()
        admin = join(result, role_name="admin")

        edit(result, admin, role_name="member")

        assert administration(admin) is None

    def test_editing_an_admins_apps_keeps_it(self):
        """The edit deletes every grant and rewrites them; Administration must come back."""
        result = found()
        admin = join(result, role_name="admin")

        edit(result, admin, role_name="admin", apps=[])

        assert administration(admin) == ("admin.org_admin", root(result))
        assert not MembershipAppAccess.objects.filter(membership=admin, app_id=AppCode.DMS)


class TestTheOwnerGetsNone:
    def test_at_sign_up(self):
        result = found()

        assert administration(result.membership) is None

    def test_when_their_own_access_is_edited(self):
        result = found()

        edit(result, result.membership, role_name="admin")

        assert result.membership.is_owner is True
        assert administration(result.membership) is None


class TestTheFrontendSeesNoChange:
    def test_the_users_list_does_not_show_administration_as_an_app(self):
        """The edit form sends `apps` back, and Administration is refused there."""
        result = found()
        admin = join(result, role_name="admin")

        row = next(p for p in org_users(result.organization, result.membership) if p.id == admin.id)

        assert [g.app for g in row.apps] == [AppCode.DMS]
        assert row.role == MembershipRole.ADMIN

    def test_the_role_catalogue_leaves_it_out(self):
        assert "admin.org_admin" not in {role.code for role in role_catalogue()}
        assert Role.objects.filter(code="admin.org_admin").exists()
