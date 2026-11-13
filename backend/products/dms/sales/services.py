"""
Write logic for Sales.

Every state change goes through a function here --- never through a view, a
serializer, or another module reaching in. This module owns `Enquiry`, so this
is the only place that can enforce its numbering, validation, audit and events
consistently.
"""

from __future__ import annotations

import random
import uuid

from decimal import Decimal
from django.db import transaction

from shared.exceptions import ConflictError, not_found

from .models import (
    AgentPayout,
    AgentPayoutAttachment,
    BankAccount,
    ConfirmedSite,
    Enquiry,
    EnquiryStatus,
    Followup,
    ProductCatalog,
    Quotation,
    QuotationItem,
    QuotationStatus,
    QuoteType,
    TechnoCommercialDocument,
)


@transaction.atomic
def create_enquiry(
    *,
    unit_id: uuid.UUID,
    created_by_user_id: uuid.UUID,
    customer_name: str,
    contact_person: str = "",
    address: str = "",
    pincode: str = "",
    phone: str = "",
    remarks: str = "",
    followup_remarks: str | None = "",
    followup_next_date: str | None = None,
    agent_id: uuid.UUID | None = None,
    agent_name: str = "",
    lead_fee: float = 0,
) -> Enquiry:
    """Record a new enquiry for a dealer, and its initial followup."""
    lead_fee_status = "DUE" if lead_fee and float(lead_fee) > 0 else "NONE"
    enquiry = Enquiry.objects.create(
        unit_id=unit_id,
        created_by_user_id=created_by_user_id,
        customer_name=customer_name,
        contact_person=contact_person,
        address=address,
        pincode=pincode,
        phone=phone,
        remarks=remarks,
        status=EnquiryStatus.PENDING,
        agent_id=agent_id,
        agent_name=agent_name,
        lead_fee=lead_fee,
        lead_fee_status=lead_fee_status,
    )

    if followup_remarks or followup_next_date:
        Followup.objects.create(
            unit_id=unit_id,
            enquiry=enquiry,
            created_by_user_id=created_by_user_id,
            remarks=followup_remarks or "",
            next_followup_date=followup_next_date if followup_next_date else None,
        )

    return enquiry


@transaction.atomic
def update_enquiry(
    *,
    enquiry_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    **updates,
) -> Enquiry:
    """Update general fields on an enquiry."""
    enquiry = Enquiry.objects.filter(id=enquiry_id).first()
    if not enquiry:
        raise not_found("Enquiry")

    for key, value in updates.items():
        setattr(enquiry, key, value)

    enquiry.updated_by_user_id = actor_user_id
    enquiry.save()
    return enquiry


@transaction.atomic
def delete_enquiry(*, enquiry_id: uuid.UUID) -> None:
    """Delete an enquiry completely."""
    enquiry = Enquiry.objects.filter(id=enquiry_id).first()
    if not enquiry:
        raise not_found("Enquiry")
    ConfirmedSite.objects.filter(enquiry=enquiry).delete()
    Quotation.objects.filter(enquiry=enquiry).delete()
    Followup.objects.filter(enquiry=enquiry).delete()
    enquiry.delete()


@transaction.atomic
def add_followup(
    *,
    enquiry_id: uuid.UUID,
    unit_id: uuid.UUID | None = None,
    actor_user_id: uuid.UUID | None = None,
    remarks: str = "",
    next_followup_date: str | None = None,
) -> Enquiry:
    enquiry = Enquiry.objects.filter(id=enquiry_id).first()
    if not enquiry:
        raise not_found("Enquiry")

    Followup.objects.create(
        unit_id=unit_id or enquiry.unit_id,
        enquiry=enquiry,
        created_by_user_id=actor_user_id,
        remarks=remarks or "",
        next_followup_date=next_followup_date if next_followup_date else None,
    )
    return enquiry


@transaction.atomic
def update_followup(
    *,
    enquiry_id: uuid.UUID,
    followup_id: uuid.UUID,
    remarks: str | None = None,
    next_followup_date: str | None = None,
) -> Enquiry:
    enquiry = Enquiry.objects.filter(id=enquiry_id).first()
    if not enquiry:
        raise not_found("Enquiry")

    followup = Followup.objects.filter(id=followup_id, enquiry=enquiry).first()
    if not followup:
        raise not_found("Followup")

    if remarks is not None:
        followup.remarks = remarks
    if next_followup_date is not None:
        followup.next_followup_date = next_followup_date if next_followup_date else None
    followup.save()

    return enquiry


