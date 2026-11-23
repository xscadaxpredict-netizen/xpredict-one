"""
Transactions on the ORGANISATION'S database.

`@transaction.atomic` with no `using=` opens a transaction on `default`, which
is the CONTROL PLANE. Every DMS model lives in the organisation's own database,
so a service decorated that way was never atomic at all: a failure half way
through left half the writes behind, and MySQL refused `select_for_update()`
outright ("cannot be used outside of a transaction") -- which is how this was
found, confirming an order.

`tenant_atomic` resolves the database when the call STARTS, from the same
`current_tenant_db` the router reads, and fails closed with no tenant bound.
It cannot be resolved at import time: one process serves every organisation.

    @tenant_atomic
    def confirm_order(...): ...

    with tenant_atomic():
        ...
"""

from __future__ import annotations

import functools
from collections.abc import Callable
from typing import Any

from django.db import transaction

from config.routers import _require_tenant_db


def tenant_atomic(func: Callable[..., Any] | None = None) -> Any:
    if func is None:
        return transaction.atomic(using=_require_tenant_db())

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        # A fresh Atomic per call, so nested and recursive calls each get their
        # own savepoint rather than sharing one decorator instance.
        with transaction.atomic(using=_require_tenant_db()):
            return func(*args, **kwargs)

    return wrapper
