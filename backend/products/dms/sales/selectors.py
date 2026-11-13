"""
Read logic for Sales.

Queries live here rather than in views, so a list endpoint, an export and a
dashboard tile all share one definition of "the enquiries this user may see".

Unit scoping is NOT applied by hand here. `Enquiry` inherits `UnitScopedModel`,
whose default manager filters by the `allowed_units` contextvar --- so
`Enquiry.objects` is already scoped to the caller's dealer. Use
`Enquiry.all_units` only for deliberate fleet-wide reporting, and justify it.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from django.db.models import Prefetch, Q

from .models import BankAccount, Enquiry, Followup, ProductCatalog, Quotation, TechnoCommercialDocument

if TYPE_CHECKING:
    from django.db.models import QuerySet


def list_enquiries(
    *,
    actor_user_id: uuid.UUID | None = None,
    is_manager_or_admin: bool = True,
) -> QuerySet[Enquiry]:
    """
    Enquiries the caller may see, newest first. Already dealer-scoped by UnitScopedModel.
    If the caller is not a manager or admin, only their own assigned or created
    enquiries are returned (peers cannot see each other's deals).
    """
    qs = Enquiry.objects.prefetch_related(
        Prefetch("followups", queryset=Followup.objects.order_by("-created_at")),
        Prefetch(
            "quotations",
            queryset=Quotation.objects.prefetch_related("items").order_by("-created_at"),
        )
    )
    if not is_manager_or_admin and actor_user_id:
        qs = qs.filter(Q(created_by_user_id=actor_user_id) | Q(assigned_to_user_id=actor_user_id))
    return qs.order_by("-created_at")


def get_enquiry(
    *,
    enquiry_id: uuid.UUID | str,
    actor_user_id: uuid.UUID | None = None,
    is_manager_or_admin: bool = False,
) -> Enquiry | None:
    return list_enquiries(
        actor_user_id=actor_user_id,
        is_manager_or_admin=is_manager_or_admin,
    ).filter(pk=enquiry_id).first()


def list_banks(*, is_org_admin: bool = False, unit_id: uuid.UUID | str | None = None) -> QuerySet[BankAccount]:
    """
    Bank accounts.
    If org_admin: by default returns Organization HQ bank accounts (unit_id IS NULL), or specific unit if requested.
    If dealer: strictly returns that dealer's local bank accounts.
    """
    if is_org_admin:
        if unit_id:
            return BankAccount.all_units.filter(unit_id=unit_id, is_active=True).order_by("-is_default")
        return BankAccount.all_units.filter(unit_id__isnull=True, is_active=True).order_by("-is_default")
    return BankAccount.objects.filter(is_active=True).order_by("-is_default")


def list_products() -> QuerySet[ProductCatalog]:
    """Product catalog (presets) for the dealer."""
    return ProductCatalog.objects.filter(is_active=True)


def list_techno_commercial_documents(
    *,
    actor_user_id: uuid.UUID | None = None,
    is_manager_or_admin: bool = True,
    search: str | None = None,
) -> QuerySet[TechnoCommercialDocument]:
    """
    Techno-commercial documents for the dealer, newest first.
    """
    qs = TechnoCommercialDocument.objects.all()
    if search:
        search = search.strip()
        qs = qs.filter(
            Q(title__icontains=search)
            | Q(file_name__icontains=search)
            | Q(notes__icontains=search)
            | Q(site_name__icontains=search)
            | Q(quote_number__icontains=search)
        )
    return qs.select_related("site", "quotation").order_by("-created_at")


def get_techno_commercial_document(
    *,
    document_id: uuid.UUID | str,
    actor_user_id: uuid.UUID | None = None,
    is_manager_or_admin: bool = True,
) -> TechnoCommercialDocument | None:
    return TechnoCommercialDocument.objects.filter(pk=document_id).first()


def list_agent_commissions(*, unit_id: uuid.UUID | None = None, is_org_admin: bool = False) -> list[dict]:
    """
    Returns list of all pending / payable / partially paid / paid agent commissions and lead fees.
    """
    quotes_qs = (
        Quotation.objects.filter(commission_amount__gt=0)
        .select_related("enquiry")
        .prefetch_related("payouts__attachments")
        .order_by("-created_at")
    )
    enquiries_qs = (
        Enquiry.objects.filter(lead_fee__gt=0)
        .prefetch_related("lead_fee_payouts__attachments")
        .order_by("-created_at")
    )

    results = []
    for q in quotes_qs:
        payouts_data = []
        total_paid = 0.0
        for p in q.payouts.all():
            p_amount = float(p.amount)
            total_paid += p_amount
            payouts_data.append({
                "id": str(p.id),
                "amount": p_amount,
                "payment_ref": p.payment_ref,
                "paid_at": p.paid_at.isoformat() if p.paid_at else None,
                "notes": p.notes,
                "attachments": [
                    {
                        "id": str(att.id),
                        "file_url": att.file.url if att.file else "",
                        "file_name": att.file_name or (att.file.name.split("/")[-1] if att.file else ""),
                        "file_size": att.file_size,
                    }
                    for att in p.attachments.all()
                ],
            })

        total_amount = float(q.commission_amount)
        balance = max(0.0, total_amount - total_paid)

        results.append({
            "type": "COMMISSION",
            "id": f"comm-{q.id}",
            "reference_id": str(q.id),
            "enquiry_id": str(q.enquiry_id) if q.enquiry_id else "",
            "deal_title": q.title or q.quote_no,
            "quote_no": q.quote_no,
            "customer_name": q.to_company_name or (q.enquiry.customer_name if q.enquiry else ""),
            "agent_id": str(q.agent_id) if q.agent_id else None,
            "agent_name": q.agent_name,
            "amount": total_amount,
            "paid_amount": total_paid,
            "balance_amount": balance,
            "rate": float(q.commission_rate),
            "commission_type": q.commission_type,
            "status": q.commission_status,
            "payment_ref": q.commission_payment_ref,
            "paid_at": q.commission_paid_at.isoformat() if q.commission_paid_at else None,
            "created_at": q.created_at.isoformat() if q.created_at else None,
            "payouts": payouts_data,
        })

    for e in enquiries_qs:
        payouts_data = []
        total_paid = 0.0
        for p in e.lead_fee_payouts.all():
            p_amount = float(p.amount)
            total_paid += p_amount
            payouts_data.append({
                "id": str(p.id),
                "amount": p_amount,
                "payment_ref": p.payment_ref,
                "paid_at": p.paid_at.isoformat() if p.paid_at else None,
                "notes": p.notes,
                "attachments": [
                    {
                        "id": str(att.id),
                        "file_url": att.file.url if att.file else "",
                        "file_name": att.file_name or (att.file.name.split("/")[-1] if att.file else ""),
                        "file_size": att.file_size,
                    }
                    for att in p.attachments.all()
                ],
            })

        total_amount = float(e.lead_fee)
        balance = max(0.0, total_amount - total_paid)

        results.append({
            "type": "LEAD_FEE",
            "id": f"lead-{e.id}",
            "reference_id": str(e.id),
            "enquiry_id": str(e.id),
            "deal_title": f"Lead Fee: {e.customer_name}",
            "quote_no": "-",
            "customer_name": e.customer_name,
            "agent_id": str(e.agent_id) if e.agent_id else None,
            "agent_name": e.agent_name,
            "amount": total_amount,
            "paid_amount": total_paid,
            "balance_amount": balance,
            "rate": 0,
            "commission_type": "FIXED",
            "status": e.lead_fee_status,
            "payment_ref": e.lead_fee_payment_ref,
            "paid_at": e.lead_fee_paid_at.isoformat() if e.lead_fee_paid_at else None,
            "created_at": e.created_at.isoformat() if e.created_at else None,
            "payouts": payouts_data,
        })

    return results

