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

CORS_ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
CORS_ALLOW_CREDENTIALS = True

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
