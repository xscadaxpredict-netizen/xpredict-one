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

from django.db import transaction

from shared.exceptions import ConflictError, not_found

from .models import (
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
) -> Enquiry:
    """Record a new enquiry for a dealer, and its initial followup."""
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

        quote.updated_by_user_id = actor_user_id
        quote.save()

        # Recreate items (simplest approach for a draft)
        quote.items.all().delete()
    else:
        quote = Quotation(
            unit_id=unit_id,
            enquiry=enquiry,
            created_by_user_id=actor_user_id,
            bank_account_id=quote_data.pop("selected_bank_id"),
            quote_type=quote_data.pop("type"),
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
        BankAccount.objects.filter(unit_id=unit_id, is_default=True).update(is_default=False)

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
    **updates,
) -> BankAccount:
    bank = BankAccount.objects.filter(id=bank_id).first()
    if not bank:
        raise not_found("Bank Account")

    if updates.get("is_default"):
        BankAccount.objects.filter(
            unit_id=bank.unit_id,
            is_default=True).exclude(id=bank_id).update(is_default=False,
        )

    for key, value in updates.items():
        setattr(bank, key, value)

    bank.updated_by_user_id = actor_user_id
    bank.save()
    return bank

@transaction.atomic
def delete_bank_account(*, bank_id: uuid.UUID) -> None:
    bank = BankAccount.objects.filter(id=bank_id).first()
    if not bank:
        raise not_found("Bank Account")
    bank.delete()


@transaction.atomic
def create_product_catalog(
    *,
    unit_id: uuid.UUID,
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
) -> ProductCatalog:
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
    **updates,
) -> ProductCatalog:
    product = ProductCatalog.objects.filter(id=product_id).first()
    if not product:
        raise not_found("Product")

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
def delete_product_catalog(*, product_id: uuid.UUID) -> None:
    product = ProductCatalog.objects.filter(id=product_id).first()
    if not product:
        raise not_found("Product")
    product.delete()
