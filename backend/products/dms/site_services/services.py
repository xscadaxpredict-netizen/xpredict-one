"""
Write logic for Site Services.
"""

from __future__ import annotations

import base64
import uuid
import random
from typing import Optional
from django.core.files.base import ContentFile
from django.utils import timezone
from django.db import transaction

from products.dms.sales.models import ConfirmedSite
from .models import (
    ServiceSchedule, ServiceReport, ReportAttachment,
    WaterReport, Complaint, SiteServiceProfile,
    ScheduleStatus, ReportStatus, ComplaintStatus
)
from .exceptions import not_found, validation_error


def _decode_base64_signature(b64_string: str, name_prefix: str) -> Optional[ContentFile]:
    """Helper to decode base64 signature strings from SignaturePad into Django ContentFile."""
    if not b64_string or not b64_string.startswith("data:image/"):
        return None
        
    try:
        format_str, img_str = b64_string.split(';base64,')
        ext = format_str.split('/')[-1]
        data = base64.b64decode(img_str)
        return ContentFile(data, name=f"{name_prefix}_{uuid.uuid4().hex[:8]}.{ext}")
    except Exception:
        return None


@transaction.atomic
def update_site_profile(
    *,
    site_id: uuid.UUID,
    unit_id: uuid.UUID,
    **kwargs
) -> SiteServiceProfile:
    site = ConfirmedSite.objects.filter(id=site_id).first()
    if not site:
        raise not_found("Site")

    profile, _ = SiteServiceProfile.objects.get_or_create(
        site=site,
        defaults={"unit_id": unit_id}
    )
    
    for key, value in kwargs.items():
        if hasattr(profile, key):
            setattr(profile, key, value)
            
    profile.save()
    return profile


@transaction.atomic
def create_schedule(
    *,
    unit_id: uuid.UUID,
    site_id: uuid.UUID,
    **kwargs
) -> ServiceSchedule:
    site = ConfirmedSite.objects.filter(id=site_id).first()
    if not site:
        raise not_found("Site")

    # If this schedule creation updates profile fields, extract them
    # but currently we just assume the API sends schedule fields.
    # We will let frontend call update_site_profile separately if needed.
    
    schedule = ServiceSchedule.objects.create(
        unit_id=unit_id,
        site=site,
        **kwargs
    )
    return schedule


@transaction.atomic
def update_schedule(
    *,
    schedule_id: uuid.UUID,
    **kwargs
) -> ServiceSchedule:
    schedule = ServiceSchedule.objects.filter(id=schedule_id).first()
    if not schedule:
        raise not_found("Schedule")

    for key, value in kwargs.items():
        if hasattr(schedule, key):
            setattr(schedule, key, value)
            
    schedule.save()
    return schedule


@transaction.atomic
def delete_schedule(*, schedule_id: uuid.UUID) -> None:
    ServiceSchedule.objects.filter(id=schedule_id).delete()


@transaction.atomic
def create_service_report(
    *,
    unit_id: uuid.UUID,
    site_id: uuid.UUID,
    service_person_signature: Optional[str] = None,
    client_signature: Optional[str] = None,
    files: Optional[list] = None,
    **kwargs
) -> ServiceReport:
    site = ConfirmedSite.objects.filter(id=site_id).first()
    if not site:
        raise not_found("Site")

    report_code = f"SR/{random.randint(1000, 9999)}"

    report = ServiceReport(
        unit_id=unit_id,
        site=site,
        report_code=report_code,
        **kwargs
    )
    
    if service_person_signature:
        f = _decode_base64_signature(service_person_signature, "tech_sig")
        if f:
            report.service_person_signature = f
            
    if client_signature:
        f = _decode_base64_signature(client_signature, "client_sig")
        if f:
            report.client_signature = f
            report.client_signed_at = timezone.now()
            report.status = ReportStatus.COMPLETED
        else:
            report.status = ReportStatus.AWAITING_CLIENT_SIGN
    else:
        report.status = ReportStatus.AWAITING_CLIENT_SIGN

    report.save()

    if files:
        for file in files:
            ReportAttachment.objects.create(
                unit_id=unit_id,
                service_report=report,
                file=file,
                file_name=file.name,
                file_size=file.size,
                file_type=file.content_type
            )
            
    return report


@transaction.atomic
def update_service_report(
    *,
    report_id: uuid.UUID,
    service_person_signature: Optional[str] = None,
    client_signature: Optional[str] = None,
    **kwargs
) -> ServiceReport:
    report = ServiceReport.objects.filter(id=report_id).first()
    if not report:
        raise not_found("Service Report")

    for key, value in kwargs.items():
        if hasattr(report, key):
            setattr(report, key, value)
            
    if service_person_signature:
        f = _decode_base64_signature(service_person_signature, "tech_sig")
        if f:
            report.service_person_signature = f
            
    if client_signature:
        f = _decode_base64_signature(client_signature, "client_sig")
        if f:
            report.client_signature = f
            report.client_signed_at = timezone.now()
            report.status = ReportStatus.COMPLETED
            
    report.save()
    return report


@transaction.atomic
def delete_service_report(*, report_id: uuid.UUID) -> None:
    ServiceReport.objects.filter(id=report_id).delete()


@transaction.atomic
def create_water_report(
    *,
    unit_id: uuid.UUID,
    site_id: uuid.UUID,
    attachment=None,
    **kwargs
) -> WaterReport:
    site = ConfirmedSite.objects.filter(id=site_id).first()
    if not site:
        raise not_found("Site")

    report = WaterReport(
        unit_id=unit_id,
        site=site,
        **kwargs
    )
    if attachment:
        report.attachment = attachment
    report.save()
    return report


@transaction.atomic
def update_water_report(
    *,
    report_id: uuid.UUID,
    attachment=None,
    **kwargs
) -> WaterReport:
    report = WaterReport.objects.filter(id=report_id).first()
    if not report:
        raise not_found("Water Report")

    for key, value in kwargs.items():
        if hasattr(report, key):
            setattr(report, key, value)
            
    if attachment:
        report.attachment = attachment
    report.save()
    return report


@transaction.atomic
def delete_water_report(*, report_id: uuid.UUID) -> None:
    WaterReport.objects.filter(id=report_id).delete()


@transaction.atomic
def create_complaint(
    *,
    unit_id: uuid.UUID,
    site_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    attachment=None,
    **kwargs
) -> Complaint:
    site = ConfirmedSite.objects.filter(id=site_id).first()
    if not site:
        raise not_found("Site")

    complaint = Complaint(
        unit_id=unit_id,
        site=site,
        complainant_user_id=actor_user_id,
        **kwargs
    )
    if attachment:
        complaint.attachment = attachment
    complaint.save()
    return complaint


@transaction.atomic
def update_complaint(
    *,
    complaint_id: uuid.UUID,
    **kwargs
) -> Complaint:
    complaint = Complaint.objects.filter(id=complaint_id).first()
    if not complaint:
        raise not_found("Complaint")

    if kwargs.get("status") == ComplaintStatus.RESOLVED and complaint.status != ComplaintStatus.RESOLVED:
        complaint.resolved_at = timezone.now()

    for key, value in kwargs.items():
        if hasattr(complaint, key):
            setattr(complaint, key, value)
            
    complaint.save()
    return complaint


@transaction.atomic
def delete_complaint(*, complaint_id: uuid.UUID) -> None:
    Complaint.objects.filter(id=complaint_id).delete()
