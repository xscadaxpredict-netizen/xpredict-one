from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    # Auth is NOT org-scoped: signing in happens before an organization is
    # known, and the token carries none (C3). AUTH_COOKIE_REFRESH_PATH is
    # pinned to this prefix --- move these routes and move that setting too.
    path("api/v1/auth/", include("core.accounts.api.urls")),
    path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/v1/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    # Organization-scoped app routes are added in Phase 2:
    #   /api/v1/orgs/<org_slug>/<app>/...
    # The org slug lives in the path, not in the token, so switching
    # organizations needs no new token.
]
