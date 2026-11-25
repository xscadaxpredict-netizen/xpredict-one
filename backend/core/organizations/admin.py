"""
Django's own admin screens for the organisation tables -- for us, not for
customers (who use the Admin panel).

Came from `main` (Nishanth) written for `BusinessUnit` and `Membership.role` /
`.unit`; rewritten for `Territory` and today's `Membership` in the merge
(2026-11-23), because the branch had renamed the one and dropped the others.

TERRITORIES ARE READ-ONLY HERE. They are a django-treebeard tree (C72): a row
saved without its `path` is refused, and a hand-edited path breaks the tree, so
they are added and moved only through the services (`add_territory`,
`edit_territory`) -- never this screen.
"""

from django.contrib import admin

from core.organizations.models import Invitation, Membership, Organization, Territory


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "db_name", "status", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("name", "slug", "db_name")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Territory)
class TerritoryAdmin(admin.ModelAdmin):
    list_display = ("name", "kind", "code", "organization", "status", "depth", "created_at")
    list_filter = ("kind", "status", "organization")
    search_fields = ("name", "code")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    # No role and no unit any more: the grants are the whole record (C72 2d).
    list_display = ("user", "organization", "status", "is_owner", "created_at")
    list_filter = ("status", "organization")
    search_fields = ("user__email", "organization__name")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Invitation)
class InvitationAdmin(admin.ModelAdmin):
    # A person, not yet placed or appointed (C83): no role and no unit.
    list_display = ("email", "organization", "expires_at", "accepted_at", "created_at")
    list_filter = ("organization",)
    search_fields = ("email", "organization__name")
    readonly_fields = ("id", "created_at", "updated_at")
