"""
Role-based access control and permissions for People Prime LMS.
Provides both Django REST Framework permission classes and standard Django view decorators.
"""

from functools import wraps
from django.http import JsonResponse
from rest_framework import permissions
from accounts.models import User


class IsLMSAdmin(permissions.BasePermission):
    """
    DRF permission: Grants access only to authenticated users with the ADMIN LMS role.
    """
    message = "Permission denied. LMS Admin role required."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "role", None) == User.Role.ADMIN
        )


class IsLMSTrainer(permissions.BasePermission):
    """
    DRF permission: Grants access to authenticated users with TRAINER or ADMIN LMS roles.
    """
    message = "Permission denied. LMS Trainer or Admin role required."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "role", None) in (User.Role.ADMIN, User.Role.TRAINER)
        )


class IsLMSLearner(permissions.BasePermission):
    """
    DRF permission: Grants access to authenticated users with the LEARNER LMS role.
    """
    message = "Permission denied. LMS Learner role required."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "role", None) == User.Role.LEARNER
        )


def require_lms_role(*allowed_roles):
    """
    Decorator for standard Django view functions.
    Enforces authentication (401) and role-based authorization (403).

    Usage:
        @require_POST
        @csrf_protect
        @require_lms_role(User.Role.ADMIN, User.Role.TRAINER)
        def my_view(request):
            ...
    """
    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(request, *args, **kwargs):
            if not request.user.is_authenticated:
                return JsonResponse(
                    {"error": "Authentication required."},
                    status=401,
                )

            user_role = getattr(request.user, "role", None)
            if user_role not in allowed_roles:
                return JsonResponse(
                    {"error": "Permission denied. Insufficient role permissions."},
                    status=403,
                )

            return view_func(request, *args, **kwargs)
        return _wrapped_view
    return decorator

