"""
You cannot act on a page you cannot see (C79 rule 5), checked by the SERVER.

The Admin panel's write-only endpoints require the page's `view` beside the
action: holding `admin.user.deactivate` without `admin.user.view` is refused
before the handler runs. No built-in role is in that position today; once
organisations build roles (C72 piece 5) one could be, and the server must not
depend on the role builder alone.
"""

from __future__ import annotations

import uuid

import pytest
from rest_framework.test import APIClient

from conftest import TEST_TENANT_ALIAS
from core.accounts.models import User
from core.organizations.models import ActivationCode, Membership, Territory
from core.organizations.services import grant_app_access, sign_up
from core.permissions.models import AppCode, Permission, Role, RolePermission

pytestmark = [
    pytest.mark.django_db(databases=["default", TEST_TENANT_ALIAS]),
]

ANY_ID = str(uuid.uuid4())

# (HTTP method, address below /orgs/<slug>/, the action, the page's view)
ENDPOINTS = [
    ("post", f"admin/users/{ANY_ID}/deactivate/", "admin.user.deactivate", "admin.user.view"),
    (
        "post",
        f"admin/users/{ANY_ID}/resend-invitation/",
        "admin.user.resend_invitation",
        "admin.user.view",
    ),
    ("get", f"admin/users/{ANY_ID}/invite-link/", "admin.user.create", "admin.user.view"),
    ("put", f"admin/dealers/{ANY_ID}/", "admin.dealer.update", "admin.dealer.view"),
    ("post", f"admin/dealers/{ANY_ID}/close/", "admin.dealer.set_status", "admin.dealer.view"),
    ("patch", f"admin/territories/{ANY_ID}/", "admin.territory.update", "admin.territory.view"),
    (
        "post",
        f"admin/territories/{ANY_ID}/move/",
        "admin.territory.update",
        "admin.territory.view",
    ),
]


def found():
    ActivationCode.objects.create(code="CODE-ACME")
    return sign_up(
        activation_code="CODE-ACME",
        organization_name="Acme Water",
        email="owner@acme.test",
        password="correct horse battery staple",
    )


def holding(result, *codes):
    """Somebody whose only permissions are `codes`, through a made-up role at the root."""
    role = Role.objects.create(
        code="dms.test_only", name="Test role", app_id=AppCode.DMS, level="org", summary="."
    )
    for code in codes:
        RolePermission.objects.create(role=role, permission=Permission.objects.get(code=code))
    user = User.objects.create_user(email="someone@acme.test", password="x")
    membership = Membership.objects.create(user=user, organization=result.organization)
    grant_app_access(
        membership=membership,
        app=AppCode.DMS,
        role=role,
        territories=[Territory.objects.root_for(result.organization, AppCode.DMS)],
    )
    return user


def call(client, result, method, address):
    url = f"/api/v1/orgs/{result.organization.slug}/{address}"
    return getattr(client, method)(url, {}, format="json")


@pytest.mark.parametrize(("method", "address", "action", "view"), ENDPOINTS)
def test_the_action_without_the_pages_view_is_refused(method, address, action, view):
    result = found()
    client = APIClient()
    client.force_authenticate(user=holding(result, action))

    assert call(client, result, method, address).status_code == 403


@pytest.mark.parametrize(("method", "address", "action", "view"), ENDPOINTS)
def test_the_action_with_the_pages_view_gets_past_the_check(method, address, action, view):
    """
    The control: with both, the request reaches the handler -- which then
    answers 404 or 400 for a made-up id or an empty body. Anything but 403.
    """
    result = found()
    client = APIClient()
    client.force_authenticate(user=holding(result, view, action))

    assert call(client, result, method, address).status_code != 403