@transaction.atomic
def delete_followup(
    *,
    enquiry_id: uuid.UUID,
    followup_id: uuid.UUID,
) -> Enquiry:
    enquiry = Enquiry.objects.filter(id=enquiry_id).first()
    if not enquiry:
        raise not_found("Enquiry")

    Followup.objects.filter(id=followup_id, enquiry=enquiry).delete()
    return enquiry


@transaction.atomic
def save_quotation(
    *,
    enquiry_id: uuid.UUID,
    unit_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    quote_data: dict,
    existing_quote_id: uuid.UUID | None = None,
) -> Enquiry:
    enquiry = Enquiry.objects.filter(id=enquiry_id).first()
    if not enquiry:
        raise not_found("Enquiry")

    from_details = quote_data.pop("from_details")
    to_details = quote_data.pop("to_details")
    items_data = quote_data.pop("items")

    # Resolve sender company name and details if missing or empty
    if not from_details.get("company_name"):
        from core.organizations.models import BusinessUnit
        effective_unit_id = unit_id or getattr(enquiry, "unit_id", None)
        if effective_unit_id:
            try:
                unit = BusinessUnit.objects.using("default").filter(id=effective_unit_id).first()
                if unit:
                    from_details["company_name"] = unit.name
                    if not from_details.get("address"):
                        parts = [unit.city, unit.state, unit.postal_code]
                        from_details["address"] = ", ".join(p for p in parts if p)
                    if not from_details.get("phone"):
                        from_details["phone"] = unit.phone or ""
                    if not from_details.get("email"):
                        from_details["email"] = unit.email or ""
                    if not from_details.get("gst"):
                        from_details["gst"] = unit.gstin or ""
                    if not from_details.get("pan"):
                        from_details["pan"] = unit.pan or ""
                    if not from_details.get("contact_person"):
                        from_details["contact_person"] = unit.contact_person or ""
            except Exception:
                pass

    if existing_quote_id:
        quote = Quotation.objects.filter(id=existing_quote_id, enquiry=enquiry).first()
        if not quote:
            raise not_found("Quotation")

        # Update quote fields
        for key, value in quote_data.items():
            if key == "selected_bank_id":
                quote.bank_account_id = value
            elif key == "type":
                quote.quote_type = value
            else:
                setattr(quote, key, value)

        # Update snapshot address fields
        for key, value in from_details.items():
            setattr(quote, f"from_{key}", value)
        for key, value in to_details.items():
            setattr(quote, f"to_{key}", value)

        if quote.commission_amount and float(quote.commission_amount) > 0:
            if quote.commission_status in ("NONE", ""):
                quote.commission_status = "PAYABLE" if quote.status == "CONFIRMED" else "PENDING"
        elif quote.commission_status != "PAID":
            quote.commission_status = "NONE"

        quote.updated_by_user_id = actor_user_id
        quote.save()

        # Recreate items (simplest approach for a draft)
        quote.items.all().delete()
    else:
        comm_amount = quote_data.get("commission_amount", 0)
        comm_status = "NONE"
        if comm_amount and float(comm_amount) > 0:
            comm_status = "PAYABLE" if quote_data.get("status") == "CONFIRMED" else "PENDING"

        quote = Quotation(
            unit_id=unit_id,
            enquiry=enquiry,
            created_by_user_id=actor_user_id,
            bank_account_id=quote_data.pop("selected_bank_id"),
            quote_type=quote_data.pop("type"),
            commission_status=comm_status,
            **quote_data,
        )
        for key, value in from_details.items():
            setattr(quote, f"from_{key}", value)
        for key, value in to_details.items():
            setattr(quote, f"to_{key}", value)
        quote.save()

    for item in items_data:
        QuotationItem.objects.create(
            unit_id=unit_id,
            quotation=quote,
            product_id=item.get("product_id"),
            description=item.get("description", ""),
            hsn_code=item.get("hsn", ""),
            locked_base_price=item.get("base_price", 0),
            locked_margin=item.get("margin", 0),
            locked_gst_rate=item.get("gst_rate", 18),
            quantity=item.get("quantity", 1),
            created_by_user_id=actor_user_id,
        )

    return enquiry


