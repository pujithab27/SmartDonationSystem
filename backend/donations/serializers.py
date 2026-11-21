import base64
import binascii
import io
import re
import warnings
from decimal import Decimal
from PIL import Image
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.crypto import salted_hmac
from django.utils import timezone
from rest_framework import serializers
from .models import (
    CATEGORIES, User, Organization, Campaign, Donation, Preference, ContactMessage, Activity, AccountReview,
)
from .models import ItemRequest, ItemRequestLine
from .donation_items import ITEM_BY_ID


CATEGORY_IMAGES = {
    "Education": "/images/education.jpg", "Food": "/images/food.jpg",
    "Healthcare": "/images/healthcare.jpg", "Disaster Relief": "/images/community.jpg",
    "Elderly Care": "/images/healthcare.jpg", "Child Welfare": "/images/children.jpg",
    "Environment": "/images/environment.jpg",
}
USER_FIELDS = {"firstName": "first_name", "lastName": "last_name", "phone": "phone",
               "address": "address", "city": "city", "state": "state", "pincode": "pincode", "interests": "interests"}


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if isinstance(data, dict):
            unknown = set(data) - set(self.fields)
            if unknown:
                raise serializers.ValidationError({key: "This field cannot be set." for key in unknown})
        return super().to_internal_value(data)


class ProfileInput(StrictSerializer):
    email = serializers.EmailField(required=False)
    firstName = serializers.CharField(max_length=150, required=False)
    lastName = serializers.CharField(max_length=150, required=False)
    phone = serializers.CharField(max_length=20)
    address = serializers.CharField(max_length=300)
    city = serializers.CharField(max_length=100)
    state = serializers.CharField(max_length=100)
    pincode = serializers.RegexField(r"^[1-9]\d{5}$", max_length=6)
    interests = serializers.ListField(child=serializers.ChoiceField(choices=CATEGORIES), required=False)
    ngoName = serializers.CharField(max_length=200, required=False)
    registrationNumber = serializers.CharField(max_length=100, required=False)
    description = serializers.CharField(max_length=5000, required=False)
    website = serializers.URLField(max_length=200, required=False, allow_blank=True)

    def validate_phone(self, value):
        value = re.sub(r"[\s-]", "", value)
        if not re.fullmatch(r"(?:\+91)?[6-9]\d{9}", value):
            raise serializers.ValidationError("Enter a valid Indian mobile number.")
        return value

    def validate(self, attrs):
        user = self.context.get("user")
        role = user.role if user else attrs.get("role")
        required = ["ngoName", "registrationNumber", "description"] if role == "ngo" else ["firstName", "lastName"]
        for name in required:
            if not attrs.get(name):
                raise serializers.ValidationError({name: "This field is required."})
        if user and attrs.get("email", user.email).lower() != user.email:
            raise serializers.ValidationError({"email": "Email cannot be changed here."})
        if role == "ngo":
            registration = attrs["registrationNumber"].upper()
            existing = Organization.objects.filter(registration_number__iexact=registration)
            if user:
                existing = existing.exclude(user=user)
            if existing.exists():
                raise serializers.ValidationError({"registrationNumber": "This registration number is already registered."})
            attrs["registrationNumber"] = registration
        return attrs


class SignupInput(ProfileInput):
    role = serializers.ChoiceField(choices=["donor", "ngo"])
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False, min_length=8, max_length=128)
    confirmPassword = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)
    agree = serializers.BooleanField()

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists. Please sign in.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not attrs["agree"]:
            raise serializers.ValidationError({"agree": "Please agree to the terms to continue."})
        if attrs["password"] != attrs["confirmPassword"]:
            raise serializers.ValidationError({"confirmPassword": "Passwords do not match."})
        user = User(email=attrs["email"], first_name=attrs.get("firstName", ""), last_name=attrs.get("lastName", ""))
        try:
            validate_password(attrs["password"], user)
        except DjangoValidationError as error:
            raise serializers.ValidationError({"password": error.messages})
        return attrs


class LoginInput(StrictSerializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False, max_length=128)
    role = serializers.ChoiceField(choices=["donor", "ngo", "admin"])


class UserSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="display_name", read_only=True)
    firstName = serializers.CharField(source="first_name", read_only=True)
    lastName = serializers.CharField(source="last_name", read_only=True)
    approvalStatus = serializers.CharField(source="approval_status", read_only=True)
    reviewNote = serializers.CharField(source="approval_note", read_only=True)
    reviewedAt = serializers.DateTimeField(source="reviewed_at", read_only=True)
    joinedAt = serializers.DateTimeField(source="date_joined", read_only=True)
    isActive = serializers.BooleanField(source="is_active", read_only=True)
    canLogin = serializers.BooleanField(source="can_login", read_only=True)
    accessVersion = serializers.IntegerField(source="access_version", read_only=True)

    class Meta:
        model = User
        fields = ["id", "role", "email", "name", "firstName", "lastName", "phone", "address", "city", "state", "pincode", "interests",
                  "approvalStatus", "reviewNote", "reviewedAt", "joinedAt", "isActive", "canLogin", "accessVersion"]


