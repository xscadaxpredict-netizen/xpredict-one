"""
Where DMS records may live -- their `home_kinds` (C72 piece 3 step 3a, C76).

A record type that a person files (an enquiry, a bank account) declares
`home_kinds` on its model; a record that hangs off another one (a follow-up,
a complaint) declares `home_follows` instead and lives wherever its parent
does. See `shared.base_models.TerritoryScopedModel`.

PRODUCT STRUCTURE, NOT A CUSTOMER SETTING. Which kinds of place a record type
may live at is decided here, by us, in code -- Zoho is the same. What a
customer configures is who SEES those records (sharing, C72 piece 6).
"""

from __future__ import annotations

from core.organizations.models import TerritoryKind

DEALERSHIP_RECORD: tuple[str, ...] = (
    TerritoryKind.ORGANISATION,  # the head-office pool (the owner, 2026-11-13)
    TerritoryKind.REGION,  # the regional pool: no dealership chosen yet
    TerritoryKind.DEALER,
    TerritoryKind.BRANCH,
)
"""
Enquiries and the other records a dealership works on. Never a warehouse:
that is for stock, which will declare its own kinds, e.g. `(ORGANISATION,
WAREHOUSE)`.
"""
