"""
Which apps care about dealerships.

THE ANSWER IS A COLUMN NOW, `App.unit_aware` (C71). This file used to hold it
as `UNIT_AWARE_APPS = {DMS}`; the fact moved into the table so it is readable in
Workbench beside the rest of what an app is. The function stays, with the same
signature, so its callers did not change.

UNIT-AWARENESS IS A PROPERTY OF THE APP, NOT OF THE PERSON (C5) --- see
`App.unit_aware` for why that matters.

AN UNKNOWN CODE ANSWERS False, as it did before. Every `app` column is a
foreign key to `App`, so a code that reaches here from a stored row exists; one
that does not came from a request and is refused by whoever checks the grant.
"""

from __future__ import annotations

from core.permissions.models import App


def is_unit_aware(app: str) -> bool:
    """Whether records in this app belong to a dealership."""
    return App.objects.filter(code=app, unit_aware=True).exists()
