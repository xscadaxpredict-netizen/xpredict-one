"""
Production settings. Every secret must come from the environment.

THIS FILE REFUSES TO IMPORT WHEN SOMETHING CRITICAL IS MISSING, and that is
deliberate. `base.py` gives several settings a development default so a clone
runs without a `.env` -- an insecure `SECRET_KEY`, the password `xpredict`, an
empty `ALLOWED_HOSTS`, an empty `FRONTEND_BASE_URL`. Each of those is correct
for a laptop and dangerous or broken on a server, and the failures they cause
land far from the cause:

  - the dev SECRET_KEY is public, so every session token is forgeable
  - the dev MySQL password is in a public repo
  - an empty ALLOWED_HOSTS answers 400 to every request
  - an empty FRONTEND_BASE_URL raises the first time an admin tries to hand
    somebody an invitation link (C56), which is days after deployment

So they are checked HERE, at import, where the message can say which variable
is missing. A server that is misconfigured does not start; it does not start
and then misbehave quietly, which is the shape this project keeps finding
(`BLACKLIST_AFTER_ROTATION` without its app, `CSRF_TRUSTED_ORIGINS` unset,
`AUTH_PASSWORD_VALIDATORS` never called).
"""

from django.core.exceptions import ImproperlyConfigured

from .base import *
from .base import ALLOWED_HOSTS, DATABASES, FRONTEND_BASE_URL, SECRET_KEY, env

DEBUG = False

# ---------------------------------------------------------------------------
# What must be set, and what happens if it is not.
# ---------------------------------------------------------------------------

# The `noqa`s are the joke writing itself: ruff flags these as hardcoded
# credentials, which is exactly what they are -- the public development values,
# named here so this file can refuse to start on them.
_DEV_SECRET_KEY = "insecure-dev-key-override-in-env"  # noqa: S105
_DEV_MYSQL_PASSWORD = "xpredict"  # noqa: S105

_missing: list[str] = []

# CHECKING FOR THE ONE KNOWN-BAD STRING IS NOT ENOUGH, which running this
# proved: `.env.example` ships the placeholder
# "generate-a-real-one-for-anything-but-local", and a copied dev template would
# have passed a check that only knew about `base.py`'s default. So the test is
# length as well as identity.
#
# 50 characters is Django's own threshold -- `security.W009` warns below it --
# and every plausible placeholder somebody types by hand is shorter than that.
_MIN_SECRET_KEY_LENGTH = 50

if not SECRET_KEY or SECRET_KEY == _DEV_SECRET_KEY:
    # The development key is committed and therefore public. Anybody holding it
    # can forge a signed value this app will accept.
    _missing.append("DJANGO_SECRET_KEY (still the public development key)")
elif len(SECRET_KEY) < _MIN_SECRET_KEY_LENGTH:
    _missing.append(
        f"DJANGO_SECRET_KEY (only {len(SECRET_KEY)} characters; "
        f"needs {_MIN_SECRET_KEY_LENGTH}+, so it looks like a placeholder)"
    )

if not ALLOWED_HOSTS:
    # Django answers 400 to every request rather than serving an unknown host.
    # Without this check that reads as "the server is down".
    _missing.append("DJANGO_ALLOWED_HOSTS")

if not FRONTEND_BASE_URL:
    # `invitation_link()` raises on an empty value rather than building a
    # relative URL (C56). Nothing notices until the first invitation.
    _missing.append("FRONTEND_BASE_URL")

if DATABASES["default"]["PASSWORD"] == _DEV_MYSQL_PASSWORD:
    # The dev password is in `create_dev_db.sql`, which is in a public
    # repository (C45).
    _missing.append("MYSQL_PASSWORD (still the public development password)")

if _missing:
    raise ImproperlyConfigured(
        "Refusing to start: these must be set in the environment for production:\n  - "
        + "\n  - ".join(_missing)
    )

# ---------------------------------------------------------------------------
# Origins.
#
# ONE VALUE DRIVES BOTH, because there is only one origin. The SPA and the API
# are served from the same host in production -- Nginx serves the built
# frontend and proxies `/api/` to Gunicorn -- which is why `request()` in
# `packages/api-client` uses relative URLs and `vite.config.ts` says its dev
# proxy "has no production equivalent".
#
# So CSRF_TRUSTED_ORIGINS is derived from FRONTEND_BASE_URL rather than being a
# second variable that can disagree with it. Two settings that must match are
# two settings that eventually will not.
#
# CORS IS DELIBERATELY NOT CONFIGURED. Same origin means the browser never
# makes a cross-origin request, so `django-cors-headers` with no allowed
# origins is correct: it permits nothing. Adding the API's own host here would
# be opening a door that nothing needs to walk through.
# ---------------------------------------------------------------------------

CSRF_TRUSTED_ORIGINS = [FRONTEND_BASE_URL.rstrip("/")]

# ---------------------------------------------------------------------------
# Transport security.
#
# THE APP CANNOT WORK OVER PLAIN HTTP, by design. `AUTH_COOKIE_SECURE` is True
# in base.py, so a browser on http:// silently discards the auth cookie and
# nobody can sign in -- there is no error, the login simply does not stick.
# These settings make that explicit rather than mysterious.
# ---------------------------------------------------------------------------

SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# NGINX TERMINATES TLS, so Django sees a plain HTTP request from the proxy and
# would redirect it to HTTPS forever without this header. The Nginx config must
# set `proxy_set_header X-Forwarded-Proto $scheme` -- if it does not, every
# request becomes an infinite redirect.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

# ---------------------------------------------------------------------------
# Celery.
#
# NOT EAGER, which is the whole difference from development. Tenant
# provisioning runs through the broker here (C1): signup fires a task on
# `transaction.on_commit` that creates and migrates the organisation's own
# database. In dev `CELERY_TASK_ALWAYS_EAGER` runs it inline because Redis was
# never installed, so **the broker round trip is exercised for the first time
# in production** -- prove it on the server before trusting it (see
# `deploy/README.md`).
# ---------------------------------------------------------------------------

CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=False)

if CELERY_TASK_ALWAYS_EAGER:
    # Eager means signup does the `CREATE DATABASE` and the migrate inside the
    # web request, holding a worker for seconds and losing the retry the task
    # queue gives. It is a development convenience and never correct here.
    raise ImproperlyConfigured(
        "CELERY_TASK_ALWAYS_EAGER must be False in production: tenant "
        "provisioning would run inside the signup request."
    )
