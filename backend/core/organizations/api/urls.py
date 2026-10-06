"""
Organization-scoped routes, mounted under /api/v1/orgs/<slug>/.

The slug is consumed by `config.middleware.TenantMiddleware` before any view
runs, so views inherit `OrgScopedAPIView` and read `self.organization` rather
than taking a slug argument (C49).
It still appears in the pattern in `config/urls.py` -- the URL is the only
place the organization is named (C3).
"""

from __future__ import annotations

from django.urls import include, path

from core.organizations.api.views import ProvisioningView

app_name = "organizations"

urlpatterns = [
    path("provisioning/", ProvisioningView.as_view(), name="provisioning"),
    # ---------------------------------------------------------------------
    # Administration (C17). An app whose modules are owned by different
    # Django apps, so the prefix is assembled here rather than each module
    # knowing where it is mounted: `users` and `dealers` belong to this app,
    # `roles` to `core.permissions`.
    #
    # EVERY ROUTE ENDS IN A SLASH, and that is not a style preference.
    # `APPEND_SLASH` is on, so a slashless GET quietly 301s and a slashless
    # POST raises -- which means a frontend calling `/admin/users` would have
    # rendered the list perfectly and 500ed on every button. The URLs in
    # `shell/admin/api/*.ts` were written without them and were corrected to
    # match; it is the same failure shape as the missing CSRF header, where
    # the reads worked and only the writes were broken.
    # ---------------------------------------------------------------------
    path("admin/", include("core.permissions.api.urls")),
]
