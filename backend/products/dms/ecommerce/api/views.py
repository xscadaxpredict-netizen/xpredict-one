from typing import ClassVar

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response

from core.api import TenantAPIView

from .. import selectors, services
from .serializers import (
    OrderCreateSerializer,
    OrderReadSerializer,
    OrderStatusUpdateSerializer,
    SpareProductSerializer,
)


class CatalogListView(TenantAPIView):
    # READING THE STORE NEEDS NOTHING BEYOND MEMBERSHIP. The catalogue is the
    # same list for every dealership and it is what the organisation is
    # entitled to buy -- a sales rep looking up a spare part is the job, not a
    # privilege.
    required_permissions: ClassVar[list[str]] = []

    def get(self, request: Request, org_slug: str) -> Response:
        products = selectors.list_spares_catalog()
        return Response(
            SpareProductSerializer(products, many=True, context={'request': request}).data
        )


class OrderListCreateView(TenantAPIView):
    # Reading your dealership's orders is open; PLACING one commits the
    # dealership to a purchase, so it is a Manager's call. `allowed_units`
    # already confines both to the caller's own dealership.
    required_permissions: ClassVar[list[str]] = []
    method_permissions: ClassVar[dict[str, list[str]]] = {
        "POST": ["dms.store_order.create"]
    }

    def get(self, request: Request, org_slug: str) -> Response:
        site_id = request.query_params.get("site_id")
        orders = selectors.list_orders(site_id=site_id)
        return Response(OrderReadSerializer(orders, many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        payload = OrderCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        order = services.place_order(
            unit_id=request.unit_id,
            **payload.validated_data
        )
        order_fetched = selectors.get_order(order_id=order.id)
        return Response(OrderReadSerializer(order_fetched).data, status=status.HTTP_201_CREATED)


class OrderDetailView(TenantAPIView):
    # Cancelling an order is not the same act as raising one, so it takes the
    # `manage` code rather than `create` -- the rep who placed it cannot
    # unplace it.
    required_permissions: ClassVar[list[str]] = []
    method_permissions: ClassVar[dict[str, list[str]]] = {
        "DELETE": ["dms.store_order.manage"]
    }

    def get(self, request: Request, org_slug: str, pk: str) -> Response:
        order = selectors.get_order(order_id=pk)
        return Response(OrderReadSerializer(order).data)

    def delete(self, request: Request, org_slug: str, pk: str) -> Response:
        order = selectors.get_order(order_id=pk)
        if not order:
            from ..exceptions import not_found
            raise not_found("Order")
        order.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class OrderStatusUpdateView(TenantAPIView):
    # Moving an order along is the same authority as cancelling it: both
    # change a record somebody else is waiting on.
    required_permissions: ClassVar[list[str]] = ["dms.store_order.manage"]

    def patch(self, request: Request, org_slug: str, pk: str) -> Response:
        payload = OrderStatusUpdateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        order = services.update_order_status(
            order_id=pk,
            **payload.validated_data
        )
        order_fetched = selectors.get_order(order_id=order.id)
        return Response(OrderReadSerializer(order_fetched).data)
