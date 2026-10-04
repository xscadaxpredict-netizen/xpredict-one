from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    # Auth is NOT org-scoped: signing in happens before an organization is
    # known, and the token carries none (C3). AUTH_COOKIE_REFRESH_PATH is
    # pinned to this prefix --- move these routes and move that setting too.
    path("api/v1/auth/", include("core.accounts.api.urls")),
    # No schema or docs routes. drf-spectacular was removed on 2026-10-02:
    # it had been in the scaffold since Phase 1 and the owner had never been
    # asked for it. Plain DRF until after the first public release.
    # Organization-scoped app routes are added in Phase 2:
    #   /api/v1/orgs/<org_slug>/<app>/...
    # The org slug lives in the path, not in the token, so switching
    # organizations needs no new token.
    path("api/v1/orgs/<str:org_slug>/dms/sales/", include("products.dms.sales.api.urls")),
    path("api/v1/orgs/<str:org_slug>/dms/site-services/", include("products.dms.site_services.api.urls")),
    path("api/v1/orgs/<str:org_slug>/dms/ecommerce/", include("products.dms.ecommerce.api.urls")),
]
