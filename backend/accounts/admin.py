from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """
    Custom UserAdmin for People Prime LMS.
    Integrates the custom LMS `role` field into user change and add forms,
    as well as list display, list filters, and search fields.
    Staff and superuser privileges remain distinct from LMS roles.
    """
    list_display = (
        "username",
        "email",
        "role",
        "is_staff",
        "is_superuser",
        "is_active",
        "date_joined",
    )
    list_filter = (
        "role",
        "is_staff",
        "is_superuser",
        "is_active",
    )
    fieldsets = BaseUserAdmin.fieldsets + (
        ("LMS Configuration", {"fields": ("role",)}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ("LMS Configuration", {"fields": ("role",)}),
    )
    search_fields = ("username", "first_name", "last_name", "email")
    ordering = ("username",)
