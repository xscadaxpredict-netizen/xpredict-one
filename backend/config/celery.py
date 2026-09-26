"""
Celery application.

Every task takes org_id as an argument and sets tenant context itself, then
resets it in a finally block. A task that relies on ambient context will run
against whatever database the worker touched last.
"""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("xpredict_one")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()


@app.task(name="config.debug_task")
def debug_task() -> str:
    """Smoke test: proves the broker round-trips. Carries no tenant context."""
    return "celery-ok"
