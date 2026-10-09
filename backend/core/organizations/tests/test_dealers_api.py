"""
`/api/v1/orgs/<slug>/admin/dealers/` -- list, create and edit dealerships.

THREE ENDPOINTS, NOT FIVE (C52). Close and reopen are deliberately absent:
Q21 has not said what closing does to a dealership's people or its records,
and `status` is therefore not writable through any endpoint. A test at the
bottom pins that, so the day somebody adds a `status` field to the payload it
fails rather than quietly becoming the answer to Q21.

THE PRIVILEGE CASE IS THE ONE TO READ FIRST. Dealerships are managed by the
ORGANIZATION and people by each dealership (C3, C23), so a dealer admin --
who holds every `admin.person.*` permission -- must be refused here. That is
the plan's "a dealer admin cannot create dealers", and it is the assertion
most likely to be broken by somebody being helpful.
"""

from __future__ import annotations

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.organizations.models import (
    ActivationCode,
    BusinessUnit,
    Invitation,
    Membership,
    MembershipRole,
    MembershipStatus,
    UnitStatus,
)
from core.organizations.services import sign_up
from core.permissions.models import AppAccess, AppCode, Role

pytestmark = [
    pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS]),
]

LIST_URL = "/api/v1/orgs/{slug}/admin/dealers/"
DETAIL_URL = "/api/v1/orgs/{slug}/admin/dealers/{id}/"

# REAL GSTINs, because the check digit means an invented one would be refused
# and every create test would 400 for the wrong reason. Both are published
# sample numbers; the PAN each one carries is characters 3-12.
GSTIN = "27AAPFU0939F1ZV"
GSTIN_PAN = "AAPFU0939F"
OTHER_GSTIN = "29AAGCB7383J1Z4"
OTHER_GSTIN_PAN = "AAGCB7383J"


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def found(name="Acme Motors", email="owner@acme.test", code="CODE-ACME"):
    ActivationCode.objects.create(code=code)
    return sign_up(
        activation_code=code,
        organization_name=name,
        email=email,
        password="correct horse battery staple",
    )


def add_dealer_admin(organization, unit, email="dealeradmin@acme.test"):
    user = User.objects.create_user(email=email, password="x")
    membership = Membership.objects.create(
        user=user, organization=organization, unit=unit, role=MembershipRole.MEMBER
    )
    AppAccess.objects.create(
        membership=membership,
        app=AppCode.DMS,
        role=Role.objects.get(app=AppCode.DMS, code="dms.system_admin"),
    )
    return user


def details(**overrides) -> dict:
    return {
        "name": "Chennai - Guindy",
        "code": "CHN-GUI",
        # MANDATORY, so it belongs in the baseline payload rather than in the
        # tests that happen to care. Without it every create here would 400 and
        # the failure would read as whatever that test was actually about.
        "gstin": GSTIN,
        "contact_person": "Anita Fernandes",
        "email": "guindy@acme.test",
        "phone": "+91 44 2345 6789",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "postal_code": "600032",
        **overrides,
    }


class TestListing:
    def test_an_owner_sees_the_organizations_dealerships(self, client):
        result = found()
        BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        BusinessUnit.objects.create(organization=result.organization, name="Guindy")
        client.force_authenticate(user=result.user)

        response = client.get(LIST_URL.format(slug=result.organization.slug))

        assert response.status_code == 200
        assert [d["name"] for d in response.json()] == ["Guindy", "Whitefield"]

    def test_the_fields_are_exactly_what_dealers_ts_declares(self, client):
        result = found()
        BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        client.force_authenticate(user=result.user)

        response = client.get(LIST_URL.format(slug=result.organization.slug))

        assert set(response.json()[0]) == {
            "id",
            "name",
            "code",
            "gstin",
            "pan",
            "contact_person",
            "email",
            "phone",
            "city",
            "state",
            "postal_code",
            "status",
            "user_count",
            "created_at",
        }

    def test_another_organizations_dealerships_are_not_listed(self, client):
        """
        Tenant isolation. The base class has already refused a caller who is
        not a member, so what this pins is the selector: `dealers_for()`
        filtering by the organization rather than returning every row.
        """
        mine = found()
        theirs = found(name="Northway", email="owner@northway.test", code="CODE-N")
        BusinessUnit.objects.create(organization=mine.organization, name="Mine")
        BusinessUnit.objects.create(organization=theirs.organization, name="Theirs")
        client.force_authenticate(user=mine.user)

        response = client.get(LIST_URL.format(slug=mine.organization.slug))

        assert [d["name"] for d in response.json()] == ["Mine"]


