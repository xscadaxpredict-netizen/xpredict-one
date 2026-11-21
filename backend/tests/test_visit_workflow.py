"""
The visit workflow (C-local-5): who can be assigned, who sees which visits,
and how a visit moves -- its service report, then the client's signature.

Each rule here was missing before: technicians were typed names, nothing
ever completed a visit, and a report was never tied to the visit it was for.
"""

from __future__ import annotations

import datetime
import uuid
from decimal import Decimal

import pytest
from django.core.files.base import ContentFile
from django.db import models

from config.routers import current_tenant_db
from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.organizations import services as org_services
from core.organizations.models import (
    Membership,
    MembershipRole,
    MembershipStatus,
    Organization,
    OrganizationStatus,
)
from core.organizations.selectors import dms_people_for_unit
from core.permissions.models import AppAccess, AppCode, Role
from products.dms.sales.models import ConfirmedSite, Customer, Enquiry, Quotation
from products.dms.site_services import selectors, services
from products.dms.site_services.models import ServiceReport, SiteServiceProfile
from shared.exceptions import AuthorizationError, ConflictError, InvalidInputError

pytestmark = pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS])


def _make(model, **values):
    """A row with every required field the test does not care about filled in."""
    for field in model._meta.concrete_fields:
        if field.primary_key or field.name in values or field.attname in values:
            continue
        if field.null or field.has_default() or getattr(field, "auto_now_add", False):
            continue
        if isinstance(field, models.DateField):
            values[field.name] = datetime.date(2026, 11, 1)
        elif isinstance(field, models.DecimalField):
            values[field.name] = Decimal("0")
        elif isinstance(field, (models.IntegerField, models.FloatField)):
            values[field.name] = 0
        elif isinstance(field, models.BooleanField):
            values[field.name] = False
        elif isinstance(field, models.UUIDField):
            values[field.name] = uuid.uuid4()
        elif isinstance(field, models.CharField) and field.choices:
            values[field.name] = field.choices[0][0]
        else:
            values[field.name] = "x"
    return model.objects.create(**values)


@pytest.fixture
def world():
    org = Organization.objects.create(
        name="Visit Org",
        slug="visit-org",
        db_name=TEST_TENANT_ALIAS,
        db_host="127.0.0.1",
        db_port=3306,
        status=OrganizationStatus.ACTIVE,
    )
    head_office = org_services.head_office_for(org)
    dealer_a = org_services.create_dealer(organization=org, name="Dealer A")
    dealer_b = org_services.create_dealer(organization=org, name="Dealer B")
    role = Role.objects.filter(app=AppCode.DMS).first()

    def person(email, unit, *, dms=True):
        user = User.objects.create_user(
            email=email, password="x-Strong-pass-1", first_name=email[:4]
        )
        membership = Membership.objects.create(
            user=user,
            organization=org,
            unit=unit,
            role=MembershipRole.MEMBER,
            status=MembershipStatus.ACTIVE,
        )
        if dms:
            AppAccess.objects.create(membership=membership, app=AppCode.DMS, role=role)
        return user

    people = {
        "tech_a": person("ravi@a.test", dealer_a),
        "tech_a2": person("kiru@a.test", dealer_a),
        "tech_b": person("sure@b.test", dealer_b),
        "hq": person("asha@hq.test", None),
        "no_dms": person("nodm@a.test", dealer_a, dms=False),
    }

    token = current_tenant_db.set(TEST_TENANT_ALIAS)
    customer = _make(Customer, unit_id=dealer_a.id, name="Dell technologies")
    enquiry = _make(Enquiry, unit_id=dealer_a.id, customer=customer, status="CONFIRMED")
    site = _make(
        ConfirmedSite, unit_id=dealer_a.id, enquiry=enquiry, customer=customer, is_active=True
    )
    _make(
        Quotation,
        unit_id=dealer_a.id,
        enquiry=enquiry,
        site=site,
        quote_type="AMC",
        status="CONFIRMED",
    )
    yield {"org": org, "head_office": head_office, "dealer_a": dealer_a, "site": site, **people}
    current_tenant_db.reset(token)


def _visit(w, **extra):
    return services.create_schedule(
        organization=w["org"],
        site_id=w["site"].id,
        actor_user_id=w["hq"].id,
        scheduled_date=datetime.date(2026, 11, 20),
        **extra,
    )


def _report(w, visit, **extra):
    return services.create_service_report(
        unit_id=w["head_office"].id,
        site_id=w["site"].id,
        schedule_id=str(visit.id),
        service_date=datetime.date(2026, 11, 20),
        service_person_name="Ravi",
        **extra,
    )


