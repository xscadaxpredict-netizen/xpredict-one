"""
C72 step 2d-2: the grants are the WHOLE record of a person's access.

Until this step every service wrote a person's access twice -- the old copy
(`Membership.role`, `Membership.unit`, one `AppAccess` row per app) and the
grants -- and since steps 2c and 2d-1 nothing read the old copy. Now the
services stop writing it. Each test below checks both halves: the grant says
the right thing, AND nothing landed in the old copy.

One rule had lived in the old copy and moves out with it: an owner or an admin
is never placed at one dealership. The `Membership` check constraint used to
refuse that -- as a 500, and only when the invitation was accepted -- and with
`unit` no longer written it would have stopped refusing anything. It is a 409
in the services now, at invite, edit and accept.
"""

from __future__ import annotations

import pytest

from conftest import TEST_TENANT_ALIAS, add_dealer
from core.organizations.exceptions import RoleScopeMismatchError
from core.organizations.models import (
    ActivationCode,
    InvitationAppGrant,
    Membership,
    MembershipAppAccess,
    MembershipRole,
    Territory,
)
from core.organizations.selectors import reach, standing
from core.organizations.services import (
    accept_invitation,
    invite_person,
    sign_up,
    update_person,
)
from core.permissions.models import AppCode, Role
from shared.exceptions import InvalidInputError

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


def invite(result, *, email="ravi@apex.test"):
    """A person, and nothing else (C83)."""
    return invite_person(
        actor=result.membership,
        organization=result.organization,
        email=email,
        first_name="Ravi",
        last_name="Kumar",
    )


def join(result, *, unit=None, role=MembershipRole.MEMBER, apps=None) -> Membership:
    """
    Invited, joined, then given a place, a standing and apps by Edit -- the way
    somebody gets them since C83. Defaults: DMS, organisation-wide.
    """
    invitation = invite(result)
    member = accept_invitation(token=invitation.token, password=PASSWORD).membership
    edit(result, member, unit=unit, role=role, apps=apps)
    return Membership.objects.get(pk=member.pk)


def edit(result, person, *, unit=None, role=MembershipRole.MEMBER, apps=None, email=None):
    if apps is None:
        apps = [{"app": "dms", "role": "dms.manager" if unit else "dms.fleet_viewer"}]
    return update_person(
        actor=result.membership,
        organization=result.organization,
        person_id=person.pk,
        first_name="Ravi",
        last_name="Kumar",
        email=email or person.user.email,
        unit_id=unit.pk if unit else None,
        role=role,
        apps=apps,
    )


def administration_grant(membership) -> MembershipAppAccess | None:
    return MembershipAppAccess.objects.filter(
        membership=membership, app_id=AppCode.ADMIN
    ).first()


class TestNothingLandsInTheOldCopy:
    def test_signing_up(self):
        """`role` stays "owner" -- the check constraint ties it to `is_owner` until 2d-3."""
        result = found()

        assert result.membership.grants.filter(app_id=AppCode.DMS).exists()

    def test_joining_at_a_dealership(self):
        result = found()
        delhi = add_dealer(organization=result.organization, name="Delhi Motors")

        member = join(result, unit=delhi)

        assert reach(member) == frozenset({delhi.pk})

    def test_joining_as_an_admin(self):
        """The old `role` column stays at its default; the grant makes them an admin."""
        result = found()

        admin = join(result, role=MembershipRole.ADMIN)

        assert standing(admin) == MembershipRole.ADMIN
        assert administration_grant(admin) is not None

    def test_editing_moves_the_grant_and_nothing_else(self):
        result = found()
        delhi = add_dealer(organization=result.organization, name="Delhi Motors")
        jaipur = add_dealer(organization=result.organization, name="Jaipur Auto")
        member = join(result, unit=delhi)

        edit(result, member, unit=jaipur)

        assert reach(Membership.objects.get(pk=member.pk)) == frozenset({jaipur.pk})

    def test_promoting_to_admin_on_edit(self):
        result = found()
        member = join(result)

        edit(result, member, role=MembershipRole.ADMIN)

        assert standing(Membership.objects.get(pk=member.pk)) == MembershipRole.ADMIN


class TestTheOwnerIsNeverAnAdminByForm:
    def test_the_form_saying_admin_gives_the_owner_no_administration_grant(self):
        """They hold Administration by rule (`is_owner`); a grant would be a second copy."""
        result = found()

        edit(result, result.membership, role=MembershipRole.ADMIN)

        assert administration_grant(result.membership) is None


class TestOwnersAndAdminsAreOrganisationWide:
    """The rule the `Membership` check constraint used to hold, as a 409."""

    def test_a_pending_person_is_neither_made_an_admin_nor_placed(self):
        """C83: an invitation is a person -- standing and place wait until they join."""
        result = found()
        delhi = add_dealer(organization=result.organization, name="Delhi Motors")
        invitation = invite(result)

        for unit, role, field in ((None, MembershipRole.ADMIN, "role"), (delhi, None, "unit_id")):
            with pytest.raises(InvalidInputError) as refused:
                update_person(
                    actor=result.membership,
                    organization=result.organization,
                    person_id=invitation.pk,
                    first_name="Ravi",
                    last_name="Kumar",
                    email="ravi@apex.test",
                    unit_id=unit.pk if unit else None,
                    role=role or MembershipRole.MEMBER,
                    apps=[],
                )
            assert [error.field for error in refused.value.field_errors] == [field]

    def test_editing_somebody_into_an_admin_at_a_dealership_is_refused(self):
        result = found()
        delhi = add_dealer(organization=result.organization, name="Delhi Motors")
        member = join(result, unit=delhi)

        with pytest.raises(RoleScopeMismatchError):
            edit(result, member, unit=delhi, role=MembershipRole.ADMIN)

    def test_placing_the_owner_at_a_dealership_is_refused(self):
        result = found()
        delhi = add_dealer(organization=result.organization, name="Delhi Motors")

        with pytest.raises(RoleScopeMismatchError):
            edit(result, result.membership, unit=delhi)

    def test_an_invitation_holding_any_dms_role_joins_with_no_place(self):
        """
        ONLY APP ROLES and NO TERRITORY UNTIL ONE IS ASSIGNED (the owner,
        2026-11-24): what was a dealership role is accepted, and the person
        joins DMS placed nowhere -- not at the root.
        """
        result = found()
        invitation = invite(result, email="old@apex.test")
        InvitationAppGrant.objects.create(
            invitation=invitation, app_id=AppCode.DMS, role=Role.objects.get(code="dms.manager")
        )

        joined = accept_invitation(token=invitation.token, password=PASSWORD).membership

        grant = joined.grants.get(app_id=AppCode.DMS)
        assert grant.roles.get().role.code == "dms.manager"
        assert not grant.territories.exists()

    def test_an_organisation_wide_admin_is_fine(self):
        result = found()

        admin = join(result, role=MembershipRole.ADMIN)

        assert reach(admin) is None
        assert administration_grant(admin).territories.get().territory == (
            Territory.objects.root_for(result.organization, AppCode.ADMIN)
        )