class TestUserCount:
    """
    `user_count` is annotated, and the annotation is the kind that inflates
    silently when it is wrong -- so it is tested with both sources present at
    once, which is the case a single-relation annotation gets wrong.
    """

    def test_it_counts_memberships_and_outstanding_invitations_together(self, client):
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")

        for index in range(2):
            user = User.objects.create_user(email=f"person{index}@acme.test", password="x")
            Membership.objects.create(
                user=user, organization=result.organization, unit=unit,
                role=MembershipRole.MEMBER,
            )
        for index in range(3):
            Invitation.objects.create(
                organization=result.organization,
                unit=unit,
                email=f"invited{index}@acme.test",
                token=f"token-{index}",
                expires_at=timezone.now() + timezone.timedelta(days=7),
            )

        client.force_authenticate(user=result.user)
        response = client.get(LIST_URL.format(slug=result.organization.slug))

        # 2 + 3, NOT 6. Annotating two reverse relations in one queryset
        # multiplies them, and the wrong answer here is a plausible-looking
        # larger number rather than an error.
        assert response.json()[0]["user_count"] == 5

    def test_an_accepted_invitation_is_not_counted_twice(self, client):
        """
        Accepting turns an invitation into a membership (C51). If the count
        still included accepted invitations, every person who joined would be
        counted once as a membership and once as the invitation they came from.
        """
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        user = User.objects.create_user(email="joined@acme.test", password="x")
        Membership.objects.create(
            user=user, organization=result.organization, unit=unit, role=MembershipRole.MEMBER
        )
        Invitation.objects.create(
            organization=result.organization,
            unit=unit,
            email="joined@acme.test",
            token="token-accepted",
            expires_at=timezone.now() + timezone.timedelta(days=7),
            accepted_at=timezone.now(),
        )

        client.force_authenticate(user=result.user)
        response = client.get(LIST_URL.format(slug=result.organization.slug))

        assert response.json()[0]["user_count"] == 1

    def test_a_disabled_membership_still_counts(self, client):
        """
        Switched off is not gone -- removing somebody deletes the membership
        (C24) -- so a dealership with a disabled person still has that person.
        """
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        user = User.objects.create_user(email="off@acme.test", password="x")
        Membership.objects.create(
            user=user,
            organization=result.organization,
            unit=unit,
            role=MembershipRole.MEMBER,
            status=MembershipStatus.DISABLED,
        )

        client.force_authenticate(user=result.user)
        response = client.get(LIST_URL.format(slug=result.organization.slug))

        assert response.json()[0]["user_count"] == 1


