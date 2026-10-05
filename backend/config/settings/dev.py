"""Local development settings."""

from .base import *

DEBUG = True
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "[::1]"]


# The SPA runs on a different port in development, so it is a cross-origin caller.
# In production the API and SPA are served from the same origin and this is empty.
# Plain http in development, so a Secure cookie would be set by Django and
# then never sent back by the browser. That presents as "login succeeds, every
# subsequent request is 401", which reads like a token bug for an hour.
AUTH_COOKIE_SECURE = False

# The Vite dev server is a DIFFERENT ORIGIN from Django (port 5173 against
# 8000), so two separate permissions are needed and they are often confused:
#
#   CORS_ALLOWED_ORIGINS   lets the browser READ our response.
#   CSRF_TRUSTED_ORIGINS   lets Django ACCEPT the request in the first place.
#
# CORS alone is not enough. Django compares the browser's Origin header
# against the host it was served on, and refuses a POST when they differ
# unless the origin is listed below — which is every state-changing request
# the frontend makes.
FRONTEND_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]

CORS_ALLOWED_ORIGINS = FRONTEND_ORIGINS

# Without it the browser drops the response for any request carrying
# cookies, so sign-in appears to do nothing at all.
CORS_ALLOW_CREDENTIALS = True

# MISSING UNTIL 2026-10-01, and the tests did not catch it: Django's test
# client is same-origin, so it sends no Origin header and the check it
# triggers never ran. Against a real browser EVERY POST, PATCH and DELETE
# from the frontend answered 403 "Origin checking failed".
CSRF_TRUSTED_ORIGINS = FRONTEND_ORIGINS

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"


# IN MEMORY, BECAUSE REDIS IS NOT INSTALLED AND THE CACHE IS NOW LOAD-BEARING.
#
# base.py points CACHES at Redis and has since Phase 1. Nothing read the cache
# until the signup endpoints were throttled, so an unreachable Redis cost
# nothing and nobody knew --- the same shape as BLACKLIST_AFTER_ROTATION without
# the app, or CSRF_TRUSTED_ORIGINS unset. The difference is the failure mode:
# DRF stores throttle history in the cache, so a dead cache does not degrade to
# "unlimited", it raises ConnectionError and the endpoint answers 500.
#
# WHAT THIS COSTS: LocMemCache is per process, so the limit is per worker and
# restarting the server forgets every tally. Both are fine for development and
# neither is fine in production, which keeps the Redis cache in base.py.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "xpredict-dev",
    }
}