class AccountReviewInput(StrictSerializer):
    action = serializers.ChoiceField(choices=["Approved", "Rejected", "Activated", "Deactivated"])
    reason = serializers.CharField(max_length=500, allow_blank=True, default="")
    version = serializers.IntegerField(min_value=0)

    def validate(self, attrs):
        if attrs["action"] in ["Rejected", "Deactivated"] and not attrs["reason"].strip():
            raise serializers.ValidationError({"reason": "Please explain this decision."})
        return attrs


class AccountVersionInput(StrictSerializer):
    id = serializers.IntegerField(min_value=1)
    version = serializers.IntegerField(min_value=0)


class BulkApprovalInput(StrictSerializer):
    accounts = AccountVersionInput(many=True, allow_empty=False)

    def validate_accounts(self, value):
        if len(value) > 50 or len({item["id"] for item in value}) != len(value):
            raise serializers.ValidationError("Select between 1 and 50 different accounts.")
        return value


class AccountReviewSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="account.display_name", read_only=True)
    email = serializers.EmailField(source="account.email", read_only=True)
    role = serializers.CharField(source="account.role", read_only=True)
    administrator = serializers.CharField(source="administrator.display_name", read_only=True, default="Administrator")
    date = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = AccountReview
        fields = ["id", "name", "email", "role", "administrator", "action", "reason", "date"]


class OrganizationSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    ngoName = serializers.CharField(source="name")
    registrationNumber = serializers.CharField(source="registration_number")
    city = serializers.CharField(source="user.city")
    state = serializers.CharField(source="user.state")
    phone = serializers.CharField(source="user.phone")
    address = serializers.CharField(source="user.address")
    pincode = serializers.CharField(source="user.pincode")
    reviewNote = serializers.CharField(source="review_note")
    reviewedAt = serializers.DateTimeField(source="reviewed_at")
    initials = serializers.SerializerMethodField()
    color = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = ["id", "email", "ngoName", "registrationNumber", "description", "website", "category", "status",
                  "city", "state", "phone", "address", "pincode", "reviewNote", "reviewedAt", "initials", "color"]

    def get_initials(self, obj):
        return "".join(word[0] for word in obj.name.split()[:2]).lower()

    def get_color(self, obj):
        return ["sage", "peach", "lavender"][obj.pk % 3]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        viewer = self.context["request"].user
        if not viewer.is_authenticated or (viewer.role != "admin" and viewer.pk != instance.user_id):
            for key in ["phone", "address", "pincode", "reviewNote", "reviewedAt"]:
                data.pop(key, None)
        return data


def validate_upload(value, allowed):
    if not isinstance(value, str) or len(value) > 940000:
        raise serializers.ValidationError("Upload must be smaller than 700 KB.")
    match = re.fullmatch(r"data:([^;,]+);base64,([A-Za-z0-9+/=]+)", value)
    if not match or match[1] not in allowed:
        raise serializers.ValidationError("Unsupported upload type.")
    try:
        raw = base64.b64decode(match[2], validate=True)
        if not raw or len(raw) > 700000:
            raise ValueError()
        if match[1] == "application/pdf":
            if not raw.startswith(b"%PDF-"):
                raise ValueError()
        else:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(raw)) as picture:
                    expected = {"image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WEBP"}[match[1]]
                    if picture.format != expected or picture.width * picture.height > 16_000_000:
                        raise ValueError()
                    picture.verify()
    except (ValueError, OSError, binascii.Error, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise serializers.ValidationError("Invalid file, or upload exceeds the image/700 KB limit.")
    return value


class CampaignInput(StrictSerializer):
    title = serializers.CharField(max_length=100)
    category = serializers.ChoiceField(choices=CATEGORIES)
    description = serializers.CharField(max_length=5000)
    need = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("1"), max_value=Decimal("100000000"))
    location = serializers.CharField(max_length=100)
    beneficiaries = serializers.CharField(max_length=200)
    startDate = serializers.DateField()
    endDate = serializers.DateField()
    urgency = serializers.ChoiceField(choices=["Normal", "Urgent"], default="Normal")
    image = serializers.CharField(allow_blank=True, default="", max_length=940000)
    document = serializers.JSONField(required=False, allow_null=True)
    status = serializers.ChoiceField(choices=["Draft", "Pending Approval"])

    def validate_image(self, value):
        return validate_upload(value, ["image/png", "image/jpeg", "image/webp"]) if value else ""

    def validate_document(self, value):
        if value is None:
            return value
        if not isinstance(value, dict) or set(value) != {"name", "type", "data"}:
            raise serializers.ValidationError("Provide document name, type and data.")
        if not isinstance(value["name"], str) or not 1 <= len(value["name"]) <= 200:
            raise serializers.ValidationError("Invalid document filename.")
        validate_upload(value["data"], ["application/pdf", "image/png", "image/jpeg"])
        if value["type"] != value["data"].split(";")[0][5:]:
            raise serializers.ValidationError("Document type does not match the file.")
        return value

    def validate(self, attrs):
        if attrs["endDate"] < attrs["startDate"]:
            raise serializers.ValidationError({"endDate": "The end date must be on or after the start date."})
        return attrs