@transaction.atomic
def delete_quotation(
    *,
    enquiry_id: uuid.UUID,
    quote_id: uuid.UUID,
    actor_user_id: uuid.UUID,
) -> Enquiry:
    enquiry = Enquiry.objects.filter(id=enquiry_id).first()
    if not enquiry:
        raise not_found("Enquiry")

    quote = Quotation.objects.filter(id=quote_id, enquiry=enquiry).first()
    if not quote:
        raise not_found("Quotation")

    quote.delete()

    if enquiry.confirmed_quote_id == quote_id:
        enquiry.status = EnquiryStatus.PENDING
        enquiry.confirmed_quote_id = None
        enquiry.oc_number = ""
        enquiry.updated_by_user_id = actor_user_id
        enquiry.save(
            update_fields=["status", "confirmed_quote_id", "oc_number", "updated_by_user_id"]
        )

    return enquiry


@transaction.atomic
def confirm_order(
    *,
    enquiry_id: uuid.UUID,
    quote_id: uuid.UUID,
    unit_id: uuid.UUID,
    actor_user_id: uuid.UUID,
) -> Enquiry:
    enquiry = Enquiry.objects.filter(id=enquiry_id).first()
    if not enquiry:
        raise not_found("Enquiry")

    if enquiry.status == EnquiryStatus.CONFIRMED:
        raise ConflictError(code="already_confirmed", message="Enquiry is already confirmed.")

    quote = Quotation.objects.filter(id=quote_id, enquiry=enquiry).first()
    if not quote:
        raise not_found("Quotation")

    # Generate OC number
    # NOT A SECRET, so S311 does not apply: this is a human-facing
    # reference number, not a token.
    #
    # THE REAL PROBLEM WITH THIS LINE is that 900 possible values
    # collide long before they run out -- a 50% chance of a duplicate
    # after a few dozen records -- and the column has no uniqueness
    # constraint. Reference numbering is Q31, still open.
    oc_number = f"STP/OC/26-27/{random.randint(100, 999):03d}"  # noqa: S311

    enquiry.status = EnquiryStatus.CONFIRMED
    enquiry.confirmed_quote_id = quote_id
    enquiry.oc_number = oc_number
    enquiry.updated_by_user_id = actor_user_id
    enquiry.save(update_fields=["status", "confirmed_quote_id", "oc_number", "updated_by_user_id"])

    quote.status = QuotationStatus.CONFIRMED
    if quote.commission_amount and float(quote.commission_amount) > 0 and quote.commission_status != "PAID":
        quote.commission_status = "PAYABLE"
        quote.save(update_fields=["status", "commission_status"])
    else:
        quote.save(update_fields=["status"])

    # Create the ConfirmedSite pivot
    # Note: Using the enquiry's existing customer if available, else we'd create one.
    # For now, we assume the customer is linked or we create a dummy one for the site.
    if not enquiry.customer_id:
        from .models import Customer
        customer = Customer.objects.create(
            unit_id=unit_id,
            name=enquiry.customer_name,
            contact_person=enquiry.contact_person,
            phone=enquiry.phone,
            address=enquiry.address,
            pincode=enquiry.pincode,
            created_by_user_id=actor_user_id,
        )
        enquiry.customer = customer
        enquiry.save(update_fields=["customer_id"])

    ConfirmedSite.objects.create(
        unit_id=unit_id,
        enquiry=enquiry,
        customer=enquiry.customer,
        confirmed_quote=quote,
        oc_number=oc_number,
        address=enquiry.address,
        pincode=enquiry.pincode,
        created_by_user_id=actor_user_id,
    )

    return enquiry


@transaction.atomic
def unconfirm_order(
    *,
    enquiry_id: uuid.UUID,
    actor_user_id: uuid.UUID,
) -> Enquiry:
    enquiry = Enquiry.objects.filter(id=enquiry_id).first()
    if not enquiry:
        raise not_found("Enquiry")

    enquiry.status = EnquiryStatus.PENDING
    enquiry.confirmed_quote_id = None
    enquiry.oc_number = ""
    enquiry.updated_by_user_id = actor_user_id
    enquiry.save(update_fields=["status", "confirmed_quote_id", "oc_number", "updated_by_user_id"])

    # Cascade delete ConfirmedSite if needed, but for now we just mark inactive
    site = ConfirmedSite.objects.filter(enquiry=enquiry).first()
    if site:
        site.is_active = False
        site.save(update_fields=["is_active"])

    return enquiry