class TestCreating:
    def test_an_owner_can_add_a_dealership(self, client):
        result = found()
        client.force_authenticate(user=result.user)

        response = client.post(
            LIST_URL.format(slug=result.organization.slug), details(), format="json"
        )

        assert response.status_code == 201
        assert response.json()["name"] == "Chennai - Guindy"
        # Annotated, so a create that returned the raw row would be missing it.
        assert response.json()["user_count"] == 0
        assert response.json()["status"] == UnitStatus.ACTIVE
        assert BusinessUnit.objects.filter(organization=result.organization).count() == 1

    def test_the_code_is_optional_and_several_may_go_without_one(self, client):
        """
        The reason `code` is NULL rather than "". MySQL treats every NULL in a
        unique index as distinct and two empty strings as a duplicate, so
        storing "" would create the first codeless dealership and refuse the
        second.
        """
        result = found()
        client.force_authenticate(user=result.user)
        url = LIST_URL.format(slug=result.organization.slug)

        first = client.post(url, details(name="One", code=""), format="json")
        second = client.post(url, details(name="Two", code=""), format="json")

        assert first.status_code == 201
        assert second.status_code == 201
        assert first.json()["code"] is None
        assert second.json()["code"] is None

    def test_a_duplicate_name_is_refused_by_field(self, client):
        result = found()
        client.force_authenticate(user=result.user)
        url = LIST_URL.format(slug=result.organization.slug)
        client.post(url, details(), format="json")

        response = client.post(url, details(code="OTHER"), format="json")

        assert response.status_code == 409
        # The string is the contract: `dealers.ts` switches on it to mark the
        # right field.
        assert response.json()["code"] == "dealer_name_taken"

    def test_a_duplicate_name_differing_only_in_case_is_refused(self, client):
        """
        The frontend compares lowercased, so the backend has to agree or the
        form permits something the list then shows as a duplicate. It agrees
        for free: the database collation is `utf8mb4_0900_ai_ci`.
        """
        result = found()
        client.force_authenticate(user=result.user)
        url = LIST_URL.format(slug=result.organization.slug)
        client.post(url, details(name="Chennai - Guindy"), format="json")

        response = client.post(
            url, details(name="chennai - guindy", code="OTHER"), format="json"
        )

        assert response.status_code == 409
        assert response.json()["code"] == "dealer_name_taken"

    def test_a_duplicate_code_is_refused_by_field(self, client):
        result = found()
        client.force_authenticate(user=result.user)
        url = LIST_URL.format(slug=result.organization.slug)
        client.post(url, details(), format="json")

        response = client.post(url, details(name="Somewhere else"), format="json")

        assert response.status_code == 409
        assert response.json()["code"] == "dealer_code_taken"

    def test_another_organization_may_reuse_the_same_name(self, client):
        """
        Uniqueness is PER ORGANIZATION. Two customers both having a "Chennai -
        Guindy" is ordinary, and a global constraint would leak the existence
        of one customer's branches into another's error messages.
        """
        mine = found()
        theirs = found(name="Northway", email="owner@northway.test", code="CODE-N")
        BusinessUnit.objects.create(organization=theirs.organization, name="Chennai - Guindy")
        client.force_authenticate(user=mine.user)

        response = client.post(
            LIST_URL.format(slug=mine.organization.slug), details(), format="json"
        )

        assert response.status_code == 201


