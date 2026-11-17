"""
Django settings for People Prime LMS config project.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.getenv("DEBUG", "True").lower() in ("true", "1", "yes")

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    if DEBUG:
        # Development fallback (existing development key preserved; must be rotated for production)
        SECRET_KEY = "django-insecure-pi-1f8&p!x0@-5^*b4xgks@3*tfp7vfqkxui_jfljd8mjb)^4("
    else:
        raise ValueError("The SECRET_KEY environment variable must be set when DEBUG is False.")

# ALLOWED_HOSTS configuration
allowed_hosts_raw = os.getenv("ALLOWED_HOSTS", "")
if allowed_hosts_raw:
    ALLOWED_HOSTS = [h.strip() for h in allowed_hosts_raw.split(",") if h.strip()]
elif DEBUG:
    ALLOWED_HOSTS = ["127.0.0.1", "localhost"]
else:
    raise ValueError("The ALLOWED_HOSTS environment variable must be configured when DEBUG is False.")


# Application definition

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "accounts",
    "core",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# Database
# https://docs.djangoproject.com/en/5.2/ref/settings/#databases

db_options = {}
db_sslmode = os.getenv("DB_SSLMODE", "")
if db_sslmode:
    db_options["sslmode"] = db_sslmode
elif not DEBUG:
    # Recommended default for AWS RDS PostgreSQL in production
    db_options["sslmode"] = "require"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB_NAME"),
        "USER": os.getenv("DB_USER"),
        "PASSWORD": os.getenv("DB_PASSWORD"),
        "HOST": os.getenv("DB_HOST", "localhost"),
        "PORT": os.getenv("DB_PORT", "5432"),
        "CONN_MAX_AGE": int(os.getenv("DB_CONN_MAX_AGE", "300")),
        "OPTIONS": db_options,
    }
}



# Password validation
# https://docs.djangoproject.com/en/5.2/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
]


# Internationalization
# https://docs.djangoproject.com/en/5.2/topics/i18n/

LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.2/howto/static-files/

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Media files (Learning materials, documents, videos, images)
# Local development storage; extensible to AWS S3 for production
USE_S3_STORAGE = os.getenv("USE_S3_STORAGE", "False").lower() in ("true", "1", "yes")

if USE_S3_STORAGE:
    # Amazon S3 Private Bucket Storage Configuration via django-storages
    INSTALLED_APPS.append("storages")
    DEFAULT_FILE_STORAGE = "storages.backends.s3boto3.S3Boto3Storage"
    AWS_STORAGE_BUCKET_NAME = os.getenv("AWS_STORAGE_BUCKET_NAME")
    AWS_S3_REGION_NAME = os.getenv("AWS_S3_REGION_NAME", "ap-south-1")
    # Enforce private file access; Block Public Access stays enabled
    AWS_DEFAULT_ACL = None
    AWS_QUERYSTRING_AUTH = True
    AWS_S3_FILE_OVERWRITE = False
    MEDIA_URL = f"https://{AWS_STORAGE_BUCKET_NAME}.s3.{AWS_S3_REGION_NAME}.amazonaws.com/"
    # For generated previews cache on EC2 local storage
    MEDIA_ROOT = BASE_DIR / "media"
else:
    MEDIA_URL = "/media/"
    MEDIA_ROOT = BASE_DIR / "media"

MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "100"))

# Default primary key field type
# https://docs.djangoproject.com/en/5.2/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "accounts.User"

# Django REST Framework deliberate defaults
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}

# Cross-Origin Resource Sharing (CORS)
cors_allowed_raw = os.getenv("CORS_ALLOWED_ORIGINS", "")
if cors_allowed_raw:
    CORS_ALLOWED_ORIGINS = [o.strip() for o in cors_allowed_raw.split(",") if o.strip()]
elif DEBUG:
    CORS_ALLOWED_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
else:
    CORS_ALLOWED_ORIGINS = []

CORS_ALLOW_CREDENTIALS = True

# CSRF Trusted Origins
csrf_trusted_raw = os.getenv("CSRF_TRUSTED_ORIGINS", "")
if csrf_trusted_raw:
    CSRF_TRUSTED_ORIGINS = [o.strip() for o in csrf_trusted_raw.split(",") if o.strip()]
elif DEBUG:
    CSRF_TRUSTED_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
else:
    CSRF_TRUSTED_ORIGINS = []

# Session and Cookie Security
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

# In production (when DEBUG is False), enforce HTTPS transmission of cookies and reverse proxy headers
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG

if not DEBUG:
    # Tell Django that Nginx/CloudFront terminates HTTPS
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    # Redirect HTTP to HTTPS only if explicitly enabled via environment variable
    # (avoiding redirect loops if SSL termination happens at CloudFront/Nginx level)
    if os.getenv("SECURE_SSL_REDIRECT", "False").lower() in ("true", "1", "yes"):
        SECURE_SSL_REDIRECT = True
    # HSTS configuration: only active when HTTPS is fully validated
    if os.getenv("SECURE_HSTS_SECONDS"):
        SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS"))
        SECURE_HSTS_INCLUDE_SUBDOMAINS = os.getenv("SECURE_HSTS_INCLUDE_SUBDOMAINS", "False").lower() in ("true", "1", "yes")
        SECURE_HSTS_PRELOAD = os.getenv("SECURE_HSTS_PRELOAD", "False").lower() in ("true", "1", "yes")

# Structured Production Logging
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[{asctime}] {levelname} [{name}:{lineno}] {message}",
            "style": "{",
        },
        "simple": {
            "format": "{levelname} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": os.getenv("LOG_LEVEL", "INFO"),
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": os.getenv("DJANGO_LOG_LEVEL", "INFO"),
            "propagate": False,
        },
        "core": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}
