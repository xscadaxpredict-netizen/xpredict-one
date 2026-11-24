"""
DMS settings' work in the ORGANISATION'S OWN DATABASE (the tenant): moving
DMS records from one territory to another, for Delete territory (the owner,
2026-11-24: "before deleting a territory the records in that territory must be
transferred to a different territory").

Every record type that carries a territory is a `TerritoryScopedModel`; they
are FOUND, not listed, so a record type added later is transferred too.
"""

from __future__ import annotations

import uuid

from django.apps import apps
from django.db import router, transaction

from shared.base_models import TerritoryScopedModel


def territory_record_models() -> list[type[TerritoryScopedModel]]:
    """Every concrete DMS record type that lives at a territory."""
    return [
        model
        for model in apps.get_models()
        if issubclass(model, TerritoryScopedModel) and not model._meta.abstract
    ]


def count_territory_records(territory_id: uuid.UUID) -> int:
    """How many DMS records live at this territory -- for Delete's summary."""
    return sum(
        model.all_territories.filter(territory_id=territory_id).count()
        for model in territory_record_models()
    )


def transfer_territory_records(*, from_id: uuid.UUID, to_id: uuid.UUID) -> int:
    """
    Every DMS record at `from_id` now lives at `to_id`; answers how many moved.

    ONE TRANSACTION ON THE TENANT DATABASE, so a failure moves none.
    `all_territories`, the unfiltered manager, ON PURPOSE: this is the
    organisation-wide data fix the manager's docstring reserves it for. SAFE TO
    REPEAT: a second run finds nothing left at `from_id`.
    """
    record_models = territory_record_models()
    moved = 0
    with transaction.atomic(using=router.db_for_write(record_models[0])):
        for model in record_models:
            moved += model.all_territories.filter(territory_id=from_id).update(
                territory_id=to_id
            )
    return moved
