"""
`organizations/0020`: the last look before the old access copy is dropped.

It refuses -- never repairs -- when somebody other than the owner holds no
grant, or a grant is missing its role or every territory. The owner decided
refuse over repair on 2026-11-12: there is no app to hand somebody for free
(C73), so the only repair would be deleting them.

Run against today's models, which is safe for this one: everything it reads
-- `Membership`, `MembershipAppAccess`, the user's email, the organisation's
slug -- survives step 2d-3.
"""

from __future__ import annotations

import importlib

import pytest
from django.apps import apps as django_apps

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.organizations.models import (
    ActivationCode,
    Membership,
    MembershipAppRole,
    MembershipAppTerritory,
)
from core.organizations.services import (
    accept_invitation,
    create_dealer,
    invite_person,
    sign_up,
)

pytestmark = [pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])]

CHECK = importlib.import_module(
    "core.organizations.migrations.0020_check_every_person_has_a_grant"
)

PASSWORD = "correct horse battery staple"


def found(code="CODE-APEX", name="Apex Motors", email="owner@apex.test"):
    ActivationCode.objects.create(code=code)
    return sign_up(
        activation_code=code, organization_name=name, email=email, password=PASSWORD
    )


def join(result, email, unit=None) -> Membership:
    invitation = invite_person(
        actor=result.membership,
        organization=result.organization,
        email=email,
        first_name="A",
        last_name="B",
        unit_id=unit.pk if unit else None,
        role="member",
        apps=[{"app": "dms", "role": "dms.manager" if unit else "dms.fleet_viewer"}],
    )
    return accept_invitation(token=invitation.token, password=PASSWORD).membership


def run() -> None:
    CHECK.check(django_apps, None)


class TestItLetsAHealthyDatabaseThrough:
    def test_nobody_at_all(self):
        run()

    def test_people_made_by_the_services(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        join(result, "ravi@apex.test", unit=delhi)
        join(result, "anita@apex.test")

        run()

    def test_the_owner_with_no_grant_is_fine(self):
        """They hold everything by rule (`is_owner`)."""
        result = found()
        result.membership.grants.all().delete()

        run()


class TestItRefusesAndNamesThem:
    def test_somebody_with_no_grant(self):
        result = found()
        User.objects.create_user(email="stray@apex.test", password="x")
        Membership.objects.create(
            user=User.objects.get(email="stray@apex.test"), organization=result.organization
        )

        with pytest.raises(RuntimeError) as refused:
            run()

        assert "stray@apex.test (apex-motors)" in str(refused.value)
        assert "give each an app, or remove them" in str(refused.value)

    def test_it_names_everybody_in_every_organisation_not_just_the_first(self):
        apex = found()
        north = found(code="CODE-NORTH", name="Northway", email="owner@northway.test")
        for result, email in ((apex, "a@apex.test"), (north, "b@northway.test")):
            user = User.objects.create_user(email=email, password="x")
            Membership.objects.create(user=user, organization=result.organization)

        with pytest.raises(RuntimeError) as refused:
            run()

        assert "a@apex.test (apex-motors)" in str(refused.value)
        assert "b@northway.test (northway)" in str(refused.value)

    def test_a_grant_with_no_role(self):
        result = found()
        member = join(result, "ravi@apex.test")
        MembershipAppRole.objects.filter(app_access__membership=member).delete()

        with pytest.raises(RuntimeError) as refused:
            run()

        assert "ravi@apex.test (apex-motors): dms" in str(refused.value)

    def test_a_grant_with_no_territory(self):
        result = found()
        member = join(result, "ravi@apex.test")
        MembershipAppTerritory.objects.filter(app_access__membership=member).delete()

        with pytest.raises(RuntimeError) as refused:
            run()

        assert "ravi@apex.test (apex-motors): dms" in str(refused.value)

    def test_it_changes_nothing_when_it_refuses(self):
        result = found()
        user = User.objects.create_user(email="stray@apex.test", password="x")
        stray = Membership.objects.create(user=user, organization=result.organization)

        with pytest.raises(RuntimeError):
            run()

        assert Membership.objects.filter(pk=stray.pk).exists()
