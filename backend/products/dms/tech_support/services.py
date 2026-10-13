from __future__ import annotations
from typing import Any
from django.core.files.uploadedfile import UploadedFile
from .models import UserManual, MachineVideo, CallRequest, CallStatus

def create_user_manual(*, title: str, category: str = "", description: str = "", file: UploadedFile) -> UserManual:
    manual = UserManual(
        title=title,
        category=category,
        description=description,
        file=file,
        file_name=file.name,
        file_size=f"{file.size / (1024 * 1024):.2f} MB"
    )
    manual.save()
    return manual

def delete_user_manual(manual_id: str) -> None:
    UserManual.objects.filter(id=manual_id).delete()

def create_machine_video(*, title: str, category: str = "", description: str = "", file: UploadedFile, duration: str = "", resolution: str = "") -> MachineVideo:
    video = MachineVideo(
        title=title,
        category=category,
        description=description,
        file=file,
        file_name=file.name,
        duration=duration,
        resolution=resolution
    )
    video.save()
    return video

def delete_machine_video(video_id: str) -> None:
    MachineVideo.objects.filter(id=video_id).delete()

def create_call_request(*, unit_id: str, name: str, phone: str = "", email: str = "", subject: str, message: str, requester_user_id: str | None = None, attachment: UploadedFile | None = None) -> CallRequest:
    call = CallRequest(
        unit_id=unit_id,
        name=name,
        phone=phone,
        email=email,
        subject=subject,
        message=message,
        requester_user_id=requester_user_id,
        attachment=attachment,
        attachment_name=attachment.name if attachment else ""
    )
    call.save()
    return call

def update_call_request_status(call_id: str, status: CallStatus) -> CallRequest:
    call = CallRequest.objects.get(id=call_id)
    call.status = status
    call.save(update_fields=["status"])
    return call

def update_call_request(call_id: str, **kwargs) -> CallRequest:
    call = CallRequest.objects.get(id=call_id)
    update_fields = []
    for key, value in kwargs.items():
        setattr(call, key, value)
        update_fields.append(key)
    if update_fields:
        call.save(update_fields=update_fields)
    return call

def delete_call_request(call_id: str) -> None:
    CallRequest.objects.filter(id=call_id).delete()
