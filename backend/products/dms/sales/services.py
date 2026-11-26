"""
Write logic for Sales.

Every state change goes through a function here --- never through a view, a
serializer, or another module reaching in. This module owns `Enquiry`, so this
is the only place that can enforce its numbering, validation, audit and events
consistently.
"""

from __future__ import annotations

import datetime
import logging
import uuid
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.db import IntegrityError
from django.db.models import Q
from django.utils import timezone

from config.transactions import tenant_atomic
from shared.exceptions import ConflictError, InvalidInputError, not_found

from .models import (
    AgentPayout,
    AgentPayoutAttachment,
    BankAccount,
    ConfirmedSite,
    Customer,
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
from .signals import amc_quote_unconfirmed

logger = logging.getLogger(__name__)


def _get_or_create_customer(
    *, territory_id: uuid.UUID, name: str, actor_user_id: uuid.UUID, defaults: dict
) -> Customer:
    """
    The dealership's customer with this name (case-insensitive), created if new.

    Two requests creating the same new name at once both miss the lookup; the
    unique constraint (territory_id, name) lets only one insert win, and the other
    falls back to reading the row the winner wrote.
    """
    existing = Customer.objects.filter(territory_id=territory_id, name__iexact=name).first()
    if existing:
        return existing
    try:
        with tenant_atomic():
            return Customer.objects.create(
                territory_id=territory_id, name=name, created_by_user_id=actor_user_id, **defaults
            )
    except IntegrityError:
        existing = Customer.objects.filter(territory_id=territory_id, name__iexact=name).first()
        if existing:
            return existing
        raise


@tenant_atomic
def create_enquiry(
    *,
    territory_id: uuid.UUID,
    created_by_user_id: uuid.UUID,
    customer_name: str,
    customer_id: uuid.UUID | None = None,
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
    customer: Customer | None = None
    clean_name = customer_name.strip()

    if customer_id:
        customer = Customer.objects.filter(id=customer_id, territory_id=territory_id).first()
        if not customer:
            raise not_found("Customer")
        if not clean_name:
            clean_name = customer.name
        if not contact_person:
            contact_person = customer.contact_person
        if not phone:
            phone = customer.phone
        if not address:
            address = customer.address
        if not pincode:
            pincode = customer.pincode
    else:
        # One customer per name per dealership (owner's rule): the same name typed
        # again is the same customer, so link to it instead of creating another.
        customer = _get_or_create_customer(
            territory_id=territory_id,
            name=clean_name,
            actor_user_id=created_by_user_id,
            defaults={
                "contact_person": contact_person,
                "address": address,
                "pincode": pincode,
                "phone": phone,
            },
        )

    lead_fee_status = "DUE" if lead_fee and float(lead_fee) > 0 else "NONE"
    enquiry = Enquiry.objects.create(
        territory_id=territory_id,
        enquiry_no=_generate_enquiry_number(territory_id),
        created_by_user_id=created_by_user_id,
        customer=customer,
        customer_name=clean_name,
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
            enquiry=enquiry,
            created_by_user_id=created_by_user_id,
            remarks=followup_remarks or "",
            next_followup_date=followup_next_date if followup_next_date else None,
        )

    return enquiry


@tenant_atomic
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


@tenant_atomic
def delete_enquiry(*, enquiry_id: uuid.UUID) -> None:
    """Delete an enquiry, enforcing dependency protections."""
    enquiry = Enquiry.objects.filter(id=enquiry_id).first()
    if not enquiry:
        raise not_found("Enquiry")

    if enquiry.status == EnquiryStatus.CONFIRMED:
        raise ConflictError(
            code="is_confirmed",
            message=(
                "Cannot delete a confirmed order. "
                "Unconfirm it first if there are no service records."
            ),
        )

    # Payment records cascade with their quote / enquiry (AgentPayout FKs are
    # CASCADE), so deleting would silently destroy records of money paid out.
    if (
        AgentPayout.objects.filter(quotation__enquiry=enquiry).exists()
        or enquiry.lead_fee_payouts.exists()
    ):
        raise ConflictError(
            code="has_payments",
            message=(
                "Cannot delete this enquiry because agent commission or lead-fee "
                "payments are recorded against it."
            ),
        )

    site = ConfirmedSite.objects.filter(enquiry=enquiry).first()
    if site:
        has_reports = site.service_reports.exists()
        has_water = site.water_reports.exists()
        has_complaints = site.complaints.exists()
        has_orders = site.ecommerce_orders.exists()
        has_confirmed_amc = site.quotations.filter(
            quote_type=QuoteType.AMC,
            status=QuotationStatus.CONFIRMED,
        ).exists()

        if has_reports or has_water or has_complaints or has_orders or has_confirmed_amc:
            raise ConflictError(
                code="has_field_records",
                message=(
                    "Cannot delete this enquiry because its site has service reports, "
                    "water reports, complaints, or store orders. "
                    "These are legal customer records that must be preserved."
                ),
            )
        # Safe to delete site because it has no field records
        site.delete()

    Quotation.objects.filter(enquiry=enquiry).delete()
    Followup.objects.filter(enquiry=enquiry).delete()
    enquiry.delete()


@tenant_atomic
def add_followup(
    *,
    enquiry_id: uuid.UUID,
    actor_user_id: uuid.UUID | None = None,
    remarks: str = "",
    next_followup_date: str | None = None,
) -> Enquiry:
    enquiry = Enquiry.objects.filter(id=enquiry_id).first()
    if not enquiry:
        raise not_found("Enquiry")

    Followup.objects.create(
        enquiry=enquiry,
        created_by_user_id=actor_user_id,
        remarks=remarks or "",
        next_followup_date=next_followup_date if next_followup_date else None,
    )
    return enquiry


@tenant_atomic
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


@tenant_atomic
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


#: Agent / channel-partner commission applies to machine quotes only. AMC and
#: spares quotes never carry one (owner, 2026-11-13).
COMMISSION_QUOTE_TYPES = frozenset({QuoteType.NORMAL})

_NO_COMMISSION = {
    "agent_name": "",
    "commission_type": "PERCENTAGE",
    "commission_rate": 0,
    "commission_amount": 0,
}


def _drop_commission_unless_allowed(quote_data: dict, quote_type: str) -> None:
    """
    Clear the commission fields of a quote type that may not carry one.

    The quote builder already hides the agent section for these types, but the
    rule lives here so no other caller can create a payable commission on an
    AMC or spares quote.
    """
    if quote_type not in COMMISSION_QUOTE_TYPES:
        quote_data.update(_NO_COMMISSION)


def _locked_base_price(item: dict, previous_prices: dict) -> Decimal:
    """
    THE BASE PRICE OF A CATALOGUE ITEM IS NOT THE QUOTE-MAKER'S TO SET. It
    comes from the product catalogue; whoever builds the quote sets only the
    margin. Whatever the client sent for a catalogue item is ignored.

    - Editing a quote keeps the price that product already had on this quote,
      so a catalogue price change never re-prices a quote already sent.
    - A product new to the quote takes today's catalogue price.
    - A custom line (no product) has no catalogue price, so the typed price
      stands.
    """
    product_id = item.get("product_id")
    if not product_id:
        return item.get("base_price", 0)
    if product_id in previous_prices:
        return previous_prices[product_id]
    product = ProductCatalog.all_units.filter(id=product_id, is_active=True).first()
    if product is None:
        raise InvalidInputError(
            message="A product on this quote no longer exists in the catalogue. "
            "Pick it again or remove the line.",
            product_id=str(product_id),
        )
    return product.base_price


#: Quote types raised on an open enquiry (a sale not yet won).
ENQUIRY_QUOTE_TYPES = (QuoteType.NORMAL, QuoteType.SPARES)


def _quote_site(
    *,
    enquiry: Enquiry,
    quote_type: str,
    site_id: uuid.UUID | None,
    existing: Quotation | None,
) -> ConfirmedSite | None:
    """
    WHAT A QUOTE IS FOR decides what it references, and the server decides it.

    - A sales quotation (NORMAL) or a spares quote is raised on an OPEN enquiry:
      it references the enquiry only, never a site, and a confirmed enquiry
      takes no new one (the customer has already ordered; a new sale is a new
      enquiry).
    - An AMC quote is raised EITHER on a confirmed site (an OC) --- it then
      references that site, and the enquiry is the site's own --- OR on an OPEN
      enquiry for a site we have not sold (no site yet). Confirming the second
      kind is not set up yet: see confirm_amc_quote.
    - Once saved, a quote's type and reference are fixed. An edit cannot move
      it to another type, enquiry or site.

    Returns the site to store on the quote (None for enquiry quotes).
    """
    if quote_type not in QuoteType.values:
        raise InvalidInputError(message="Unknown quote type.", quote_type=quote_type)

    if existing is not None:
        if quote_type != existing.quote_type:
            raise InvalidInputError(
                message="The type of a saved quote cannot be changed. Create a new quote instead.",
                quote_id=str(existing.id),
            )
        if site_id and existing.site_id and str(site_id) != str(existing.site_id):
            raise InvalidInputError(
                message="A saved quote cannot be moved to another site.",
                quote_id=str(existing.id),
            )
        if existing.site_id or quote_type != QuoteType.AMC:
            return existing.site
        # A legacy AMC quote saved before sites were recorded: fill it in now.

    if quote_type in ENQUIRY_QUOTE_TYPES:
        if site_id:
            raise InvalidInputError(
                message="A sales or spares quotation is raised on an enquiry, not on a site.",
            )
        if existing is None and enquiry.status == EnquiryStatus.CONFIRMED:
            raise ConflictError(
                code="enquiry_confirmed",
                message="This enquiry is already confirmed. Raise a new enquiry for a new sale.",
            )
        return None

    # AMC on a confirmed order: the enquiry's own active site with an OC number.
    site = (
        ConfirmedSite.objects.filter(enquiry=enquiry, is_active=True)
        .exclude(oc_number="")
        .first()
    )
    if site_id and (site is None or str(site_id) != str(site.id)):
        raise InvalidInputError(
            message="The selected site does not belong to this enquiry.",
            site_id=str(site_id),
        )
    if site is not None:
        # A confirmed customer's AMC always references their site --- and while
        # that site has a confirmed AMC, a new AMC quote has no purpose.
        _refuse_if_amc_active(site=site, enquiry=enquiry)
        return site
    if enquiry.status == EnquiryStatus.CONFIRMED:
        raise ConflictError(
            code="no_confirmed_site",
            message="This enquiry is confirmed but has no active site with an OC number.",
        )
    # AMC on an open enquiry: no site yet.
    return None


def _active_amc(*, site: ConfirmedSite | None, enquiry: Enquiry) -> Quotation | None:
    """The confirmed AMC quote covering this site (or enquiry, before it has a site)."""
    amc = Quotation.objects.filter(quote_type=QuoteType.AMC, status=QuotationStatus.CONFIRMED)
    if site is not None:
        return amc.filter(Q(site=site) | Q(enquiry=enquiry)).first()
    return amc.filter(enquiry=enquiry).first()


def _refuse_if_amc_active(*, site: ConfirmedSite | None, enquiry: Enquiry, except_id=None) -> None:
    active = _active_amc(site=site, enquiry=enquiry)
    if active is not None and active.id != except_id:
        raise ConflictError(
            code="amc_active",
            message=f"This site already has a confirmed AMC ({active.quote_no}). "
            "Unconfirm it first to quote or confirm another.",
        )


@tenant_atomic
def save_quotation(
    *,
    enquiry_id: uuid.UUID,
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

    # THE CUSTOMER IS THE ENQUIRY'S. A quote cannot be addressed to somebody
    # else by editing a text box; to change the customer, change the enquiry.
    to_details["company_name"] = enquiry.customer_name

    # Resolve sender company name and details if missing or empty
    if not from_details.get("company_name"):
        from core.organizations.models import Territory
        # The sender is the territory the quote's enquiry lives at -- the root
        # (the head office) shows the organisation's name (`display_name`).
        effective_unit_id = enquiry.territory_id
        if effective_unit_id:
            try:
                unit = (
                    Territory.objects.using("default")
                    .select_related("organization")
                    .filter(id=effective_unit_id)
                    .first()
                )
                if unit:
                    from_details["company_name"] = unit.display_name
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
                # Sender details are a convenience; the quotation still saves without them.
                logger.warning(
                    "Could not load dealership %s for quotation sender details",
                    effective_unit_id,
                    exc_info=True,
                )

    existing = None
    if existing_quote_id:
        existing = Quotation.objects.filter(id=existing_quote_id, enquiry=enquiry).first()
        if not existing:
            raise not_found("Quotation")
    site = _quote_site(
        enquiry=enquiry,
        quote_type=quote_data.get("type"),
        site_id=quote_data.pop("site_id", None),
        existing=existing,
    )

    # THE QUOTE NUMBER IS THE SERVER'S. A saved quote keeps its number; a new one
    # gets the next in sequence. A typed or client-made number is never used.
    quote_data.pop("quote_no", None)

    if existing is not None:
        quote = existing
        quote.site = site

        # A legacy non-machine quote whose commission has already been (partly)
        # paid keeps it: wiping the amount would contradict the payouts on record.
        if quote.commission_status not in ("PAID", "PARTIALLY_PAID"):
            _drop_commission_unless_allowed(quote_data, quote_data.get("type", quote.quote_type))

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

        # Recreate items (simplest approach for a draft). Remember what each
        # product was priced at on THIS quote first, so editing an old quote
        # does not silently re-price it from today's catalogue.
        previous_prices = {
            i.product_id: i.locked_base_price
            for i in quote.items.all()
            if i.product_id is not None
        }
        quote.items.all().delete()
    else:
        previous_prices = {}
        _drop_commission_unless_allowed(quote_data, quote_data["type"])
        comm_amount = quote_data.get("commission_amount", 0)
        comm_status = "NONE"
        if comm_amount and float(comm_amount) > 0:
            comm_status = "PAYABLE" if quote_data.get("status") == "CONFIRMED" else "PENDING"

        quote = Quotation(
            # The quote lives where its enquiry lives (`home_follows`), so it is
            # numbered in the enquiry's territory's sequence.
            quote_no=_generate_quote_number(enquiry.territory_id, quote_data["type"]),
            enquiry=enquiry,
            created_by_user_id=actor_user_id,
            bank_account_id=quote_data.pop("selected_bank_id"),
            quote_type=quote_data.pop("type"),
            site=site,
            commission_status=comm_status,
            **quote_data,
        )
        for key, value in from_details.items():
            setattr(quote, f"from_{key}", value)
        for key, value in to_details.items():
            setattr(quote, f"to_{key}", value)
        quote.save()

    for item in items_data:
        item["base_price"] = _locked_base_price(item, previous_prices)
        QuotationItem.objects.create(
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


#: Statuses of a visit that has not happened yet (site_services' ScheduleStatus;
#: spelled out because sales may not import that module).
_UPCOMING_VISIT_STATUSES = ("SCHEDULED", "IN_PROGRESS")


def _quotation_dependencies(enquiry: Enquiry, quote: Quotation) -> dict:
    # Read through the reverse relation: counting needs no import of site_services.
    visits = quote.service_schedules.all()
    upcoming = visits.filter(status__in=_UPCOMING_VISIT_STATUSES).count()
    visits = {"upcoming_visits": upcoming, "past_visits": visits.count() - upcoming}
    deps = {
        "quote_type": quote.quote_type,
        "is_confirmed": quote.status == QuotationStatus.CONFIRMED,
        "upcoming_visits": visits["upcoming_visits"],
        "past_visits": visits["past_visits"],
        "techno_commercial_documents": quote.techno_commercial_documents.count(),
        "commission_payouts": quote.payouts.count(),
        "blocked_reason": None,
    }

    # Hard stops. Payout records cascade with the quote (AgentPayout FK is
    # CASCADE), so deleting would silently destroy records of money paid out.
    if deps["commission_payouts"]:
        deps["blocked_reason"] = (
            "Commission payments are recorded against this quotation, "
            "so it cannot be deleted."
        )
    # A confirmed machine sale is the order itself; it has its own unconfirm step.
    elif quote.quote_type != QuoteType.AMC and enquiry.confirmed_quote_id == quote.id:
        deps["blocked_reason"] = (
            "This quotation is the confirmed order. Unconfirm the order before deleting it."
        )

    deps["has_dependents"] = bool(
        deps["is_confirmed"]
        or deps["upcoming_visits"]
        or deps["past_visits"]
        or deps["techno_commercial_documents"]
    )
    return deps


def quotation_dependencies(*, enquiry_id: uuid.UUID, quote_id: uuid.UUID) -> dict:
    """What deleting this quotation would affect --- shown before the user confirms."""
    enquiry = Enquiry.objects.filter(id=enquiry_id).first()
    if not enquiry:
        raise not_found("Enquiry")
    quote = Quotation.objects.filter(id=quote_id, enquiry=enquiry).first()
    if not quote:
        raise not_found("Quotation")
    return _quotation_dependencies(enquiry, quote)


@tenant_atomic
def delete_quotation(
    *,
    enquiry_id: uuid.UUID,
    quote_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    confirmed: bool = False,
) -> Enquiry:
    """
    Delete a quotation, after `quotation_dependencies` has been shown to the user.

    Refused outright (`delete_blocked`) when a dependency cannot be undone or
    must be handled first; refused with `has_dependents` when there are
    dependents the user has not confirmed. On delete, an AMC's upcoming visits
    are cancelled; its past visits and any techno-commercial documents are kept,
    just unlinked.
    """
    enquiry = Enquiry.objects.filter(id=enquiry_id).first()
    if not enquiry:
        raise not_found("Enquiry")

    quote = Quotation.objects.filter(id=quote_id, enquiry=enquiry).first()
    if not quote:
        raise not_found("Quotation")

    deps = _quotation_dependencies(enquiry, quote)
    if deps["blocked_reason"]:
        raise ConflictError(code="delete_blocked", message=deps["blocked_reason"])
    if deps["has_dependents"] and not confirmed:
        raise ConflictError(
            code="has_dependents",
            message="This quotation has linked records. Review them and confirm to delete.",
        )

    # An AMC's upcoming visits are cancelled by site_services, which owns them:
    # its handler listens for this delete (pre_delete on dms_sales.Quotation).
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


#: Indian financial year runs April to March; OC numbers restart each year.
_FY_ZONE = ZoneInfo("Asia/Kolkata")


def _financial_year_label(today: datetime.date) -> str:
    """26-27 for any date from 1 Apr 2026 to 31 Mar 2027."""
    start = today.year if today.month >= 4 else today.year - 1
    return f"{start % 100:02d}-{(start + 1) % 100:02d}"


def enquiry_number(fy_label: str, seq: int) -> str:
    """ENQ/26-27/0042. Shared with the migration that numbers old enquiries."""
    return f"ENQ/{fy_label}/{seq:04d}"


def _generate_enquiry_number(territory_id: uuid.UUID) -> str:
    """
    The territory's next enquiry number for the current financial year:
    ENQ/26-27/0001, 0002, ... Runs inside create_enquiry's transaction and locks
    the territory's enquiry rows first, so two enquiries saved at the same
    moment queue up instead of reading the same last number. The unique
    constraint on (territory_id, enquiry_no) is the backstop.
    """
    fy = _financial_year_label(timezone.now().astimezone(_FY_ZONE).date())
    prefix = f"ENQ/{fy}/"
    # Evaluated for the lock it takes, not for the rows. `all_territories`, not
    # `objects`: the sequence is the territory's, whoever is asking -- the scoped
    # manager would hide rows the caller may not see and hand out a taken number.
    list(
        Enquiry.all_territories.select_for_update()
        .filter(territory_id=territory_id)
        .values_list("id", flat=True)
    )
    max_seq = 0
    taken = Enquiry.all_territories.filter(territory_id=territory_id, enquiry_no__startswith=prefix)
    for no in taken.values_list("enquiry_no", flat=True):
        tail = no[len(prefix):]
        if tail.isdigit():
            max_seq = max(max_seq, int(tail))
    return enquiry_number(fy, max_seq + 1)


#: Quote number prefix per quote type: QT/26-27/0001, AMC/26-27/0001, SPR/26-27/0001.
QUOTE_NUMBER_PREFIX = {
    QuoteType.NORMAL: "QT",
    QuoteType.AMC: "AMC",
    QuoteType.SPARES: "SPR",
}


def _generate_quote_number(territory_id: uuid.UUID, quote_type: str) -> str:
    """
    The territory's next quote number for this type and financial year, e.g.
    QT/26-27/0007. Short and sequential, so people can read it out and find it.
    Runs inside save_quotation's transaction and locks the territory's quote
    rows first, so two quotes saved at once queue up; the unique constraint on
    (territory_id, quote_no) is the backstop.
    """
    fy = _financial_year_label(timezone.now().astimezone(_FY_ZONE).date())
    prefix = f"{QUOTE_NUMBER_PREFIX.get(quote_type, 'QT')}/{fy}/"
    # Evaluated for the lock it takes, not for the rows. `all_territories`, not
    # `objects`: the sequence is the territory's, whoever is asking -- the scoped
    # manager would hide rows the caller may not see and hand out a taken number.
    list(
        Quotation.all_territories.select_for_update()
        .filter(territory_id=territory_id)
        .values_list("id", flat=True)
    )
    max_seq = 0
    taken = Quotation.all_territories.filter(territory_id=territory_id, quote_no__startswith=prefix)
    for no in taken.values_list("quote_no", flat=True):
        tail = no[len(prefix):]
        if tail.isdigit():
            max_seq = max(max_seq, int(tail))
    return f"{prefix}{max_seq + 1:04d}"


def _generate_sequential_oc_number(territory_id: uuid.UUID) -> str:
    """
    The dealership's next OC number for the current financial year, e.g.
    STP/OC/26-27/001, then 002, ...

    Must run inside the confirm transaction. It locks the dealership's site rows
    first, so two people confirming at the same moment queue up instead of both
    reading the same "last number" --- the (territory_id, oc_number) unique constraint
    is conditional, and MySQL does not enforce conditional constraints at all.
    """
    prefix = f"STP/OC/{_financial_year_label(timezone.now().astimezone(_FY_ZONE).date())}/"
    # Evaluated for the lock it takes, not for the rows.
    list(
        ConfirmedSite.objects.select_for_update()
        .filter(territory_id=territory_id)
        .values_list("id", flat=True)
    )
    existing_ocs = ConfirmedSite.objects.filter(
        territory_id=territory_id,
        oc_number__startswith=prefix,
    ).values_list("oc_number", flat=True)

    max_seq = 0
    for oc in existing_ocs:
        tail = oc[len(prefix):].strip()
        if tail.isdigit():
            max_seq = max(max_seq, int(tail))
    return f"{prefix}{max_seq + 1:03d}"


@tenant_atomic
def confirm_order(
    *,
    enquiry_id: uuid.UUID,
    quote_id: uuid.UUID,
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
    if quote.quote_type == QuoteType.AMC:
        raise ConflictError(
            code="amc_not_an_order",
            message="An AMC quote cannot confirm the order. Confirm the machine quote instead.",
        )

    # THE ORDER BELONGS TO THE ENQUIRY'S UNIT, not to whoever clicks Confirm.
    # An organisation admin confirming a dealer's enquiry must produce that
    # dealer's site and that dealer's OC number, not the head office's.
    territory_id = enquiry.territory_id

    # Reuse existing OC number if this enquiry or site was previously confirmed
    existing_site = ConfirmedSite.objects.filter(enquiry=enquiry).first()
    if existing_site and existing_site.oc_number:
        oc_number = existing_site.oc_number
    elif enquiry.oc_number:
        oc_number = enquiry.oc_number
    else:
        oc_number = _generate_sequential_oc_number(territory_id)

    enquiry.status = EnquiryStatus.CONFIRMED
    enquiry.confirmed_quote_id = quote_id
    enquiry.oc_number = oc_number
    enquiry.updated_by_user_id = actor_user_id
    enquiry.save(update_fields=["status", "confirmed_quote_id", "oc_number", "updated_by_user_id"])

    quote.status = QuotationStatus.CONFIRMED
    if (
        quote.commission_amount
        and float(quote.commission_amount) > 0
        and quote.commission_status != "PAID"
    ):
        quote.commission_status = "PAYABLE"
        quote.save(update_fields=["status", "commission_status"])
    else:
        quote.save(update_fields=["status"])

    # Ensure customer is linked to enquiry
    if not enquiry.customer_id:
        customer = _get_or_create_customer(
            territory_id=territory_id,
            name=enquiry.customer_name.strip(),
            actor_user_id=actor_user_id,
            defaults={
                "contact_person": enquiry.contact_person,
                "phone": enquiry.phone,
                "address": enquiry.address,
                "pincode": enquiry.pincode,
            },
        )
        enquiry.customer = customer
        enquiry.save(update_fields=["customer_id"])
    else:
        customer = enquiry.customer

    # Create or reactivate the 1:1 ConfirmedSite pivot (never duplicate)
    if existing_site:
        existing_site.is_active = True
        existing_site.confirmed_quote = quote
        existing_site.customer = customer
        existing_site.oc_number = oc_number
        existing_site.address = enquiry.address
        existing_site.pincode = enquiry.pincode
        existing_site.save(
            update_fields=[
                "is_active",
                "confirmed_quote_id",
                "customer_id",
                "oc_number",
                "address",
                "pincode",
            ]
        )
    else:
        ConfirmedSite.objects.create(
            territory_id=territory_id,
            enquiry=enquiry,
            customer=customer,
            confirmed_quote=quote,
            oc_number=oc_number,
            address=enquiry.address,
            pincode=enquiry.pincode,
            created_by_user_id=actor_user_id,
        )

    return enquiry


@tenant_atomic
def unconfirm_order(
    *,
    enquiry_id: uuid.UUID,
    actor_user_id: uuid.UUID,
) -> Enquiry:
    enquiry = Enquiry.objects.filter(id=enquiry_id).first()
    if not enquiry:
        raise not_found("Enquiry")

    if enquiry.status != EnquiryStatus.CONFIRMED:
        raise ConflictError(code="not_confirmed", message="Enquiry is not currently confirmed.")

    site = ConfirmedSite.objects.filter(enquiry=enquiry).first()
    if site:
        # Check for dependent field records that must be preserved
        has_reports = site.service_reports.exists()
        has_water = site.water_reports.exists()
        has_complaints = site.complaints.exists()
        has_orders = site.ecommerce_orders.exists()
        has_confirmed_amc = site.quotations.filter(
            quote_type=QuoteType.AMC,
            status=QuotationStatus.CONFIRMED,
        ).exists()

        if has_reports or has_water or has_complaints or has_orders or has_confirmed_amc:
            reasons = []
            if has_reports:
                reasons.append("service reports")
            if has_water:
                reasons.append("water reports")
            if has_complaints:
                reasons.append("complaints")
            if has_orders:
                reasons.append("store orders")
            if has_confirmed_amc:
                reasons.append("confirmed AMC contracts")
            joined_reasons = ", ".join(reasons)
            raise ConflictError(
                code="has_field_records",
                message=(
                    f"Cannot unconfirm this order because the site has {joined_reasons} on record. "
                    "These are legal customer records that must be preserved."
                ),
            )

        # Deactivate all sites associated with this enquiry
        ConfirmedSite.objects.filter(enquiry=enquiry).update(is_active=False)

    # Revert the confirmed quotation status if attached
    if enquiry.confirmed_quote_id:
        quote = Quotation.objects.filter(id=enquiry.confirmed_quote_id).first()
        if quote:
            if quote.commission_status == "PAID" or quote.total_commission_paid > 0:
                raise ConflictError(
                    code="commission_paid",
                    message=(
                        "Cannot unconfirm this order because commission has already been paid out."
                    ),
                )
            quote.status = QuotationStatus.QUOTE_SENT
            if quote.commission_status == "PAYABLE":
                quote.commission_status = "PENDING"
            quote.save(update_fields=["status", "commission_status"])

    enquiry.status = EnquiryStatus.PENDING
    enquiry.confirmed_quote_id = None
    enquiry.oc_number = ""
    enquiry.updated_by_user_id = actor_user_id
    enquiry.save(update_fields=["status", "confirmed_quote_id", "oc_number", "updated_by_user_id"])

    return enquiry


@tenant_atomic
def confirm_amc_quote(
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

    if quote.quote_type != QuoteType.AMC:
        raise ConflictError(
            code="not_amc",
            message="Only AMC quotes can be confirmed via this endpoint.",
        )

    if quote.status == QuotationStatus.CONFIRMED:
        raise ConflictError(code="already_confirmed", message="Quotation is already confirmed.")

    _refuse_if_amc_active(
        site=quote.site or ConfirmedSite.objects.filter(enquiry=enquiry, is_active=True).first(),
        enquiry=enquiry,
        except_id=quote.id,
    )

    if quote.site_id is None and not ConfirmedSite.objects.filter(
        enquiry=enquiry, is_active=True
    ).exclude(oc_number="").exists():
        # An AMC raised on an open enquiry: there is no site for it to cover
        # yet. How that site is created on confirmation is still to be decided,
        # so it is refused rather than confirmed onto nothing.
        raise ConflictError(
            code="amc_without_site",
            message="This AMC quote is for an enquiry with no confirmed site yet. "
            "Confirming it (and creating the site) is not set up yet.",
        )

    quote.status = QuotationStatus.CONFIRMED
    quote.save(update_fields=["status"])

    if quote.site_id is None:
        # Legacy AMC quote saved before its site was recorded.
        site = ConfirmedSite.objects.filter(enquiry=enquiry).first()
        if site:
            quote.site = site
            quote.save(update_fields=["site_id"])

    return enquiry



#: Visit statuses that mean the service was (being) carried out.
_DELIVERED_VISIT_STATUSES = ("IN_PROGRESS", "COMPLETED")


@tenant_atomic
def unconfirm_amc_quote(
    *,
    enquiry_id: uuid.UUID,
    quote_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    confirmed: bool = False,
) -> Enquiry:
    """
    Take a confirmed AMC back to "quote sent", like unconfirming a sales order,
    so another AMC quote for the site can be confirmed instead.

    - REFUSED once service has been carried out under it (a visit in progress
      or completed): that work happened under this contract.
    - Its upcoming (scheduled) visits are cancelled, with the reason recorded
      on each visit. The caller is told how many first and must confirm.
    """
    enquiry = Enquiry.objects.filter(id=enquiry_id).first()
    if not enquiry:
        raise not_found("Enquiry")
    quote = (
        Quotation.objects.select_for_update()
        .filter(id=quote_id, enquiry=enquiry, quote_type=QuoteType.AMC)
        .first()
    )
    if not quote:
        raise not_found("Quotation")
    if quote.status != QuotationStatus.CONFIRMED:
        raise ConflictError(code="not_confirmed", message="This AMC quote is not confirmed.")

    # Read through the reverse relation: counting needs no import of site_services.
    visits = quote.service_schedules.all()
    delivered = visits.filter(status__in=_DELIVERED_VISIT_STATUSES).count()
    if delivered:
        raise ConflictError(
            code="amc_has_service",
            message=f"{delivered} visit(s) under this AMC have already been carried out, "
            "so it cannot be unconfirmed.",
        )
    upcoming = visits.filter(status="SCHEDULED").count()
    if upcoming and not confirmed:
        raise ConflictError(
            code="has_dependents",
            message=f"{upcoming} scheduled visit(s) under this AMC will be cancelled.",
        )

    quote.status = QuotationStatus.QUOTE_SENT
    quote.updated_by_user_id = actor_user_id
    quote.save(update_fields=["status", "updated_by_user_id", "updated_at"])
    amc_quote_unconfirmed.send(sender=Quotation, quote_id=quote.id, actor_user_id=actor_user_id)
    return enquiry

# ============================================================================
# Master Data (Bank Accounts & Products)
# ============================================================================


@tenant_atomic
def create_bank_account(
    *,
    territory_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    bank_name: str,
    account_no: str,
    ifsc_code: str,
    branch_name: str = "",
    is_default: bool = False,
    is_active: bool = True,
) -> BankAccount:
    if is_default:
        if territory_id is None:
            BankAccount.all_territories.filter(territory_id__isnull=True, is_default=True).update(
                is_default=False
            )
        else:
            BankAccount.all_territories.filter(
                territory_id=territory_id, is_default=True
            ).update(is_default=False)

    bank = BankAccount.objects.create(
        territory_id=territory_id,
        created_by_user_id=actor_user_id,
        bank_name=bank_name,
        account_no=account_no,
        ifsc_code=ifsc_code,
        branch_name=branch_name,
        is_default=is_default,
        is_active=is_active,
    )
    return bank


@tenant_atomic
def update_bank_account(
    *,
    bank_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    request_unit_id: uuid.UUID | None = None,
    is_org_admin: bool = False,
    **updates,
) -> BankAccount:
    bank = BankAccount.all_territories.filter(id=bank_id).first()
    if not bank:
        raise not_found("Bank Account")

    # Protection: Dealers cannot modify Org banks
    if bank.territory_id is None and not is_org_admin:
        from rest_framework.exceptions import PermissionDenied

        raise PermissionDenied("Dealers cannot modify organization bank accounts.")

    # Protection: Dealers cannot modify other dealers' banks
    if (
        bank.territory_id is not None
        and not is_org_admin
        and str(bank.territory_id) != str(request_unit_id)
    ):
        from rest_framework.exceptions import PermissionDenied

        raise PermissionDenied(
            "You do not have permission to modify this dealership's bank accounts."
        )

    if updates.get("is_default"):
        if bank.territory_id is None:
            BankAccount.all_territories.filter(territory_id__isnull=True, is_default=True).exclude(
                id=bank_id
            ).update(is_default=False)
        else:
            BankAccount.all_territories.filter(
                territory_id=bank.territory_id, is_default=True
            ).exclude(id=bank_id).update(is_default=False)

    for key, value in updates.items():
        setattr(bank, key, value)

    bank.updated_by_user_id = actor_user_id
    bank.save()
    return bank


@tenant_atomic
def delete_bank_account(
    *,
    bank_id: uuid.UUID,
    request_unit_id: uuid.UUID | None = None,
    is_org_admin: bool = False,
) -> None:
    bank = BankAccount.all_territories.filter(id=bank_id).first()
    if not bank:
        raise not_found("Bank Account")

    if bank.territory_id is None and not is_org_admin:
        from rest_framework.exceptions import PermissionDenied

        raise PermissionDenied("Dealers cannot delete organization bank accounts.")

    if (
        bank.territory_id is not None
        and not is_org_admin
        and str(bank.territory_id) != str(request_unit_id)
    ):
        from rest_framework.exceptions import PermissionDenied

        raise PermissionDenied(
            "You do not have permission to delete this dealership's bank accounts."
        )

    bank.delete()


@tenant_atomic
def create_product_catalog(
    *,
    territory_id: uuid.UUID | None,
    actor_user_id: uuid.UUID,
    product_type: str,
    base_price: float,
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
        territory_id = None

    if not name and description:
        name = description[:255]

    product = ProductCatalog.objects.create(
        territory_id=territory_id,
        created_by_user_id=actor_user_id,
        product_type=product_type,
        name=name,
        description=description,
        hsn_code=hsn_code,
        base_price=base_price,
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
                product=product,
                # A spec lives with its product: global with a global one, a
                # dealer's with a dealer's (merge, 2026-11-23 -- `main` left it
                # global, visible to every dealer).
                territory_id=product.territory_id,
                spec_value=spec,
                sort_order=idx,
            )

    return product


@tenant_atomic
def update_product_catalog(
    *,
    product_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    request_unit_id: uuid.UUID | None = None,
    is_org_admin: bool = False,
    **updates,
) -> ProductCatalog:
    product = ProductCatalog.all_territories.filter(id=product_id).first()
    if not product:
        raise not_found("Product")

    # Protection: Dealers cannot edit OEM global items
    if product.territory_id is None and not is_org_admin:
        from rest_framework.exceptions import PermissionDenied

        raise PermissionDenied("Dealers cannot modify standard OEM catalog items.")

    # Protection: Dealers cannot edit other dealers' items
    if (
        product.territory_id is not None
        and not is_org_admin
        and str(product.territory_id) != str(request_unit_id)
    ):
        from rest_framework.exceptions import PermissionDenied

        raise PermissionDenied("You do not have permission to modify this dealership's items.")

    is_global = updates.pop("is_global", None)
    if is_org_admin and is_global is True:
        product.territory_id = None

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
                product=product,
                # A spec lives with its product: global with a global one, a
                # dealer's with a dealer's (merge, 2026-11-23 -- `main` left it
                # global, visible to every dealer).
                territory_id=product.territory_id,
                spec_value=spec,
                sort_order=idx,
            )

    return product


@tenant_atomic
def delete_product_catalog(
    *,
    product_id: uuid.UUID,
    request_unit_id: uuid.UUID | None = None,
    is_org_admin: bool = False,
) -> None:
    product = ProductCatalog.all_territories.filter(id=product_id).first()
    if not product:
        raise not_found("Product")

    # Protection: Dealers cannot delete OEM global items
    if product.territory_id is None and not is_org_admin:
        from rest_framework.exceptions import PermissionDenied

        raise PermissionDenied("Dealers cannot delete standard OEM catalog items.")

    # Protection: Dealers cannot delete other dealers' items
    if (
        product.territory_id is not None
        and not is_org_admin
        and str(product.territory_id) != str(request_unit_id)
    ):
        from rest_framework.exceptions import PermissionDenied

        raise PermissionDenied("You do not have permission to delete this dealership's items.")

    product.delete()


def _format_file_size(size_bytes: int) -> str:
    if size_bytes >= 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.2f} MB"
    elif size_bytes >= 1024:
        return f"{size_bytes / 1024:.1f} KB"
    return f"{size_bytes} B"


@tenant_atomic
def create_techno_commercial_document(
    *,
    territory_id: uuid.UUID,
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
        territory_id=territory_id,
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


@tenant_atomic
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
                logger.warning("Could not delete old file for document %s", doc.id, exc_info=True)
        doc.file = file
        doc.file_name = getattr(file, "name", doc.file_name)
        doc.file_size = _format_file_size(getattr(file, "size", 0))
        doc.mime_type = getattr(file, "content_type", doc.mime_type)

    if "site_id" in updates:
        s_id = updates.pop("site_id")
        if s_id:
            doc.site = ConfirmedSite.objects.filter(id=s_id).first()
            if doc.site and not updates.get("site_name"):
                doc.site_name = doc.site.site_name or (
                    doc.site.customer.name if doc.site.customer else ""
                )
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


@tenant_atomic
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
            logger.warning("Could not delete file for document %s", doc.id, exc_info=True)

    doc.delete()


@tenant_atomic
def record_commission_payment(
    *,
    quote_id: uuid.UUID,
    payment_ref: str,
    actor_user_id: uuid.UUID,
    territory_id: uuid.UUID | None = None,
    amount: Decimal | float | None = None,
    paid_at=None,
    notes: str = "",
    proof_files: list | None = None,
) -> Quotation:
    import datetime

    from django.utils import timezone
    from django.utils.dateparse import parse_date, parse_datetime

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
        territory_id=territory_id or quote.territory_id,
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
                territory_id=territory_id or quote.territory_id,
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

    quote.save(
        update_fields=[
            "commission_status",
            "commission_payment_ref",
            "commission_paid_at",
            "updated_by_user_id",
        ]
    )
    return quote


@tenant_atomic
def record_lead_fee_payment(
    *,
    enquiry_id: uuid.UUID,
    payment_ref: str,
    actor_user_id: uuid.UUID,
    territory_id: uuid.UUID | None = None,
    amount: Decimal | float | None = None,
    paid_at=None,
    notes: str = "",
    proof_files: list | None = None,
) -> Enquiry:
    import datetime

    from django.utils import timezone
    from django.utils.dateparse import parse_date, parse_datetime

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
        territory_id=territory_id or enquiry.territory_id,
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
                territory_id=territory_id or enquiry.territory_id,
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

    enquiry.save(
        update_fields=[
            "lead_fee_status",
            "lead_fee_payment_ref",
            "lead_fee_paid_at",
            "updated_by_user_id",
        ]
    )
    return enquiry
