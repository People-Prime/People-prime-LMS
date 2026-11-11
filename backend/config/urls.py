from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
]

# Note: Direct MEDIA_URL file serving is intentionally omitted to prevent bypassing
# the protected /api/materials/{id}/download/ authorization and entitlement endpoint.

