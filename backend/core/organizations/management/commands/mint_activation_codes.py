"""
Mint activation codes. One code founds one organization (C14).

A MANAGEMENT COMMAND RATHER THAN A SCREEN, which answers the "who generates
them, and where are they recorded" half of Q20 (C47). A code is a licence to
create a tenant database, so minting one is an operator action with a shell
and a record, not a button somebody can reach from a browser session. When
there is a reason to put it behind a UI, that UI is for Xpredict staff and
needs its own authorization story -- it is not an organization-admin feature.

    python manage.py mint_activation_codes --label "Northway Auto Group"
    python manage.py mint_activation_codes --count 5 --label "Trade show" --days 30
    python manage.py mint_activation_codes --label "Internal" --never-expires
"""

from __future__ import annotations

import secrets
from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from core.organizations.models import ActivationCode

# 24 bytes of randomness, which `token_urlsafe` renders as 32 characters.
#
# THIS IS WHAT MAKES THE CODE SAFE, not the rate limit. `XPRD-2026` was the
# shape Q20 flagged as guessable and it is: a human-memorable code is a code an
# attacker can enumerate, and no throttle fixes that -- it only slows it to the
# speed of a botnet. At 32 characters, guessing one is not a strategy.
#
# The cost is that it cannot be read down a phone line, which is accepted: a
# code is pasted from an email, and C14 already keeps `?code=` link support for
# exactly that path.
CODE_ENTROPY_BYTES = 24

# Q20 asked whether an unused code should die. 90 days (C47): long enough for a
# sales cycle, short enough that a code leaked from an old inbox is usually
# already dead. `expires_at` stays nullable, so --never-expires remains
# possible and the policy can change without a migration.
DEFAULT_LIFETIME_DAYS = 90


class Command(BaseCommand):
    help = "Create single-use activation codes, each good for one organization."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--count", type=int, default=1)
        parser.add_argument(
            "--label",
            required=True,
            help="Who this is for. Required so an unspent code can be traced to a customer.",
        )
        parser.add_argument("--days", type=int, default=DEFAULT_LIFETIME_DAYS)
        parser.add_argument("--never-expires", action="store_true")

    def handle(self, *args: Any, **options: Any) -> None:
        count = options["count"]
        if count < 1:
            raise CommandError("--count must be at least 1.")

        if options["never_expires"]:
            expires_at = None
        else:
            days = options["days"]
            if days < 1:
                raise CommandError("--days must be at least 1, or pass --never-expires.")
            expires_at = timezone.now() + timezone.timedelta(days=days)

        codes = [
            ActivationCode.objects.create(
                code=secrets.token_urlsafe(CODE_ENTROPY_BYTES),
                label=options["label"],
                expires_at=expires_at,
            )
            for _ in range(count)
        ]

        # PRINTED ONCE, and this is the only time anybody sees them conveniently
        # -- they are stored raw, so they can be read back out of the table, but
        # that is a database read rather than something a sales process should
        # rely on.
        self.stdout.write(
            self.style.SUCCESS(f"Minted {len(codes)} code(s) for {options['label']}:")
        )
        for code in codes:
            self.stdout.write(f"  {code.code}")

        when = "never" if expires_at is None else expires_at.date().isoformat()
        self.stdout.write(f"Expires: {when}")
