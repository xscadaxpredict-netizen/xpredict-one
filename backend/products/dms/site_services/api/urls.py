from django.urls import path

from .views import (
    ComplaintDetailView,
    ComplaintListCreateView,
    ComplaintStatusView,
    PublicServiceReportSignView,
    PublicServiceReportView,
    ScheduleDependenciesView,
    ScheduleDetailView,
    ScheduleListCreateView,
    ServiceReportDetailView,
    ServiceReportListCreateView,
    SiteListView,
    SitePeopleView,
    SiteProfileUpdateView,
    VisitCancelView,
    VisitRescheduleView,
    WaterReportDetailView,
    WaterReportListCreateView,
)

app_name = "dms_site_services"

urlpatterns = [
    # Sites
    path("sites/", SiteListView.as_view(), name="site-list"),
    path("sites/<uuid:pk>/profile/", SiteProfileUpdateView.as_view(), name="site-profile-update"),
    path("sites/<uuid:pk>/people/", SitePeopleView.as_view(), name="site-people"),

    # Schedules
    path("schedules/", ScheduleListCreateView.as_view(), name="schedule-list-create"),
    path("schedules/<uuid:pk>/", ScheduleDetailView.as_view(), name="schedule-detail"),
    path("schedules/<uuid:pk>/cancel/", VisitCancelView.as_view(), name="visit-cancel"),
    path("schedules/<uuid:pk>/reschedule/", VisitRescheduleView.as_view(), name="visit-reschedule"),
    path(
        "schedules/<uuid:pk>/dependencies/",
        ScheduleDependenciesView.as_view(),
        name="schedule-dependencies",
    ),

    # Service Reports
    path(
        "service-reports/",
        ServiceReportListCreateView.as_view(),
        name="service-report-list-create",
    ),
    path(
        "service-reports/<uuid:pk>/",
        ServiceReportDetailView.as_view(),
        name="service-report-detail",
    ),
    path(
        "public/report/<uuid:token>/",
        PublicServiceReportView.as_view(),
        name="public-service-report",
    ),
    path(
        "public/report/<uuid:token>/sign/",
        PublicServiceReportSignView.as_view(),
        name="public-service-report-sign",
    ),

    # Water Reports
    path("water-reports/", WaterReportListCreateView.as_view(), name="water-report-list-create"),
    path("water-reports/<uuid:pk>/", WaterReportDetailView.as_view(), name="water-report-detail"),

    # Complaints
    path("complaints/", ComplaintListCreateView.as_view(), name="complaint-list-create"),
    path("complaints/<uuid:pk>/", ComplaintDetailView.as_view(), name="complaint-detail"),
    path("complaints/<uuid:pk>/status/", ComplaintStatusView.as_view(), name="complaint-status"),
]
