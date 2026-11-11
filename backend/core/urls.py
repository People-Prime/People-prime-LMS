from django.urls import include, path

from .views import (
    csrf_token,
    lms_status,
    session_login,
    session_logout,
    session_me,
    session_register,
)

urlpatterns = [
    # Auth / public endpoints (Phase 1 & 2)
    path("status/", lms_status, name="lms-status"),
    path("csrf/", csrf_token, name="csrf-token"),
    path("login/", session_login, name="session-login"),
    path("register/", session_register, name="session-register"),
    path("logout/", session_logout, name="session-logout"),
    path("me/", session_me, name="session-me"),
    # Curriculum & Learning Material REST APIs (Phase 3 Step 2)
    path("", include("core.api_urls")),
]
