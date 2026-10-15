"""
Write logic for E-commerce.
"""

from __future__ import annotations

import random
import uuid
from decimal import Decimal
from typing import Any

from django.db import transaction

from products.dms.sales.models import ConfirmedSite, ProductCatalog

from .exceptions import not_found
from .models import EcommerceOrder, EcommerceOrderItem, OrderStatus


@transaction.atomic
def place_order(
    *,
    unit_id: uuid.UUID,
    site_id: uuid.UUID,
    items: list[dict[str, Any]],
    **kwargs
) -> EcommerceOrder:
    site = ConfirmedSite.objects.filter(id=site_id).first()
    if not site:
        raise not_found("Site")

    # NOT A SECRET, so S311 does not apply: this is a human-facing
    # reference number, not a token.
    #
    # THE REAL PROBLEM WITH THIS LINE is that 9,000 possible values
    # collide long before they run out -- a 50% chance of a duplicate
    # after a few dozen records -- and the column has no uniqueness
    # constraint. Reference numbering is Q31, still open.
    order_number = f"PO/{random.randint(1000, 9999)}"  # noqa: S311

    order = EcommerceOrder.objects.create(
        unit_id=unit_id,
        site=site,
        customer=site.customer,
        order_number=order_number,
        site_name=site.site_name or site.customer.name,
        oc_number=site.oc_number,
        status=OrderStatus.PENDING,
        total_amount=Decimal('0.00')
    )

    total = Decimal('0.00')
    for item_data in items:
        product_id = item_data.get("product_id")
        quantity = int(item_data.get("quantity", 1))

        product = ProductCatalog.objects.filter(id=product_id).first()
        if not product:
            continue

        price = product.base_price
        line_total = price * quantity
        total += line_total

        EcommerceOrderItem.objects.create(
            unit_id=unit_id,
            order=order,
            product=product,
            name=product.name,
            price=price,
            quantity=quantity,
        )

    order.total_amount = total
    order.save(update_fields=["total_amount"])

    return order


@transaction.atomic
def update_order_status(
    *,
    order_id: uuid.UUID,
    status: str,
    reject_reason: str = ""
) -> EcommerceOrder:
    order = EcommerceOrder.objects.filter(id=order_id).first()
    if not order:
        raise not_found("Order")

    order.status = status
    if status == OrderStatus.REJECTED:
        order.reject_reason = reject_reason

    order.save(update_fields=["status", "reject_reason"])
    return order
