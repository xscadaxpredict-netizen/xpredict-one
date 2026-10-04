"""
Read logic for E-commerce.
"""

from __future__ import annotations

import uuid
from typing import Optional
from django.db.models import QuerySet

from products.dms.sales.models import ProductCatalog
from .models import EcommerceOrder, EcommerceOrderItem
from .exceptions import not_found


def list_spares_catalog() -> QuerySet[ProductCatalog]:
    """Return products that belong in the spares catalog (e.g. have a specific product_type or category)"""
    return ProductCatalog.objects.filter(is_active=True).order_by("name")


def get_spare(product_id: uuid.UUID) -> ProductCatalog:
    product = ProductCatalog.objects.filter(id=product_id).first()
    if not product:
        raise not_found("Spare Product")
    return product


def list_orders(site_id: Optional[uuid.UUID] = None) -> QuerySet[EcommerceOrder]:
    qs = EcommerceOrder.objects.prefetch_related("items").order_by("-placed_at")
    if site_id:
        qs = qs.filter(site_id=site_id)
    return qs


def get_order(order_id: uuid.UUID) -> EcommerceOrder:
    order = EcommerceOrder.objects.filter(id=order_id).prefetch_related("items").first()
    if not order:
        raise not_found("Ecommerce Order")
    return order
