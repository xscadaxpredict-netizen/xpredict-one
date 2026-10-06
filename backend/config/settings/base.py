"""
Settings shared by every environment.

Environment-specific modules (dev.py, prod.py) import * from here and override.
Nothing in this file may read a secret without a default that is safe to commit ---
real values come from the environment. See .env.example.
"""

from datetime import timedelta
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
    "corsheaders",
]

CONTROL_PLANE_APPS = [
    "core.accounts",
    "core.organizations",
    "core.permissions",
    "core.billing",
    # The refresh-token denylist. Identity, so it belongs in the control
    # database --- and listing it HERE is what puts it there: its label,
    # "token_blacklist", derives from the last path segment just below.
    #
    # IT WAS MISSING UNTIL 2026-10-01, while BLACKLIST_AFTER_ROTATION had been
    # True since Phase 1. Without the app there are no denylist tables, so the
    # setting did nothing at all and looked exactly like a working denylist.
    "rest_framework_simplejwt.token_blacklist",
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
    # LAST, and after authentication. It resolves the organization from the URL
    # path (C3), binds that tenant's database for the request and resets the
    # contextvars in a finally block.
    #
    # It does NOT check membership, and cannot: DRF authenticates inside the
    # view, so request.user is still anonymous here. It binds the DATABASE and
    # each org-scoped endpoint checks WHO -- see the docstring, and the Phase 3
    # authorization chain that makes that structural rather than per endpoint.
    "config.middleware.TenantMiddleware",
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
        # MySQL, not PostgreSQL (C39). Django 5.2 requires MySQL 8.0.11+.
        "ENGINE": "django.db.backends.mysql",
        "NAME": env("MYSQL_DB", default="xpredict_control"),
        "USER": env("MYSQL_USER", default="xpredict"),
        "PASSWORD": env("MYSQL_PASSWORD", default="xpredict"),
        "HOST": env("MYSQL_HOST", default="127.0.0.1"),
        "PORT": env.int("MYSQL_PORT", default=3306),
        # No pooler in front any more --- PgBouncer went with PostgreSQL and
        # has no drop-in MySQL equivalent (Q27). Connections are closed at the
        # end of each request instead: database-per-tenant means a persistent
        # connection is held PER TENANT per worker, so CONN_MAX_AGE multiplies
        # by the number of organizations rather than staying constant.
        "CONN_MAX_AGE": 0,
        "OPTIONS": {
            # Fail fast when MySQL is not up, rather than hanging a request
            # (or a management command) on the OS connect timeout.
            "connect_timeout": 5,
            # utf8mb4 is real four-byte UTF-8. MySQL's "utf8" is a three-byte
            # subset that silently truncates anything outside the BMP --- an
            # emoji in a customer name, for one.
            "charset": "utf8mb4",
            # STRICT MODE IS NOT OPTIONAL HERE. Without it MySQL "helpfully"
            # coerces bad data instead of refusing it: an over-length string is
            # truncated, an invalid date becomes 0000-00-00, and the write
            # succeeds. Django assumes the database rejects what it is told to
            # reject, so a validation hole becomes silent data loss.
            "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
        },
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
        # Reads the access token from an httpOnly cookie and enforces CSRF
        # (C12). NOT simplejwt's own class, which expects an Authorization
        # header the frontend is deliberately unable to build.
        "core.accounts.authentication.CookieJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "UNAUTHENTICATED_USER": None,
    # Rate limits for the UNAUTHENTICATED endpoints, by IP (Q20, C47). Only
    # the two signup endpoints opt in, via ScopedRateThrottle --- everything
    # else needs a session, which is its own limit on volume.
    #
    # DRF's OWN THROTTLING, not a new dependency. The rule about never adding a
    # library the lead has not agreed to (C43) applies to rate limiting as
    # much as to anything else, and this is already installed.
    #
    # 20/hour is not the thing stopping enumeration --- 32 characters of
    # `secrets.token_urlsafe` entropy is, and no rate makes a guessable code
    # safe. This is defence in depth and a brake on automation, set high
    # enough not to lock out an office behind one NAT where two people sign up
    # the same afternoon.
    #
    # THROTTLING NEEDS THE CACHE, AND THE CACHE IS NOT OPTIONAL HERE. DRF keeps
    # each IP's history in CACHES["default"], so an unreachable cache does not
    # mean "no limit" --- it means the throttled endpoint raises and answers 500.
    #
    # CACHES pointed at Redis from Phase 1 while Redis was never installed, and
    # nothing noticed for nine sessions because nothing used the cache. This
    # setting is the first thing that does. Development and tests therefore use
    # LocMemCache (see dev.py), which counts PER PROCESS: with several workers
    # the real limit is 20 x workers. Correct enough for development, and
    # production wants the shared Redis below so one tally covers every worker.
    "DEFAULT_THROTTLE_RATES": {
        "signup": "20/hour",
    },
    # Every error leaves the API as RFC 9457 problem+json, whatever raised it.
    # Views never catch domain exceptions --- this is the only translation point.
    "EXCEPTION_HANDLER": "config.exception_handler.api_exception_handler",
}

# Answered 2026-10-01 (Q17). The premise of the question turned out to be
# wrong in a useful way: JWTAuthentication.get_user() loads the user row on
# EVERY request and refuses an inactive one, so disabling an account takes
# effect on the next request rather than after a token expires. The lifetime
# below is therefore not "how long a sacked employee keeps working" --- it is
# how long a STOLEN access token stays usable after its owner logs out.
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    # Needs the token_blacklist app above. It is listed there now.
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    # Changing a password invalidates every existing token. Free: the token
    # carries a hash of the password and the user row is already loaded.
    "CHECK_REVOKE_TOKEN": True,
}

# --------------------------------------------------------------------------
# Auth cookies (C12)
#
# Tokens are set as httpOnly cookies and the frontend never holds one. So
# these are not simplejwt settings --- simplejwt returns tokens in the response
# body and knows nothing about cookies; core.accounts.cookies does the work.
# --------------------------------------------------------------------------

AUTH_COOKIE_ACCESS = "xp_access"
AUTH_COOKIE_REFRESH = "xp_refresh"

# Overridden to False in dev, where the server is plain http and a Secure
# cookie would be set and then never sent back --- which presents as "login
# succeeds and every request is still 401".
AUTH_COOKIE_SECURE = True

# Lax, not Strict: Strict withholds the cookie on a top-level navigation INTO
# the app, so following a link from an email lands the user on a signed-out
# page despite a valid session.
AUTH_COOKIE_SAMESITE = "Lax"

# THE REFRESH COOKIE IS SCOPED TO THE AUTH ENDPOINTS, deliberately. It is the
# long-lived credential (7 days), and there is no reason for the browser to
# attach it to every API call for a week. The access cookie is site-wide.
AUTH_COOKIE_REFRESH_PATH = "/api/v1/auth/"


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
