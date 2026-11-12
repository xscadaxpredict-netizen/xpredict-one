"""
C72 step 2b: the readers use the per-app grants, not `AppAccess` / `Membership.unit`.

Access written to the grant tables opens the app. (The other half -- an old
`AppAccess` row alone opening nothing -- went with that table in step 2d-3.)

And one thing the old tables could never express: a person placed at SEVERAL
dealerships (the owner, answering Q10) sees exactly those.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.api import TenantAPIView
from core.organizations.models import (
    ActivationCode,
    Membership,
    Territory,
)
from core.organizations.selectors import (
    me,
    org_users,
    permissions_for,
    resolve_allowed_units,
)
from core.organizations.services import create_dealer, grant_app_access, sign_up
from core.permissions.models import AppCode, Role

pytestmark = [pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])]


def found():
    ActivationCode.objects.create(code="CODE-APEX")
    return sign_up(
        activation_code="CODE-APEX",
        organization_name="Apex Motors",
        email="owner@apex.test",
        password="correct horse battery staple",
    )


def bare_member(organization, email="meera@apex.test") -> Membership:
    """A membership with no grant yet."""
    user = User.objects.create_user(email=email, password="x")
    return Membership.objects.create(user=user, organization=organization)


def dms(me_payload, slug="apex-motors"):
    membership = next(m for m in me_payload.memberships if m.org_slug == slug)
    return next(a for a in membership.apps if a.key == AppCode.DMS)


class TestTheNewTablesAloneOpenTheApp:
    def test_a_grant_with_no_appaccess_row_is_access(self):
        result = found()
        member = bare_member(result.organization)
        grant_app_access(
            membership=member,
            app=AppCode.DMS,
            role=Role.objects.get(code="dms.fleet_viewer"),
            territories=[Territory.objects.root_for(result.organization)],
        )

        assert dms(me(member.user)).accessible is True
        assert "dms.enquiry.view" in permissions_for(member)

    def test_the_users_screen_shows_the_grant(self):
        result = found()
        member = bare_member(result.organization)
        grant_app_access(
            membership=member,
            app=AppCode.DMS,
            role=Role.objects.get(code="dms.fleet_viewer"),
            territories=[Territory.objects.root_for(result.organization)],
        )

        row = next(
            p for p in org_users(result.organization, result.membership) if p.id == member.id
        )

        assert [(g.app, g.role_code) for g in row.apps] == [(AppCode.DMS, "dms.fleet_viewer")]


class TestWhichDealershipsADmsRequestSees:
    def test_the_root_sees_everything(self):
        result = found()
        assert resolve_allowed_units(result.membership, AppCode.DMS) is None

    def test_one_dealership(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        member = bare_member(result.organization)
        grant_app_access(
            membership=member,
            app=AppCode.DMS,
            role=Role.objects.get(code="dms.manager"),
            territories=[delhi],
        )

        assert resolve_allowed_units(member, AppCode.DMS) == frozenset({delhi.pk})

    def test_several_dealerships_see_exactly_those(self):
        """Q10, answered: something `Membership.unit` could never hold."""
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        jaipur = create_dealer(organization=result.organization, name="Jaipur Auto")
        create_dealer(organization=result.organization, name="Pune Wheels")
        member = bare_member(result.organization)
        grant_app_access(
            membership=member,
            app=AppCode.DMS,
            role=Role.objects.get(code="dms.manager"),
            territories=[delhi, jaipur],
        )

        assert resolve_allowed_units(member, AppCode.DMS) == frozenset({delhi.pk, jaipur.pk})

    def test_no_grant_sees_nothing_never_everything(self):
        """Fail closed: a missing grant is an empty set, not None."""
        result = found()
        member = bare_member(result.organization)

        assert resolve_allowed_units(member, AppCode.DMS) == frozenset()


class TestWhichDealershipARequestWritesTo:
    def test_several_dealerships_pick_with_the_header_but_only_among_their_own(self):
        result = found()
        delhi = create_dealer(organization=result.organization, name="Delhi Motors")
        jaipur = create_dealer(organization=result.organization, name="Jaipur Auto")
        pune = create_dealer(organization=result.organization, name="Pune Wheels")
        member = bare_member(result.organization)
        grant_app_access(
            membership=member,
            app=AppCode.DMS,
            role=Role.objects.get(code="dms.manager"),
            territories=[delhi, jaipur],
        )

        def pick(header):
            request = SimpleNamespace(membership=member, headers={"X-Unit-Id": str(header)})
            return TenantAPIView._resolve_unit_id(request, result.organization)

        assert pick(jaipur.pk) == jaipur.pk
        # A dealership they are not placed at is ignored, never honoured:
        # filing a record there would put it somewhere they cannot see.
        assert pick(pune.pk) in {delhi.pk, jaipur.pk}
