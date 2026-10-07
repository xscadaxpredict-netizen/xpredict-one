"""
Invitation routes, mounted at /api/v1/invitations/.

NOT under /api/v1/orgs/<slug>/: the person using these has no membership yet,
so `OrgScopedAPIView` would refuse them before the handler ran (C49, C56). The
token identifies the organisation.

DELIBERATELY OUTSIDE `AUTH_COOKIE_REFRESH_PATH` --- the refresh cookie is
scoped to /api/v1/auth/ and has no business being sent to an endpoint a
stranger can reach with a token they were handed.
"""

from __future__ import annotations

from django.urls import path

from core.organizations.api.invitation_views import AcceptInvitationView, InvitationView

app_name = "invitations"

urlpatterns = [
    # TRAILING SLASHES, like every other route here. `APPEND_SLASH` turns a
    # slashless GET into a silent 301 and a slashless POST into a raise, which
    # is how session 12 nearly shipped an Administration screen where every
    # read worked and every write 500ed.
    path("<str:token>/", InvitationView.as_view(), name="detail"),
    path("<str:token>/accept/", AcceptInvitationView.as_view(), name="accept"),
]
