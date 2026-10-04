import os
import django

from django.contrib.auth import get_user_model
from core.accounts.models import Organization, OrganizationMembership, Application, ApplicationAccess
from products.dms.sales.models import ProductCatalog

User = get_user_model()

# Create organization
org, _ = Organization.objects.get_or_create(
    slug='acme-motors',
    defaults={'name': 'Acme Motors Corporation'}
)

# Create applications (DMS, CRM, ECOMMERCE)
dms, _ = Application.objects.get_or_create(key='dms', defaults={'name': 'DMS'})
crm, _ = Application.objects.get_or_create(key='crm', defaults={'name': 'CRM'})
ecommerce, _ = Application.objects.get_or_create(key='ecommerce', defaults={'name': 'E-Commerce'})

# Grant org access to applications
ApplicationAccess.objects.get_or_create(organization=org, application=dms, defaults={'is_active': True})
ApplicationAccess.objects.get_or_create(organization=org, application=crm, defaults={'is_active': True})
ApplicationAccess.objects.get_or_create(organization=org, application=ecommerce, defaults={'is_active': True})

# Create admin user
user, created = User.objects.get_or_create(
    email='admin@acmemotors.in',
    defaults={
        'first_name': 'Admin',
        'last_name': 'User',
        'is_staff': True,
        'is_superuser': True,
    }
)
if created:
    user.set_password('admin123')
    user.save()

# Add user to organization
OrganizationMembership.objects.get_or_create(
    organization=org,
    user=user,
    defaults={'role': 'owner'}
)

print("Seed data created successfully! Login with admin@acmemotors.in / admin123")
