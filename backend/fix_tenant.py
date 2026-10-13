import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.base")
django.setup()

from core.organizations.models import Organization
from core.organizations.tenancy import register_tenant_connection
from django.core.management import call_command
from django.db import connections

org = Organization.objects.get(slug="acme-motors")
org.db_name = "xpredict_acme_motors"
org.save()

# Register the connection (this creates the DB if it doesn't exist)
alias = register_tenant_connection(org)

# Now migrate the tenant database
print(f"Migrating tenant database: {alias}")
call_command("migrate", database=alias)
