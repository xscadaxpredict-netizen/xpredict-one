"""
Per-app grants, C72 piece 2 step 2a: `MembershipAppAccess` + `MembershipAppRole`
+ `MembershipAppTerritory`, written only by `grant_app_access()`.

THREE THINGS ARE PROVED HERE:

1. The rules the database cannot enforce: the role belongs to the app; at least
   one territory; only the person's own organisation's territories; and a
   dealership's person holds only apps that use territories (C27, Q53) -- both
   ways round, across all of their grants.
2. THE NEW TABLES SAY EXACTLY WHAT THE OLD ONES SAY after every real flow that
   writes grants -- sign-up, invite then accept, edit, remove. Step 2b moves the
   readers onto the new tables, and it is only safe because of this.
3. The copy migration (`organizations/0017`) produces the same, and is safe to
   re-run.
"""

from __future__ import annotations

import importlib

import pytest
from django.apps import apps as django_apps

from conftest import TEST_TENANT_ALIAS
from core.organizations.exceptions import (
    DealerScopedAppError,
    GrantNeedsTerritoryError,
    RoleNotInAppError,
)
from core.organizations.models import (
    ActivationCode,
    Membership,
    MembershipAppAccess,
    MembershipAppRole,
    MembershipAppTerritory,
    Territory,
    TerritoryKind,
)
from core.organizations.services import (
    accept_invitation,
    create_dealer,
    create_territory,
    grant_app_access,
    invite_person,
    remove_person,
    revoke_app_access,
    sign_up,
    update_person,
)
from core.permissions.models import AppAccess, AppCode, Role
from shared.exceptions import NotFoundError

pytestmark = [pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])]

COPY = importlib.import_module("core.organizations.migrations.0017_copy_grants_into_per_app_grants")
PASSWORD = "correct horse battery staple"


def found(name="Apex Motors", email="owner@apex.test", code="CODE-APEX"):
    ActivationCode.objects.create(code=code)
    return sign_up(activation_code=code, organization_name=name, email=email, password=PASSWORD)


def role(code: str) -> Role:
    return Role.objects.get(code=code)


def legacy(membership: Membership) -> set[tuple[str, str, frozenset]]:
    """What the OLD tables say: per app, the role and the one place (unit, or the root)."""
    place = membership.unit_id or Territory.objects.root_for(membership.organization).pk
    return {
        (access.app_id, access.role_id, frozenset({place}))
        for access in AppAccess.objects.filter(membership=membership)
    }


def granted(membership: Membership) -> set[tuple[str, str, frozenset]]:
    """What the NEW tables say: per app, the role and the set of places."""
    return {
        (
            grant.app_id,
            MembershipAppRole.objects.get(app_access=grant).role_id,
            frozenset(grant.territories.values_list("territory_id", flat=True)),
        )
        for grant in MembershipAppAccess.objects.filter(membership=membership)
    }


def join(result, *, email: str, unit=None, apps=None, role_name="member") -> Membership:
    # ROLES STILL HAVE A LEVEL until that moves after piece 3: Manager is a
    # dealership role and Fleet viewer an organisation one, and inviting with
    # the wrong one is refused today. So the default follows the placement.
    if apps is None:
        default_role = "dms.manager" if unit else "dms.fleet_viewer"
        apps = [{"app": "dms", "role": default_role}]
    invitation = invite_person(
        actor=result.membership,
        organization=result.organization,
        email=email,
        first_name="Test",
        last_name="Person",
        unit_id=unit.pk if unit else None,
        role=role_name,
        apps=apps,
    )
    return accept_invitation(token=invitation.token, password=PASSWORD).membership


