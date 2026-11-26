"""
NUMBERS CARRY THE TERRITORY'S CODE (the owner, 2026-11-26):

    ENQ/DLM/26-27/0001   QT/DLM/26-27/0001   AMC/...   SPR/...   OC/DLM/26-27/0001

and so are unique across the organisation, which is what lets Delete territory
move records without two of them sharing a number. TENANT migration.

1. RENUMBERS what exists, per (territory, prefix, financial year), oldest first
   -- the same order `main`'s 0015 numbered enquiries in. Codes are in the
   CONTROL database, read on its own connection. A territory made before codes
   were required may have none: it gets `T` + the first five characters of its
   id (`T1A2B3`), unique in practice and plainly a stand-in, so nothing here
   can fail half-way. New records at such a territory are refused until it
   has a real code (`TerritoryNeedsACodeError`).
   An enquiry's copy of its order's OC number follows the order's new one.
2. SWAPS THE RULES: per-territory unique numbers become organisation-wide.
   The old rules are dropped by NAME in SQL where an index exists -- Django's
   `RemoveConstraint` builds the drop from the fields, and after this branch's
   column rename it cannot (see 0017). The OC rule is conditional, which MySQL
   never creates, so it is changed in the state alone.

Production has no real customer data (2026-11-26), so no number anyone
relies on changes. Reverse: rules only; numbers are not un-renumbered.
"""

import datetime
from zoneinfo import ZoneInfo

from django.db import connections, migrations, models

_FY_ZONE = ZoneInfo("Asia/Kolkata")
QUOTE_PREFIX = {"NORMAL": "QT", "AMC": "AMC", "SPARES": "SPR"}


def _fy_label(when: datetime.datetime) -> str:
    day = when.astimezone(_FY_ZONE).date()
    start = day.year if day.month >= 4 else day.year - 1
    return f"{start % 100:02d}-{(start + 1) % 100:02d}"


def _codes() -> dict[str, str]:
    """Territory id (hex, as stored) -> its code, from the control database."""
    with connections["default"].cursor() as cursor:
        cursor.execute("SELECT id, code FROM organizations_territory")
        return {str(pk).replace("-", ""): code for pk, code in cursor.fetchall() if code}


def _code_for(codes: dict[str, str], territory_id) -> str:
    key = str(territory_id).replace("-", "")
    return codes.get(key) or f"T{key[:5].upper()}"


def _renumber(manager, field: str, prefix_of, codes: dict[str, str]) -> dict:
    counters: dict[tuple, int] = {}
    renumbered = {}
    rows = manager.order_by("created_at", "id").values_list(
        "id", "territory_id", "created_at", *prefix_of.fields
    )
    for pk, territory_id, created_at, *extra in rows:
        prefix = prefix_of(*extra)
        if prefix is None:
            continue
        code = _code_for(codes, territory_id)
        fy = _fy_label(created_at)
        key = (prefix, code, fy)
        counters[key] = counters.get(key, 0) + 1
        number = f"{prefix}/{code}/{fy}/{counters[key]:04d}"
        manager.filter(pk=pk).update(**{field: number})
        renumbered[pk] = number
    return renumbered


class _Prefix:
    def __init__(self, fields, fn):
        self.fields = fields
        self.fn = fn

    def __call__(self, *values):
        return self.fn(*values)


def renumber(apps, schema_editor):
    db = schema_editor.connection.alias
    codes = _codes()

    Enquiry = apps.get_model("dms_sales", "Enquiry")
    Quotation = apps.get_model("dms_sales", "Quotation")
    ConfirmedSite = apps.get_model("dms_sales", "ConfirmedSite")

    _renumber(
        Enquiry._base_manager.using(db), "enquiry_no", _Prefix((), lambda: "ENQ"), codes
    )
    _renumber(
        Quotation._base_manager.using(db),
        "quote_no",
        _Prefix(("quote_type",), lambda quote_type: QUOTE_PREFIX.get(quote_type, "QT")),
        codes,
    )
    sites = ConfirmedSite._base_manager.using(db)
    new_oc = _renumber(
        sites,
        "oc_number",
        _Prefix(("oc_number",), lambda oc: "OC" if oc else None),
        codes,
    )
    # The enquiry keeps a copy of its order's OC number.
    for site_pk, number in new_oc.items():
        enquiry_id = sites.filter(pk=site_pk).values_list("enquiry_id", flat=True).first()
        if enquiry_id:
            Enquiry._base_manager.using(db).filter(pk=enquiry_id).update(oc_number=number)


def _drop_index(name: str, table: str, recreate: str) -> migrations.RunSQL:
    return migrations.RunSQL(
        sql=f"ALTER TABLE `{table}` DROP INDEX `{name}`",
        reverse_sql=f"ALTER TABLE `{table}` ADD CONSTRAINT `{name}` UNIQUE ({recreate})",
    )


class Migration(migrations.Migration):
    dependencies = [
        # NOT on any control-plane migration: a tenant app depending on one would
        # drag it into every tenant database's bookkeeping (CLAUDE.md).
        ("dms_sales", "0017_enquiry_number_by_territory"),
    ]

    operations = [
        migrations.RunPython(renumber, migrations.RunPython.noop),
        migrations.SeparateDatabaseAndState(
            database_operations=[
                _drop_index(
                    "uq_enquiry_territory_enquiry_no",
                    "dms_sales_enquiry",
                    "`territory_id`, `enquiry_no`",
                ),
                _drop_index(
                    "uq_quotation_unit_quote_no",
                    "dms_sales_quotation",
                    "`territory_id`, `quote_no`",
                ),
            ],
            state_operations=[
                migrations.RemoveConstraint(
                    model_name="enquiry", name="uq_enquiry_territory_enquiry_no"
                ),
                migrations.RemoveConstraint(
                    model_name="quotation", name="uq_quotation_unit_quote_no"
                ),
                migrations.RemoveConstraint(
                    model_name="confirmedsite", name="uq_site_unit_oc_number"
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="enquiry",
            constraint=models.UniqueConstraint(fields=("enquiry_no",), name="uq_enquiry_no"),
        ),
        migrations.AddConstraint(
            model_name="quotation",
            constraint=models.UniqueConstraint(fields=("quote_no",), name="uq_quotation_quote_no"),
        ),
        migrations.AddConstraint(
            model_name="confirmedsite",
            constraint=models.UniqueConstraint(
                condition=models.Q(("oc_number", ""), _negated=True),
                fields=("oc_number",),
                name="uq_site_oc_number",
            ),
        ),
    ]
