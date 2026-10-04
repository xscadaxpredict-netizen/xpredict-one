from django.urls import path

from .views import (
    SiteListView, SiteProfileUpdateView,
    ScheduleListCreateView, ScheduleDetailView,
    ServiceReportListCreateView, ServiceReportDetailView,
    WaterReportListCreateView, WaterReportDetailView,
    ComplaintListCreateView, ComplaintDetailView,
)

app_name = "dms_site_services"

urlpatterns = [
    # Sites
    path("sites/", SiteListView.as_view(), name="site-list"),
    path("sites/<uuid:pk>/profile/", SiteProfileUpdateView.as_view(), name="site-profile-update"),
    
    # Schedules
    path("schedules/", ScheduleListCreateView.as_view(), name="schedule-list-create"),
    path("schedules/<uuid:pk>/", ScheduleDetailView.as_view(), name="schedule-detail"),
    
    # Service Reports
    path("service-reports/", ServiceReportListCreateView.as_view(), name="service-report-list-create"),
    path("service-reports/<uuid:pk>/", ServiceReportDetailView.as_view(), name="service-report-detail"),
    
    # Water Reports
    path("water-reports/", WaterReportListCreateView.as_view(), name="water-report-list-create"),
    path("water-reports/<uuid:pk>/", WaterReportDetailView.as_view(), name="water-report-detail"),
    
    # Complaints
    path("complaints/", ComplaintListCreateView.as_view(), name="complaint-list-create"),
    path("complaints/<uuid:pk>/", ComplaintDetailView.as_view(), name="complaint-detail"),
]