@transaction.atomic
def confirm_amc_quote(
    *,
    enquiry_id: uuid.UUID,
    quote_id: uuid.UUID,
    actor_user_id: uuid.UUID,
) -> Enquiry:
    enquiry = Enquiry.objects.filter(id=enquiry_id).first()
    if not enquiry:
        raise not_found('Enquiry')

    quote = Quotation.objects.filter(id=quote_id, enquiry=enquiry).first()
    if not quote:
        raise not_found('Quotation')

    if quote.quote_type != QuoteType.AMC:
        raise ConflictError(
            code='not_amc',
            message='Only AMC quotes can be confirmed via this endpoint.',
        )

    if quote.status == QuotationStatus.CONFIRMED:
        raise ConflictError(code='already_confirmed', message='Quotation is already confirmed.')

    quote.status = QuotationStatus.CONFIRMED
    quote.save(update_fields=['status'])

    site = ConfirmedSite.objects.filter(enquiry=enquiry).first()
    if site:
        quote.site = site
        quote.save(update_fields=['site_id'])

    return enquiry


# ============================================================================
# Master Data (Bank Accounts & Products)
# ============================================================================

@transaction.atomic
def create_bank_account(
    *,
    unit_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    bank_name: str,
    account_no: str,
    ifsc_code: str,
    branch_name: str = "",
    is_default: bool = False,
    is_active: bool = True,
) -> BankAccount:
    if is_default:
        if unit_id is None:
            BankAccount.all_units.filter(unit_id__isnull=True, is_default=True).update(is_default=False)
        else:
            BankAccount.all_units.filter(unit_id=unit_id, is_default=True).update(is_default=False)

    bank = BankAccount.objects.create(
        unit_id=unit_id,
        created_by_user_id=actor_user_id,
        bank_name=bank_name,
        account_no=account_no,
        ifsc_code=ifsc_code,
        branch_name=branch_name,
        is_default=is_default,
        is_active=is_active,
    )
    return bank

@transaction.atomic
def update_bank_account(
    *,
    bank_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    request_unit_id: uuid.UUID | None = None,
    is_org_admin: bool = False,
    **updates,
) -> BankAccount:
    bank = BankAccount.all_units.filter(id=bank_id).first()
    if not bank:
        raise not_found("Bank Account")

    # Protection: Dealers cannot modify Org banks
    if bank.unit_id is None and not is_org_admin:
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("Dealers cannot modify organization bank accounts.")

    # Protection: Dealers cannot modify other dealers' banks
    if bank.unit_id is not None and not is_org_admin and str(bank.unit_id) != str(request_unit_id):
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("You do not have permission to modify this dealership's bank accounts.")

    if updates.get("is_default"):
        if bank.unit_id is None:
            BankAccount.all_units.filter(
                unit_id__isnull=True,
                is_default=True
            ).exclude(id=bank_id).update(is_default=False)
        else:
            BankAccount.all_units.filter(
                unit_id=bank.unit_id,
                is_default=True
            ).exclude(id=bank_id).update(is_default=False)

    for key, value in updates.items():
        setattr(bank, key, value)

    bank.updated_by_user_id = actor_user_id
    bank.save()
    return bank

@transaction.atomic
def delete_bank_account(
    *,
    bank_id: uuid.UUID,
    request_unit_id: uuid.UUID | None = None,
    is_org_admin: bool = False,
) -> None:
    bank = BankAccount.all_units.filter(id=bank_id).first()
    if not bank:
        raise not_found("Bank Account")

    if bank.unit_id is None and not is_org_admin:
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("Dealers cannot delete organization bank accounts.")

    if bank.unit_id is not None and not is_org_admin and str(bank.unit_id) != str(request_unit_id):
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("You do not have permission to delete this dealership's bank accounts.")

    bank.delete()


