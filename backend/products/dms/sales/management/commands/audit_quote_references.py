"""
List quotes whose reference breaks the rule in services._quote_site.

    python manage.py audit_quote_references            # every organisation
    python manage.py audit_quote_references acme-motors

Read-only. It reports; it never changes data, because each finding needs a
person's decision (delete the draft, or confirm the customer's order first).

What it reports, per organisation:
- AMC quotes with no site on a confirmed enquiry, and confirmed AMC quotes with
  no site. (An AMC quote with no site on an OPEN enquiry is allowed: it is an
  AMC offered for a site we have not sold.)
- Sales / spares quotes that carry a site --- a sales quote references an
  enquiry only.
- AMC quotes whose site belongs to a different enquiry than the quote.
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db.models import F

from config.routers import current_tenant_db
from core.organizations.models import Organization
from core.organizations.tenancy import register_tenant_connection


class Command(BaseCommand):
    help = "Report quotes whose enquiry / site reference is inconsistent (read-only)."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("slugs", nargs="*", help="Organisation slugs (default: all).")

    def handle(self, *args: Any, **options: Any) -> None:
        from products.dms.sales.models import Quotation

        qs = Organization.objects.all()
        if options["slugs"]:
            qs = qs.filter(slug__in=options["slugs"])
            missing = set(options["slugs"]) - set(qs.values_list("slug", flat=True))
            if missing:
                raise CommandError(f"No organisation with slug: {', '.join(sorted(missing))}")

        total = 0
        for org in qs.order_by("slug"):
            if not org.is_ready:
                self.stdout.write(f"{org.slug}: skipped (not provisioned)")
                continue
            token = current_tenant_db.set(register_tenant_connection(org))
            try:
                quotes = Quotation._base_manager.select_related("enquiry", "site")
                amc = quotes.filter(quote_type="AMC")
                findings = [
                    (
                        "AMC quote with no site on a confirmed enquiry",
                        amc.filter(site__isnull=True, enquiry__status="CONFIRMED"),
                    ),
                    (
                        "Confirmed AMC quote with no site",
                        amc.filter(site__isnull=True, status="CONFIRMED"),
                    ),
                    (
                        "Sales/spares quote carrying a site",
                        quotes.exclude(quote_type="AMC").filter(site__isnull=False),
                    ),
                    (
                        "AMC quote whose site is another enquiry's",
                        amc.filter(site__isnull=False).exclude(site__enquiry_id=F("enquiry_id")),
                    ),
                ]
                lines = [
                    f"  - {label}: {q.quote_no} ({q.id}) on enquiry {q.enquiry.customer_name}"
                    for label, rows in findings
                    for q in rows
                ]
            finally:
                current_tenant_db.reset(token)
            total += len(lines)
            self.stdout.write(f"{org.slug}: {len(lines)} finding(s)")
            for line in lines:
                self.stdout.write(line)

        ok = "" if total else " Every quote references the right record."
        self.stdout.write(f"\n{total} finding(s) in total.{ok}")
