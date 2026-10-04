"""
Event handlers for Service.

Reacts to events published by other modules and products. Handlers must be
idempotent --- the dispatcher retries, so the same event will arrive twice.

Every event carries the org ID, and a handler sets tenant context from it
rather than assuming ambient context.
"""

from __future__ import annotations
