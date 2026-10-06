"""
Organization-scoped routes, mounted under /api/v1/orgs/<slug>/.

The slug is consumed by `config.middleware.TenantMiddleware` before any view
runs, so views inherit `OrgScopedAPIView` and read `self.organization` rather
than taking a slug argument (C49).
It still appears in the pattern in `config/urls.py` -- the URL is the only
place the organization is named (C3).
"""

from __future__ import annotations

from django.urls import path

from core.organizations.api.views import ProvisioningView

app_name = "organizations"

urlpatterns = [
    path("provisioning/", ProvisioningView.as_view(), name="provisioning"),
]