def test_assignable_people_are_the_sites_own_unit_with_dms_access(world):
    org, dealer_a, head_office = world["org"], world["dealer_a"], world["head_office"]
    dealer_people = {p.user_id for p in dms_people_for_unit(organization=org, unit_id=dealer_a.id)}
    org_people = {p.user_id for p in dms_people_for_unit(organization=org, unit_id=head_office.id)}
    assert dealer_people == {world["tech_a"].id, world["tech_a2"].id}
    assert org_people == {world["hq"].id}


@pytest.mark.parametrize("who", ["tech_b", "hq", "no_dms"])
def test_a_visit_refuses_anybody_outside_the_sites_unit(world, who):
    with pytest.raises(InvalidInputError):
        _visit(world, technician_user_id=world[who].id)


def test_a_visit_belongs_to_the_sites_unit_and_stores_the_person(world):
    visit = _visit(world, technician_user_id=world["tech_a"].id)
    assert visit.unit_id == world["dealer_a"].id
    assert visit.technician_user_id == world["tech_a"].id
    assert visit.assigned_at is not None


def test_a_patch_cannot_set_the_status(world):
    visit = _visit(world)
    services.update_schedule(
        organization=world["org"],
        schedule_id=visit.id,
        actor_user_id=world["hq"].id,
        status="COMPLETED",
    )
    visit.refresh_from_db()
    assert visit.status == "SCHEDULED"


def test_a_technician_sees_only_their_own_visits(world):
    mine = _visit(world, technician_user_id=world["tech_a"].id)
    _visit(world, technician_user_id=world["tech_a2"].id)
    assert list(selectors.list_schedules(technician_user_id=world["tech_a"].id)) == [mine]
    assert selectors.list_schedules().count() == 2


def test_the_clients_signature_completes_the_visit(world):
    visit = _visit(world, technician_user_id=world["tech_a"].id)
    report = _report(world, visit)
    visit.refresh_from_db()
    assert (report.unit_id, report.technician_user_id) == (world["dealer_a"].id, world["tech_a"].id)
    assert visit.status == "IN_PROGRESS"

    services.record_client_signature(
        report=ServiceReport.objects.get(id=report.id),
        signature_file=ContentFile(b"png", name="sig.png"),
        client_name="Satya",
    )
    visit.refresh_from_db()
    assert visit.status == "COMPLETED" and visit.completed_at is not None
    profile = SiteServiceProfile.objects.get(site=world["site"])
    assert profile.last_serviced_date == datetime.date(2026, 11, 20)


def test_one_report_per_visit(world):
    visit = _visit(world)
    _report(world, visit)
    with pytest.raises(ConflictError) as err:
        _report(world, visit)
    assert err.value.code == "visit_has_report"


def test_deleting_the_report_reopens_the_visit(world):
    visit = _visit(world)
    report = _report(world, visit, client_signature="data:image/png;base64,iVBORw0KGgo=")
    visit.refresh_from_db()
    assert visit.status == "COMPLETED"
    services.delete_service_report(report_id=report.id)
    visit.refresh_from_db()
    assert visit.status == "SCHEDULED" and visit.completed_at is None


def test_closed_visits_cannot_be_changed(world):
    visit = _visit(world)
    services.cancel_visit(schedule_id=visit.id, reason="Site closed", actor_user_id=world["hq"].id)
    for action in (
        lambda: services.update_schedule(
            organization=world["org"], schedule_id=visit.id, actor_user_id=world["hq"].id, notes="x"
        ),
        lambda: _report(world, visit),
        lambda: services.cancel_visit(
            schedule_id=visit.id, reason="again", actor_user_id=world["hq"].id
        ),
    ):
        with pytest.raises(ConflictError):
            action()


def test_cancelling_needs_a_reason(world):
    visit = _visit(world)
    with pytest.raises(InvalidInputError):
        services.cancel_visit(schedule_id=visit.id, reason="  ", actor_user_id=world["hq"].id)


# ---- Complaints: the same rules -------------------------------------------


def _complaint(w, *, by="hq", manager=True, **extra):
    return services.create_complaint(
        organization=w["org"],
        site_id=w["site"].id,
        actor_user_id=w[by].id,
        can_manage=manager,
        description="Pump leaking",
        **extra,
    )


