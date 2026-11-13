from django.contrib import admin

from core.organizations.models import BusinessUnit, Invitation, Membership, Organization


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "db_name", "status", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("name", "slug", "db_name")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(BusinessUnit)
class BusinessUnitAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "organization", "status", "created_at")
    list_filter = ("status", "organization")
    search_fields = ("name", "code")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "organization", "role", "status", "unit", "created_at")
    list_filter = ("role", "status", "organization")
    search_fields = ("user__email", "organization__name")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Invitation)
class InvitationAdmin(admin.ModelAdmin):
    list_display = ("email", "organization", "role", "unit", "expires_at", "created_at")
    list_filter = ("role", "organization")
    search_fields = ("email", "organization__name")
    readonly_fields = ("id", "created_at", "updated_at")

