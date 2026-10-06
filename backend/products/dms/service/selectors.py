"""
Read logic for Service.

Queries live here rather than in views, so a list endpoint, an export and a
dashboard tile all share one definition of "the enquiries this user may see".

Unit scoping is not applied here by hand. Service models inherit from
`UnitScopedModel`, whose default manager filters by the `allowed_units`
contextvar --- so `Model.objects` is already scoped to the caller's dealer.
Use `Model.all_units` only for deliberate fleet-wide reporting, and justify it.
"""

from __future__ import annotations
