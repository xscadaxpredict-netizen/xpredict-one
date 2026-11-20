"""
Every REAL view that reads and writes names each write in `method_permissions`.

The base class refuses such a view with a 500 (`undeclared_writes()` in
`core/organizations/api/base.py`) -- but only when somebody calls it. This
walks every route the project serves, so a forgotten declaration fails here,
in the suite, before any endpoint is called.
"""

from __future__ import annotations

from django.urls import URLPattern, URLResolver, get_resolver

from core.organizations.api.base import OrgScopedAPIView, undeclared_writes


def _views(patterns) -> set[type]:
    found: set[type] = set()
    for pattern in patterns:
        if isinstance(pattern, URLResolver):
            found |= _views(pattern.url_patterns)
        elif isinstance(pattern, URLPattern):
            view_class = getattr(pattern.callback, "view_class", None)
            if view_class is not None and issubclass(view_class, OrgScopedAPIView):
                found.add(view_class)
    return found


ORG_VIEWS = _views(get_resolver().url_patterns)


def test_the_walk_finds_the_views_it_is_meant_to_check():
    """An empty walk would pass the test below for any code at all."""
    names = {view.__name__ for view in ORG_VIEWS}

    assert len(ORG_VIEWS) > 40
    assert {"UsersView", "AdminsView", "TimerCalculationListView", "EnquiryDetailView"} <= names


def test_every_view_that_reads_and_writes_names_each_write():
    missing = {
        view.__name__: undeclared_writes(view)
        for view in ORG_VIEWS
        if undeclared_writes(view)
    }

    assert missing == {}
