"""
Serializers for E-commerce.
"""

from rest_framework import serializers
from products.dms.sales.models import ProductCatalog
from ..models import EcommerceOrder, EcommerceOrderItem


class SpareProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductCatalog
        fields = [
            "id",
            "name",
            "description",
            "price",
            "category",
            "part_number",
            "hsn_code",
        ]


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = EcommerceOrderItem
        fields = [
            "id",
            "product_id",
            "name",
            "price",
            "quantity",
            "line_total",
        ]


class OrderReadSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    date = serializers.DateTimeField(source="placed_at")

    class Meta:
        model = EcommerceOrder
        fields = [
            "id",
            "site_id",
            "order_number",
            "site_name",
            "oc_number",
            "status",
            "reject_reason",
            "total_amount",
            "date",
            "items",
        ]


class OrderItemCreateSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)


class OrderCreateSerializer(serializers.Serializer):
    site_id = serializers.UUIDField()
    items = OrderItemCreateSerializer(many=True)


class OrderStatusUpdateSerializer(serializers.Serializer):
    status = serializers.CharField(max_length=20)
    reject_reason = serializers.CharField(required=False, allow_blank=True)
