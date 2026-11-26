"""
DMS's top box gets the code "HO" where it has none (2026-11-26).

Numbers carry their territory's code (ENQ/HO/26-27/0001), and the organisation
is where the owner files, so its box needs one. New organisations get "HO" when
the box is made (`TerritoryManager._root_fields`); this gives it to the boxes
that already exist -- unless another territory in that tree already uses "HO",
in which case the owner sets one in Territory Management.

Control plane: a plain `migrate`. Reverse: nothing (a code is harmless).
"""

from django.db import migrations


def give_roots_a_code(apps, schema_editor):
    Territory = apps.get_model("organizations", "Territory")
    for root in Territory.objects.filter(app_id="dms", is_root=True, code__isnull=True):
        taken = Territory.objects.filter(
            organization_id=root.organization_id, app_id="dms", code="HO"
        ).exists()
        if not taken:
            Territory.objects.filter(pk=root.pk).update(code="HO")


class Migration(migrations.Migration):
    dependencies = [("organizations", "0028_position")]

    operations = [migrations.RunPython(give_roots_a_code, migrations.RunPython.noop)]
