"""
Give every AMC quote the confirmed site it is for.

Until now an AMC quote recorded its site only when it was confirmed, so a draft
or sent AMC quote pointed at the site only through its enquiry. From here on the
site is set when the quote is created (see services._quote_site); this fills it
in for quotes saved before that.

Each enquiry has at most one ConfirmedSite (OneToOne), so the site is not a
guess. AMC quotes on an enquiry that was never confirmed have no site to point
at and are left as they are: an AMC may be offered on an open enquiry for a
site we have not sold.
"""

from django.db import migrations


def backfill(apps, schema_editor):
    db = schema_editor.connection.alias
    Quotation = apps.get_model("dms_sales", "Quotation")
    ConfirmedSite = apps.get_model("dms_sales", "ConfirmedSite")
    site_by_enquiry = dict(
        ConfirmedSite._base_manager.using(db).values_list("enquiry_id", "id")
    )
    pending = Quotation._base_manager.using(db).filter(quote_type="AMC", site__isnull=True)
    for quote in pending.only("id", "enquiry_id"):
        site_id = site_by_enquiry.get(quote.enquiry_id)
        if site_id:
            Quotation._base_manager.using(db).filter(pk=quote.pk).update(site_id=site_id)


class Migration(migrations.Migration):
    dependencies = [
        ("dms_sales", "0013_remove_productcatalog_margin_percent"),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
