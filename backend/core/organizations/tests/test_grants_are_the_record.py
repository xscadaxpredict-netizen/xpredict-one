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

import secrets
from datetime import timedelta

import pytest
from django.utils import timezone

from conftest import TEST_TENANT_ALIAS
from core.organizations.exceptions import RoleScopeMismatchError
from core.organizations.models import (
    ActivationCode,
    Invitation,
    InvitationAppGrant,
    Membership,
    MembershipAppAccess,
    MembershipRole,
    Territory,
)
from core.organizations.selectors import reach, standing
from core.organizations.services import (
    accept_invitation,
    create_dealer,
    invite_person,
    sign_up,
    update_person,
)
from core.permissions.models import AppCode, Role

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


def invite(result, *, unit=None, role=MembershipRole.MEMBER, apps=None, email="ravi@apex.test"):
    if apps is None:
        apps = [{"app": "dms", "role": "dms.manager" if unit else "dms.fleet_viewer"}]
    return invite_person(
        actor=result.membership,
        organization=result.organization,
        email=email,
        first_name="Ravi",
        last_name="Kumar",
        unit_id=unit.pk if unit else None,
        role=role,
        apps=apps,
    )


def join(result, **kwargs) -> Membership:
    invitation = invite(result, **kwargs)
    return accept_invitation(token=invitation.token, password=PASSWORD).membership


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
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")

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
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        jaipur = create_dealer(organization=result.organization, name="Jaipur Auto")
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

    def test_inviting_an_admin_at_a_dealership_is_refused(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")

        with pytest.raises(RoleScopeMismatchError):
            invite(result, unit=delhi, role=MembershipRole.ADMIN)

        assert not Invitation.objects.filter(email="ravi@apex.test").exists()

    def test_editing_somebody_into_an_admin_at_a_dealership_is_refused(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        member = join(result, unit=delhi)

        with pytest.raises(RoleScopeMismatchError):
            edit(result, member, unit=delhi, role=MembershipRole.ADMIN)

    def test_placing_the_owner_at_a_dealership_is_refused(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")

        with pytest.raises(RoleScopeMismatchError):
            edit(result, result.membership, unit=delhi)

    def test_an_older_admin_invitation_at_a_dealership_is_refused_at_accept(self):
        """
        Issued before the rule moved here, so nothing refused it then. It used
        to fail as a 500 from the check constraint; now it is a 409 and the
        invitation stays unspent for an admin to correct.
        """
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        invitation = Invitation.objects.create(
            organization=result.organization,
            unit=delhi,
            email="old@apex.test",
            first_name="Old",
            last_name="Invite",
            role=MembershipRole.ADMIN,
            token=secrets.token_urlsafe(32),
            expires_at=timezone.now() + timedelta(days=7),
            invited_by=result.user,
        )
        InvitationAppGrant.objects.create(
            invitation=invitation, app_id=AppCode.DMS, role=Role.objects.get(code="dms.manager")
        )

        with pytest.raises(RoleScopeMismatchError):
            accept_invitation(token=invitation.token, password=PASSWORD)

        invitation.refresh_from_db()
        assert invitation.accepted_at is None
        assert not Membership.objects.filter(user__email="old@apex.test").exists()

    def test_an_organisation_wide_admin_is_fine(self):
        result = found()

        admin = join(result, role=MembershipRole.ADMIN)

        assert reach(admin) is None
        assert administration_grant(admin).territories.get().territory == (
            Territory.objects.root_for(result.organization)
        )
