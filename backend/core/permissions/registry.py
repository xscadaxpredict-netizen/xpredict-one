"""
Which apps exist, and which of them care about dealerships.

THIS IS THE APP REGISTRY the implementation plan puts at the top of Phase 3,
and it is deliberately four lines: `AppCode` already names the apps, so the
only fact missing was unit-awareness.

UNIT-AWARENESS IS A PROPERTY OF THE APP, NOT OF THE PERSON (C5). DMS splits its
records by dealership. CRM and E-commerce have no dealerships at all --- their
users belong to the organization directly --- so a unit means nothing there.

Declaring it ONCE here is the point. The alternative is inferring it per
request from whether somebody happens to have a unit, which gets the answer
right for DMS and silently wrong for CRM: a dealer-scoped person would have
their CRM queries filtered by a column CRM does not have.
"""

from __future__ import annotations

from core.permissions.models import AppCode

# E-commerce is absent on purpose rather than listed as False: it is deferred
# and nothing about it is designed (Q15), so this file has no opinion to offer.
UNIT_AWARE_APPS: frozenset[str] = frozenset({AppCode.DMS})


def is_unit_aware(app: str) -> bool:
    """Whether records in this app belong to a dealership."""
    return app in UNIT_AWARE_APPS