@transaction.atomic
def create_product_catalog(
    *,
    unit_id: uuid.UUID | None,
    actor_user_id: uuid.UUID,
    product_type: str,
    base_price: float,
    margin_percent: float,
    name: str = "",
    description: str = "",
    hsn_code: str = "",
    gst_rate: float = 18,
    category: str = "",
    specs: str = "",
    image=None,
    is_global: bool | None = None,
) -> ProductCatalog:
    if is_global is True:
        unit_id = None

    if not name and description:
        name = description[:255]

    product = ProductCatalog.objects.create(
        unit_id=unit_id,
        created_by_user_id=actor_user_id,
        product_type=product_type,
        name=name,
        description=description,
        hsn_code=hsn_code,
        base_price=base_price,
        margin_percent=margin_percent,
        gst_rate=gst_rate,
        category=category,
    )

    if image:
        product.image = image
        product.save()

    if specs:
        spec_list = [s.strip() for s in specs.split(",") if s.strip()]
        for idx, spec in enumerate(spec_list):
            from .models import ProductSpec
            ProductSpec.objects.create(
                unit_id=unit_id,
                product=product,
                spec_value=spec,
                sort_order=idx,
            )

    return product

@transaction.atomic
def update_product_catalog(
    *,
    product_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    request_unit_id: uuid.UUID | None = None,
    is_org_admin: bool = False,
    **updates,
) -> ProductCatalog:
    product = ProductCatalog.all_units.filter(id=product_id).first()
    if not product:
        raise not_found("Product")

    # Protection: Dealers cannot edit OEM global items
    if product.unit_id is None and not is_org_admin:
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("Dealers cannot modify standard OEM catalog items.")

    # Protection: Dealers cannot edit other dealers' items
    if product.unit_id is not None and not is_org_admin and str(product.unit_id) != str(request_unit_id):
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("You do not have permission to modify this dealership's items.")

    is_global = updates.pop("is_global", None)
    if is_org_admin and is_global is True:
        product.unit_id = None

    if "description" in updates and not updates.get("name") and not product.name:
         updates["name"] = updates["description"][:255]

    image = updates.pop("image", None)
    specs = updates.pop("specs", None)

    for key, value in updates.items():
        setattr(product, key, value)

    product.updated_by_user_id = actor_user_id

    if image is not None:
        if image:
            product.image = image
        else:
            product.image = ""

    product.save()

    if specs is not None:
        from .models import ProductSpec
        product.specs.all().delete()
        spec_list = [s.strip() for s in specs.split(",") if s.strip()]
        for idx, spec in enumerate(spec_list):
            ProductSpec.objects.create(
                unit_id=product.unit_id,
                product=product,
                spec_value=spec,
                sort_order=idx,
            )

    return product

@transaction.atomic
def delete_product_catalog(
    *,
    product_id: uuid.UUID,
    request_unit_id: uuid.UUID | None = None,
    is_org_admin: bool = False,
) -> None:
    product = ProductCatalog.all_units.filter(id=product_id).first()
    if not product:
        raise not_found("Product")

    # Protection: Dealers cannot delete OEM global items
    if product.unit_id is None and not is_org_admin:
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("Dealers cannot delete standard OEM catalog items.")

    # Protection: Dealers cannot delete other dealers' items
    if product.unit_id is not None and not is_org_admin and str(product.unit_id) != str(request_unit_id):
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("You do not have permission to delete this dealership's items.")

    product.delete()


def _format_file_size(size_bytes: int) -> str:
    if size_bytes >= 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.2f} MB"
    elif size_bytes >= 1024:
        return f"{size_bytes / 1024:.1f} KB"
    return f"{size_bytes} B"


@transaction.atomic
def create_techno_commercial_document(
    *,
    unit_id: uuid.UUID,
    created_by_user_id: uuid.UUID,
    file,
    title: str,
    notes: str = "",
    site_id: uuid.UUID | str | None = None,
    site_name: str = "",
    quotation_id: uuid.UUID | str | None = None,
    quote_number: str = "",
) -> TechnoCommercialDocument:
    file_name = getattr(file, "name", "document")
    file_size_bytes = getattr(file, "size", 0)
    file_size = _format_file_size(file_size_bytes)
    mime_type = getattr(file, "content_type", "")

    site = None
    if site_id:
        site = ConfirmedSite.objects.filter(id=site_id).first()
        if site and not site_name:
            site_name = site.site_name or (site.customer.name if site.customer else "")

    quotation = None
    if quotation_id:
        quotation = Quotation.objects.filter(id=quotation_id).first()
        if quotation and not quote_number:
            quote_number = quotation.quote_number

    doc = TechnoCommercialDocument.objects.create(
        unit_id=unit_id,
        created_by_user_id=created_by_user_id,
        file=file,
        title=title,
        file_name=file_name,
        file_size=file_size,
        mime_type=mime_type,
        notes=notes,
        site=site,
        site_name=site_name,
        quotation=quotation,
        quote_number=quote_number,
    )
    return doc


