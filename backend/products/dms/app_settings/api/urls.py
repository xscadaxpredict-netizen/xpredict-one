from django.urls import path

from .views import DmsInviteRolesView, DmsUsersView

urlpatterns = [
    path("users/", DmsUsersView.as_view(), name="dms-settings-users"),
    path("invite-roles/", DmsInviteRolesView.as_view(), name="dms-settings-invite-roles"),
]