def test_a_complaint_belongs_to_the_site_and_assigns_a_real_person(world):
    complaint = _complaint(world, assigned_user_id=world["tech_a"].id)
    assert complaint.unit_id == world["dealer_a"].id
    assert complaint.assigned_service_person_user_id == world["tech_a"].id
    with pytest.raises(InvalidInputError):
        services.update_complaint(
            organization=world["org"],
            complaint_id=complaint.id,
            actor_user_id=world["hq"].id,
            can_manage=True,
            assigned_user_id=world["tech_b"].id,
        )


def test_only_a_manager_chooses_who_handles_a_complaint(world):
    with pytest.raises(AuthorizationError):
        _complaint(world, by="tech_a2", manager=False, assigned_user_id=world["tech_a"].id)


def test_a_non_manager_sees_complaints_assigned_to_them_or_raised_by_them(world):
    assigned = _complaint(world, assigned_user_id=world["tech_a"].id)
    raised = _complaint(world, by="tech_a2", manager=False)
    seen = set(selectors.list_complaints(only_for_user_id=world["tech_a"].id))
    assert seen == {assigned}
    assert set(selectors.list_complaints(only_for_user_id=world["tech_a2"].id)) == {raised}


def test_the_assignee_resolves_with_a_note_and_a_manager_closes(world):
    complaint = _complaint(world, assigned_user_id=world["tech_a"].id)
    with pytest.raises(AuthorizationError):
        services.set_complaint_status(
            complaint_id=complaint.id,
            status="RESOLVED",
            notes="x",
            actor_user_id=world["tech_a2"].id,
            can_manage=False,
        )
    with pytest.raises(InvalidInputError):
        services.set_complaint_status(
            complaint_id=complaint.id,
            status="RESOLVED",
            notes=" ",
            actor_user_id=world["tech_a"].id,
            can_manage=False,
        )
    resolved = services.set_complaint_status(
        complaint_id=complaint.id,
        status="RESOLVED",
        notes="Replaced the seal",
        actor_user_id=world["tech_a"].id,
        can_manage=False,
    )
    assert resolved.resolved_by_user_id == world["tech_a"].id
    assert resolved.resolution_notes == "Replaced the seal"
    with pytest.raises(AuthorizationError):
        services.set_complaint_status(
            complaint_id=complaint.id,
            status="CLOSED",
            actor_user_id=world["tech_a"].id,
            can_manage=False,
        )
    closed = services.set_complaint_status(
        complaint_id=complaint.id, status="CLOSED", actor_user_id=world["hq"].id, can_manage=True
    )
    assert closed.status == "CLOSED"


def test_an_edit_cannot_set_a_complaints_status(world):
    complaint = _complaint(world)
    services.update_complaint(
        organization=world["org"],
        complaint_id=complaint.id,
        actor_user_id=world["hq"].id,
        can_manage=True,
        status="CLOSED",
        description="Pump leaking badly",
    )
    complaint.refresh_from_db()
    assert complaint.status == "OPEN"
    assert complaint.description == "Pump leaking badly"


# ---- Rescheduling a cancelled visit, in place ------------------------------


def test_a_cancelled_visit_is_rescheduled_in_place_and_keeps_its_history(world):
    visit = _visit(world, technician_user_id=world["tech_a"].id)
    services.cancel_visit(schedule_id=visit.id, reason="Diwali", actor_user_id=world["hq"].id)
    visit = services.reschedule_visit(
        organization=world["org"],
        schedule_id=visit.id,
        scheduled_date=datetime.date(2026, 11, 25),
        actor_user_id=world["hq"].id,
    )
    assert visit.status == "SCHEDULED"
    assert visit.scheduled_date == datetime.date(2026, 11, 25)
    assert visit.technician_user_id == world["tech_a"].id
    assert [h["event"] for h in visit.history] == ["cancelled", "rescheduled"]
    assert visit.history[0]["reason"] == "Diwali"
    assert (visit.history[1]["from_date"], visit.history[1]["to_date"]) == (
        "2026-11-20",
        "2026-11-25",
    )


def test_only_a_cancelled_visit_is_rescheduled(world):
    visit = _visit(world)
    with pytest.raises(ConflictError) as err:
        services.reschedule_visit(
            organization=world["org"],
            schedule_id=visit.id,
            scheduled_date=datetime.date(2026, 11, 25),
            actor_user_id=world["hq"].id,
        )
    assert err.value.code == "not_cancelled"


def test_a_visit_with_a_report_cannot_be_cancelled(world):
    visit = _visit(world)
    _report(world, visit)
    with pytest.raises(ConflictError) as err:
        services.cancel_visit(schedule_id=visit.id, reason="x", actor_user_id=world["hq"].id)
    assert err.value.code == "visit_has_report"
