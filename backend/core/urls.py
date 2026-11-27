from django.urls import include, path

from .views import (
    csrf_token,
    health_check,
    lms_status,
    session_login,
    session_logout,
    session_me,
)

urlpatterns = [
    # Health / monitoring probes
    path("health/", health_check, name="health-check"),
    # Auth / public endpoints (Phase 1 & 2)
    path("status/", lms_status, name="lms-status"),
    path("csrf/", csrf_token, name="csrf-token"),
    path("login/", session_login, name="session-login"),
    path("logout/", session_logout, name="session-logout"),
    path("me/", session_me, name="session-me"),
    # Curriculum & Learning Material REST APIs (Phase 3 Step 2)
    path("", include("core.api_urls")),
]
