"""
C72 step 2d, commit 1: the PERSON BEING MANAGED is judged by their grants too,
and everybody holds at least one app (C73, "for now").

Step 2c switched the ACTOR side -- where the admin sits. This switches the
TARGET side: where the person on the other end of "edit", "remove" or the users
list sits. (Written with each person's old `Membership.unit` disagreeing with
their grant; step 2d-3 dropped that field, and the grant half remains.)
"""

from __future__ import annotations

import pytest

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.organizations.exceptions import PersonNeedsAnAppError
from core.organizations.models import (
    ActivationCode,
    Membership,
    MembershipRole,
    Territory,
)
from core.organizations.selectors import can_manage_person, dealers_for, org_users
from core.organizations.services import (
    accept_invitation,
    create_dealer,
    grant_app_access,
    invite_person,
    remove_person,
    sign_up,
    update_person,
)
from core.permissions.models import AppCode, Role
from shared.exceptions import NotFoundError

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


def person(result, email) -> Membership:
    user = User.objects.create_user(email=email, password="x")
    return Membership.objects.create(user=user, organization=result.organization)


def dms_at(membership, territories, code="dms.manager") -> Membership:
    grant_app_access(
        membership=membership,
        app=AppCode.DMS,
        role=Role.objects.get(code=code),
        territories=territories,
    )
    return Membership.objects.get(pk=membership.pk)


def dealer_admin(result, dealership) -> Membership:
    email = f"da-{dealership.pk.hex[:8]}@apex.test"
    return dms_at(person(result, email), [dealership], "dms.system_admin")


def invite(result, *, role=MembershipRole.MEMBER, apps=None):
    return invite_person(
        actor=result.membership,
        organization=result.organization,
        email="new@apex.test",
        first_name="New",
        last_name="Person",
        unit_id=None,
        role=role,
        apps=apps if apps is not None else [],
    )


class TestEverybodyHoldsAnApp:
    def test_inviting_somebody_with_no_app_is_refused(self):
        result = found()

        with pytest.raises(PersonNeedsAnAppError) as refused:
            invite(result)

        assert refused.value.field_errors[0].field == "apps"

    def test_an_admin_with_no_other_app_is_fine(self):
        """Administration is their app."""
        result = found()

        invite(result, role=MembershipRole.ADMIN)

    def test_taking_away_somebodys_last_app_is_refused(self):
        result = found()
        invitation = invite(result, apps=[{"app": "dms", "role": "dms.fleet_viewer"}])
        member = accept_invitation(token=invitation.token, password=PASSWORD).membership

        with pytest.raises(PersonNeedsAnAppError):
            update_person(
                actor=result.membership,
                organization=result.organization,
                person_id=member.pk,
                first_name="New",
                last_name="Person",
                email="new@apex.test",
                unit_id=None,
                role=MembershipRole.MEMBER,
                apps=[],
            )

    def test_the_owner_is_never_refused(self):
        result = found()

        update_person(
            actor=result.membership,
            organization=result.organization,
            person_id=result.membership.pk,
            first_name="Owner",
            last_name="Person",
            email="owner@apex.test",
            unit_id=None,
            role=MembershipRole.MEMBER,
            apps=[],
        )


class TestThePersonSitsWhereTheirGrantsSay:
    def test_old_field_says_jaipur_grant_says_delhi(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        jaipur = create_dealer(organization=result.organization, name="Jaipur Auto")
        ravi = dms_at(person(result, "ravi@apex.test"), [delhi])

        assert can_manage_person(dealer_admin(result, delhi), ravi) is True
        assert can_manage_person(dealer_admin(result, jaipur), ravi) is False

    def test_removing_them_follows_the_grant_not_the_old_field(self):
        """The services, not just the helper: 404 from the wrong dealership."""
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        jaipur = create_dealer(organization=result.organization, name="Jaipur Auto")
        ravi = dms_at(person(result, "ravi@apex.test"), [delhi])

        with pytest.raises(NotFoundError):
            remove_person(
                actor=dealer_admin(result, jaipur),
                organization=result.organization,
                person_id=ravi.pk,
            )
        remove_person(
            actor=dealer_admin(result, delhi), organization=result.organization, person_id=ravi.pk
        )

        assert not Membership.objects.filter(pk=ravi.pk).exists()

    def test_the_users_list_shows_the_grants_dealership(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        ravi = dms_at(person(result, "ravi@apex.test"), [delhi])
        da = dealer_admin(result, delhi)

        rows = {p.id: p for p in org_users(result.organization, da)}

        assert ravi.id in rows
        assert rows[ravi.id].unit_id == delhi.pk
        assert rows[ravi.id].unit_name == "Delhi Motors"

    def test_somebody_at_two_dealerships_needs_an_admin_covering_both(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        jaipur = create_dealer(organization=result.organization, name="Jaipur Auto")
        both = dms_at(person(result, "both@apex.test"), [delhi, jaipur])

        assert can_manage_person(dealer_admin(result, delhi), both) is False
        assert can_manage_person(result.membership, both) is True

    def test_head_office_people_are_not_a_dealer_admins(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        wide = dms_at(
            person(result, "wide@apex.test"),
            [Territory.objects.root_for(result.organization)],
            "dms.fleet_viewer",
        )

        assert can_manage_person(dealer_admin(result, delhi), wide) is False

    def test_an_older_member_with_no_grants_is_head_offices_alone(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        stray = person(result, "stray@apex.test")

        assert can_manage_person(dealer_admin(result, delhi), stray) is False
        assert can_manage_person(result.membership, stray) is True


class TestTheDealersScreenCountsByGrants:
    def test_a_person_counts_where_their_grant_places_them(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        create_dealer(organization=result.organization, name="Jaipur Auto")
        dms_at(person(result, "ravi@apex.test"), [delhi])

        counts = {d.name: d.user_count for d in dealers_for(result.organization)}

        assert counts == {"Delhi Motors": 1, "Jaipur Auto": 0}
