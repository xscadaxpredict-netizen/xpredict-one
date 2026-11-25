"""
Product code must not use a bare `transaction.atomic`.

With no `using=`, it opens the transaction on `default` -- the control plane --
while every product model lives in the organisation's own database. Nothing
looked wrong: the services ran, the tests passed (SQLite ignores row locks),
and none of the writes were atomic. MySQL finally refused `select_for_update()`
when confirming an order. Use `config.transactions.tenant_atomic`.
"""

from __future__ import annotations

import re
from pathlib import Path

PRODUCTS = Path(__file__).resolve().parent.parent / "products"
BARE_ATOMIC = re.compile(r"transaction\.atomic(?!\(\s*using=)")


def test_no_product_code_opens_a_transaction_on_the_control_plane():
    offenders = [
        f"{path.relative_to(PRODUCTS.parent)}:{number}"
        for path in PRODUCTS.rglob("*.py")
        if "migrations" not in path.parts and "tests" not in path.parts
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1)
        if BARE_ATOMIC.search(line)
    ]
    assert not offenders, "Use tenant_atomic instead of transaction.atomic in: " + ", ".join(
        offenders
    )


# THESE WRITE SERVICES MUST RUN IN ONE TENANT TRANSACTION. They delete and
# recreate rows or take row locks (select_for_update, which MySQL refuses
# outside a transaction). A helper inserted between `@tenant_atomic` and its
# function once silently moved the decorator off `save_quotation`; nothing
# failed until a save broke half-way. `tenant_atomic` uses functools.wraps,
# so a wrapped function carries `__wrapped__`.
MUST_BE_ATOMIC = [
    "create_enquiry",
    "save_quotation",
    "delete_quotation",
    "confirm_order",
    "unconfirm_order",
    "confirm_amc_quote",
    "unconfirm_amc_quote",
]


def test_quote_and_order_writes_run_in_a_tenant_transaction():
    from products.dms.sales import services

    missing = [n for n in MUST_BE_ATOMIC if not hasattr(getattr(services, n), "__wrapped__")]
    assert not missing, f"not wrapped in @tenant_atomic: {missing}"
