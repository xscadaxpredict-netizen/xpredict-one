from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from core.api import TenantAPIView
from ..selectors import get_user_manuals, get_machine_videos, get_call_requests
from ..services import (
    create_user_manual, delete_user_manual,
    create_machine_video, delete_machine_video,
    create_call_request, update_call_request_status, delete_call_request
)
from ..models import CallRequest
from .serializers import UserManualSerializer, MachineVideoSerializer, CallRequestSerializer

class UserManualListView(TenantAPIView):
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, org_slug: str):
        manuals = get_user_manuals()
        serializer = UserManualSerializer(manuals, many=True)
        return Response(serializer.data)

    def post(self, request, org_slug: str):
        serializer = UserManualSerializer(data=request.data)
        if serializer.is_valid():
            if "file" not in request.FILES:
                return Response({"detail": "File is required"}, status=status.HTTP_400_BAD_REQUEST)
            
            manual = create_user_manual(
                title=serializer.validated_data["title"],
                category=serializer.validated_data.get("category", ""),
                description=serializer.validated_data.get("description", ""),
                file=request.FILES["file"]
            )
            return Response(UserManualSerializer(manual).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class UserManualDetailView(TenantAPIView):
    def delete(self, request, org_slug: str, pk: str):
        delete_user_manual(pk)
        return Response(status=status.HTTP_204_NO_CONTENT)

class MachineVideoListView(TenantAPIView):
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, org_slug: str):
        videos = get_machine_videos()
        serializer = MachineVideoSerializer(videos, many=True)
        return Response(serializer.data)

    def post(self, request, org_slug: str):
        serializer = MachineVideoSerializer(data=request.data)
        if serializer.is_valid():
            if "file" not in request.FILES:
                return Response({"detail": "File is required"}, status=status.HTTP_400_BAD_REQUEST)
            
            video = create_machine_video(
                title=serializer.validated_data["title"],
                category=serializer.validated_data.get("category", ""),
                description=serializer.validated_data.get("description", ""),
                duration=serializer.validated_data.get("duration", ""),
                resolution=serializer.validated_data.get("resolution", ""),
                file=request.FILES["file"]
            )
            return Response(MachineVideoSerializer(video).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class MachineVideoDetailView(TenantAPIView):
    def delete(self, request, org_slug: str, pk: str):
        delete_machine_video(pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CallRequestListView(TenantAPIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    required_permissions = ["dms.ticket.view"]
    method_permissions = {"POST": ["dms.ticket.create"]}

    def get(self, request, org_slug: str):
        calls = get_call_requests()
        serializer = CallRequestSerializer(calls, many=True)
        return Response(serializer.data)

    def post(self, request, org_slug: str):
        serializer = CallRequestSerializer(data=request.data)
        if serializer.is_valid():
            attachment = request.FILES.get("attachment")
            call = create_call_request(
                unit_id=request.unit_id,
                name=serializer.validated_data["name"],
                phone=serializer.validated_data.get("phone", ""),
                email=serializer.validated_data.get("email", ""),
                subject=serializer.validated_data["subject"],
                message=serializer.validated_data["message"],
                requester_user_id=request.user.id if request.user.is_authenticated else None,
                attachment=attachment
            )
            return Response(CallRequestSerializer(call).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class CallRequestDetailView(TenantAPIView):
    required_permissions = ["dms.ticket.view"]
    method_permissions = {
        "PATCH": ["dms.ticket.update"],
        "DELETE": ["dms.ticket.close"],
    }
    def patch(self, request, org_slug: str, pk: str):
        call = CallRequest.objects.get(id=pk)
        serializer = CallRequestSerializer(call, data=request.data, partial=True)
        if serializer.is_valid():
            validated_data = serializer.validated_data
            if "status" in validated_data and len(validated_data) == 1:
                call = update_call_request_status(pk, validated_data["status"])
            else:
                from ..services import update_call_request
                call = update_call_request(pk, **validated_data)
            return Response(CallRequestSerializer(call).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, org_slug: str, pk: str):
        delete_call_request(pk)
        return Response(status=status.HTTP_204_NO_CONTENT)
