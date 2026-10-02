"""
Tenant routing tests.

These need no database: they exercise the router's decisions directly. The
full two-organization isolation suite arrives in Phase 2, once there are real
tenant databases to isolate. What is locked in here is the property that
matters most and is easiest to regress --- the router must never invent a
database when tenant context is missing.
"""

from __future__ import annotations

import pytest
from django.apps import apps
from django.conf import settings

from config.routers import (
    TenantContextMissingError,
    TenantRouter,
    current_tenant_db,
)


class _FakeMeta:
    def __init__(self, app_label: str) -> None:
        self.app_label = app_label


class _FakeModel:
    def __init__(self, app_label: str) -> None:
        self._meta = _FakeMeta(app_label)


@pytest.fixture
def router() -> TenantRouter:
    return TenantRouter()


@pytest.fixture
def tenant_bound():
    """Bind a tenant database, and always reset it --- contextvars leak across tests."""
    token = current_tenant_db.set("org_acme")
    try:
        yield "org_acme"
    finally:
        current_tenant_db.reset(token)


# --------------------------------------------------------------------------
# Fail closed
# --------------------------------------------------------------------------


@pytest.mark.parametrize("app_label", ["dms", "crm", "contacts", "audit", "events"])
def test_tenant_read_without_context_raises(router, app_label):
    """A tenant model with no bound database must raise, not fall back to default."""
    with pytest.raises(TenantContextMissingError):
        router.db_for_read(_FakeModel(app_label))


@pytest.mark.parametrize("app_label", ["dms", "crm", "contacts", "audit", "events"])
def test_tenant_write_without_context_raises(router, app_label):
    with pytest.raises(TenantContextMissingError):
        router.db_for_write(_FakeModel(app_label))


def test_control_plane_never_needs_tenant_context(router):
    """Control-plane models resolve with no tenant bound at all."""
    for app_label in settings.CONTROL_PLANE_APP_LABELS:
        assert router.db_for_read(_FakeModel(app_label)) == "default"
        assert router.db_for_write(_FakeModel(app_label)) == "default"


# --------------------------------------------------------------------------
# Correct routing when context is present
# --------------------------------------------------------------------------


def test_tenant_model_uses_bound_database(router, tenant_bound):
    assert router.db_for_read(_FakeModel("dms")) == tenant_bound
    assert router.db_for_write(_FakeModel("dms")) == tenant_bound


def test_control_plane_ignores_bound_tenant(router, tenant_bound):
    """A bound tenant must not drag control-plane models out of `default`."""
    assert router.db_for_read(_FakeModel("accounts")) == "default"
    assert router.db_for_write(_FakeModel("organizations")) == "default"


def test_context_does_not_leak_between_operations(router):
    """After reset, the next caller must be back to failing closed."""
    token = current_tenant_db.set("org_acme")
    assert router.db_for_read(_FakeModel("dms")) == "org_acme"
    current_tenant_db.reset(token)

    with pytest.raises(TenantContextMissingError):
        router.db_for_read(_FakeModel("dms"))


# --------------------------------------------------------------------------
# allow_migrate keeps the two planes apart
# --------------------------------------------------------------------------


def test_control_plane_apps_migrate_only_into_default(router):
    assert router.allow_migrate("default", "accounts") is True
    assert router.allow_migrate("org_acme", "accounts") is False


def test_tenant_apps_migrate_only_into_tenant_databases(router):
    assert router.allow_migrate("default", "dms") is False
    assert router.allow_migrate("org_acme", "dms") is True


def test_every_installed_app_lands_in_exactly_one_plane(router):
    """
    No app may migrate into both planes, or neither.

    Labels come from the real app registry, not from the dotted path. A module
    nested inside a product has a product-prefixed label --- "products.dms.sales"
    is labelled "dms_sales" --- so deriving the label from the last path segment
    would test a label that does not exist and pass without checking anything.
    """
    for config in apps.get_app_configs():
        if config.name.startswith("django.") or config.name in {
            "rest_framework",
            "corsheaders",
        }:
            continue
        in_control = router.allow_migrate("default", config.label)
        in_tenant = router.allow_migrate("org_acme", config.label)
        assert in_control != in_tenant, (
            f"{config.label!r} ({config.name}) is in both planes or neither"
        )


def test_control_plane_labels_match_the_app_registry(router):
    """
    CONTROL_PLANE_APP_LABELS is derived by splitting the dotted path, which
    assumes every control-plane app's label equals its last path segment.

    If a control-plane app ever sets a custom label, that assumption breaks and
    the app starts routing to tenant databases --- silently, because nothing
    else would notice. This is the guard.
    """
    for dotted in settings.CONTROL_PLANE_APPS:
        config = apps.get_app_config(dotted.rsplit(".", 1)[-1])
        assert config.label in settings.CONTROL_PLANE_APP_LABELS, (
            f"{dotted} has label {config.label!r}, which is not in "
            "CONTROL_PLANE_APP_LABELS --- it would route to a tenant database."
        )
        assert router.db_for_read(_FakeModel(config.label)) == "default"


def test_tenant_modules_are_product_prefixed():
    """
    Django app labels are global. Two products both containing a `sales`
    module would collide at startup, so every product module is prefixed.
    """
    for dotted in settings.TENANT_APPS:
        if not dotted.startswith("products."):
            continue
        parts = dotted.split(".")
        if len(parts) < 3:  # a product with no submodules yet
            continue
        product, module = parts[1], parts[2]
        config = apps.get_app_config(f"{product}_{module}")
        assert config.name == dotted


# --------------------------------------------------------------------------
# Cross-database relations
# --------------------------------------------------------------------------


def test_relations_across_databases_are_refused(router):
    """
    No foreign keys across databases (C1).

    Tenant rows reference control-plane rows by plain UUID --- created_by_user_id,
    unit_id --- so a relation spanning two connections is always a mistake.
    """

    class _Obj:
        def __init__(self, db):
            self._state = type("S", (), {"db": db})()

    assert router.allow_relation(_Obj("default"), _Obj("default")) is True
    assert router.allow_relation(_Obj("org_acme"), _Obj("org_acme")) is True
    assert router.allow_relation(_Obj("default"), _Obj("org_acme")) is False