@transaction.atomic
def update_techno_commercial_document(
    *,
    document_id: uuid.UUID | str,
    actor_user_id: uuid.UUID,
    is_manager_or_admin: bool = True,
    **updates,
) -> TechnoCommercialDocument:
    doc = TechnoCommercialDocument.objects.filter(id=document_id).first()
    if not doc:
        raise not_found("TechnoCommercialDocument")

    file = updates.pop("file", None)
    if file:
        if doc.file:
            try:
                doc.file.delete(save=False)
            except Exception:
                pass
        doc.file = file
        doc.file_name = getattr(file, "name", doc.file_name)
        doc.file_size = _format_file_size(getattr(file, "size", 0))
        doc.mime_type = getattr(file, "content_type", doc.mime_type)

    if "site_id" in updates:
        s_id = updates.pop("site_id")
        if s_id:
            doc.site = ConfirmedSite.objects.filter(id=s_id).first()
            if doc.site and not updates.get("site_name"):
                doc.site_name = doc.site.site_name or (doc.site.customer.name if doc.site.customer else "")
        else:
            doc.site = None

    if "quotation_id" in updates:
        q_id = updates.pop("quotation_id")
        if q_id:
            doc.quotation = Quotation.objects.filter(id=q_id).first()
            if doc.quotation and not updates.get("quote_number"):
                doc.quote_number = doc.quotation.quote_number
        else:
            doc.quotation = None

    for key, value in updates.items():
        if hasattr(doc, key):
            setattr(doc, key, value)

    doc.updated_by_user_id = actor_user_id
    doc.save()
    return doc


@transaction.atomic
def delete_techno_commercial_document(
    *,
    document_id: uuid.UUID | str,
    actor_user_id: uuid.UUID,
    is_manager_or_admin: bool = True,
) -> None:
    doc = TechnoCommercialDocument.objects.filter(id=document_id).first()
    if not doc:
        raise not_found("TechnoCommercialDocument")

    if doc.file:
        try:
            doc.file.delete(save=False)
        except Exception:
            pass

    doc.delete()


@transaction.atomic
def record_commission_payment(
    *,
    quote_id: uuid.UUID,
    payment_ref: str,
    actor_user_id: uuid.UUID,
    unit_id: uuid.UUID | None = None,
    amount: Decimal | float | None = None,
    paid_at = None,
    notes: str = "",
    proof_files: list | None = None,
) -> Quotation:
    from django.utils import timezone
    from django.utils.dateparse import parse_date, parse_datetime
    import datetime

    quote = Quotation.objects.filter(id=quote_id).first()
    if not quote:
        raise not_found("Quotation")

    if isinstance(paid_at, str):
        parsed = parse_datetime(paid_at) or parse_date(paid_at)
        if parsed:
            if isinstance(parsed, datetime.date) and not isinstance(parsed, datetime.datetime):
                now = timezone.make_aware(datetime.datetime.combine(parsed, datetime.time.min))
            elif timezone.is_naive(parsed):
                now = timezone.make_aware(parsed)
            else:
                now = parsed
        else:
            now = timezone.now()
    else:
        now = paid_at or timezone.now()

    already_paid = sum((p.amount for p in quote.payouts.all()), Decimal("0"))
    remaining_balance = max(Decimal("0"), quote.commission_amount - already_paid)

    if remaining_balance <= 0:
        raise ConflictError(code="already_paid", message="This commission is already fully paid.")

    if amount is not None:
        installment_amount = Decimal(str(amount))
    else:
        installment_amount = remaining_balance

    if installment_amount > remaining_balance:
        installment_amount = remaining_balance

    if installment_amount <= 0:
        raise ConflictError(code="invalid_amount", message="Payment amount must be greater than 0.")

    # Create the payout installment
    payout = AgentPayout.objects.create(
        unit_id=unit_id or quote.unit_id,
        quotation=quote,
        payout_type="COMMISSION",
        agent_id=quote.agent_id,
        agent_name=quote.agent_name,
        amount=installment_amount,
        payment_ref=payment_ref,
        paid_at=now,
        notes=notes,
        created_by_user_id=actor_user_id,
    )

    # Attach proof files if any
    if proof_files:
        for f in proof_files:
            AgentPayoutAttachment.objects.create(
                unit_id=unit_id or quote.unit_id,
                payout=payout,
                file=f,
                file_name=getattr(f, "name", ""),
                file_size=getattr(f, "size", 0),
                mime_type=getattr(f, "content_type", ""),
            )

    # Re-calculate total paid so far
    total_paid = sum((p.amount for p in quote.payouts.all()), Decimal("0"))
    quote.commission_payment_ref = payment_ref
    quote.commission_paid_at = now
    quote.updated_by_user_id = actor_user_id

    if total_paid >= quote.commission_amount:
        quote.commission_status = "PAID"
    else:
        quote.commission_status = "PARTIALLY_PAID"

    quote.save(update_fields=["commission_status", "commission_payment_ref", "commission_paid_at", "updated_by_user_id"])
    return quote


