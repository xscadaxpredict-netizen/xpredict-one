"""
Fold `main`'s head offices into each organisation's ROOT territory (C82
amended, the owner 2026-11-23; the merge of `main`, Q74).

`main` gave every organisation a hidden "head office" unit (C-local-4,
`is_head_office`) and filed organisation-level DMS work there. On this branch
the root of the territory tree IS the head office, so after the merge each of
those rows is a duplicate: an ordinary-looking dealer territory under the root
that every dealer query already leaves out.

FOR EACH ORGANISATION WITH A HEAD OFFICE, IN THIS ORDER:

1. Refuse, changing nothing, if anybody's grant places them at the head office
   or it has territories under it -- neither should exist (`main` never
   confined anybody there), so either means something unexpected happened.
2. In the organisation's own database, re-file every DMS record whose
   `territory_id` is the head office at the root, in one transaction.
3. Delete the head-office row from the control database.

Run it ONCE, by hand, after the merged release's `migrate` and
`migrate_all_tenants` (`--plan` first). Safe to run again: an organisation with
no head office left is skipped. A later release drops `is_head_office`.

`core` NEVER IMPORTS `products` (import-linter's layers): the DMS models are
found through the app registry, as every model of a `dms_*` app with a
`territory_id` field.
"""

from __future__ import annotations

from typing import Any

from django.apps import apps
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from core.organizations.models import MembershipAppTerritory, Organization, Territory
from core.organizations.tenancy import register_tenant_connection
from core.permissions.models import AppCode


def _dms_models_with_territory() -> list:
    return [
        model
        for config in apps.get_app_configs()
        if config.label.startswith("dms_")
        for model in config.get_models()
        if any(field.name == "territory_id" for field in model._meta.get_fields())
    ]


class Command(BaseCommand):
    help = "Fold main's head offices into each organisation's root territory (run once)."

    def add_arguments(self, parser) -> None:
        parser.add_argument("slugs", nargs="*", help="Only these organisations (default: all).")
        parser.add_argument(
            "--plan", action="store_true", help="Report what would move; change nothing."
        )

    def handle(self, *args: Any, **options: Any) -> None:
        organizations = Organization.objects.order_by("slug")
        if options["slugs"]:
            organizations = organizations.filter(slug__in=options["slugs"])
        models = _dms_models_with_territory()
        failures = 0

        for organization in organizations:
            head = Territory.objects.filter(
                organization=organization, is_head_office=True
            ).first()
            if head is None:
                self.stdout.write(f"  {organization.slug}: no head office -- nothing to do")
                continue
            # DMS's root: head offices were DMS's, and so is the tree they fold into.
            root = Territory.objects.root_for(organization, AppCode.DMS)

            placed = MembershipAppTerritory.objects.filter(territory=head).count()
            children = Territory.objects.get_descendants(head).count()
            if placed or children:
                failures += 1
                self.stderr.write(
                    self.style.ERROR(
                        f"  {organization.slug}: REFUSED -- {placed} grant place(s) and "
                        f"{children} territory(ies) under the head office; nothing changed"
                    )
                )
                continue

            if not organization.is_ready:
                self.stdout.write(
                    f"  {organization.slug}: no database yet -- the head office row only"
                )
                moved = {}
            else:
                moved = self._refile(organization, models, head, root, plan=options["plan"])

            summary = ", ".join(f"{name} {n}" for name, n in moved.items() if n) or "no records"
            if options["plan"]:
                self.stdout.write(f"  {organization.slug}: WOULD move {summary} to the root")
                continue
            Territory.objects.filter(pk=head.pk).delete()
            self.stdout.write(
                self.style.SUCCESS(f"  {organization.slug}: moved {summary}; head office retired")
            )

        if failures:
            raise CommandError(f"{failures} organisation(s) refused -- see above.")

    def _refile(self, organization, models, head, root, *, plan: bool) -> dict[str, int]:
        from config.routers import current_tenant_db

        alias = register_tenant_connection(organization)
        token = current_tenant_db.set(alias)
        moved: dict[str, int] = {}
        try:
            # The base manager: the scoped one refuses with no territory scope
            # decided, and this must see every record of the organisation.
            with transaction.atomic(using=alias):
                for model in models:
                    rows = model._base_manager.using(alias).filter(territory_id=head.id)
                    label = f"{model._meta.app_label}.{model.__name__}"
                    moved[label] = rows.count() if plan else rows.update(territory_id=root.id)
        finally:
            current_tenant_db.reset(token)
        return moved
