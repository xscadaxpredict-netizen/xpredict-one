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
