"""
Celery tasks for Tech Support.

Every task takes `org_id` as an argument and sets tenant context itself, then
resets it in a finally block. A task that relies on ambient context will run
against whatever database the worker touched last.
"""

from __future__ import annotations
