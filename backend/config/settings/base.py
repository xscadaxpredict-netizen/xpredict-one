"""
Settings shared by every environment.

Environment-specific modules (dev.py, prod.py) import * from here and override.
Nothing in this file may read a secret without a default that is safe to commit ---
real values come from the environment. See .env.example.
"""

from pathlib import Path

import environ

# backend/config/settings/base.py -> backend/
BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY", default="insecure-dev-key-override-in-env")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=[])


# --------------------------------------------------------------------------
# Applications
#
# CONTROL_PLANE_APPS live in the control database: identity and structure.
# TENANT_APPS live in a per-organization database: business data.
# The split is enforced by config.routers.TenantRouter --- keep these lists
# accurate, because allow_migrate() reads them to decide what goes where.
# --------------------------------------------------------------------------

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "drf_spectacular",
    "corsheaders",
]

CONTROL_PLANE_APPS = [
    "core.accounts",
    "core.organizations",
    "core.permissions",
    "core.billing",
]

# Each module inside a product is its own Django app with a unique, product-
# prefixed label --- "sales" alone would collide the moment another product
# grows a sales module. Adding a module here is what creates its migration
# history, so a module missing from this list silently never migrates.
TENANT_APPS = [
    "core.contacts",
    "core.notifications",
    "core.audit",
    "core.events",
    # DMS --- the only unit-aware product (C5).
    "products.dms.sales",
    "products.dms.service",
    "products.dms.tech_support",
    # CRM --- organization level, no business units.
    "products.crm",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + CONTROL_PLANE_APPS + TENANT_APPS

# App labels of the control-plane apps, for the router.
#
# Derived from CONTROL_PLANE_APPS so the two cannot drift apart. This relies on
# every control-plane app's label equalling the last path segment
# ("core.accounts" -> "accounts"), which tests/test_routing.py asserts against
# the real app registry --- a control-plane app that ever sets a custom label
# would break routing silently otherwise.
#
# Tenant apps are NOT derived this way: their labels are product-prefixed
# ("products.dms.sales" -> "dms_sales"), so the last segment is not the label.
# They do not need to be --- the router treats anything not listed here as
# tenant data, which fails safe: a forgotten app is denied the control DB
# rather than handed it.
CONTROL_PLANE_APP_LABELS = {app.rsplit(".", 1)[-1] for app in CONTROL_PLANE_APPS} | {
    "admin",
    "auth",
    "contenttypes",
    "sessions",
}


MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # Tenant resolution middleware is added in Phase 2. It must run after
    # authentication (it needs the user to verify membership) and must reset
    # its contextvars in a finally block.
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
ASGI_APPLICATION = "config.asgi.application"


# --------------------------------------------------------------------------
# Databases
#
# Only the control database is configured statically. Tenant databases are
# registered at runtime by the tenant middleware (Phase 2), which adds entries
# to connections.databases from the Organization.db_alias registry.
# --------------------------------------------------------------------------

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB", default="xpredict_control"),
        "USER": env("POSTGRES_USER", default="xpredict"),
        "PASSWORD": env("POSTGRES_PASSWORD", default="xpredict"),
        "HOST": env("POSTGRES_HOST", default="127.0.0.1"),
        "PORT": env.int("POSTGRES_PORT", default=5432),
        # PgBouncer sits in front in every environment, so persistent
        # connections here would defeat the pool.
        "CONN_MAX_AGE": 0,
        # Fail fast when Postgres is not up, rather than hanging a request
        # (or a management command) on the OS connect timeout.
        "OPTIONS": {"connect_timeout": 5},
    }
}

DATABASE_ROUTERS = ["config.routers.TenantRouter"]

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
# Every model in this project uses an explicit UUID primary key (see
# shared.base_models.BaseModel). DEFAULT_AUTO_FIELD only covers third-party apps.

AUTH_USER_MODEL = "accounts.User"


# --------------------------------------------------------------------------
# Authentication
#
# Authentication belongs to the platform layer (core/accounts) --- never to an
# app. Apps receive an authenticated principal and do authorization only.
# --------------------------------------------------------------------------

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "UNAUTHENTICATED_USER": None,
    # Every error leaves the API as RFC 9457 problem+json, whatever raised it.
    # Views never catch domain exceptions --- this is the only translation point.
    "EXCEPTION_HANDLER": "config.exception_handler.api_exception_handler",
}

# Access-token lifetime is a product decision, not a default to inherit:
# it is how long a disabled user keeps working. Tracked as Q17 in
# context/04-OPEN-QUESTIONS.md --- revisit before Phase 2 ships.
SIMPLE_JWT = {
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Xpredict One API",
    "DESCRIPTION": "Multi-tenant platform: DMS, CRM, E-commerce.",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": "/api/v1",
}


# --------------------------------------------------------------------------
# Celery
#
# Every task takes org_id as an argument and sets/resets tenant context itself.
# A task that assumes ambient context will run against the wrong database.
# --------------------------------------------------------------------------

CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://127.0.0.1:6379/0")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default="redis://127.0.0.1:6379/1")
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=False)
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TIMEZONE = "UTC"

# Redis keys are prefixed per organization at the call site (org:{id}:...).
# Any cache key without an org prefix is a cross-tenant leak waiting to happen.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": env("REDIS_CACHE_URL", default="redis://127.0.0.1:6379/2"),
    }
}


# --------------------------------------------------------------------------
# Internationalization and static files
# --------------------------------------------------------------------------

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"
# File storage paths are prefixed by org ID --- see shared.storage (Phase 2).

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {"format": "{levelname} {asctime} {name} {message}", "style": "{"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "verbose"},
    },
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", default="INFO")},
}
