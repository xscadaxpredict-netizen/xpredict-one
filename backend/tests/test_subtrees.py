"""
C72 piece 3, step 2: a place covers everything below it.

The tree every test here builds, one organisation:

    Apex Motors (root)
    ├── North (region)
    │   ├── Delhi Motors (dealer)
    │   │   └── Delhi East (branch)
    │   └── Jaipur Auto (dealer)
    └── South (region)
        └── Chennai Cars (dealer)

Three things change, and each has a class below:

- RECORDS: placed at North you see North, Delhi, Delhi East and Jaipur --
  until now a region placement saw only records filed AT the region, which
  is to say nothing.
- FILING: placed at exactly one dealership or branch, a new record is filed
  there (a branch person's save used to fail -- only dealerships were
  candidates); `X-Unit-Id` may name any dealership, branch or region inside
  your subtree. The "first dealership" guess for people above several
  places is kept, and pinned, until the create forms gain a choice.
- ADMINISTRATION: a DMS System administrator at North manages Delhi's and
  Jaipur's people, not Chennai's (the owner, 2026-11-13).
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from rest_framework.test import APIClient

from config.routers import current_tenant_db
from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.organizations.models import (
    ActivationCode,
    Membership,
    Organization,
    Territory,
    TerritoryKind,
)
from core.organizations.selectors import (
    can_manage,
    can_manage_person,
    org_users,
    resolve_allowed_territories,
)
from core.organizations.services import (
    create_territory,
    grant_app_access,
    invite_person,
    move_territory,
    sign_up,
)
from core.permissions.models import AppCode, Role
from products.dms.sales.models import Enquiry
from shared.base_models import territory_scope

pytestmark = [pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])]

PASSWORD = "correct horse battery staple"


def found(code="CODE-APEX", name="Apex Motors", email="owner@apex.test", *, tenant=False):
    ActivationCode.objects.create(code=code)
    result = sign_up(activation_code=code, organization_name=name, email=email, password=PASSWORD)
    if tenant:
        # The suite's one declared tenant database, so DMS endpoints can run.
        Organization.objects.filter(pk=result.organization.pk).update(db_name=TEST_TENANT_ALIAS)
    return result


def build_tree(organization) -> SimpleNamespace:
    def add(kind, name, parent=None):
        return create_territory(
            organization=organization,
            kind=kind,
            name=name,
            parent_id=parent.pk if parent else None,
        )

    north = add(TerritoryKind.REGION, "North")
    delhi = add(TerritoryKind.DEALER, "Delhi Motors", north)
    delhi_east = add(TerritoryKind.BRANCH, "Delhi East", delhi)
    jaipur = add(TerritoryKind.DEALER, "Jaipur Auto", north)
    south = add(TerritoryKind.REGION, "South")
    chennai = add(TerritoryKind.DEALER, "Chennai Cars", south)
    return SimpleNamespace(
        root=Territory.objects.root_for(organization),
        north=north,
        delhi=delhi,
        delhi_east=delhi_east,
        jaipur=jaipur,
        south=south,
        chennai=chennai,
    )


def person(organization, email, places, role="dms.manager") -> Membership:
    user = User.objects.create_user(email=email, password=PASSWORD)
    membership = Membership.objects.create(user=user, organization=organization)
    grant_app_access(
        membership=membership,
        app=AppCode.DMS,
        role=Role.objects.get(code=role),
        territories=places,
    )
    return Membership.objects.get(pk=membership.pk)


def ids(*territories) -> frozenset:
    return frozenset(t.pk for t in territories)


@pytest.fixture
def tenant_db():
    token = current_tenant_db.set(TEST_TENANT_ALIAS)
    try:
        yield
    finally:
        current_tenant_db.reset(token)


# ---------------------------------------------------------------------------
# Which records a person sees.
# ---------------------------------------------------------------------------


class TestAPlaceCoversItsSubtree:
    def test_a_dealership_covers_its_branches(self):
        result = found()
        t = build_tree(result.organization)
        at_delhi = person(result.organization, "a@apex.test", [t.delhi])

        assert resolve_allowed_territories(at_delhi, AppCode.DMS) == ids(t.delhi, t.delhi_east)

    def test_a_region_covers_its_dealerships_and_their_branches(self):
        result = found()
        t = build_tree(result.organization)
        at_north = person(result.organization, "n@apex.test", [t.north])

        assert resolve_allowed_territories(at_north, AppCode.DMS) == ids(
            t.north, t.delhi, t.delhi_east, t.jaipur
        )

    def test_several_places_cover_all_of_their_subtrees(self):
        result = found()
        t = build_tree(result.organization)
        both = person(result.organization, "b@apex.test", [t.north, t.south])

        assert resolve_allowed_territories(both, AppCode.DMS) == ids(
            t.north, t.delhi, t.delhi_east, t.jaipur, t.south, t.chennai
        )

    def test_the_root_is_still_everything(self):
        result = found()
        t = build_tree(result.organization)
        wide = person(result.organization, "w@apex.test", [t.root], role="dms.fleet_viewer")

        assert resolve_allowed_territories(wide, AppCode.DMS) is None

    def test_another_organisations_tree_is_never_included(self):
        apex = found()
        mine = build_tree(apex.organization)
        north_co = found(code="CODE-NORTH", name="Northway", email="owner@northway.test")
        theirs = build_tree(north_co.organization)
        at_north = person(apex.organization, "n@apex.test", [mine.north])

        seen = resolve_allowed_territories(at_north, AppCode.DMS)

        assert not seen & ids(*vars(theirs).values())

    def test_moving_a_box_moves_who_sees_it_on_the_next_question(self):
        """Read fresh every time, never stored."""
        result = found()
        t = build_tree(result.organization)
        at_north = person(result.organization, "n@apex.test", [t.north])

        move_territory(territory=t.jaipur, parent_id=t.south.pk)

        assert t.jaipur.pk not in resolve_allowed_territories(
            Membership.objects.get(pk=at_north.pk), AppCode.DMS
        )


class TestThroughTheApi:
    """The manager's filter, end to end: a regional manager's enquiry list."""

    def enquiries(self, t):
        with territory_scope(None):
            return {
                place: Enquiry.objects.create(territory_id=place.pk, customer_name="C", phone="1")
                for place in (t.delhi, t.delhi_east, t.jaipur, t.chennai)
            }

    def listed(self, result, membership):
        client = APIClient()
        client.force_authenticate(user=membership.user)
        response = client.get(f"/api/v1/orgs/{result.organization.slug}/dms/sales/enquiries/")
        assert response.status_code == 200, response.content
        return {row["id"] for row in response.json()}

    def test_a_regional_manager_sees_their_region_and_nothing_else(self, tenant_db):
        result = found(tenant=True)
        t = build_tree(result.organization)
        made = self.enquiries(t)
        at_north = person(result.organization, "n@apex.test", [t.north])

        seen = self.listed(result, at_north)

        assert {str(made[p].pk) for p in (t.delhi, t.delhi_east, t.jaipur)} <= seen
        assert str(made[t.chennai].pk) not in seen

    def test_a_dealership_manager_sees_their_branches_too(self, tenant_db):
        result = found(tenant=True)
        t = build_tree(result.organization)
        made = self.enquiries(t)
        at_delhi = person(result.organization, "d@apex.test", [t.delhi])

        seen = self.listed(result, at_delhi)

        assert {str(made[t.delhi].pk), str(made[t.delhi_east].pk)} <= seen
        assert not {str(made[t.jaipur].pk), str(made[t.chennai].pk)} & seen


# ---------------------------------------------------------------------------
# Where a new record is filed.
# ---------------------------------------------------------------------------


class TestFilingANewRecord:
    def create(self, result, membership, header=None):
        client = APIClient()
        client.force_authenticate(user=membership.user)
        extra = {"HTTP_X_UNIT_ID": str(header.pk)} if header else {}
        response = client.post(
            f"/api/v1/orgs/{result.organization.slug}/dms/sales/enquiries/",
            {"customer_name": "New", "phone": "9"},
            format="json",
            **extra,
        )
        assert response.status_code == 201, response.content
        with territory_scope(None):
            return Enquiry.objects.get(pk=response.json()["id"]).territory_id

    def rep(self, result, email, places):
        return person(result.organization, email, places, role="dms.sales_representative")

    def test_a_branch_person_files_at_their_branch(self, tenant_db):
        """It used to fail: only dealerships were candidates, so no home at all."""
        result = found(tenant=True)
        t = build_tree(result.organization)

        home = self.create(result, self.rep(result, "e@apex.test", [t.delhi_east]))

        assert home == t.delhi_east.pk

    def test_a_dealership_person_files_at_their_dealership(self, tenant_db):
        result = found(tenant=True)
        t = build_tree(result.organization)

        home = self.create(result, self.rep(result, "d@apex.test", [t.delhi]))

        assert home == t.delhi.pk

    def test_a_regional_person_may_name_a_dealership_inside_their_region(self, tenant_db):
        result = found(tenant=True)
        t = build_tree(result.organization)

        home = self.create(result, self.rep(result, "n@apex.test", [t.north]), header=t.jaipur)

        assert home == t.jaipur.pk

    def test_a_regional_person_may_file_at_the_region_itself(self, tenant_db):
        """The regional pool: no dealership chosen yet."""
        result = found(tenant=True)
        t = build_tree(result.organization)

        home = self.create(result, self.rep(result, "n@apex.test", [t.north]), header=t.north)

        assert home == t.north.pk

    def test_head_office_may_file_at_the_head_office_pool(self, tenant_db):
        """The root is a record's home too (the owner, 2026-11-13)."""
        result = found(tenant=True)
        t = build_tree(result.organization)

        home = self.create(result, self.rep(result, "h@apex.test", [t.root]), header=t.root)

        assert home == t.root.pk

    def test_somebody_below_head_office_cannot_file_at_the_root(self, tenant_db):
        """The root is above North, so outside a North person's subtree."""
        result = found(tenant=True)
        t = build_tree(result.organization)

        home = self.create(result, self.rep(result, "n@apex.test", [t.north]), header=t.root)

        assert home != t.root.pk

    def test_a_place_outside_their_subtree_is_ignored(self, tenant_db):
        result = found(tenant=True)
        t = build_tree(result.organization)

        home = self.create(result, self.rep(result, "n@apex.test", [t.north]), header=t.chennai)

        assert home != t.chennai.pk

    def test_without_a_choice_the_temporary_guess_still_applies(self, tenant_db):
        """
        PINNED SO ITS REMOVAL IS DELIBERATE. Above several places with no
        `X-Unit-Id`, the record goes to the first dealership created inside
        the person's subtree -- today's behaviour, kept until the create forms
        offer a choice.
        """
        result = found(tenant=True)
        t = build_tree(result.organization)

        home = self.create(result, self.rep(result, "n@apex.test", [t.north]))

        assert home == t.delhi.pk


