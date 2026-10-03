"""
What an organization pays for.

Billing itself is out of the first release (C38) --- there is no Apps & billing
screen, and the module is simply not granted. `AppSubscription` is here anyway
because it is not a billing feature: it is half of the answer to "may I open
this app?", and the app launcher has needed it since the shell was built.
"""

from __future__ import annotations

from django.db import models

from core.permissions.models import AppCode
from shared.base_models import BaseModel


class SubscriptionStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    CANCELLED = "cancelled", "Cancelled"


class AppSubscription(BaseModel):
    """
    One app this organization has bought.

    SUBSCRIBED AND ACCESSIBLE ARE TWO FACTS, deliberately not collapsed into one
    flag (C16). This row says the organization pays for the app;
    `permissions.AppAccess` says a particular person may open it. They fail
    differently and the difference is visible in the product:

      not subscribed  -> the tile is SHOWN, disabled. Nobody can ask for a
                         product they do not know exists, so this one is a sales
                         question.
      not accessible  -> the tile is HIDDEN entirely. Naming a thing in order to
                         say you cannot have it gives away what the hiding was
                         for, so this one is a privacy question.

    A stale grant left on a cancelled subscription must therefore open nothing,
    which is only expressible while these stay two rows in two tables.

    ADMINISTRATION IS NOT SUBSCRIBABLE. It comes with the platform and is gated
    by standing and permissions alone (C40), so `/me` reports it as subscribed
    without reading this table. The check constraint below is what makes that a
    rule rather than a habit — `AppCode` lists Administration now, because
    `admin.*` permissions need an app, so leaving it out of the enum no longer
    does the job.
    """

    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="subscriptions",
    )
    app = models.CharField(max_length=20, choices=AppCode.choices)
    status = models.CharField(
        max_length=20, choices=SubscriptionStatus.choices, default=SubscriptionStatus.ACTIVE
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "app"], name="subscription_unique_org_app"
            ),
            models.CheckConstraint(
                condition=~models.Q(app=AppCode.ADMIN),
                name="subscription_never_administration",
            ),
        ]
        ordering = ["app"]

    def __str__(self) -> str:
        return f"{self.organization_id}: {self.app} ({self.status})"
