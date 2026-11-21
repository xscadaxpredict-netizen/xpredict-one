
from typing import ClassVar

from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from core.api import TenantAPIView
from core.organizations.selectors import dms_people_for_unit, permissions_for

from .. import selectors, services
from ..models import ServiceReport
from .serializers import (
    ComplaintReadSerializer,
    ComplaintStatusSerializer,
    ScheduleCreateUpdateSerializer,
    ScheduleReadSerializer,
    ServiceReportReadSerializer,
    SiteProfileUpdateSerializer,
    SiteReadSerializer,
    UnitPersonSerializer,
    VisitCancelSerializer,
    VisitRescheduleSerializer,
    WaterReportReadSerializer,
)

#: Holding either of these means managing visits: seeing every visit in the
#: units one can see, and assigning them. Anyone else sees only the visits
#: assigned to them. Which roles grant these is set in Administration.
VISIT_MANAGER_PERMISSIONS = frozenset({"dms.appointment.create", "dms.appointment.update"})


def manages_visits(view: TenantAPIView) -> bool:
    if view.membership.role in ("owner", "admin"):
        return True
    return bool(permissions_for(view.membership) & VISIT_MANAGER_PERMISSIONS)


#: Holding this means managing complaints: assigning them and seeing all.
#: Everybody else sees the ones assigned to them or raised by them.
COMPLAINT_MANAGER_PERMISSION = "dms.ticket.assign"


def manages_complaints(view: TenantAPIView) -> bool:
    if view.membership.role in ("owner", "admin"):
        return True
    return COMPLAINT_MANAGER_PERMISSION in permissions_for(view.membership)


def _kept_attachment_ids(request: Request) -> list[str] | None:
    """
    Every kept attachment id, or None if the form sent no list at all.

    `request.data.dict()` keeps only the LAST value of a repeated key, so an
    edit with several attachments used to delete all but one of them.
    """
    if hasattr(request.data, "getlist"):
        if "kept_attachment_ids" not in request.data:
            return None
        return [v for v in request.data.getlist("kept_attachment_ids") if v]
    value = request.data.get("kept_attachment_ids")
    if value is None:
        return None
    return value if isinstance(value, list) else [value]


class SiteListView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = ["dms.jobcard.view"]

    def get(self, request: Request, org_slug: str) -> Response:
        sites = selectors.list_sites()
        return Response(SiteReadSerializer(sites, many=True).data)


class SiteProfileUpdateView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = ["dms.jobcard.update"]

    def patch(self, request: Request, org_slug: str, pk: str) -> Response:
        payload = SiteProfileUpdateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        services.update_site_profile(
            site_id=pk,
            unit_id=request.unit_id,
            **payload.validated_data
        )
        site = selectors.get_site(site_id=pk)
        return Response(SiteReadSerializer(site).data)


class SitePeopleView(TenantAPIView):
    """Who can be assigned work on this site: its own unit's active DMS people."""

    # Visits and complaints both assign people from here.
    required_permissions: ClassVar[list[str]] = []  # see required_any_permission
    required_any_permission: ClassVar[list[str]] = ["dms.appointment.view", "dms.ticket.view"]

    def get(self, request: Request, org_slug: str, pk: str) -> Response:
        site = selectors.get_site(site_id=pk)
        people = dms_people_for_unit(organization=self.organization, unit_id=site.unit_id)
        return Response(UnitPersonSerializer(people, many=True).data)


