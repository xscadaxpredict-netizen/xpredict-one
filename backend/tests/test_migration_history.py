"""
Migrations are history: none of them may read a module that keeps changing.

A migration that imports live application data replays TODAY's version of it
on every database built from scratch -- the test database on every run, CI, a
new machine, a rebuilt server -- while every database that already ran it
keeps the version it saw. Same migration, different databases, and nothing
says so.

THIS IS NOT HYPOTHETICAL. `permissions/0002` and `0003` imported
`core/permissions/catalogue.py` until 2026-11-05, and after `c87b376` edited
that file, a fresh database gave the dealership-level Tech support role two
organisation-library permissions production never had. They read the frozen
`migrations/_catalogue_2026_10_03.py` now; this keeps it that way.

READ AS SOURCE, NOT IMPORTED. Importing a migration to inspect it would run its
module-level code, and the question is what the file says, not what it does.
"""

from __future__ import annotations

import ast
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent

# Modules a migration must never import. The catalogue is the one that bit; a
# new entry belongs here the moment another migration-readable data module
# appears.
FORBIDDEN = {"core.permissions.catalogue"}


def _migration_files() -> list[Path]:
    files = []
    for root in ("core", "products"):
        files.extend((BACKEND / root).glob("**/migrations/*.py"))
    return sorted(files)


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            found.add(node.module)
            # `from core.permissions import catalogue` names the module too.
            found.update(f"{node.module}.{alias.name}" for alias in node.names)
        elif isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
    return found


def test_the_scan_actually_finds_the_migrations():
    """
    A glob that matches nothing makes the test below pass for any code at all.
    `0002` is the file this exists for, so it must be among the ones read.
    """
    names = {path.name for path in _migration_files()}

    assert "0002_seed_catalogue.py" in names
    assert "0004_dms_library_tools_and_store_orders.py" in names


def test_no_migration_imports_live_application_data():
    offenders = {
        str(path.relative_to(BACKEND)): sorted(_imports(path) & FORBIDDEN)
        for path in _migration_files()
        if _imports(path) & FORBIDDEN
    }

    assert offenders == {}
