import django
import sys
import uuid
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.base")
django.setup()

from core.accounts.models import User
from core.organizations.models import Organization, Membership, BusinessUnit, MembershipRole

user = User.objects.get(email="rahul@acmemotors.in")
org, _ = Organization.objects.get_or_create(
    id=uuid.UUID("1a2b3c4d-0000-0000-0000-000000000001"),
    defaults={"name": "Acme Motors", "slug": "acme-motors"}
)

unit, _ = BusinessUnit.objects.get_or_create(
    organization=org,
    name="HQ"
)

Membership.objects.get_or_create(
    user=user,
    organization=org,
    unit=None,
    defaults={"role": MembershipRole.OWNER}
)

Membership.objects.get_or_create(
    user=user,
    organization=org,
    unit=unit,
    defaults={"role": MembershipRole.MEMBER}
)

print("Setup complete")
