"""
Events Sales publishes for other DMS modules.

A module never writes another module's models (CLAUDE.md), so Sales announces
what happened and the owner of the affected data reacts in its own handlers.
"""

from __future__ import annotations

from django.dispatch import Signal

#: An AMC quote went from CONFIRMED back to QUOTE_SENT.
#: Sent inside the unconfirm transaction with `quote_id` and `actor_user_id`;
#: site_services cancels the visits it had booked that have not happened yet.
amc_quote_unconfirmed = Signal()