class TestGstinAndPan:
    """
    The two statutory identifiers. GSTIN is MANDATORY; PAN is derived from it
    and then editable.

    WHY THE CHECK DIGIT IS TESTED AND NOT JUST THE PATTERN. A GSTIN with a
    plausible shape and a wrong last character is exactly what a typo produces,
    and it is the case a format-only check waves through -- after which the
    wrong number is on an invoice and it is somebody else's tax problem. The
    refusal below uses a number that passes the pattern and fails the
    arithmetic, so deleting the checksum makes that test fail rather than
    making it pass more easily.

    WHY THERE IS NO UNIQUENESS TEST -- or rather, why there is one proving the
    opposite. There is deliberately no constraint: one registration covers
    several branches in the same state as additional places of business, so two
    dealerships sharing a GSTIN is real data. Adding a unique constraint later
    therefore has to argue with a test rather than with nobody.
    """

    def test_creating_derives_the_pan_from_the_gstin(self, client):
        result = found()
        client.force_authenticate(user=result.user)

        response = client.post(
            LIST_URL.format(slug=result.organization.slug),
            details(gstin=GSTIN),
            format="json",
        )

        assert response.status_code == 201
        assert response.json()["gstin"] == GSTIN
        assert response.json()["pan"] == GSTIN_PAN
        assert BusinessUnit.objects.get(gstin=GSTIN).pan == GSTIN_PAN

    def test_a_dealership_cannot_be_created_without_a_gstin(self, client):
        result = found()
        client.force_authenticate(user=result.user)

        payload = details()
        del payload["gstin"]

        response = client.post(
            LIST_URL.format(slug=result.organization.slug), payload, format="json"
        )

        assert response.status_code == 422
        assert not BusinessUnit.objects.filter(name="Chennai - Guindy").exists()

    def test_a_blank_gstin_is_refused_too(self, client):
        """
        SEPARATE FROM THE MISSING CASE. `required=True` refuses an absent key;
        it is `allow_blank` defaulting to False that refuses "". A form that
        submits every field always sends the key, so this is the one a person
        actually hits.
        """
        result = found()
        client.force_authenticate(user=result.user)

        response = client.post(
            LIST_URL.format(slug=result.organization.slug),
            details(gstin=""),
            format="json",
        )

        assert response.status_code == 422

    def test_a_gstin_with_a_bad_check_digit_is_refused(self, client):
        """
        The number below is a real GSTIN with its last character changed:
        correct shape, wrong arithmetic. Nothing but the checksum catches it.
        """
        result = found()
        client.force_authenticate(user=result.user)

        response = client.post(
            LIST_URL.format(slug=result.organization.slug),
            details(gstin="27AAPFU0939F1ZX"),
            format="json",
        )

        assert response.status_code == 422
        assert not BusinessUnit.objects.filter(name="Chennai - Guindy").exists()

    def test_a_malformed_gstin_is_refused(self, client):
        result = found()
        client.force_authenticate(user=result.user)

        response = client.post(
            LIST_URL.format(slug=result.organization.slug),
            details(gstin="NOT-A-GSTIN"),
            format="json",
        )

        assert response.status_code == 422

    def test_a_lowercase_gstin_is_accepted_and_stored_uppercase(self, client):
        """
        Refusing a correct number for its case is a refusal nobody can act on,
        and storing two spellings makes one number look like two.
        """
        result = found()
        client.force_authenticate(user=result.user)

        response = client.post(
            LIST_URL.format(slug=result.organization.slug),
            details(gstin=GSTIN.lower()),
            format="json",
        )

        assert response.status_code == 201
        assert response.json()["gstin"] == GSTIN
        assert response.json()["pan"] == GSTIN_PAN

    def test_a_gstin_with_surrounding_whitespace_is_accepted(self, client):
        """One copied off a PDF arrives with a space on the end."""
        result = found()
        client.force_authenticate(user=result.user)

        response = client.post(
            LIST_URL.format(slug=result.organization.slug),
            details(gstin="  " + GSTIN + " "),
            format="json",
        )

        assert response.status_code == 201
        assert response.json()["gstin"] == GSTIN

    def test_an_explicit_pan_overrides_the_derivation(self, client):
        """
        THE WHOLE POINT OF THE FIELD BEING EDITABLE. A GSTIN issued against a
        predecessor entity's PAN is a real situation, so the derived value has
        to be correctable -- which means a sent PAN is deliberately NOT checked
        against the one inside the GSTIN.
        """
        result = found()
        client.force_authenticate(user=result.user)

        response = client.post(
            LIST_URL.format(slug=result.organization.slug),
            details(gstin=GSTIN, pan="ZZZPK1234Q"),
            format="json",
        )

        assert response.status_code == 201
        assert response.json()["gstin"] == GSTIN
        assert response.json()["pan"] == "ZZZPK1234Q"

    def test_a_malformed_pan_is_refused(self, client):
        result = found()
        client.force_authenticate(user=result.user)

        response = client.post(
            LIST_URL.format(slug=result.organization.slug),
            details(pan="12345"),
            format="json",
        )

        assert response.status_code == 422

    def test_two_dealerships_may_share_one_gstin(self, client):
        """
        NO UNIQUENESS CONSTRAINT, ON PURPOSE. One registration covers several
        branches in the same state as additional places of business.
        """
        result = found()
        client.force_authenticate(user=result.user)
        url = LIST_URL.format(slug=result.organization.slug)

        first = client.post(url, details(name="Guindy", code="GUI"), format="json")
        second = client.post(url, details(name="Whitefield", code="WHF"), format="json")

        assert first.status_code == 201
        assert second.status_code == 201
        assert BusinessUnit.objects.filter(gstin=GSTIN).count() == 2

    def test_changing_the_gstin_rederives_the_pan(self, client):
        result = found()
        unit = BusinessUnit.objects.create(
            organization=result.organization, name="Guindy", gstin=GSTIN, pan=GSTIN_PAN
        )
        client.force_authenticate(user=result.user)

        response = client.put(
            DETAIL_URL.format(slug=result.organization.slug, id=unit.id),
            details(name="Guindy", gstin=OTHER_GSTIN),
            format="json",
        )

        assert response.status_code == 200
        unit.refresh_from_db()
        assert unit.gstin == OTHER_GSTIN
        assert unit.pan == OTHER_GSTIN_PAN

    def test_clearing_the_pan_restores_the_derived_one(self, client):
        """
        A FIELD THAT CANNOT RETURN TO ITS DEFAULT IS A ONE-WAY DOOR, which is
        what C55 was about. Clearing an overridden PAN means "give me the one
        in the GSTIN back", not "store nothing" -- otherwise recovering the
        default means retyping ten characters.
        """
        result = found()
        unit = BusinessUnit.objects.create(
            organization=result.organization, name="Guindy", gstin=GSTIN, pan="ZZZPK1234Q"
        )
        client.force_authenticate(user=result.user)

        response = client.put(
            DETAIL_URL.format(slug=result.organization.slug, id=unit.id),
            details(name="Guindy", gstin=GSTIN, pan=""),
            format="json",
        )

        assert response.status_code == 200
        unit.refresh_from_db()
        assert unit.pan == GSTIN_PAN

    def test_the_list_carries_both_identifiers(self, client):
        result = found()
        BusinessUnit.objects.create(
            organization=result.organization, name="Guindy", gstin=GSTIN, pan=GSTIN_PAN
        )
        client.force_authenticate(user=result.user)

        response = client.get(LIST_URL.format(slug=result.organization.slug))

        assert response.status_code == 200
        row = next(r for r in response.json() if r["name"] == "Guindy")
        assert row["gstin"] == GSTIN
        assert row["pan"] == GSTIN_PAN

    def test_a_dealership_that_predates_the_field_still_reads(self, client):
        """
        THE FOUR EXISTING DEALERSHIPS. Both columns are NOT NULL with an empty
        default, so a row written before the migration holds "" -- and the list
        must render it rather than 500. Requiring a field on write while the
        read path assumes it is always present is how a mandatory field breaks a
        screen nobody changed.
        """
        result = found()
        BusinessUnit.objects.create(organization=result.organization, name="Legacy")
        client.force_authenticate(user=result.user)

        response = client.get(LIST_URL.format(slug=result.organization.slug))

        assert response.status_code == 200
        row = next(r for r in response.json() if r["name"] == "Legacy")
        assert row["gstin"] == ""
        assert row["pan"] == ""


