"""
Territory becomes a tree, step 2 of 3: every existing territory becomes a root.

Before C72 every territory was a dealership with nothing above it, so each one
is a top-level box: `depth` 1, no children, and its own root `path`. Roots are
numbered in the order the dealerships were created (then by id, so two created
in the same instant still get a stable order).

THE ENCODING IS WRITTEN OUT HERE, not borrowed from treebeard or from the
model. A migration is history: it must produce the same paths in five years
that it produces today, whatever the model's `steplen` or treebeard's
internals have become by then (`tests/test_migration_history.py`). It matches
treebeard's materialised path for `steplen = 5` and its default alphabet:
position N written in base 36, left-padded with "0" to five characters --
1 -> "00001", 36 -> "00010". `0012` is followed by a test that runs
treebeard's own `find_problems()` over the result.

IDEMPOTENT: only rows still without a path are numbered, continuing after the
highest root already present, so re-running after a partial failure finishes
the job instead of renumbering what is done (C39).

The reverse is a no-op: reversing `0010` drops the columns this fills.
"""

from django.db import migrations

ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
STEPLEN = 5


def _encode(position: int) -> str:
    digits = ""
    while position:
        position, remainder = divmod(position, len(ALPHABET))
        digits = ALPHABET[remainder] + digits
    return digits.rjust(STEPLEN, ALPHABET[0])


def _decode(path: str) -> int:
    value = 0
    for char in path:
        value = value * len(ALPHABET) + ALPHABET.index(char)
    return value


def give_every_territory_a_root_path(apps, schema_editor):
    Territory = apps.get_model("organizations", "Territory")

    done = Territory.objects.filter(path__isnull=False, depth=1).values_list("path", flat=True)
    position = max((_decode(path) for path in done), default=0)

    for territory in Territory.objects.filter(path__isnull=True).order_by("created_at", "id"):
        position += 1
        territory.path = _encode(position)
        territory.depth = 1
        territory.numchild = 0
        territory.save(update_fields=["path", "depth", "numchild"])


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0010_territory_tree_fields"),
    ]

    operations = [
        migrations.RunPython(give_every_territory_a_root_path, migrations.RunPython.noop),
    ]
