from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .. import selectors, services
from .serializers import (
    SpareProductSerializer,
    OrderReadSerializer,
    OrderCreateSerializer,
    OrderStatusUpdateSerializer,
)


class CatalogListView(APIView):
    def get(self, request: Request, org_slug: str) -> Response:
        products = selectors.list_spares_catalog()
        return Response(SpareProductSerializer(products, many=True).data)


class OrderListCreateView(APIView):
    def get(self, request: Request, org_slug: str) -> Response:
        site_id = request.query_params.get("site_id")
        orders = selectors.list_orders(site_id=site_id)
        return Response(OrderReadSerializer(orders, many=True).data)

    def post(self, request: Request, org_slug: str) -> Response:
        payload = OrderCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        order = services.place_order(
            unit_id=request.membership.unit_id,
            **payload.validated_data
        )
        order_fetched = selectors.get_order(order_id=order.id)
        return Response(OrderReadSerializer(order_fetched).data, status=status.HTTP_201_CREATED)


class OrderDetailView(APIView):
    def get(self, request: Request, org_slug: str, pk: str) -> Response:
        order = selectors.get_order(order_id=pk)
        return Response(OrderReadSerializer(order).data)


class OrderStatusUpdateView(APIView):
    def patch(self, request: Request, org_slug: str, pk: str) -> Response:
        payload = OrderStatusUpdateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        order = services.update_order_status(
            order_id=pk,
            **payload.validated_data
        )
        order_fetched = selectors.get_order(order_id=order.id)
        return Response(OrderReadSerializer(order_fetched).data)
