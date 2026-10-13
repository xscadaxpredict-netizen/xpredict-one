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

from core.organizations.api.views import (
    DealerDetailView,
    DealerStatusView,
    DealersView,
    InviteLinkView,
    ProvisioningView,
    ResendInvitationView,
    UserDetailView,
    UserStatusView,
    UsersView,
)

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
    path("admin/users/", UsersView.as_view(), name="users"),
    path("admin/users/<str:user_id>/", UserDetailView.as_view(), name="user-detail"),
    # BEFORE the activate/deactivate route below, which would otherwise match
    # this too -- Django takes the first pattern that fits, so a generic
    # `<str:action>` placed first would swallow every sibling action and hand
    # "resend-invitation" to the status view as a status.
    path(
        "admin/users/<str:user_id>/resend-invitation/",
        ResendInvitationView.as_view(),
        name="user-resend-invitation",
    ),
    # BEFORE the <str:action> route too, and for the same reason: a generic
    # trailing segment placed first swallows every sibling.
    path(
        "admin/users/<str:user_id>/invite-link/",
        InviteLinkView.as_view(),
        name="user-invite-link",
    ),
    # One route, two actions, because the rule is currently symmetrical --- the
    # view says what would split them. The view also refuses any other verb,
    # rather than treating an unrecognised one as "deactivate", which is what
    # a bare else would do.
    path(
        "admin/users/<str:user_id>/<str:action>/",
        UserStatusView.as_view(),
        name="user-status",
    ),
    # INVITATIONS, NOT USERS, and the URL says so (C51). Inviting creates an
    # `Invitation`, never a membership -- the person may not have an account at
    # all -- so posting to /users/ would name a row this request does not make.
    path("admin/invitations/", UsersView.as_view(), name="invitations"),
    path("admin/dealers/", DealersView.as_view(), name="dealers"),
    # `str`, not `uuid`. A malformed id must answer 404 like any other
    # dealership the caller cannot see -- with a `uuid` converter the route
    # simply would not match, and Django's own 404 is an HTML page rather than
    # the problem+json every other refusal returns.
    path("admin/dealers/<str:dealer_id>/", DealerDetailView.as_view(), name="dealer-detail"),
    # CLOSE AND REOPEN (C63, answering Q21). One route, two actions, as the
    # user-status route does -- the rule is symmetrical today and the view says
    # what would split them.
    #
    # The extra segment is what keeps this from colliding with the detail route
    # above; there is no generic `<str:action>` sibling here to be swallowed by,
    # which is the trap the users routes had to be ordered around.
    #
    # AND IT ENDS IN A SLASH. `APPEND_SLASH` turns a slashless POST into a
    # raise, so a frontend calling `/close` without one would 500 on the button
    # while every read on the screen worked perfectly.
    path(
        "admin/dealers/<str:dealer_id>/<str:action>/",
        DealerStatusView.as_view(),
        name="dealer-status",
    ),
    path("admin/", include("core.permissions.api.urls")),
]
