"""
The organisation becomes the root of its territory tree, step 2 of 3: give every
organisation a root box and move its existing top-level territories under it.

Before this, an organisation's top-level territories were treebeard roots
themselves (`0011`). After it, each organisation has ONE root of kind
`organisation` at depth 1, and every other territory sits beneath it -- one
level deeper than before, its path prefixed with the root's. A moved box keeps
its id, so every membership, invitation and tenant record still points at it.

ORGANISATIONS WITH NO TERRITORIES GET A ROOT TOO: the tree is the
organisation's whether or not anything has been drawn in it yet.

NO PATH CAN COLLIDE WHILE THIS RUNS. A new root is numbered after the highest
root already in the table, so no existing path starts with its prefix; every
path written below begins with that prefix.

IDEMPOTENT, because MySQL does not run this in a transaction it can roll back
(C39): the root is created FIRST, and a re-run finds it, numbers further
children after the ones already moved, and moves only what is still at the top.
`numchild` is recounted at the end rather than incremented.

THE ENCODING IS WRITTEN OUT, as in `0011`, for the same reason: a migration is
history (`tests/test_migration_history.py`). Base 36 over digits and capitals,
five characters per level; a test pins it to treebeard's.

The reverse is a no-op: reversing `0013` drops `is_root`, and a tree with the
organisation at its root is a valid tree to leave behind.
"""

import uuid

from django.db import migrations

ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
STEPLEN = 5


def _encode(position: int) -> str:
    digits = ""
    while position:
        position, remainder = divmod(position, len(ALPHABET))
        digits = ALPHABET[remainder] + digits
    return digits.rjust(STEPLEN, ALPHABET[0])


def _decode(step: str) -> int:
    value = 0
    for char in step:
        value = value * len(ALPHABET) + ALPHABET.index(char)
    return value


def put_every_tree_under_its_organisation(apps, schema_editor):
    Organization = apps.get_model("organizations", "Organization")
    Territory = apps.get_model("organizations", "Territory")

    for organization in Organization.objects.order_by("created_at", "id"):
        root = Territory.objects.filter(organization=organization, is_root=True).first()
        if root is None:
            highest = max(
                (_decode(p) for p in Territory.objects.filter(depth=1).values_list("path", flat=True)),
                default=0,
            )
            root = Territory.objects.create(
                id=uuid.uuid4(),
                organization=organization,
                kind="organisation",
                name="",
                is_root=True,
                path=_encode(highest + 1),
                depth=1,
                numchild=0,
            )

        moved = Territory.objects.filter(
            organization=organization, depth=2, path__startswith=root.path
        ).values_list("path", flat=True)
        position = max((_decode(p[STEPLEN:]) for p in moved), default=0)

        tops = Territory.objects.filter(
            organization=organization, depth=1, is_root__isnull=True
        ).order_by("path")
        for top in tops:
            position += 1
            old_prefix = top.path
            new_prefix = root.path + _encode(position)
            for node in Territory.objects.filter(path__startswith=old_prefix).order_by("path"):
                node.path = new_prefix + node.path[len(old_prefix) :]
                node.depth += 1
                node.save(update_fields=["path", "depth"])

        root.numchild = Territory.objects.filter(
            organization=organization, depth=2, path__startswith=root.path
        ).count()
        root.save(update_fields=["numchild"])


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0013_territory_root_fields"),
    ]

    operations = [
        migrations.RunPython(put_every_tree_under_its_organisation, migrations.RunPython.noop),
    ]
