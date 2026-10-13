from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from core.api import TenantAPIView
from ..models import ServiceReport
import json

from .. import selectors, services
from .serializers import (
    SiteReadSerializer, SiteProfileUpdateSerializer,
    ScheduleReadSerializer, ScheduleCreateUpdateSerializer,
    ServiceReportReadSerializer,
    WaterReportReadSerializer,
    ComplaintReadSerializer
)


class SiteListView(TenantAPIView):
    def get(self, request: Request, org_slug: str) -> Response:
        sites = selectors.list_sites()
        return Response(SiteReadSerializer(sites, many=True).data)


class SiteProfileUpdateView(TenantAPIView):
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


class ScheduleListCreateView(TenantAPIView):
    def get(self, request: Request, org_slug: str) -> Response:
        site_id = request.query_params.get("site_id")
        schedules = selectors.list_schedules(site_id=site_id)
        return Response(ScheduleReadSerializer(schedules, many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        payload = ScheduleCreateUpdateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        schedule = services.create_schedule(
            unit_id=request.unit_id,
            **payload.validated_data
        )
        return Response(ScheduleReadSerializer(schedule).data, status=status.HTTP_201_CREATED)


class ScheduleDetailView(TenantAPIView):
    def patch(self, request: Request, org_slug: str, pk: str) -> Response:
        payload = ScheduleCreateUpdateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        schedule = services.update_schedule(
            schedule_id=pk,
            **payload.validated_data
        )
        return Response(ScheduleReadSerializer(schedule).data)

    def delete(self, request: Request, org_slug: str, pk: str) -> Response:
        services.delete_schedule(schedule_id=pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ServiceReportListCreateView(TenantAPIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

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
        return Response(ServiceReportReadSerializer(report_fetched).data, status=status.HTTP_201_CREATED)


class ServiceReportDetailView(TenantAPIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def patch(self, request: Request, org_slug: str, pk: str) -> Response:
        data = request.data.dict() if hasattr(request.data, "dict") else request.data.copy()
        files = request.FILES.getlist("attachments")
        data.pop("attachments", None)
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
    parser_classes = [MultiPartParser, FormParser, JSONParser]

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
    parser_classes = [MultiPartParser, FormParser, JSONParser]

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


class ComplaintListCreateView(TenantAPIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request: Request, org_slug: str) -> Response:
        site_id = request.query_params.get("site_id")
        complaints = selectors.list_complaints(site_id=site_id)
        return Response(ComplaintReadSerializer(complaints, many=True).data)

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
        
        complaint = services.create_complaint(
            unit_id=request.unit_id,
            site_id=site_id,
            actor_user_id=request.user.id if request.user and hasattr(request.user, "id") else None,
            attachment=attachment,
            files=files,
            **data
        )
        return Response(ComplaintReadSerializer(complaint).data, status=status.HTTP_201_CREATED)


class ComplaintDetailView(TenantAPIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

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
        
        complaint = services.update_complaint(
            complaint_id=pk,
            attachment=attachment,
            files=files,
            **data
        )
        return Response(ComplaintReadSerializer(complaint).data)

    def delete(self, request: Request, org_slug: str, pk: str) -> Response:
        services.delete_complaint(complaint_id=pk)
        return Response(status=status.HTTP_204_NO_CONTENT)

class PublicServiceReportView(APIView):
    authentication_classes = []
    permission_classes = []
    
    def get(self, request: Request, org_slug: str, token: str) -> Response:
        report = ServiceReport.objects.filter(sign_link_token=token).first()
        if not report:
            from .exceptions import not_found
            raise not_found("Report")
            
        if report.client_signature:
            return Response({"detail": "This report has already been signed and is locked.", "already_signed": True}, status=status.HTTP_403_FORBIDDEN)
        
        return Response(ServiceReportReadSerializer(report, context={"request": request}).data)

class PublicServiceReportSignView(APIView):
    authentication_classes = []
    permission_classes = []
    
    def post(self, request: Request, org_slug: str, token: str) -> Response:
        report = ServiceReport.objects.filter(sign_link_token=token).first()
        if not report:
            from .exceptions import not_found
            raise not_found("Report")
            
        if report.client_signature:
            return Response({"detail": "This report has already been signed."}, status=status.HTTP_400_BAD_REQUEST)

        signature = request.data.get("signature")
        client_name = request.data.get("client_name")
        if not signature or not client_name:
            return Response({"detail": "Signature and name are required."}, status=status.HTTP_400_BAD_REQUEST)
            
        from django.core.files.base import ContentFile
        import base64
        import uuid
        from django.utils import timezone
        
        try:
            format, imgstr = signature.split(';base64,') 
            ext = format.split('/')[-1] 
            data = ContentFile(base64.b64decode(imgstr), name=f"{uuid.uuid4().hex}.{ext}")
        except Exception:
            return Response({"detail": "Invalid signature format."}, status=status.HTTP_400_BAD_REQUEST)
        
        report.client_signature = data
        report.client_name = client_name
        report.client_signed_at = timezone.now()
        report.status = "COMPLETED"
        report.sign_link_token = uuid.uuid4()
        report.save(update_fields=["client_signature", "client_name", "client_signed_at", "status", "sign_link_token"])
        
        return Response({"detail": "Signature saved successfully"})
