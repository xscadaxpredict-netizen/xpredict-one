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

from shared.exceptions import not_found, ConflictError
from .models import Enquiry, Followup, Quotation, QuotationItem, ConfirmedSite


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
    followup_remarks: str,
    followup_next_date: str,
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
        status=Enquiry.Status.PENDING,
    )
    
    Followup.objects.create(
        unit_id=unit_id,
        enquiry=enquiry,
        created_by_user_id=created_by_user_id,
        remarks=followup_remarks,
        next_followup_date=followup_next_date,
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
    enquiry.delete()


@transaction.atomic
def add_followup(
    *,
    enquiry_id: uuid.UUID,
    unit_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    remarks: str,
    next_followup_date: str,
) -> Enquiry:
    enquiry = Enquiry.objects.filter(id=enquiry_id).first()
    if not enquiry:
        raise not_found("Enquiry")
        
    Followup.objects.create(
        unit_id=unit_id,
        enquiry=enquiry,
        created_by_user_id=actor_user_id,
        remarks=remarks,
        next_followup_date=next_followup_date,
    )
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
        enquiry.status = Enquiry.Status.PENDING
        enquiry.confirmed_quote_id = None
        enquiry.oc_number = ""
        enquiry.updated_by_user_id = actor_user_id
        enquiry.save(update_fields=["status", "confirmed_quote_id", "oc_number", "updated_by_user_id"])
        
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
        
    if enquiry.status == Enquiry.Status.CONFIRMED:
        raise ConflictError(code="already_confirmed", message="Enquiry is already confirmed.")
        
    quote = Quotation.objects.filter(id=quote_id, enquiry=enquiry).first()
    if not quote:
        raise not_found("Quotation")
        
    # Generate OC number
    oc_number = f"STP/OC/26-27/{random.randint(100, 999):03d}"
    
    enquiry.status = Enquiry.Status.CONFIRMED
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
        
    enquiry.status = Enquiry.Status.PENDING
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

    if quote.quote_type != Quotation.QuoteType.AMC:
        raise ConflictError(code='not_amc', message='Only AMC quotes can be confirmed via this endpoint.')
        
    if quote.status == Quotation.QuotationStatus.CONFIRMED:
        raise ConflictError(code='already_confirmed', message='Quotation is already confirmed.')

    quote.status = Quotation.QuotationStatus.CONFIRMED
    quote.save(update_fields=['status'])

    site = ConfirmedSite.objects.filter(enquiry=enquiry).first()
    if site:
        quote.site = site
        quote.save(update_fields=['site_id'])

    return enquiry