class TestEditing:
    def test_an_owner_can_edit_a_dealership(self, client):
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Old name")
        client.force_authenticate(user=result.user)

        response = client.put(
            DETAIL_URL.format(slug=result.organization.slug, id=unit.id),
            details(name="New name"),
            format="json",
        )

        assert response.status_code == 200
        assert response.json()["name"] == "New name"
        unit.refresh_from_db()
        assert unit.city == "Chennai"

    def test_saving_without_changing_the_name_does_not_collide_with_itself(self, client):
        """
        The uniqueness check has to exclude the row being edited. Both the
        frontend fake and this had the bug at some point; it only appears when
        somebody edits a field that is not the name.
        """
        result = found()
        unit = BusinessUnit.objects.create(
            organization=result.organization, name="Chennai - Guindy", code="CHN-GUI"
        )
        client.force_authenticate(user=result.user)

        response = client.put(
            DETAIL_URL.format(slug=result.organization.slug, id=unit.id),
            details(city="Chengalpattu"),
            format="json",
        )

        assert response.status_code == 200
        assert response.json()["city"] == "Chengalpattu"

    def test_another_organizations_dealership_is_404_not_403(self, client):
        """
        Cross-scope access is `NotFoundError`. A dealership the caller may not
        see has to be indistinguishable from one that never existed -- a 403
        would confirm that this UUID belongs to somebody.
        """
        mine = found()
        theirs = found(name="Northway", email="owner@northway.test", code="CODE-N")
        unit = BusinessUnit.objects.create(organization=theirs.organization, name="Theirs")
        client.force_authenticate(user=mine.user)

        response = client.put(
            DETAIL_URL.format(slug=mine.organization.slug, id=unit.id),
            details(),
            format="json",
        )

        assert response.status_code == 404
        assert response.json()["code"] == "not_found"
        # And untouched.
        unit.refresh_from_db()
        assert unit.name == "Theirs"

    def test_a_malformed_id_is_also_404(self, client):
        """
        Not a 400. A 400 would say "that is not a well-formed id", which tells
        a prober that well-formed ids are the thing being looked up -- and the
        route uses `str` rather than `uuid` precisely so this reaches the view
        and answers in problem+json like every other refusal.
        """
        result = found()
        client.force_authenticate(user=result.user)

        response = client.put(
            DETAIL_URL.format(slug=result.organization.slug, id="not-a-uuid"),
            details(),
            format="json",
        )

        assert response.status_code == 404


