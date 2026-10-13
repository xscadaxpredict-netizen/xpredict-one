from django.urls import path
from .views import (
    UserManualListView, UserManualDetailView,
    MachineVideoListView, MachineVideoDetailView,
    CallRequestListView, CallRequestDetailView
)

urlpatterns = [
    path("manuals/", UserManualListView.as_view(), name="user-manual-list"),
    path("manuals/<uuid:pk>/", UserManualDetailView.as_view(), name="user-manual-detail"),
    
    path("videos/", MachineVideoListView.as_view(), name="machine-video-list"),
    path("videos/<uuid:pk>/", MachineVideoDetailView.as_view(), name="machine-video-detail"),
    
    path("calls/", CallRequestListView.as_view(), name="call-request-list"),
    path("calls/<uuid:pk>/", CallRequestDetailView.as_view(), name="call-request-detail"),
]
