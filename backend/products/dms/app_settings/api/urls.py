from django.urls import path

from .views import (
    DmsInviteRolesView,
    DmsTerritoriesView,
    DmsTerritoryDetailView,
    DmsTerritoryPeopleView,
    DmsTerritoryPersonMoveView,
    DmsTerritoryPersonView,
    DmsTerritoryStatusView,
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
    # Security & Controls -> Territory Management (2026-11-24).
    path("territories/", DmsTerritoriesView.as_view(), name="dms-settings-territories"),
    path(
        "territories/<str:territory_id>/",
        DmsTerritoryDetailView.as_view(),
        name="dms-settings-territory",
    ),
    # A territory's People tab (2026-11-24), before the generic `<action>/`.
    path(
        "territories/<str:territory_id>/people/",
        DmsTerritoryPeopleView.as_view(),
        name="dms-settings-territory-people",
    ),
    path(
        "territories/<str:territory_id>/people/<str:person_id>/",
        DmsTerritoryPersonView.as_view(),
        name="dms-settings-territory-person",
    ),
    path(
        "territories/<str:territory_id>/people/<str:person_id>/move/",
        DmsTerritoryPersonMoveView.as_view(),
        name="dms-settings-territory-person-move",
    ),
    path(
        "territories/<str:territory_id>/<str:action>/",
        DmsTerritoryStatusView.as_view(),
        name="dms-settings-territory-status",
    ),
]
