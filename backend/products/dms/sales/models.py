"""
What exists in Sales. Structure only --- no behaviour that changes state.

`Enquiry` below is a minimal worked example showing the conventions. Replace
its fields with the real ones; keep the shape.

Conventions this file demonstrates:

- Inherit `UnitScopedModel` for anything a dealer owns. It supplies `unit_id`
  and a default manager that filters by the caller's dealer, so a query for
  another dealer's row returns nothing --- which is what turns into 404, not 403.
- Inherit `BaseModel` instead for records that belong to the organization as a
  whole rather than to one dealer.
- Reference control-plane rows (users, business units) by **plain UUID**, never
  a ForeignKey: they live in a different database and the router refuses
  cross-database relations.
- ForeignKeys *within* the same tenant database are fine --- but only to models
  this product owns. Never to another product's models.
- Model methods may compute and validate. They must not create, update or
  delete other modules' data --- that belongs in services.py.
"""

from __future__ import annotations

from django.db import models

from shared.base_models import UnitScopedModel


class Enquiry(UnitScopedModel):
    """
    A sales enquiry belonging to one dealer.

    Illustrative --- replace the fields with the real ones.
    """

    class Status(models.TextChoices):
        NEW = "new", "New"
        CONTACTED = "contacted", "Contacted"
        QUOTED = "quoted", "Quoted"
        WON = "won", "Won"
        LOST = "lost", "Lost"

    class Source(models.TextChoices):
        WALK_IN = "walk_in", "Walk-in"
        CALL = "call", "Call"
        WEB = "web", "Web"

    reference = models.CharField(max_length=32, unique=True)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.NEW, db_index=True
    )
    source = models.CharField(max_length=16, choices=Source.choices)

    customer_name = models.CharField(max_length=200)
    customer_phone = models.CharField(max_length=32, blank=True)
    customer_email = models.EmailField(blank=True)

    # Control-plane reference: the User lives in the control database, so this
    # is a UUID and not a ForeignKey. Resolve it through core.accounts when a
    # name is needed for display.
    assigned_to_user_id = models.UUIDField(null=True, blank=True, db_index=True)

    notes = models.TextField(blank=True)

    class Meta:
        verbose_name_plural = "enquiries"
        ordering = ["-created_at"]
        indexes = [
            # unit_id leads every index: every scoped query filters on it first.
            models.Index(fields=["unit_id", "status"]),
            models.Index(fields=["unit_id", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.reference} --- {self.customer_name}"

    @property
    def is_open(self) -> bool:
        return self.status not in {self.Status.WON, self.Status.LOST}