@transaction.atomic
def record_lead_fee_payment(
    *,
    enquiry_id: uuid.UUID,
    payment_ref: str,
    actor_user_id: uuid.UUID,
    unit_id: uuid.UUID | None = None,
    amount: Decimal | float | None = None,
    paid_at = None,
    notes: str = "",
    proof_files: list | None = None,
) -> Enquiry:
    from django.utils import timezone
    from django.utils.dateparse import parse_date, parse_datetime
    import datetime

    enquiry = Enquiry.objects.filter(id=enquiry_id).first()
    if not enquiry:
        raise not_found("Enquiry")

    if isinstance(paid_at, str):
        parsed = parse_datetime(paid_at) or parse_date(paid_at)
        if parsed:
            if isinstance(parsed, datetime.date) and not isinstance(parsed, datetime.datetime):
                now = timezone.make_aware(datetime.datetime.combine(parsed, datetime.time.min))
            elif timezone.is_naive(parsed):
                now = timezone.make_aware(parsed)
            else:
                now = parsed
        else:
            now = timezone.now()
    else:
        now = paid_at or timezone.now()

    already_paid = sum((p.amount for p in enquiry.lead_fee_payouts.all()), Decimal("0"))
    remaining_balance = max(Decimal("0"), enquiry.lead_fee - already_paid)

    if remaining_balance <= 0:
        raise ConflictError(code="already_paid", message="This lead fee is already fully paid.")

    if amount is not None:
        installment_amount = Decimal(str(amount))
    else:
        installment_amount = remaining_balance

    if installment_amount > remaining_balance:
        installment_amount = remaining_balance

    if installment_amount <= 0:
        raise ConflictError(code="invalid_amount", message="Payment amount must be greater than 0.")

    payout = AgentPayout.objects.create(
        unit_id=unit_id or enquiry.unit_id,
        enquiry=enquiry,
        payout_type="LEAD_FEE",
        agent_id=enquiry.agent_id,
        agent_name=enquiry.agent_name,
        amount=installment_amount,
        payment_ref=payment_ref,
        paid_at=now,
        notes=notes,
        created_by_user_id=actor_user_id,
    )

    if proof_files:
        for f in proof_files:
            AgentPayoutAttachment.objects.create(
                unit_id=unit_id or enquiry.unit_id,
                payout=payout,
                file=f,
                file_name=getattr(f, "name", ""),
                file_size=getattr(f, "size", 0),
                mime_type=getattr(f, "content_type", ""),
            )

    total_paid = sum((p.amount for p in enquiry.lead_fee_payouts.all()), Decimal("0"))
    enquiry.lead_fee_payment_ref = payment_ref
    enquiry.lead_fee_paid_at = now
    enquiry.updated_by_user_id = actor_user_id

    if total_paid >= enquiry.lead_fee:
        enquiry.lead_fee_status = "PAID"
    else:
        enquiry.lead_fee_status = "PARTIALLY_PAID"

    enquiry.save(update_fields=["lead_fee_status", "lead_fee_payment_ref", "lead_fee_paid_at", "updated_by_user_id"])
    return enquiry

