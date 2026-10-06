from django.contrib import admin
from django.urls import include, path

from core.accounts.api.views import MeView

urlpatterns = [
    path("admin/", admin.site.urls),
    # Auth is NOT org-scoped: signing in happens before an organization is
    # known, and the token carries none (C3). AUTH_COOKIE_REFRESH_PATH is
    # pinned to this prefix --- move these routes and move that setting too.
    path("api/v1/auth/", include("core.accounts.api.urls")),
    # NOT under /orgs/<slug>/ and not under /auth/. This is the request that
    # tells the browser which organization slugs exist, so it cannot sit behind
    # one -- and it is not an auth operation, so it does not belong beside
    # login either. It is also deliberately outside AUTH_COOKIE_REFRESH_PATH:
    # the refresh cookie is scoped to /api/v1/auth/ and must not be sent here.
    path("api/v1/me/", MeView.as_view(), name="me"),
    # Everything organization-scoped. The slug is read by
    # config.middleware.TenantMiddleware before any view runs, which binds that
    # organization's database for the request and refuses the request if the
    # slug is unknown or the organization is suspended. Views therefore read
    # `request.organization` rather than taking a slug argument.
    path("api/v1/orgs/<slug:org_slug>/", include("core.organizations.api.urls")),
    # No schema or docs routes. drf-spectacular was removed on 2026-10-02:
    # it had been in the scaffold since Phase 1 and the owner had never been
    # asked for it. Plain DRF until after the first public release.
    # Organization-scoped app routes are added in Phase 2:
    #   /api/v1/orgs/<org_slug>/<app>/...
    # The org slug lives in the path, not in the token, so switching
    # organizations needs no new token.
]
