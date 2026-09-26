"""
URLs for Sales.

Mounted by the DMS product router under the org-scoped prefix, so the full
path is /api/v1/orgs/<org_slug>/dms/sales/... --- the org slug travels in the
path, not in the token (C2).
"""

from django.urls import path

from .views import EnquiryListCreateView

app_name = "dms_sales"

urlpatterns = [
    path("enquiries/", EnquiryListCreateView.as_view(), name="enquiry-list-create"),
]
