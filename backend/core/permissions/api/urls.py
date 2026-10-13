"""
Administration's `roles` module, mounted under /api/v1/orgs/<slug>/admin/.

IN `core.permissions` RATHER THAN `core.organizations`, because the module that
owns the models owns its endpoints. Administration is an app whose modules are
owned by different Django apps -- `users` and `dealers` by `core.organizations`,
`roles` by this one -- so the `admin/` prefix is assembled from both in
`core/organizations/api/urls.py`, which is where the prefix lives.
"""

from __future__ import annotations

from django.urls import path

from core.permissions.api.views import RolesView

app_name = "permissions"

urlpatterns = [
    path("roles/", RolesView.as_view(), name="roles"),
]
