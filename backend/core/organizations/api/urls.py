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
    AdminDetailView,
    AdminsView,
    ApplicationMembersView,
    ApplicationsView,
    InviteLinkView,
    OrganizationProfileView,
    PanelRoleDetailView,
    PanelRolesView,
    ProvisioningView,
    ResendInvitationView,
    RoleBuilderView,
    UserAppStatusView,
    UserAppsView,
    UserAppView,
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
    # knowing where it is mounted: `users` belongs to this app,
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
    path("admin/organization/", OrganizationProfileView.as_view(), name="organization"),
    path("admin/applications/", ApplicationsView.as_view(), name="applications"),
    path(
        "admin/applications/<str:app_code>/members/",
        ApplicationMembersView.as_view(),
        name="application-members",
    ),
    # The Roles tab (C78). Not `admin/roles/`: that is the role catalogue the
    # invite and edit forms' pickers read, owned by `core.permissions`.
    path("admin/panel-roles/", PanelRolesView.as_view(), name="panel-roles"),
    # Edit Role (PUT) and Delete Role (DELETE): the organisation's own roles only.
    path(
        "admin/panel-roles/<str:role_code>/",
        PanelRoleDetailView.as_view(),
        name="panel-role-detail",
    ),
    # New Role's grid: the section tree and the roles to copy from (C72 piece 5).
    path("admin/role-builder/", RoleBuilderView.as_view(), name="role-builder"),
    # The Admins tab (C78), on its own permission (C79).
    path("admin/admins/", AdminsView.as_view(), name="admins"),
    # Manage Roles (PUT) and Unassign (DELETE) on one admin's row.
    path("admin/admins/<str:person_id>/", AdminDetailView.as_view(), name="admin-detail"),
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
    # Assign applications (C83). BEFORE the <str:action> route, for the reason
    # above: "apps" would otherwise reach the status view as a status.
    path("admin/users/<str:user_id>/apps/", UserAppsView.as_view(), name="user-apps"),
    # The app tile (the owner, 2026-11-20): Edit (PUT) and Unassign (DELETE)
    # on one app, and Disable / Enable as their own actions.
    path(
        "admin/users/<str:user_id>/apps/<str:app>/",
        UserAppView.as_view(),
        name="user-app",
    ),
    path(
        "admin/users/<str:user_id>/apps/<str:app>/<str:action>/",
        UserAppStatusView.as_view(),
        name="user-app-status",
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
    path("admin/", include("core.permissions.api.urls")),
]
