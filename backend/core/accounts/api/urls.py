"""
Auth routes, mounted at /api/v1/auth/.

NOT under /api/v1/orgs/<slug>/: signing in happens before an organization is
known, and the token carries none (C3). The path also matters operationally —
it is what AUTH_COOKIE_REFRESH_PATH scopes the refresh cookie to, so moving
these routes means moving that setting with them.
"""

from __future__ import annotations

from django.urls import path

from core.accounts.api.views import LoginView, LogoutView, RefreshView, SessionView

app_name = "accounts"

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("session/", SessionView.as_view(), name="session"),
    path("refresh/", RefreshView.as_view(), name="refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
]
