from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
import json

from .. import selectors, services
from .serializers import (
    SiteReadSerializer, SiteProfileUpdateSerializer,
    ScheduleReadSerializer, ScheduleCreateUpdateSerializer,
    ServiceReportReadSerializer,
    WaterReportReadSerializer,
    ComplaintReadSerializer
)


class SiteListView(APIView):
    def get(self, request: Request, org_slug: str) -> Response:
        sites = selectors.list_sites()
        return Response(SiteReadSerializer(sites, many=True).data)


class SiteProfileUpdateView(APIView):
    def patch(self, request: Request, org_slug: str, pk: str) -> Response:
        payload = SiteProfileUpdateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        services.update_site_profile(
            site_id=pk,
            unit_id=request.membership.unit_id,
            **payload.validated_data
        )
        site = selectors.get_site(site_id=pk)
        return Response(SiteReadSerializer(site).data)


class ScheduleListCreateView(APIView):
    def get(self, request: Request, org_slug: str) -> Response:
        site_id = request.query_params.get("site_id")
        schedules = selectors.list_schedules(site_id=site_id)
        return Response(ScheduleReadSerializer(schedules, many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        payload = ScheduleCreateUpdateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        schedule = services.create_schedule(
            unit_id=request.membership.unit_id,
            **payload.validated_data
        )
        return Response(ScheduleReadSerializer(schedule).data, status=status.HTTP_201_CREATED)


class ScheduleDetailView(APIView):
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


class ServiceReportListCreateView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request: Request, org_slug: str) -> Response:
        site_id = request.query_params.get("site_id")
        reports = selectors.list_service_reports(site_id=site_id)
        return Response(ServiceReportReadSerializer(reports, many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        data = request.data.dict() if hasattr(request.data, "dict") else request.data
        files = request.FILES.getlist("attachments")
        report = services.create_service_report(
            unit_id=request.membership.unit_id,
            files=files,
            **data
        )
        report_fetched = selectors.get_service_report(report_id=report.id)
        return Response(ServiceReportReadSerializer(report_fetched).data, status=status.HTTP_201_CREATED)


class ServiceReportDetailView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def patch(self, request: Request, org_slug: str, pk: str) -> Response:
        data = request.data.dict() if hasattr(request.data, "dict") else request.data
        report = services.update_service_report(
            report_id=pk,
            **data
        )
        report_fetched = selectors.get_service_report(report_id=report.id)
        return Response(ServiceReportReadSerializer(report_fetched).data)

    def delete(self, request: Request, org_slug: str, pk: str) -> Response:
        services.delete_service_report(report_id=pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class WaterReportListCreateView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request: Request, org_slug: str) -> Response:
        site_id = request.query_params.get("site_id")
        reports = selectors.list_water_reports(site_id=site_id)
        return Response(WaterReportReadSerializer(reports, many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        data = request.data.dict() if hasattr(request.data, "dict") else request.data
        attachment = request.FILES.get("attachment")
        
        report = services.create_water_report(
            unit_id=request.membership.unit_id,
            attachment=attachment,
            **data
        )
        return Response(WaterReportReadSerializer(report).data, status=status.HTTP_201_CREATED)


class WaterReportDetailView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def patch(self, request: Request, org_slug: str, pk: str) -> Response:
        data = request.data.dict() if hasattr(request.data, "dict") else request.data
        attachment = request.FILES.get("attachment")
        
        report = services.update_water_report(
            report_id=pk,
            attachment=attachment,
            **data
        )
        return Response(WaterReportReadSerializer(report).data)

    def delete(self, request: Request, org_slug: str, pk: str) -> Response:
        services.delete_water_report(report_id=pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ComplaintListCreateView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request: Request, org_slug: str) -> Response:
        site_id = request.query_params.get("site_id")
        complaints = selectors.list_complaints(site_id=site_id)
        return Response(ComplaintReadSerializer(complaints, many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        data = request.data.dict() if hasattr(request.data, "dict") else request.data
        attachment = request.FILES.get("attachment")
        
        complaint = services.create_complaint(
            unit_id=request.membership.unit_id,
            actor_user_id=request.user.id,
            attachment=attachment,
            **data
        )
        return Response(ComplaintReadSerializer(complaint).data, status=status.HTTP_201_CREATED)


class ComplaintDetailView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def patch(self, request: Request, org_slug: str, pk: str) -> Response:
        data = request.data.dict() if hasattr(request.data, "dict") else request.data
        
        complaint = services.update_complaint(
            complaint_id=pk,
            **data
        )
        return Response(ComplaintReadSerializer(complaint).data)

    def delete(self, request: Request, org_slug: str, pk: str) -> Response:
        services.delete_complaint(complaint_id=pk)
        return Response(status=status.HTTP_204_NO_CONTENT)