class TestTheRules:
    def test_a_grant_carries_its_role_and_its_territories(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        jaipur = create_dealer(organization=result.organization, name="Jaipur Auto")
        member = join(result, email="meera@apex.test")

        grant_app_access(
            membership=member, app="dms", role=role("dms.manager"), territories=[delhi, jaipur]
        )

        assert granted(member) == {
            ("dms", role("dms.manager").pk, frozenset({delhi.pk, jaipur.pk}))
        }

    def test_granting_again_replaces_never_merges(self):
        """A territory left out is a territory removed; a placement must be able to shrink."""
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        jaipur = create_dealer(organization=result.organization, name="Jaipur Auto")
        member = join(result, email="meera@apex.test")
        grant_app_access(
            membership=member, app="dms", role=role("dms.manager"), territories=[delhi, jaipur]
        )

        grant_app_access(
            membership=member, app="dms", role=role("dms.technician"), territories=[jaipur]
        )

        assert granted(member) == {("dms", role("dms.technician").pk, frozenset({jaipur.pk}))}

    def test_the_role_must_belong_to_the_app(self):
        result = found()
        root = Territory.objects.root_for(result.organization)

        with pytest.raises(RoleNotInAppError):
            grant_app_access(
                membership=result.membership,
                app="crm",
                role=role("dms.manager"),
                territories=[root],
            )

    def test_at_least_one_territory(self):
        """Never "nowhere": a missing placement must fail closed, not mean everything."""
        result = found()

        with pytest.raises(GrantNeedsTerritoryError):
            grant_app_access(
                membership=result.membership, app="crm", role=role("crm.member"), territories=[]
            )

    def test_another_organisations_territory_is_a_404(self):
        apex = found()
        bharat = found("Bharat Auto", "owner@bharat.test", "CODE-BHARAT")
        theirs = create_dealer(organization=bharat.organization, name="Pune Wheels")

        with pytest.raises(NotFoundError):
            grant_app_access(
                membership=apex.membership,
                app="dms",
                role=role("dms.manager"),
                territories=[theirs],
            )

    def test_revoking_takes_the_role_and_territories_with_it(self):
        result = found()

        revoke_app_access(membership=result.membership, app="dms")

        assert not MembershipAppAccess.objects.filter(membership=result.membership).exists()
        assert not MembershipAppRole.objects.filter(
            app_access__membership=result.membership
        ).exists()
        assert not MembershipAppTerritory.objects.filter(
            app_access__membership=result.membership
        ).exists()


class TestADealershipsPeopleGetDmsOnly:
    """C27 / Q53, enforced per placement and across all of a person's grants."""

    def test_a_dealer_placement_in_an_app_without_territories_is_refused(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        member = join(result, email="meera@apex.test")

        with pytest.raises(DealerScopedAppError):
            grant_app_access(
                membership=member, app="crm", role=role("crm.member"), territories=[delhi]
            )

    def test_a_warehouse_inside_a_dealer_counts_as_the_dealership(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        store = create_territory(
            organization=result.organization,
            kind=TerritoryKind.WAREHOUSE,
            name="Delhi Store",
            parent_id=delhi.pk,
        )
        member = join(result, email="meera@apex.test")

        with pytest.raises(DealerScopedAppError):
            grant_app_access(
                membership=member, app="crm", role=role("crm.member"), territories=[store]
            )

    def test_dms_at_a_dealer_then_any_crm_is_refused(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        member = join(result, email="meera@apex.test", unit=delhi)
        root = Territory.objects.root_for(result.organization)

        with pytest.raises(DealerScopedAppError):
            grant_app_access(
                membership=member, app="crm", role=role("crm.member"), territories=[root]
            )

    def test_crm_first_then_dms_at_a_dealer_is_refused(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        root = Territory.objects.root_for(result.organization)
        grant_app_access(
            membership=result.membership, app="crm", role=role("crm.member"), territories=[root]
        )

        with pytest.raises(DealerScopedAppError):
            grant_app_access(
                membership=result.membership,
                app="dms",
                role=role("dms.manager"),
                territories=[delhi],
            )

    def test_head_office_people_may_hold_both(self):
        result = found()
        north = create_territory(
            organization=result.organization, kind=TerritoryKind.REGION, name="North"
        )

        grant_app_access(
            membership=result.membership, app="crm", role=role("crm.member"), territories=[north]
        )

        assert {g[0] for g in granted(result.membership)} == {"dms", "crm"}


class TestTheNewTablesSayWhatTheOldOnesSay:
    """
    STEP 2a's PROMISE. Every flow that writes the old tables writes the new
    ones identically; step 2b switches the readers on the strength of this.
    """

    def test_sign_up_places_the_owner_at_the_root(self):
        result = found()
        root = Territory.objects.root_for(result.organization)

        assert granted(result.membership) == legacy(result.membership)
        assert granted(result.membership) == {
            ("dms", role("dms.group_operations").pk, frozenset({root.pk}))
        }

    def test_accepting_an_invitation_at_a_dealership(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")

        member = join(result, email="ravi@apex.test", unit=delhi)

        assert granted(member) == legacy(member)
        assert granted(member) == {("dms", role("dms.manager").pk, frozenset({delhi.pk}))}

    def test_accepting_an_organisation_wide_invitation(self):
        result = found()

        member = join(
            result, email="anita@apex.test", apps=[{"app": "dms", "role": "dms.fleet_viewer"}]
        )

        assert granted(member) == legacy(member)

    def test_editing_a_person_moves_them_and_changes_their_apps(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        jaipur = create_dealer(organization=result.organization, name="Jaipur Auto")
        member = join(result, email="ravi@apex.test", unit=delhi)

        update_person(
            actor=result.membership,
            organization=result.organization,
            person_id=member.pk,
            first_name="Ravi",
            last_name="Kumar",
            email="ravi@apex.test",
            unit_id=jaipur.pk,
            role="member",
            apps=[{"app": "dms", "role": "dms.technician"}],
        )

        member.refresh_from_db()
        assert granted(member) == legacy(member)
        assert granted(member) == {("dms", role("dms.technician").pk, frozenset({jaipur.pk}))}

    def test_removing_a_person_removes_their_grants(self):
        result = found()
        member = join(result, email="ravi@apex.test")
        member_id = member.pk

        remove_person(
            actor=result.membership, organization=result.organization, person_id=member_id
        )

        assert not MembershipAppAccess.objects.filter(membership_id=member_id).exists()


class TestTheCopyMigration:
    def test_it_copies_grants_made_before_the_new_tables_existed(self):
        """
        Rows written straight into `AppAccess` -- as every grant was before
        step 2a -- with the new tables emptied, as on a database that has not
        run `0017` yet.
        """
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        member = join(result, email="ravi@apex.test", unit=delhi)
        MembershipAppAccess.objects.all().delete()

        COPY.copy(django_apps, None)

        assert granted(result.membership) == legacy(result.membership)
        assert granted(member) == legacy(member)

    def test_running_it_twice_changes_nothing(self):
        result = found()
        MembershipAppAccess.objects.all().delete()
        COPY.copy(django_apps, None)
        first = granted(result.membership)

        COPY.copy(django_apps, None)

        assert granted(result.membership) == first
        assert MembershipAppAccess.objects.filter(membership=result.membership).count() == 1


def test_appcode_names_still_match():
    """The tests above name apps by code; a renamed code would make them pass vacuously."""
    assert {AppCode.DMS, AppCode.CRM} == {"dms", "crm"}
