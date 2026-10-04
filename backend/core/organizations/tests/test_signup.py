"""
Founding an organization: `sign_up()`, and the rules the database enforces.

These run against a database the test run builds and throws away, with every
migration applied -- so the nine roles `sign_up()` looks up were written by
`0002_seed_catalogue`, not by a fixture standing in for it.

THE CONSTRAINT TESTS AT THE BOTTOM ARE BEHAVIOURAL ON PURPOSE. The merge that
landed these tables verified the constraints existed by reading
`information_schema`, which proves they are declared and not that they bite.
MySQL silently ignored `CHECK` before 8.0.16, so "declared" and "enforced" are
genuinely different claims. These insert the forbidden row and require the
database to refuse it.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from core.accounts.models import User
from core.billing.models import AppSubscription, SubscriptionStatus
from core.organizations.exceptions import (
    ActivationCodeExpiredError,
    ActivationCodeInvalidError,
    ActivationCodeSpentError,
    EmailAlreadyRegisteredError,
    OrganizationNameUnusableError,
)
from core.organizations.models import (
    ActivationCode,
    BusinessUnit,
    Membership,
    MembershipRole,
    MembershipStatus,
    Organization,
)
from core.organizations.services import sign_up
from core.permissions.models import AppAccess, AppCode, Role

# NOT `transaction=True`. That flag gives each test TransactionTestCase
# semantics, which TRUNCATES every table afterwards --- including the rows
# `0002_seed_catalogue` wrote, so the nine roles vanish after the first test and
# `sign_up()` cannot find the one it seeds the owner with. The IntegrityError
# cases below do not need it either: the test is already inside a transaction,
# so an inner `atomic()` is a savepoint, and catching the error rolls back to it.
pytestmark = pytest.mark.django_db


def make_code(value: str = "XPRD-TEST-0001", **kwargs) -> ActivationCode:
    return ActivationCode.objects.create(code=value, **kwargs)


def do_sign_up(code: str = "XPRD-TEST-0001", **overrides):
    kwargs = {
        "activation_code": code,
        "organization_name": "Acme Motors",
        "email": "rahul@acmemotors.in",
        "password": "correct horse battery staple",
        "first_name": "Rahul",
        "last_name": "Kandaswamy",
    }
    kwargs.update(overrides)
    return sign_up(**kwargs)


class TestSignupCreatesTheOrganization:
    def test_creates_account_organization_and_owner_membership(self):
        make_code()

        result = do_sign_up()

        assert User.objects.count() == 1
        assert Organization.objects.count() == 1
        assert Membership.objects.count() == 1

        assert result.user.email == "rahul@acmemotors.in"
        assert result.organization.name == "Acme Motors"
        assert result.membership.role == MembershipRole.OWNER
        assert result.membership.status == MembershipStatus.ACTIVE

    def test_the_owner_is_organization_wide_and_marked(self):
        """
        `unit` NULL because an owner is not scoped to one dealership (C40), and
        `owner_marker` True because that is how "exactly one owner" is
        expressed on MySQL, which has no partial unique indexes (C39).
        """
        make_code()

        result = do_sign_up()

        assert result.membership.unit_id is None
        assert result.membership.owner_marker is True

    def test_the_slug_and_database_name_are_derived(self):
        make_code()

        organization = do_sign_up().organization

        assert organization.slug == "acme-motors"
        assert organization.db_name == "xpredict_acme_motors"

    def test_the_database_name_keeps_the_granted_prefix(self):
        """
        The dev grant is on `xpredict\\_%`. A database named anything else
        cannot be created by the application at all, so the prefix is a
        privilege boundary rather than a naming preference.
        """
        make_code()

        assert do_sign_up().organization.db_name.startswith("xpredict_")

    def test_a_second_organization_of_the_same_name_gets_a_suffix(self):
        """
        Two real companies may share a name. Telling the second one to pick a
        different one is absurd, so the slug is suffixed instead.
        """
        make_code("CODE-ONE")
        make_code("CODE-TWO")

        first = do_sign_up("CODE-ONE").organization
        second = do_sign_up("CODE-TWO", email="other@example.com").organization

        assert first.slug == "acme-motors"
        assert second.slug == "acme-motors-2"
        assert first.db_name != second.db_name


class TestWhatTheOwnerIsGiven:
    def test_dms_is_subscribed_and_granted_at_group_operations(self):
        """
        C41: the owner holds apps through `AppAccess` like anyone else, seeded
        at the top organization-level role, which for DMS is Group operations.
        Not Fleet viewer -- that one reads and changes nothing.
        """
        make_code()

        membership = do_sign_up().membership

        access = AppAccess.objects.get(membership=membership, app=AppCode.DMS)
        assert access.role.code == "dms.group_operations"
        assert access.role.level == "org"

    def test_subscription_and_grant_are_two_separate_rows(self):
        """
        C16. One says the organization pays, the other says this person may
        open it. Collapsing them loses the difference between an app shown
        disabled and an app hidden entirely.
        """
        make_code()

        organization = do_sign_up().organization

        assert AppSubscription.objects.filter(
            organization=organization, app=AppCode.DMS, status=SubscriptionStatus.ACTIVE
        ).exists()
        assert AppAccess.objects.filter(app=AppCode.DMS).exists()

    def test_only_dms_is_bought(self):
        """
        DMS is the product being built. CRM and E-commerce are committed (C4)
        and do not exist, so a new organization is not sold them.
        """
        make_code()

        organization = do_sign_up().organization

        assert list(
            AppSubscription.objects.filter(organization=organization).values_list("app", flat=True)
        ) == [AppCode.DMS]

    def test_administration_is_never_subscribed_or_granted(self):
        """
        It comes with the platform and is gated by standing (C40). Asking for
        it is a programming error, not a sale.
        """
        make_code()

        with pytest.raises(ValueError, match="not subscribable"):
            do_sign_up(subscribed_apps=(AppCode.ADMIN,))

    def test_an_app_with_no_seed_role_is_refused_rather_than_half_sold(self):
        """
        E-commerce is deferred and has no roles at all (Q15). Subscribing it
        would create a membership that cannot open the app it was just sold.
        """
        make_code()

        with pytest.raises(ValueError, match="owner seed role"):
            do_sign_up(subscribed_apps=(AppCode.ECOMMERCE,))


class TestTheActivationCode:
    def test_it_is_spent_and_linked_to_what_it_founded(self):
        code = make_code()

        organization = do_sign_up().organization

        code.refresh_from_db()
        assert code.spent_at is not None
        assert code.organization_id == organization.id

    def test_an_unknown_code_is_refused(self):
        with pytest.raises(ActivationCodeInvalidError):
            do_sign_up("NOT-A-REAL-CODE")

    def test_a_spent_code_says_so_rather_than_saying_invalid(self):
        """
        C14 distinguishes these deliberately. Login is vague because an
        attacker is guessing; this code was handed to this customer, and
        "invalid" when it means "already used" is a support call.
        """
        make_code()
        do_sign_up()

        with pytest.raises(ActivationCodeSpentError):
            do_sign_up(email="second@example.com")

    def test_an_expired_code_is_refused(self):
        make_code(expires_at=timezone.now() - timedelta(days=1))

        with pytest.raises(ActivationCodeExpiredError):
            do_sign_up()

    def test_a_code_with_no_expiry_still_works(self):
        """
        `expires_at` is nullable so that NULL means "no expiry" and Q20 can
        pick a policy later without a migration.
        """
        make_code(expires_at=None)

        assert do_sign_up().organization.pk is not None

    def test_a_failed_signup_does_not_burn_the_code(self):
        """
        The expensive mistake. A code consumed by a signup that then failed is
        a customer holding a worthless licence and a support call nobody can
        fix without a database edit.
        """
        code = make_code()
        User.objects.create_user(email="taken@example.com", password="x")

        with pytest.raises(EmailAlreadyRegisteredError):
            do_sign_up(email="taken@example.com")

        code.refresh_from_db()
        assert code.spent_at is None
        assert code.organization_id is None


class TestSignupIsAllOrNothing:
    def test_a_failure_part_way_through_leaves_nothing_behind(self):
        """
        One transaction (CLAUDE.md). A partial signup leaves either a spent
        code with no organization, or an organization nobody can sign in to.

        The failure is forced at the LAST step --- granting an app with no seed
        role --- so the user, the organization and the membership have all been
        written by the time it raises. If the transaction were not doing its
        job, they would survive.
        """
        code = make_code()

        with pytest.raises(ValueError):
            do_sign_up(subscribed_apps=(AppCode.ECOMMERCE,))

        assert User.objects.count() == 0
        assert Organization.objects.count() == 0
        assert Membership.objects.count() == 0
        code.refresh_from_db()
        assert code.spent_at is None


class TestNamesThatCannotBeUsed:
    def test_a_name_that_slugifies_to_nothing_is_refused(self):
        make_code()

        with pytest.raises(OrganizationNameUnusableError):
            do_sign_up(organization_name="!!! ???")

    def test_a_name_too_long_for_a_mysql_identifier_is_refused_on_write(self):
        """
        MySQL caps an identifier at 64 characters (C46). Caught here, with a
        message about the name, rather than at provisioning time -- where it
        would surface as a Celery task failing minutes after the customer
        finished, with the code already spent.
        """
        make_code()

        with pytest.raises(OrganizationNameUnusableError):
            do_sign_up(organization_name="A" * 70)

    def test_an_existing_email_is_refused_rather_than_joined(self):
        """
        Signup is unauthenticated. Attaching a new organization to an existing
        account would let anybody holding a valid code found an organization in
        somebody else's name -- they would gain no access, but the real owner
        would find out by surprise. C27's "same account, second organization"
        case is a signed-in flow instead.
        """
        make_code()
        User.objects.create_user(email="rahul@acmemotors.in", password="x")

        with pytest.raises(EmailAlreadyRegisteredError):
            do_sign_up()


class TestTheDatabaseRefusesWhatC40Forbids:
    """
    The constraints, proved by insertion rather than by reading the schema.

    Reading `information_schema` says a constraint is declared. These say it
    bites -- which on MySQL is a different claim, because every version before
    8.0.16 parsed `CHECK` and then ignored it.

    EACH ONE MATCHES THE CONSTRAINT NAME, and that is not decoration. A bare
    `pytest.raises(IntegrityError)` passes for ANY integrity error --- a typo in
    a field name, a missing NOT NULL, a duplicate on an unrelated unique index
    --- so it would stay green with the constraint under test deleted. That is
    this project's most frequent bug shape, found seven times already; naming
    the constraint is what makes these tests able to fail at all.
    """

    def test_a_second_owner_in_one_organization_is_refused(self):
        make_code()
        result = do_sign_up()
        other = User.objects.create_user(email="second@example.com", password="x")

        with (
            pytest.raises(IntegrityError, match="membership_one_owner_per_org"),
            transaction.atomic(),
        ):
            Membership.objects.create(
                user=other,
                organization=result.organization,
                role=MembershipRole.OWNER,
                owner_marker=True,
            )

    def test_admin_standing_cannot_be_scoped_to_a_dealership(self):
        """
        C40: an administrator of the ORGANIZATION is not scoped to one
        dealership. Somebody who administers a single dealership holds the DMS
        System administrator role and keeps `member` standing.

        This is the row the frontend's Northway fake described for three
        sessions, and the database now refuses it outright.
        """
        make_code()
        result = do_sign_up()
        unit = BusinessUnit.objects.create(
            organization=result.organization, name="Bangalore - Whitefield"
        )
        other = User.objects.create_user(email="dealeradmin@example.com", password="x")

        with (
            pytest.raises(IntegrityError, match="membership_org_standing_has_no_unit"),
            transaction.atomic(),
        ):
            Membership.objects.create(
                user=other,
                organization=result.organization,
                role=MembershipRole.ADMIN,
                unit=unit,
            )

    def test_a_dealer_scoped_member_is_allowed(self):
        """The other half: `member` plus a dealership is the normal case."""
        make_code()
        result = do_sign_up()
        unit = BusinessUnit.objects.create(
            organization=result.organization, name="Bangalore - Whitefield"
        )
        other = User.objects.create_user(email="salesrep@example.com", password="x")

        membership = Membership.objects.create(
            user=other,
            organization=result.organization,
            role=MembershipRole.MEMBER,
            unit=unit,
        )

        assert membership.unit_id == unit.id
        assert membership.owner_marker is None

    def test_administration_cannot_be_granted_as_app_access(self):
        """C44 moved this rule into the database rather than an enum omission."""
        make_code()
        result = do_sign_up()

        with (
            pytest.raises(IntegrityError, match="appaccess_never_administration"),
            transaction.atomic(),
        ):
            AppAccess.objects.create(
                membership=result.membership,
                app=AppCode.ADMIN,
                role=Role.objects.get(app=AppCode.DMS, code="dms.group_operations"),
            )
