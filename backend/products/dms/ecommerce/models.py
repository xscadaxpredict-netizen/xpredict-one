"""
Ecommerce models: EcommerceOrder, EcommerceOrderItem.

These represent purchase orders placed by a dealer from the spares catalog
against a confirmed site.  All inherit ``UnitScopedModel``.
"""

from __future__ import annotations

from django.db import models
from django.db.models import F, Value

from shared.base_models import UnitScopedModel


# ============================================================================
# EcommerceOrder
# ============================================================================

class OrderStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    DELIVERED = "DELIVERED", "Delivered"


class EcommerceOrder(UnitScopedModel):
    """
    A spares purchase order placed against a confirmed site.

    Frontend ref: PurchaseOrder interface — siteName, ocNumber, date,
    items, total, status, rejectReason.
    """

    site = models.ForeignKey(
        "dms_sales.ConfirmedSite",
        on_delete=models.CASCADE,
        related_name="ecommerce_orders",
    )
    customer = models.ForeignKey(
        "dms_sales.Customer",
        on_delete=models.PROTECT,
        related_name="ecommerce_orders",
        null=True,
        blank=True,
    )

    order_number = models.CharField(max_length=50, blank=True, default="")

    # Snapshot of site details at order time.
    site_name = models.CharField(max_length=255, blank=True, default="")
    oc_number = models.CharField(max_length=50, blank=True, default="")

    status = models.CharField(
        max_length=15,
        choices=OrderStatus.choices,
        default=OrderStatus.PENDING,
    )
    reject_reason = models.TextField(blank=True, default="")
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    placed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["unit_id", "status"]),
            models.Index(fields=["unit_id", "-placed_at"]),
            models.Index(fields=["unit_id", "site_id"]),
        ]

    def __str__(self) -> str:
        return f"Order {self.order_number} — {self.site_name}"


# ============================================================================
# EcommerceOrderItem
# ============================================================================

class EcommerceOrderItem(UnitScopedModel):
    """
    A line item in a spares purchase order.

    Frontend ref: OrderItem interface — name, qty, price.
    """

    order = models.ForeignKey(
        EcommerceOrder,
        on_delete=models.CASCADE,
        related_name="items",
    )
    # Nullable FK to catalog for traceability.
    product = models.ForeignKey(
        "dms_sales.ProductCatalog",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ecommerce_order_items",
    )

    # Snapshot fields.
    name = models.CharField(max_length=500)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    quantity = models.PositiveIntegerField(default=1)

    # Generated column: total = price * quantity.
    line_total = models.GeneratedField(
        expression=F("price") * F("quantity"),
        output_field=models.DecimalField(max_digits=14, decimal_places=2),
        db_persist=True,
    )

    class Meta:
        indexes = [
            models.Index(fields=["unit_id", "order_id"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} x{self.quantity}"
