from django.urls import path

from .views import DmsUsersView

urlpatterns = [
    path("users/", DmsUsersView.as_view(), name="dms-settings-users"),
]
