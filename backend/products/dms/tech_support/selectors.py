from __future__ import annotations
from django.db.models import QuerySet
from .models import UserManual, MachineVideo, CallRequest

def get_user_manuals() -> QuerySet[UserManual]:
    return UserManual.objects.all().order_by("-created_at")

def get_machine_videos() -> QuerySet[MachineVideo]:
    return MachineVideo.objects.all().order_by("-created_at")

def get_call_requests() -> QuerySet[CallRequest]:
    return CallRequest.objects.all().order_by("-created_at")