# ---------------------------------------------------------------------------
# Whose people an administrator manages.
# ---------------------------------------------------------------------------


class TestAdministeringASubtree:
    def admin_at(self, result, place):
        return person(result.organization, "admin@apex.test", [place], role="dms.system_admin")

    def test_a_regional_admin_reaches_every_place_below(self):
        result = found()
        t = build_tree(result.organization)
        admin = self.admin_at(result, t.north)

        assert can_manage(admin, t.delhi.pk) is True
        assert can_manage(admin, t.delhi_east.pk) is True
        assert can_manage(admin, t.jaipur.pk) is True
        assert can_manage(admin, t.chennai.pk) is False
        assert can_manage(admin, None) is False

    def test_a_regional_admin_manages_the_people_placed_below(self):
        result = found()
        t = build_tree(result.organization)
        admin = self.admin_at(result, t.north)

        assert can_manage_person(admin, person(result.organization, "j@apex.test", [t.jaipur]))
        assert can_manage_person(admin, person(result.organization, "n2@apex.test", [t.north]))
        assert not can_manage_person(admin, person(result.organization, "c@apex.test", [t.chennai]))

    def test_a_dealership_admin_does_not_manage_somebody_placed_above_them(self):
        result = found()
        t = build_tree(result.organization)
        admin = self.admin_at(result, t.delhi)

        assert not can_manage_person(admin, person(result.organization, "n@apex.test", [t.north]))

    def test_the_users_list_shows_the_region_and_its_invitations(self):
        result = found()
        t = build_tree(result.organization)
        admin = self.admin_at(result, t.north)
        at_jaipur = person(result.organization, "j@apex.test", [t.jaipur])
        at_chennai = person(result.organization, "c@apex.test", [t.chennai])
        invited = {}
        for place, email in ((t.jaipur, "inv-j@apex.test"), (t.chennai, "inv-c@apex.test")):
            invited[place] = invite_person(
                actor=result.membership,
                organization=result.organization,
                email=email,
                first_name="I",
                last_name="N",
                unit_id=place.pk,
                role="member",
                apps=[{"app": "dms", "role": "dms.manager"}],
            )

        seen = {row.id for row in org_users(result.organization, admin)}

        assert at_jaipur.id in seen and invited[t.jaipur].id in seen
        assert at_chennai.id not in seen and invited[t.chennai].id not in seen