class TestWhoMayManageDealerships:
    def test_a_dealer_admin_cannot_create_one(self, client):
        """
        THE PRIVILEGE TEST. Dealerships are the organization's to create and
        people are each dealership's to manage (C3, C23). A dealer admin holds
        every `admin.person.*` permission and none of `admin.dealer.*`.
        """
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        client.force_authenticate(user=add_dealer_admin(result.organization, unit))

        response = client.post(
            LIST_URL.format(slug=result.organization.slug), details(), format="json"
        )

        assert response.status_code == 403
        assert BusinessUnit.objects.filter(name="Chennai - Guindy").count() == 0

    def test_a_dealer_admin_cannot_even_list_them(self, client):
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        client.force_authenticate(user=add_dealer_admin(result.organization, unit))

        response = client.get(LIST_URL.format(slug=result.organization.slug))

        assert response.status_code == 403

    def test_a_dealer_admin_cannot_edit_one(self, client):
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        client.force_authenticate(user=add_dealer_admin(result.organization, unit))

        response = client.put(
            DETAIL_URL.format(slug=result.organization.slug, id=unit.id),
            details(),
            format="json",
        )

        assert response.status_code == 403
        unit.refresh_from_db()
        assert unit.name == "Whitefield"


class TestStatusIsNotWritable:
    def test_closing_a_dealership_is_not_possible_through_the_payload(self, client):
        """
        C52: close and reopen do not exist until Q21 says what they do. The
        payload must therefore ignore `status` rather than accept it --- an
        endpoint that quietly wrote the column would answer Q21 by default,
        which is exactly what C52 declined to do.

        This fails the day somebody adds `status` to `DealerDetailsSerializer`,
        which is the intent: it should be a decision, not a field.
        """
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        client.force_authenticate(user=result.user)

        response = client.put(
            DETAIL_URL.format(slug=result.organization.slug, id=unit.id),
            details(name="Whitefield", status=UnitStatus.DISABLED),
            format="json",
        )

        assert response.status_code == 200
        unit.refresh_from_db()
        assert unit.status == UnitStatus.ACTIVE

    def test_there_is_no_close_endpoint(self, client):
        result = found()
        unit = BusinessUnit.objects.create(organization=result.organization, name="Whitefield")
        client.force_authenticate(user=result.user)

        response = client.post(
            f"/api/v1/orgs/{result.organization.slug}/admin/dealers/{unit.id}/close/"
        )

        assert response.status_code == 404
