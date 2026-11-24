from django.urls import path

from .views import (
    DmsInviteRolesView,
    DmsUserDetailView,
    DmsUserRolesView,
    DmsUserStatusView,
    DmsUsersView,
)

urlpatterns = [
    path("users/", DmsUsersView.as_view(), name="dms-settings-users"),
    path("users/<str:user_id>/", DmsUserDetailView.as_view(), name="dms-settings-user"),
    path(
        "users/<str:user_id>/roles/",
        DmsUserRolesView.as_view(),
        name="dms-settings-user-roles",
    ),
    path(
        "users/<str:user_id>/<str:action>/",
        DmsUserStatusView.as_view(),
        name="dms-settings-user-status",
    ),
    path("invite-roles/", DmsInviteRolesView.as_view(), name="dms-settings-invite-roles"),
]
