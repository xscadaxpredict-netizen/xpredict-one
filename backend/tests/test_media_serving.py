"""
The contract between Django's media settings and the Nginx that serves them.

WHY THESE ARE TESTS AND NOT A COMMENT. In production Django does not serve
uploaded files at all: `config/urls.py` serves `MEDIA_URL` only
`if settings.DEBUG`, and `prod.py` hardcodes `DEBUG = False`. Nginx serves the
directory by `alias` instead. So the two halves live in different files, in
different languages, and nothing executes them together --- the exact shape
that produced the bug these tests exist for.

THE BUG, because the failure mode is the point. With no `/media/` location,
`/media/signature.png` fell through to the SPA's `try_files $uri $uri/
/index.html` and came back as **index.html with a 200 status**. A browser
asking for an image got HTML and rendered a broken image; nothing appeared in
any log, because as far as Nginx was concerned it had served a page
successfully. Ten `FileField`s were affected, including the client signatures
on service reports.

WHAT THESE TESTS CANNOT DO: run Nginx. They read the shipped config as text
and assert it still agrees with Django's settings. That is weaker than an
integration test and stronger than nothing --- it catches the two drifting
apart, which is how this breaks. Proving it end to end is step 13 of
`deploy/README.md`, which fetches a probe file over HTTPS and checks the BODY,
because the status code is 200 either way.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from django.conf import settings
from django.urls import get_resolver

NGINX_CONF = Path(settings.BASE_DIR).parent / "deploy" / "nginx-xpredict.conf"


@pytest.fixture(scope="module")
def nginx() -> str:
    assert NGINX_CONF.is_file(), f"the shipped Nginx config is missing: {NGINX_CONF}"
    return NGINX_CONF.read_text(encoding="utf-8")


class TestNginxServesMedia:
    def test_there_is_a_media_location(self, nginx: str):
        """
        THE ASSERTION THAT WOULD HAVE CAUGHT IT. There was no such block, and
        every other part of the deployment looked correct.
        """
        assert re.search(r"^\s*location\s+/media/\s*\{", nginx, re.M), (
            "deploy/nginx-xpredict.conf has no `location /media/` block, so "
            "uploaded files fall through to the SPA and return index.html "
            "with a 200"
        )

    def test_its_alias_matches_django_media_root(self, nginx: str):
        """
        `MEDIA_ROOT` is `BASE_DIR / "media"`, and the runbook deploys the
        backend at /srv/xpredict/backend --- so the alias has to end in the same
        two segments Django will write to. Moving MEDIA_ROOT without moving the
        alias gives an empty directory served successfully.
        """
        block = _media_block(nginx)
        alias = re.search(r"^\s*alias\s+([^;]+);", block, re.M)

        assert alias, "the /media/ block serves nothing: no `alias` directive"
        assert alias.group(1).strip().rstrip("/").endswith("backend/media"), (
            f"the alias {alias.group(1).strip()!r} does not end in the path "
            f"MEDIA_ROOT resolves to ({Path(settings.MEDIA_ROOT).name!r} under "
            "backend/)"
        )

    def test_media_url_is_the_prefix_nginx_matches(self):
        """
        The one place the two halves are named the same. `MEDIA_URL` is what
        the serializers put in front of every file path they hand the frontend;
        the Nginx location is what intercepts it. A change to either alone
        breaks every upload.
        """
        assert settings.MEDIA_URL == "/media/"

    def test_a_missing_file_is_a_404_and_not_the_spa(self, nginx: str):
        """
        The original bug in miniature. Without an explicit `try_files … =404`
        inside the block, a path that does not exist inherits the SPA
        fallthrough and answers 200 with HTML.
        """
        block = _media_block(nginx)

        assert re.search(r"try_files[^;]*=404\s*;", block), (
            "the /media/ block does not end a miss with =404, so a missing "
            "file can still be answered with the SPA's index.html"
        )

    def test_it_sets_its_own_framing_header(self, nginx: str):
        """
        DJANGO'S `X_FRAME_OPTIONS` DOES NOT REACH THESE RESPONSES, which is the
        thing most likely to be misread in this codebase: `base.py` sets
        SAMEORIGIN and `prod.py` sets DENY, and neither applies to a file Nginx
        serves by alias, because Django is not in the request.

        Measured rather than assumed, both ways: a development request to
        /media/ (where Django DOES serve it) comes back SAMEORIGIN, and the
        Nginx config sets no X-Frame-Options anywhere else. So without this
        line every uploaded file is framable by any site on the internet --- and
        it must be SAMEORIGIN rather than DENY, because the preview modal
        iframes these URLs directly.
        """
        block = _media_block(nginx)

        assert re.search(r'add_header\s+X-Frame-Options\s+"?SAMEORIGIN"?\s*;', block), (
            "the /media/ block must set X-Frame-Options: SAMEORIGIN itself --- "
            "Django's setting never reaches an alias-served file"
        )

    def test_uploads_are_not_cached_for_a_year(self, nginx: str):
        """
        Unlike `/assets/`, these filenames are not content-hashed, so a
        replaced attachment would be served stale. `private` matters more: an
        intermediary caching one customer's signed report is worse than serving
        it slowly.
        """
        block = _media_block(nginx)

        assert "private" in block, "uploaded files must not be publicly cacheable"


class TestDjangoDoesNotServeMediaInProduction:
    def test_the_media_route_is_debug_only(self):
        """
        Pinning the half that is easy to "fix" wrongly. Somebody finding broken
        uploads in production may reach for serving them from Django instead,
        which works and then serves every file through a Python worker. The
        route is deliberately DEBUG-only; Nginx is the answer.

        Asserted through the resolver rather than by reading the file, so it
        follows what Django actually routes.
        """
        patterns = [str(p.pattern) for p in get_resolver().url_patterns]
        media_routes = [p for p in patterns if "media" in p]

        if settings.DEBUG:
            assert media_routes, (
                "DEBUG is on, so Django should be serving MEDIA_URL --- the "
                "development preview iframe depends on it"
            )
        else:
            assert not media_routes, (
                "DEBUG is off and Django is still routing MEDIA_URL; in "
                "production Nginx serves it by alias"
            )

    def test_media_root_is_under_the_backend_directory(self):
        """
        The runbook creates this directory by hand, owned by `xpredict` and
        readable by `www-data`. If MEDIA_ROOT ever moves outside `backend/`,
        that step and the Nginx alias both become wrong silently.
        """
        media_root = Path(settings.MEDIA_ROOT)

        assert media_root.name == "media"
        assert media_root.parent == Path(settings.BASE_DIR)


def _media_block(nginx: str) -> str:
    """
    The text of the `location /media/ { … }` block.

    Brace-counted rather than regexed to the first `}`: the block contains a
    nested `location ~ \\.(php|py|…)$` that denies executables, and a
    non-greedy match would stop inside it and silently test only the first
    half.
    """
    start = re.search(r"^\s*location\s+/media/\s*\{", nginx, re.M)
    assert start, "no /media/ block to read"

    depth = 0
    for index in range(start.end() - 1, len(nginx)):
        if nginx[index] == "{":
            depth += 1
        elif nginx[index] == "}":
            depth -= 1
            if depth == 0:
                return nginx[start.start() : index + 1]

    raise AssertionError("the /media/ block is not closed")
