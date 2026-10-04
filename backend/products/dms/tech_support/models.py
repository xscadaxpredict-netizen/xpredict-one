"""
Tech Support models: UserManual, MachineVideo, CallRequest.

UserManual and MachineVideo inherit ``BaseModel`` (org-level, no unit_id)
because they are admin-uploaded content visible to ALL dealers within an
organisation (schema review #04).

CallRequest inherits ``UnitScopedModel`` because it is dealer-specific.
"""

from __future__ import annotations

from django.db import models

from shared.base_models import BaseModel, UnitScopedModel


# ============================================================================
# UserManual
# ============================================================================

class UserManual(BaseModel):
    """
    A user manual document uploaded by an admin.

    Frontend ref: UserManual interface — title, category, fileName,
    fileSize, description.  UploadManualDialog — title, category, file.
    """

    title = models.CharField(max_length=255)
    category = models.CharField(max_length=100, blank=True, default="")
    description = models.TextField(blank=True, default="")
    file = models.FileField(upload_to="tech_support/manuals/")
    file_name = models.CharField(max_length=255, blank=True, default="")
    file_size = models.CharField(max_length=50, blank=True, default="")

    class Meta:
        indexes = [
            models.Index(fields=["category"]),
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self) -> str:
        return self.title


# ============================================================================
# MachineVideo
# ============================================================================

class MachineVideo(BaseModel):
    """
    A machine video uploaded by an admin.

    Frontend ref: MachineVideo interface — title, duration, resolution,
    fileName, category, description.  UploadVideoDialog — title, category,
    file.
    """

    title = models.CharField(max_length=255)
    category = models.CharField(max_length=100, blank=True, default="")
    description = models.TextField(blank=True, default="")
    file = models.FileField(upload_to="tech_support/videos/")
    file_name = models.CharField(max_length=255, blank=True, default="")
    duration = models.CharField(max_length=20, blank=True, default="")
    resolution = models.CharField(max_length=20, blank=True, default="")

    class Meta:
        indexes = [
            models.Index(fields=["category"]),
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self) -> str:
        return self.title


# ============================================================================
# CallRequest
# ============================================================================

class CallStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    COMPLETED = "COMPLETED", "Completed"
    CANCELLED = "CANCELLED", "Cancelled"


class CallRequest(UnitScopedModel):
    """
    A request for a tech support call from a dealer or technician.

    Frontend ref: RequestCall interface — name, phone, email, subject,
    message, date, status.  CallRequestDialog — name, phone, email,
    subject, message.
    """

    # The platform user who submitted the request.
    requester_user_id = models.UUIDField(null=True, blank=True)

    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    subject = models.CharField(max_length=500)
    message = models.TextField()

    status = models.CharField(
        max_length=15,
        choices=CallStatus.choices,
        default=CallStatus.PENDING,
    )

    class Meta:
        indexes = [
            models.Index(fields=["unit_id", "status"]),
            models.Index(fields=["unit_id", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"Call Request: {self.subject[:50]}"