class CampaignSerializer(serializers.ModelSerializer):
    ownerEmail = serializers.EmailField(source="organization.user.email")
    ngo = serializers.CharField(source="organization.name")
    startDate = serializers.DateField(source="start_date")
    endDate = serializers.DateField(source="end_date")
    reviewNote = serializers.CharField(source="review_note")
    document = serializers.SerializerMethodField()

    class Meta:
        model = Campaign
        fields = ["id", "ownerEmail", "ngo", "title", "category", "description", "need", "raised", "location",
                  "beneficiaries", "startDate", "endDate", "urgency", "image", "status", "reviewNote", "document"]

    def get_document(self, obj):
        viewer = self.context["request"].user
        if viewer.is_authenticated and (viewer.role == "admin" or viewer.pk == obj.organization.user_id) and hasattr(obj, "document"):
            return {"name": obj.document.name, "type": obj.document.mime_type, "data": obj.document.data}
        return None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        viewer = self.context["request"].user
        if not viewer.is_authenticated or (viewer.role != "admin" and viewer.pk != instance.organization.user_id):
            data.pop("reviewNote", None)
        return data


class DonationInput(StrictSerializer):
    campaignId = serializers.CharField(max_length=40)
    transactionId = serializers.CharField(max_length=100)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("1"), max_value=Decimal("10000000"))
    anonymous = serializers.BooleanField(default=False)
    message = serializers.CharField(max_length=500, allow_blank=True, default="")


class DonationSerializer(serializers.ModelSerializer):
    requestId = serializers.CharField(source="campaign_id")
    campaignTitle = serializers.CharField(source="campaign.title")
    ngo = serializers.CharField(source="campaign.organization.name")
    donorEmail = serializers.SerializerMethodField()
    donorName = serializers.SerializerMethodField()
    donorKey = serializers.SerializerMethodField()
    date = serializers.DateTimeField(source="created_at")
    status = serializers.SerializerMethodField()

    class Meta:
        model = Donation
        fields = ["id", "requestId", "campaignTitle", "ngo", "donorEmail", "donorName", "donorKey", "amount", "anonymous", "message", "date", "status"]

    def get_donorEmail(self, obj):
        viewer = self.context["request"].user
        return "" if obj.anonymous and viewer.role != "admin" and viewer.pk != obj.donor_id else obj.donor.email

    def get_donorName(self, obj):
        return "Anonymous donor" if obj.anonymous else obj.donor.display_name

    def get_donorKey(self, obj):
        return salted_hmac("ngo-donor", f"{obj.campaign.organization_id}:{obj.donor_id}").hexdigest()

    def get_status(self, obj):
        return "Pledge recorded"


class PreferenceSerializer(serializers.ModelSerializer):
    defaultAmount = serializers.DecimalField(source="default_amount", max_digits=10, decimal_places=2, min_value=Decimal("1"), max_value=Decimal("10000000"))
    defaultCategory = serializers.ChoiceField(source="default_category", choices=CATEGORIES)
    showResolved = serializers.BooleanField(source="show_resolved")

    class Meta:
        model = Preference
        fields = ["compact", "defaultAmount", "defaultCategory", "showResolved"]


class ContactSerializer(serializers.ModelSerializer):
    date = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = ContactMessage
        fields = ["id", "name", "email", "subject", "message", "date"]
        read_only_fields = ["id", "date"]


class ActivitySerializer(serializers.ModelSerializer):
    date = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = Activity
        fields = ["id", "message", "severity", "resolved", "date"]


