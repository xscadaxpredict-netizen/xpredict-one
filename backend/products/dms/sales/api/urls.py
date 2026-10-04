"""
URLs for Sales.

Mounted by the DMS product router under the org-scoped prefix, so the full
path is /api/v1/orgs/<org_slug>/dms/sales/... --- the org slug travels in the
path, not in the token (C2).
"""

from django.urls import path

from .views import (
    EnquiryListCreateView,
    EnquiryDetailView,
    EnquiryFollowupCreateView,
    EnquiryQuotationListCreateView,
    EnquiryQuotationDetailView,
    EnquiryConfirmView,
    EnquiryUnconfirmView,
    BankAccountListView,
    ProductPresetListView,
    EnquiryConfirmAmcView,
)

app_name = "dms_sales"

urlpatterns = [
    # Enquiries
    path("enquiries/", EnquiryListCreateView.as_view(), name="enquiry-list-create"),
    path("enquiries/<uuid:pk>/", EnquiryDetailView.as_view(), name="enquiry-detail"),
    path("enquiries/<uuid:pk>/followups/", EnquiryFollowupCreateView.as_view(), name="enquiry-followup-create"),
    path("enquiries/<uuid:pk>/quotations/", EnquiryQuotationListCreateView.as_view(), name="enquiry-quotation-create"),
    path("enquiries/<uuid:pk>/quotations/<uuid:quote_id>/", EnquiryQuotationDetailView.as_view(), name="enquiry-quotation-detail"),
    path("enquiries/<uuid:pk>/confirm/", EnquiryConfirmView.as_view(), name="enquiry-confirm"),
    path("enquiries/<uuid:pk>/quotations/<uuid:quote_id>/confirm-amc/", EnquiryConfirmAmcView.as_view(), name="enquiry-confirm-amc"),
    path("enquiries/<uuid:pk>/unconfirm/", EnquiryUnconfirmView.as_view(), name="enquiry-unconfirm"),
    
    # Static lookups for quotes
    path("banks/", BankAccountListView.as_view(), name="bank-list"),
    path("products/", ProductPresetListView.as_view(), name="product-preset-list"),
]
