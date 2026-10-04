from django.urls import path

from .views import (
    CatalogListView,
    OrderListCreateView,
    OrderDetailView,
    OrderStatusUpdateView,
)

app_name = "dms_ecommerce"

urlpatterns = [
    # Catalog
    path("catalog/", CatalogListView.as_view(), name="catalog-list"),
    
    # Orders
    path("orders/", OrderListCreateView.as_view(), name="order-list-create"),
    path("orders/<uuid:pk>/", OrderDetailView.as_view(), name="order-detail"),
    path("orders/<uuid:pk>/status/", OrderStatusUpdateView.as_view(), name="order-status-update"),
]