class ScheduleListCreateView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = ["dms.appointment.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {"POST": ["dms.appointment.create"]}

    def get(self, request: Request, org_slug: str) -> Response:
        # MANAGERS SEE EVERY VISIT, everybody else only their own.
        schedules = selectors.list_schedules(
            site_id=request.query_params.get("site_id"),
            technician_user_id=None if manages_visits(self) else request.user.id,
        )
        return Response(ScheduleReadSerializer(schedules, many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        payload = ScheduleCreateUpdateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        schedule = services.create_schedule(
            organization=self.organization,
            actor_user_id=request.user.id,
            **payload.validated_data,
        )
        return Response(ScheduleReadSerializer(schedule).data, status=status.HTTP_201_CREATED)


class ScheduleDetailView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = ["dms.appointment.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {
        "PATCH": ["dms.appointment.update"],
        "DELETE": ["dms.appointment.cancel"],
    }

    def patch(self, request: Request, org_slug: str, pk: str) -> Response:
        payload = ScheduleCreateUpdateSerializer(data=request.data, partial=True)
        payload.is_valid(raise_exception=True)
        data = {k: v for k, v in payload.validated_data.items() if k != "site_id"}
        schedule = services.update_schedule(
            organization=self.organization,
            schedule_id=pk,
            actor_user_id=request.user.id,
            **data,
        )
        return Response(ScheduleReadSerializer(schedule).data)

    def delete(self, request: Request, org_slug: str, pk: str) -> Response:
        # `?confirm=true` says the user has seen what depends on this visit.
        services.delete_schedule(
            schedule_id=pk, confirmed=request.query_params.get("confirm") == "true"
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class VisitRescheduleView(TenantAPIView):
    """Put a cancelled visit back on the schedule, on a new date."""

    required_permissions: ClassVar[list[str]] = ["dms.appointment.update"]

    def post(self, request: Request, org_slug: str, pk: str) -> Response:
        payload = VisitRescheduleSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        schedule = services.reschedule_visit(
            organization=self.organization,
            schedule_id=pk,
            actor_user_id=request.user.id,
            **payload.validated_data,
        )
        return Response(ScheduleReadSerializer(schedule).data)


class VisitCancelView(TenantAPIView):
    required_permissions: ClassVar[list[str]] = ["dms.appointment.cancel"]

    def post(self, request: Request, org_slug: str, pk: str) -> Response:
        payload = VisitCancelSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        schedule = services.cancel_visit(
            schedule_id=pk, reason=payload.validated_data["reason"], actor_user_id=request.user.id
        )
        return Response(ScheduleReadSerializer(schedule).data)


class ScheduleDependenciesView(TenantAPIView):
    """What deleting a visit would affect, for the confirmation dialog."""

    required_permissions: ClassVar[list[str]] = ["dms.appointment.view"]

    def get(self, request: Request, org_slug: str, pk: str) -> Response:
        return Response(services.schedule_dependencies(schedule_id=pk))


class ServiceReportListCreateView(TenantAPIView):
    parser_classes: ClassVar[list] = [MultiPartParser, FormParser, JSONParser]
    required_permissions: ClassVar[list[str]] = ["dms.jobcard.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {"POST": ["dms.jobcard.create"]}

    def get(self, request: Request, org_slug: str) -> Response:
        site_id = request.query_params.get("site_id")
        reports = selectors.list_service_reports(site_id=site_id)
        return Response(ServiceReportReadSerializer(reports, many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        data = request.data.dict() if hasattr(request.data, "dict") else request.data.copy()
        files = request.FILES.getlist("attachments")
        data.pop("attachments", None)
        report = services.create_service_report(
            unit_id=request.unit_id,
            files=files,
            **data
        )
        report_fetched = selectors.get_service_report(report_id=report.id)
        return Response(
            ServiceReportReadSerializer(report_fetched).data,
            status=status.HTTP_201_CREATED,
        )


class ServiceReportDetailView(TenantAPIView):
    parser_classes: ClassVar[list] = [MultiPartParser, FormParser, JSONParser]
    required_permissions: ClassVar[list[str]] = ["dms.jobcard.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {
        "PATCH": ["dms.jobcard.update"],
        "DELETE": ["dms.jobcard.close"],
    }

    def patch(self, request: Request, org_slug: str, pk: str) -> Response:
        data = request.data.dict() if hasattr(request.data, "dict") else request.data.copy()
        files = request.FILES.getlist("attachments")
        data.pop("attachments", None)
        data.pop("kept_attachment_ids", None)
        kept = _kept_attachment_ids(request)
        if kept is not None:
            data["kept_attachment_ids"] = kept
        report = services.update_service_report(
            report_id=pk,
            files=files,
            **data
        )
        report_fetched = selectors.get_service_report(report_id=report.id)
        return Response(ServiceReportReadSerializer(report_fetched).data)

    def delete(self, request: Request, org_slug: str, pk: str) -> Response:
        services.delete_service_report(report_id=pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class WaterReportListCreateView(TenantAPIView):
    parser_classes: ClassVar[list] = [MultiPartParser, FormParser, JSONParser]
    required_permissions: ClassVar[list[str]] = ["dms.jobcard.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {"POST": ["dms.jobcard.create"]}

    def get(self, request: Request, org_slug: str) -> Response:
        site_id = request.query_params.get("site_id")
        reports = selectors.list_water_reports(site_id=site_id)
        return Response(WaterReportReadSerializer(reports, many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        data = request.data.dict() if hasattr(request.data, "dict") else request.data.copy()
        attachment = request.FILES.get("attachment")
        files = request.FILES.getlist("attachments")
        data.pop("attachment", None)
        data.pop("attachments", None)
        data.pop("zonePincode", None)
        data.pop("attachedItems", None)
        data.pop("attachmentName", None)
        site_id = data.pop("site_id", None)

        report = services.create_water_report(
            unit_id=request.unit_id,
            site_id=site_id,
            attachment=attachment,
            files=files,
            **data
        )
        return Response(WaterReportReadSerializer(report).data, status=status.HTTP_201_CREATED)


class WaterReportDetailView(TenantAPIView):
    parser_classes: ClassVar[list] = [MultiPartParser, FormParser, JSONParser]
    required_permissions: ClassVar[list[str]] = ["dms.jobcard.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {
        "PATCH": ["dms.jobcard.update"],
        "DELETE": ["dms.jobcard.close"],
    }

    def patch(self, request: Request, org_slug: str, pk: str) -> Response:
        data = request.data.dict() if hasattr(request.data, "dict") else request.data.copy()
        attachment = request.FILES.get("attachment")
        files = request.FILES.getlist("attachments")
        data.pop("attachment", None)
        data.pop("attachments", None)
        data.pop("zonePincode", None)
        data.pop("attachedItems", None)
        data.pop("attachmentName", None)
        data.pop("site_id", None)
        data.pop("kept_attachment_ids", None)
        kept = _kept_attachment_ids(request)
        if kept is not None:
            data["kept_attachment_ids"] = kept

        report = services.update_water_report(
            report_id=pk,
            attachment=attachment,
            files=files,
            **data
        )
        return Response(WaterReportReadSerializer(report).data)

    def delete(self, request: Request, org_slug: str, pk: str) -> Response:
        services.delete_water_report(report_id=pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


def _complaint_payload(request: Request) -> dict:
    """The writable fields of a complaint form, by name -- nothing else gets through."""
    data = request.data
    out: dict = {}
    for key in ("description", "priority"):
        if key in data:
            out[key] = data.get(key)
    if "assigned_user_id" in data:
        out["assigned_user_id"] = data.get("assigned_user_id") or None
    return out


class ComplaintListCreateView(TenantAPIView):
    parser_classes: ClassVar[list] = [MultiPartParser, FormParser, JSONParser]
    required_permissions: ClassVar[list[str]] = ["dms.ticket.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {"POST": ["dms.ticket.create"]}

    def get(self, request: Request, org_slug: str) -> Response:
        complaints = selectors.list_complaints(
            site_id=request.query_params.get("site_id"),
            only_for_user_id=None if manages_complaints(self) else request.user.id,
        )
        return Response(ComplaintReadSerializer(complaints, many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        payload = _complaint_payload(request)
        complaint = services.create_complaint(
            organization=self.organization,
            site_id=request.data.get("site_id"),
            actor_user_id=request.user.id,
            can_manage=manages_complaints(self),
            attachment=request.FILES.get("attachment"),
            files=request.FILES.getlist("attachments"),
            **payload,
        )
        return Response(ComplaintReadSerializer(complaint).data, status=status.HTTP_201_CREATED)


class ComplaintDetailView(TenantAPIView):
    parser_classes: ClassVar[list] = [MultiPartParser, FormParser, JSONParser]
    required_permissions: ClassVar[list[str]] = ["dms.ticket.view"]
    method_permissions: ClassVar[dict[str, list[str]]] = {
        "PATCH": ["dms.ticket.update"],
        "DELETE": ["dms.ticket.close"],
    }

    def patch(self, request: Request, org_slug: str, pk: str) -> Response:
        complaint = services.update_complaint(
            organization=self.organization,
            complaint_id=pk,
            actor_user_id=request.user.id,
            can_manage=manages_complaints(self),
            attachment=request.FILES.get("attachment"),
            files=request.FILES.getlist("attachments"),
            kept_attachment_ids=_kept_attachment_ids(request),
            clear_attachment=request.data.get("clear_attachment") == "true",
            **_complaint_payload(request),
        )
        return Response(ComplaintReadSerializer(complaint).data)

    def delete(self, request: Request, org_slug: str, pk: str) -> Response:
        services.delete_complaint(complaint_id=pk)
        return Response(status=status.HTTP_204_NO_CONTENT)

class ComplaintStatusView(TenantAPIView):
    """Start work, resolve (with what was done), close, or reopen a complaint."""

    required_permissions: ClassVar[list[str]] = ["dms.ticket.view"]

    def post(self, request: Request, org_slug: str, pk: str) -> Response:
        payload = ComplaintStatusSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        complaint = services.set_complaint_status(
            complaint_id=pk,
            status=payload.validated_data["status"],
            notes=payload.validated_data.get("notes", ""),
            actor_user_id=request.user.id,
            can_manage=manages_complaints(self),
        )
        return Response(ComplaintReadSerializer(complaint).data)


class PublicServiceReportView(APIView):
    authentication_classes: ClassVar[list] = []
    permission_classes: ClassVar[list] = []

    def get(self, request: Request, org_slug: str, token: str) -> Response:
        report = ServiceReport.objects.filter(sign_link_token=token).first()
        if not report:
            from .exceptions import not_found
            raise not_found("Report")

        if report.client_signature:
            return Response(
                {
                    "detail": "This report has already been signed and is locked.",
                    "already_signed": True,
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        return Response(ServiceReportReadSerializer(report, context={"request": request}).data)

class PublicServiceReportSignView(APIView):
    authentication_classes: ClassVar[list] = []
    permission_classes: ClassVar[list] = []

    def post(self, request: Request, org_slug: str, token: str) -> Response:
        report = ServiceReport.objects.filter(sign_link_token=token).first()
        if not report:
            from .exceptions import not_found
            raise not_found("Report")

        if report.client_signature:
            return Response(
                {"detail": "This report has already been signed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        signature = request.data.get("signature")
        client_name = request.data.get("client_name")
        if not signature or not client_name:
            return Response(
                {"detail": "Signature and name are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        import base64
        import uuid

        from django.core.files.base import ContentFile

        try:
            format, imgstr = signature.split(';base64,')
            ext = format.split('/')[-1]
            data = ContentFile(base64.b64decode(imgstr), name=f"{uuid.uuid4().hex}.{ext}")
        except Exception:
            return Response(
                {"detail": "Invalid signature format."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Through the service, so signing here completes the visit too.
        services.record_client_signature(
            report=report, signature_file=data, client_name=client_name
        )

        return Response({"detail": "Signature saved successfully"})
