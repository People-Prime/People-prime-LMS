import json
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_GET, require_POST
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

User = get_user_model()


@api_view(["GET"])
@permission_classes([AllowAny])
def lms_status(request):
    """
    Public health and status endpoint.
    Exposes LMS API status and recognized system roles.
    """
    return Response({
        "message": "People Prime LMS API is working!",
        "status": "success",
        "roles": [choice[1] for choice in User.Role.choices],
    })


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    """
    Lightweight, unauthenticated health-check probe for AWS ALB, Route 53, and uptime monitors.
    Validates database connectivity without exposing connection strings, stack traces,
    or internal infrastructure details.
    """
    from django.db import connection
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1;")
            cursor.fetchone()
        return Response({"status": "healthy"}, status=200)
    except Exception:
        # Intentionally generic to avoid exposing internal infrastructure error details
        return Response({"status": "unhealthy"}, status=503)


@require_GET
def csrf_token(request):
    """
    Public endpoint providing a CSRF token for subsequent state-changing POST requests.
    """
    return JsonResponse({
        "csrfToken": get_token(request),
    })


@require_POST
@csrf_protect
def session_login(request):
    """
    Public session login endpoint.
    Authenticates valid active users and sets a secure session cookie.
    """
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse(
            {"error": "Invalid JSON request."},
            status=400,
        )

    if not isinstance(data, dict):
        return JsonResponse(
            {"error": "Invalid request payload. Expected a JSON object."},
            status=400,
        )

    username = data.get("username")
    password = data.get("password")

    if not isinstance(username, str) or not isinstance(password, str):
        return JsonResponse(
            {"error": "Username and password are required."},
            status=400,
        )

    username_clean = username.strip()
    if not username_clean or not password:
        return JsonResponse(
            {"error": "Username and password are required."},
            status=400,
        )

    # Resolve email to username if input contains '@'
    auth_username = username_clean
    if "@" in username_clean:
        matched_users = User.objects.filter(email__iexact=username_clean)
        match_count = matched_users.count()
        if match_count == 1:
            auth_username = matched_users.first().username
        elif match_count > 1:
            # If multiple accounts share the same email, reject authentication safely
            return JsonResponse(
                {"error": "Invalid username or password."},
                status=401,
            )
        else:
            # No email found; allow authenticate() to fail normally without exposing account existence
            auth_username = username_clean

    user = authenticate(
        request,
        username=auth_username,
        password=password,
    )

    if user is None:
        return JsonResponse(
            {"error": "Invalid username or password."},
            status=401,
        )

    if not user.is_active:
        return JsonResponse(
            {"error": "This account is inactive."},
            status=403,
        )

    login(request, user)

    return JsonResponse({
        "message": "Login successful.",
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role,
        },
    })


@require_POST
@csrf_protect
def session_register(request):
    """
    Public self-registration endpoint.
    Security policy:
    1. Strictly creates LEARNER accounts only. Client-supplied ADMIN or TRAINER roles are ignored.
    2. Enforces all Django configured AUTH_PASSWORD_VALIDATORS via validate_password().
    3. Prevents duplicate usernames.
    4. Automatically initiates the authenticated session upon successful registration.
    """
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse(
            {"error": "Invalid JSON request."},
            status=400,
        )

    username = data.get("username", "")
    password = data.get("password", "")
    email = data.get("email", "")

    if not isinstance(username, str) or not isinstance(password, str):
        return JsonResponse(
            {"error": "Username and password are required."},
            status=400,
        )

    username_clean = username.strip()
    if not username_clean:
        return JsonResponse(
            {"error": "Username is required."},
            status=400,
        )

    if not password:
        return JsonResponse(
            {"error": "Password is required."},
            status=400,
        )

    if User.objects.filter(username__iexact=username_clean).exists():
        return JsonResponse(
            {"error": "Username is already taken."},
            status=400,
        )

    # Public self-registration is strictly restricted to LEARNER role
    assigned_role = User.Role.LEARNER
    email_clean = email.strip() if isinstance(email, str) else ""

    # Validate password against configured Django validators
    temp_user = User(username=username_clean, email=email_clean, role=assigned_role)
    try:
        validate_password(password, user=temp_user)
    except DjangoValidationError as exc:
        return JsonResponse(
            {
                "error": "Password validation failed.",
                "details": exc.messages,
            },
            status=400,
        )

    try:
        user = User.objects.create_user(
            username=username_clean,
            email=email_clean,
            password=password,
            role=assigned_role,
        )
    except Exception:
        return JsonResponse(
            {"error": "Failed to create account. Please check your information."},
            status=400,
        )

    # Automatically establish session upon registration
    login(request, user)

    return JsonResponse({
        "message": "Registration successful.",
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role,
        },
    }, status=201)


@require_GET
def session_me(request):
    """
    Session verification endpoint.
    Returns the current authentication status and user details if authenticated.
    """
    if not request.user.is_authenticated:
        return JsonResponse({
            "authenticated": False,
            "user": None,
        })

    user = request.user

    return JsonResponse({
        "authenticated": True,
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role,
        },
    })


@require_POST
@csrf_protect
def session_logout(request):
    """
    Protected logout endpoint.
    Requires an authenticated session; flushes session state.
    """
    if not request.user.is_authenticated:
        return JsonResponse(
            {"error": "Authentication required."},
            status=401,
        )

    logout(request)
    return JsonResponse({
        "message": "Logout successful.",
    })
