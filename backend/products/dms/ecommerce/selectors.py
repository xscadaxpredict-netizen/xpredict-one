"""
Read logic for E-commerce.
"""

from __future__ import annotations

import uuid

from django.db.models import QuerySet

from products.dms.sales.models import ProductCatalog

from .exceptions import not_found
from .models import EcommerceOrder


def list_spares_catalog() -> QuerySet[ProductCatalog]:
    """
    Return products that belong in the spares catalog --- those with a
    specific product_type or category.
    """
    return ProductCatalog.objects.filter(is_active=True, product_type="SPARES").order_by("name")


def get_spare(product_id: uuid.UUID) -> ProductCatalog:
    product = ProductCatalog.objects.filter(id=product_id).first()
    if not product:
        raise not_found("Spare Product")
    return product


def list_orders(site_id: uuid.UUID | None = None) -> QuerySet[EcommerceOrder]:
    qs = EcommerceOrder.objects.prefetch_related("items").order_by("-placed_at")
    if site_id:
        qs = qs.filter(site_id=site_id)
    return qs


def get_order(order_id: uuid.UUID) -> EcommerceOrder:
    order = EcommerceOrder.objects.filter(id=order_id).prefetch_related("items").first()
    if not order:
        raise not_found("Ecommerce Order")
    return order
