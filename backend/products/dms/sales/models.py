"""
Sales models: Customer, BankAccount, Enquiry, Followup,
ProductCatalog, ProductSpec, Quotation, QuotationItem, ConfirmedSite.

Every model that a dealer owns inherits ``UnitScopedModel``, which supplies
``unit_id`` and a default manager that filters by the caller's dealer.

Cross-database references (to users, business units) are **plain UUIDs**,
never a ForeignKey — the router refuses cross-database relations.

Generated columns (Django 5.0+ ``GeneratedField``) are used for computed
monetary totals so that the database, not application code, is the single
source of truth for amounts.  ``db_persist=True`` stores the value on disk
so MySQL can index it.
"""

from __future__ import annotations

import uuid

from django.db import models
from django.db.models import F, Value
from django.db.models.functions import Coalesce

from shared.base_models import BaseModel, UnitScopedModel


# ============================================================================
# Customer
# ============================================================================

class Customer(UnitScopedModel):
    """
    A customer managed by a specific dealership.

    Frontend ref: NewEnquiryDialog (customer_name, contact_person, address,
    pincode, phone).  GST and PAN come from the AddressDetails interface
    used in the quote builder's "To" section.
    """

    name = models.CharField(max_length=255)
    contact_person = models.CharField(max_length=255, blank=True, default="")
    address = models.TextField(blank=True, default="")
    pincode = models.CharField(max_length=10, blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="")
    state = models.CharField(max_length=100, blank=True, default="")
    phone = models.CharField(max_length=20, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    gst = models.CharField(max_length=20, blank=True, default="")
    pan = models.CharField(max_length=15, blank=True, default="")

    class Meta:
        indexes = [
            models.Index(fields=["unit_id", "name"]),
            models.Index(fields=["unit_id", "-created_at"]),
        ]

    def __str__(self) -> str:
        return self.name


# ============================================================================
# BankAccount
# ============================================================================

class BankAccount(UnitScopedModel):
    """
    Dealer's bank account shown on quotation PDFs.

    Frontend ref: BankAccount interface — bank_name, account_no, ifsc_code.
    """

    bank_name = models.CharField(max_length=255)
    account_no = models.CharField(max_length=30)
    ifsc_code = models.CharField(max_length=15)
    branch_name = models.CharField(max_length=255, blank=True, default="")
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        indexes = [
            models.Index(fields=["unit_id", "is_default"]),
        ]

    def __str__(self) -> str:
        return f"{self.bank_name} — {self.account_no}"


# ============================================================================
# Enquiry
# ============================================================================

class EnquiryStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    CONFIRMED = "CONFIRMED", "Confirmed"
    LOST = "LOST", "Lost"


class EnquirySource(models.TextChoices):
    WALK_IN = "WALK_IN", "Walk-In"
    CALL = "CALL", "Call"
    WEB = "WEB", "Web"
    REFERRAL = "REFERRAL", "Referral"
    OTHER = "OTHER", "Other"


class Enquiry(UnitScopedModel):
    """
    A sales enquiry from a prospective or existing customer.

    Frontend ref: Enquiry interface — customer_name, contact_person, address,
    pincode, phone, remarks, status, confirmed_quote_id, oc_number.
    """

    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="enquiries",
        null=True,
        blank=True,
    )

    # Snapshot fields — these are denormalised from the customer so that
    # the enquiry remains readable even if the customer record is edited.
    customer_name = models.CharField(max_length=255)
    contact_person = models.CharField(max_length=255, blank=True, default="")
    address = models.TextField(blank=True, default="")
    pincode = models.CharField(max_length=10, blank=True, default="")
    phone = models.CharField(max_length=20, blank=True, default="")

    # The sales rep who created it — control-plane user UUID.
    assigned_to_user_id = models.UUIDField(null=True, blank=True)

    source = models.CharField(
        max_length=20,
        choices=EnquirySource.choices,
        default=EnquirySource.OTHER,
    )
    status = models.CharField(
        max_length=20,
        choices=EnquiryStatus.choices,
        default=EnquiryStatus.PENDING,
    )
    remarks = models.TextField(blank=True, default="")

    # Set when a quote is confirmed.
    confirmed_quote_id = models.UUIDField(null=True, blank=True)
    # Order Confirmation number — generated when status → CONFIRMED.
    oc_number = models.CharField(max_length=50, blank=True, default="")

    class Meta:
        verbose_name_plural = "enquiries"
        indexes = [
            models.Index(fields=["unit_id", "status"]),
            models.Index(fields=["unit_id", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"Enquiry: {self.customer_name}"


# ============================================================================
# Followup
# ============================================================================

class Followup(UnitScopedModel):
    """
    A follow-up entry on an enquiry.

    Frontend ref: Followup interface — remarks, next_followup_date,
    entered_date (which is created_at from BaseModel).
    """

    enquiry = models.ForeignKey(
        Enquiry,
        on_delete=models.CASCADE,
        related_name="followups",
    )
    remarks = models.TextField()
    next_followup_date = models.DateField()

    class Meta:
        indexes = [
            models.Index(fields=["unit_id", "-created_at"]),
        ]
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Followup for {self.enquiry_id} on {self.next_followup_date}"


# ============================================================================
# ProductCatalog
# ============================================================================

class ProductType(models.TextChoices):
    NORMAL = "NORMAL", "Normal"
    AMC = "AMC", "AMC"
    SPARES = "SPARES", "Spares"


class ProductCatalog(UnitScopedModel):
    """
    A product in a dealer's catalog.

    Frontend ref: ProductPreset interface — type, description, hsn,
    base_price, margin, gst_rate.

    Schema review #05: per-dealer products (inherits UnitScopedModel).
    """

    product_type = models.CharField(
        max_length=10,
        choices=ProductType.choices,
        default=ProductType.NORMAL,
    )
    category = models.CharField(max_length=100, blank=True, default="")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    hsn_code = models.CharField(max_length=20, blank=True, default="")
    base_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    margin_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=18)
    image = models.FileField(upload_to="products/images/", blank=True, default="")
    is_active = models.BooleanField(default=True)

    class Meta:
        indexes = [
            models.Index(fields=["unit_id", "product_type"]),
            models.Index(fields=["unit_id", "is_active"]),
        ]

    def __str__(self) -> str:
        return self.name


# ============================================================================
# ProductSpec
# ============================================================================

class ProductSpec(UnitScopedModel):
    """
    A specification line for a product (e.g. "Flow Rate: 1000 LPH").

    Frontend ref: CatalogProduct.specs is an array of strings.  The backend
    stores them as separate rows for flexible ordering and filtering.
    """

    product = models.ForeignKey(
        ProductCatalog,
        on_delete=models.CASCADE,
        related_name="specs",
    )
    spec_label = models.CharField(max_length=100, blank=True, default="")
    spec_value = models.CharField(max_length=255)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order"]
        indexes = [
            models.Index(fields=["unit_id", "product_id"]),
        ]

    def __str__(self) -> str:
        return f"{self.spec_label}: {self.spec_value}"


# ============================================================================
# Quotation
# ============================================================================

class QuoteType(models.TextChoices):
    NORMAL = "NORMAL", "Normal"
    AMC = "AMC", "AMC"
    SPARES = "SPARES", "Spares"


class AmcType(models.TextChoices):
    COMPREHENSIVE = "COMPREHENSIVE", "Comprehensive"
    NON_COMPREHENSIVE = "NON_COMPREHENSIVE", "Non-Comprehensive"


class QuotationStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    QUOTE_SENT = "QUOTE_SENT", "Quote Sent"
    CONFIRMED = "CONFIRMED", "Confirmed"
    REJECTED = "REJECTED", "Rejected"
    EXPIRED = "EXPIRED", "Expired"


class Quotation(UnitScopedModel):
    """
    A price quotation linked to an enquiry (NORMAL) or a site (AMC).

    Schema review #08: ``unit_id`` handles scoping. Snapshot fields
    (from_*, to_*) lock the printed address at creation time so the
    quote PDF never silently reprints with new data.

    Frontend ref: Quotation interface — title, quote_no, type, amc_type,
    service_interval, status, from_details, to_details, selected_bank_id,
    items, terms.
    """

    enquiry = models.ForeignKey(
        Enquiry,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quotations",
    )
    # For AMC quotes linked to a confirmed site.
    site = models.ForeignKey(
        "ConfirmedSite",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quotations",
    )
    bank_account = models.ForeignKey(
        BankAccount,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quotations",
    )

    title = models.CharField(max_length=255)
    quote_no = models.CharField(max_length=50)

    quote_type = models.CharField(
        max_length=10,
        choices=QuoteType.choices,
        default=QuoteType.NORMAL,
    )
    amc_type = models.CharField(
        max_length=20,
        choices=AmcType.choices,
        blank=True,
        default="",
    )
    service_interval = models.CharField(max_length=50, blank=True, default="")

    status = models.CharField(
        max_length=20,
        choices=QuotationStatus.choices,
        default=QuotationStatus.DRAFT,
    )

    # ---- "From" snapshot (dealer details at time of quote) ----
    from_company_name = models.CharField(max_length=255, blank=True, default="")
    from_contact_person = models.CharField(max_length=255, blank=True, default="")
    from_phone = models.CharField(max_length=20, blank=True, default="")
    from_email = models.EmailField(blank=True, default="")
    from_address = models.TextField(blank=True, default="")
    from_state = models.CharField(max_length=100, blank=True, default="")
    from_gst = models.CharField(max_length=20, blank=True, default="")
    from_pan = models.CharField(max_length=15, blank=True, default="")

    # ---- "To" snapshot (customer details at time of quote) ----
    to_company_name = models.CharField(max_length=255, blank=True, default="")
    to_contact_person = models.CharField(max_length=255, blank=True, default="")
    to_phone = models.CharField(max_length=20, blank=True, default="")
    to_email = models.EmailField(blank=True, default="")
    to_address = models.TextField(blank=True, default="")
    to_state = models.CharField(max_length=100, blank=True, default="")
    to_gst = models.CharField(max_length=20, blank=True, default="")
    to_pan = models.CharField(max_length=15, blank=True, default="")

    terms = models.TextField(blank=True, default="")
    valid_until = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        indexes = [
            models.Index(fields=["unit_id", "status"]),
            models.Index(fields=["unit_id", "quote_type"]),
            models.Index(fields=["unit_id", "-created_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["unit_id", "quote_no"],
                name="uq_quotation_unit_quote_no",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.quote_no} — {self.title}"


# ============================================================================
# QuotationItem
# ============================================================================

class QuotationItem(UnitScopedModel):
    """
    A line item on a quotation — snapshots the product's price at quote time.

    Schema review #01: every table carries its own ``unit_id``.
    Schema review — "quotation_item snapshots the product": description,
    hsn_code, base_price, margin, gst_rate are all locked at creation.

    Frontend ref: QuotationItem interface — product_id, description, hsn,
    base_price, margin, gst_rate, quantity.
    """

    quotation = models.ForeignKey(
        Quotation,
        on_delete=models.CASCADE,
        related_name="items",
    )
    # Nullable FK back to catalog for reporting; never used for live pricing.
    product = models.ForeignKey(
        ProductCatalog,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quotation_items",
    )

    # Snapshot fields — locked at creation time.
    description = models.CharField(max_length=500)
    hsn_code = models.CharField(max_length=20, blank=True, default="")
    locked_base_price = models.DecimalField(max_digits=12, decimal_places=2)
    locked_margin = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    locked_gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=18)
    quantity = models.PositiveIntegerField(default=1)

    # Generated columns — computed by the database, not application code.
    # taxable_amount = quantity * base_price * (1 + margin/100)
    taxable_amount = models.GeneratedField(
        expression=F("quantity") * F("locked_base_price") * (
            Value(1) + F("locked_margin") / Value(100)
        ),
        output_field=models.DecimalField(max_digits=14, decimal_places=2),
        db_persist=True,
    )
    # gst_amount = taxable_amount * gst_rate/100
    gst_amount = models.GeneratedField(
        expression=(
            F("quantity") * F("locked_base_price") * (
                Value(1) + F("locked_margin") / Value(100)
            ) * F("locked_gst_rate") / Value(100)
        ),
        output_field=models.DecimalField(max_digits=14, decimal_places=2),
        db_persist=True,
    )
    # total_amount = taxable + gst
    total_amount = models.GeneratedField(
        expression=(
            F("quantity") * F("locked_base_price") * (
                Value(1) + F("locked_margin") / Value(100)
            ) * (Value(1) + F("locked_gst_rate") / Value(100))
        ),
        output_field=models.DecimalField(max_digits=14, decimal_places=2),
        db_persist=True,
    )

    class Meta:
        indexes = [
            models.Index(fields=["unit_id", "quotation_id"]),
        ]
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.description} x{self.quantity}"


# ============================================================================
# ConfirmedSite
# ============================================================================

class ConfirmedSite(UnitScopedModel):
    """
    A confirmed installation site — the pivot point of the entire system.

    Created when a NORMAL quotation is confirmed. All site-services,
    AMC quotes, complaints, ecommerce orders, and timer calculations
    point to this table.

    Frontend ref: ConfirmedOrdersScreen — customer_name, address, oc_number,
    confirmed_quote_id.
    """

    enquiry = models.ForeignKey(
        Enquiry,
        on_delete=models.PROTECT,
        related_name="confirmed_sites",
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="confirmed_sites",
    )
    confirmed_quote = models.ForeignKey(
        Quotation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="confirmed_site",
    )

    site_name = models.CharField(max_length=255, blank=True, default="")
    address = models.TextField(blank=True, default="")
    pincode = models.CharField(max_length=10, blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="")
    state = models.CharField(max_length=100, blank=True, default="")

    oc_number = models.CharField(max_length=50, blank=True, default="")
    installation_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        indexes = [
            models.Index(fields=["unit_id", "is_active"]),
            models.Index(fields=["unit_id", "-created_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["unit_id", "oc_number"],
                name="uq_site_unit_oc_number",
                condition=~models.Q(oc_number=""),
            ),
        ]

    def __str__(self) -> str:
        return f"Site: {self.site_name or self.customer.name} ({self.oc_number})"