class ReviewInput(StrictSerializer):
    status = serializers.CharField(max_length=20)
    reason = serializers.CharField(max_length=500, allow_blank=True, default="")

    def validate(self, attrs):
        if attrs["status"] == "Rejected" and not attrs["reason"].strip():
            raise serializers.ValidationError({"reason": "Please provide a rejection reason."})
        return attrs


class ItemQuantityInput(StrictSerializer):
    itemId = serializers.ChoiceField(source="item_key", choices=list(ITEM_BY_ID))
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("1"), max_value=Decimal("1000000"))

    def validate(self, attrs):
        if attrs["quantity"] % 1:
            raise serializers.ValidationError({"quantity": "Use a whole number such as 3 or 4. Decimal quantities are not accepted."})
        return attrs


class ItemRequestInput(StrictSerializer):
    contactPhone = serializers.CharField(source="contact_phone", max_length=20)

    def validate_contactPhone(self, value):
        return ProfileInput.validate_phone(self, value)

    priority = serializers.ChoiceField(choices=["Low", "Medium", "High"], default="Medium")
    title = serializers.CharField(max_length=120)
    items = ItemQuantityInput(many=True, allow_empty=False, max_length=50)
    deliveryAddress = serializers.CharField(source="delivery_address", max_length=300)
    deliveryCity = serializers.CharField(source="delivery_city", max_length=100)
    deliveryState = serializers.CharField(source="delivery_state", max_length=100)
    deliveryPincode = serializers.RegexField(r"^[1-9]\d{5}$", source="delivery_pincode", max_length=6)
    notes = serializers.CharField(max_length=2000, allow_blank=True, default="")
    neededBy = serializers.DateField(source="needed_by", required=False, allow_null=True)

    def validate_items(self, items):
        keys = [item["item_key"] for item in items]
        if len(keys) != len(set(keys)):
            raise serializers.ValidationError("Choose each item once and adjust its quantity.")
        return items

    def validate_neededBy(self, value):
        existing = self.context.get("instance")
        if value and value < timezone.localdate() and (not existing or value != existing.needed_by):
            raise serializers.ValidationError("Choose today or a future date.")
        return value


class ItemRequestEditInput(ItemRequestInput):
    version = serializers.IntegerField(min_value=0)


class ItemRequestStatusInput(StrictSerializer):
    status = serializers.ChoiceField(choices=["Open", "Closed"])
    version = serializers.IntegerField(min_value=0)


class ItemRequestLineSerializer(serializers.ModelSerializer):
    fulfilled = serializers.DecimalField(source="fulfilled_quantity", max_digits=10, decimal_places=2)
    reserved = serializers.SerializerMethodField()
    remaining = serializers.SerializerMethodField()

    def get_reserved(self, item):
        return sum((m.quantity for m in item.request.matches.all() if m.status in ["Pending", "Pickup scheduled"] and m.donation.item_key == item.item_key), Decimal(0))

    def get_remaining(self, item):
        return max(Decimal(0), item.quantity - item.fulfilled_quantity - self.get_reserved(item))

    itemId = serializers.CharField(source="item_key")
    name = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()
    unit = serializers.SerializerMethodField()

    class Meta:
        model = ItemRequestLine
        fields = ["itemId", "name", "category", "unit", "quantity", "fulfilled", "reserved", "remaining"]

    def get_name(self, item):
        return ITEM_BY_ID[item.item_key]["name"]

    def get_category(self, item):
        return ITEM_BY_ID[item.item_key]["category"]

    def get_unit(self, item):
        return ITEM_BY_ID[item.item_key]["unit"]


class ItemRequestSerializer(serializers.ModelSerializer):
    canDelete = serializers.SerializerMethodField()

    def get_canDelete(self, obj):
        return not list(obj.matches.all()) and not any(line.fulfilled_quantity > 0 for line in obj.items.all())

    contactPhone = serializers.CharField(source="contact_phone")
    organizationId = serializers.IntegerField(source="organization_id")
    ngoName = serializers.CharField(source="organization.name")
    ownerEmail = serializers.EmailField(source="organization.user.email")
    deliveryAddress = serializers.CharField(source="delivery_address")
    deliveryCity = serializers.CharField(source="delivery_city")
    deliveryState = serializers.CharField(source="delivery_state")
    deliveryPincode = serializers.CharField(source="delivery_pincode")
    neededBy = serializers.DateField(source="needed_by")
    createdAt = serializers.DateTimeField(source="created_at")
    items = ItemRequestLineSerializer(many=True)

    class Meta:
        model = ItemRequest
        fields = ["id", "organizationId", "ngoName", "ownerEmail", "title", "items", "deliveryAddress", "deliveryCity", "deliveryState", "deliveryPincode", "notes", "priority", "neededBy", "status", "version", "createdAt", "contactPhone", "canDelete"]
