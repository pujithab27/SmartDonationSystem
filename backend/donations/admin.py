from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, Organization, Campaign, CampaignDocument, Donation, SavedCampaign, Preference, ContactMessage, Activity, LoginEvent


@admin.register(User)
class AccountAdmin(UserAdmin):
    ordering = ["email"]
    list_display = ["email", "role", "approval_status", "is_active", "last_login"]
    readonly_fields = ["approval_status", "approval_note", "reviewed_at", "reviewed_by", "access_version"]
    search_fields = ["email", "first_name", "last_name"]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Profile", {"fields": ("first_name", "last_name", "role", "phone", "address", "city", "state", "pincode", "interests")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Account review (use the Smart Donation System admin portal)", {"fields": ("approval_status", "approval_note", "reviewed_at", "reviewed_by", "access_version")}),
        ("Dates", {"fields": ("last_login", "date_joined", "terms_accepted_at")}),
    )
    add_fieldsets = ((None, {"classes": ("wide",), "fields": ("email", "password1", "password2", "role", "is_staff", "is_superuser")}),)


@admin.register(LoginEvent)
class LoginEventAdmin(admin.ModelAdmin):
    list_display = ["email", "role", "successful", "created_at"]
    readonly_fields = ["user", "email", "role", "successful", "created_at"]
    list_filter = ["successful", "role"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


admin.site.register([Organization, Campaign, CampaignDocument, Donation, SavedCampaign, Preference, ContactMessage, Activity])
