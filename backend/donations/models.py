import uuid
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.db.models.functions import Lower
from django.utils.crypto import salted_hmac

CATEGORIES = ["Education", "Food", "Healthcare", "Disaster Relief", "Elderly Care", "Child Welfare", "Environment"]
CATEGORY_CHOICES = [(value, value) for value in CATEGORIES]


def campaign_id():
    return "req-" + uuid.uuid4().hex


def donation_id():
    return "AOU-" + uuid.uuid4().hex.upper()


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required.")
        user = self.model(email=email.strip().lower(), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("role", "admin")
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("approval_status", "Approved")
        if not extra_fields["is_staff"] or not extra_fields["is_superuser"] or extra_fields["role"] != "admin":
            raise ValueError("Superusers must have admin role, is_staff=True and is_superuser=True.")
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    username = None
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=10, choices=[("donor", "Donor"), ("ngo", "NGO"), ("admin", "Admin")], default="donor")
    phone = models.CharField(max_length=20, blank=True)
    address = models.CharField(max_length=300, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    pincode = models.CharField(max_length=6, blank=True)
    interests = models.JSONField(default=list, blank=True)
    terms_accepted_at = models.DateTimeField(null=True, blank=True)
    approval_status = models.CharField(max_length=10, choices=[(v, v) for v in ["Pending", "Approved", "Rejected"]], default="Pending")
    approval_note = models.CharField(max_length=500, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="account_reviews")
    access_version = models.PositiveIntegerField(default=0)
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []
    objects = UserManager()

    class Meta:
        constraints = [models.UniqueConstraint(Lower("email"), name="unique_email_case_insensitive")]

    def save(self, *args, **kwargs):
        self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    @property
    def can_login(self):
        return self.is_active and (self.role == "admin" or self.approval_status == "Approved")

    def _get_session_auth_hash(self, secret=None):
        # An old cookie must never regain access after an account is reactivated.
        return salted_hmac(
            "donations.User.session_access",
            f"{self.password}:{self.approval_status}:{self.is_active}:{self.access_version}",
            secret=secret, algorithm="sha256",
        ).hexdigest()

    @property
    def display_name(self):
        if self.role == "ngo" and hasattr(self, "organization"):
            return self.organization.name
        return self.get_full_name() or self.email


class Organization(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="organization")
    name = models.CharField(max_length=200)
    registration_number = models.CharField(max_length=100, unique=True)
    description = models.TextField()
    website = models.URLField(blank=True)
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default="Education")
    status = models.CharField(max_length=15, choices=[(v, v) for v in ["Pending", "Verified", "Rejected"]], default="Pending")
    review_note = models.CharField(max_length=500, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="organization_reviews")
    created_at = models.DateTimeField(auto_now_add=True)


class AccountReview(models.Model):
    account = models.ForeignKey(User, on_delete=models.CASCADE, related_name="access_history")
    administrator = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name="access_decisions")
    action = models.CharField(max_length=12, choices=[(v, v) for v in ["Approved", "Rejected", "Activated", "Deactivated"]])
    reason = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class Campaign(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=campaign_id, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.PROTECT, related_name="campaigns")
    title = models.CharField(max_length=100)
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES)
    description = models.TextField()
    need = models.DecimalField(max_digits=12, decimal_places=2)
    raised = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    location = models.CharField(max_length=100)
    beneficiaries = models.CharField(max_length=200)
    start_date = models.DateField()
    end_date = models.DateField()
    urgency = models.CharField(max_length=10, choices=[("Normal", "Normal"), ("Urgent", "Urgent")], default="Normal")
    image = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=[(v, v) for v in ["Draft", "Pending Approval", "Active", "Rejected", "Completed"]], default="Draft")
    review_note = models.CharField(max_length=500, blank=True)
    reviewed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="campaign_reviews")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(condition=models.Q(need__gte=1), name="campaign_positive_target"),
            models.CheckConstraint(condition=models.Q(raised__gte=0), name="campaign_nonnegative_raised"),
            models.CheckConstraint(condition=models.Q(end_date__gte=models.F("start_date")), name="campaign_valid_dates"),
        ]


class CampaignDocument(models.Model):
    campaign = models.OneToOneField(Campaign, on_delete=models.CASCADE, related_name="document")
    name = models.CharField(max_length=200)
    mime_type = models.CharField(max_length=50)
    data = models.TextField()


class Donation(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=donation_id, editable=False)
    donor = models.ForeignKey(User, on_delete=models.PROTECT, related_name="donations")
    campaign = models.ForeignKey(Campaign, on_delete=models.PROTECT, related_name="donations")
    transaction_id = models.CharField(max_length=100)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    anonymous = models.BooleanField(default=False)
    message = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["donor", "transaction_id"], name="unique_donor_transaction"),
            models.CheckConstraint(condition=models.Q(amount__gte=1, amount__lte=10000000), name="donation_valid_amount"),
        ]


class SavedCampaign(models.Model):
    donor = models.ForeignKey(User, on_delete=models.CASCADE, related_name="saved_campaigns")
    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["donor", "campaign"], name="unique_saved_campaign")]


class Preference(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="preferences")
    compact = models.BooleanField(default=False)
    default_amount = models.DecimalField(max_digits=10, decimal_places=2, default=500)
    default_category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default="Education")
    show_resolved = models.BooleanField(default=False)


class ContactMessage(models.Model):
    name = models.CharField(max_length=100)
    email = models.EmailField()
    subject = models.CharField(max_length=100)
    message = models.CharField(max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True)


class Activity(models.Model):
    message = models.CharField(max_length=500)
    severity = models.CharField(max_length=20, default="Info")
    resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)


class LoginEvent(models.Model):
    """Audit successful and failed attempts, never passwords or session tokens."""
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    email = models.EmailField()
    role = models.CharField(max_length=10)
    successful = models.BooleanField()
    created_at = models.DateTimeField(auto_now_add=True)


class ItemRequest(models.Model):
    source_donation = models.ForeignKey('ItemDonation', null=True, blank=True, on_delete=models.SET_NULL, related_name='interest_requests')
    organization = models.ForeignKey(Organization, on_delete=models.PROTECT, related_name="item_requests")
    title = models.CharField(max_length=120)
    delivery_address = models.CharField(max_length=300)
    delivery_city = models.CharField(max_length=100)
    delivery_state = models.CharField(max_length=100)
    delivery_pincode = models.CharField(max_length=6)
    contact_phone = models.CharField(max_length=20, blank=True)
    notes = models.CharField(max_length=2000, blank=True)
    priority = models.CharField(max_length=10, choices=[(v, v) for v in ["Low", "Medium", "High"]], default="Medium")
    needed_by = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=[("Open", "Open"), ("Closed", "Closed")], default="Open")
    version = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [models.UniqueConstraint(fields=['organization', 'source_donation'], name='unique_ngo_offer_interest')]


class ItemRequestLine(models.Model):
    request = models.ForeignKey(ItemRequest, on_delete=models.CASCADE, related_name="items")
    item_key = models.CharField(max_length=50)
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    fulfilled_quantity = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["request", "item_key"], name="unique_item_per_request"),
            models.CheckConstraint(condition=models.Q(quantity__gt=0, quantity__lte=1000000), name="item_request_valid_quantity"),
            models.CheckConstraint(condition=models.Q(fulfilled_quantity__gte=0, fulfilled_quantity__lte=models.F("quantity")), name="item_request_valid_fulfilled"),
        ]


class ItemDonation(models.Model):
    donor = models.ForeignKey(User, on_delete=models.PROTECT, related_name="item_donations")
    client_id = models.UUIDField()
    version = models.PositiveIntegerField(default=0)
    item_key = models.CharField(max_length=50)
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    city = models.CharField(max_length=100)
    address = models.CharField(max_length=300, blank=True)
    state = models.CharField(max_length=100, blank=True)
    pincode = models.CharField(max_length=6, blank=True)
    notes = models.CharField(max_length=2000, blank=True)
    image = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["donor", "client_id"], name="unique_item_donation_submission"),
            models.CheckConstraint(condition=models.Q(quantity__gt=0, quantity__lte=1000000), name="item_donation_valid_quantity"),
        ]


class DonationMatch(models.Model):
    donation = models.ForeignKey(ItemDonation, on_delete=models.PROTECT, related_name="matches")
    request = models.ForeignKey(ItemRequest, on_delete=models.PROTECT, related_name="matches")
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=[(v, v) for v in ["Pending", "Pickup scheduled", "Completed", "Cancelled"]], default="Pending")
    pickup_at = models.DateTimeField(null=True, blank=True)
    pickup_address = models.CharField(max_length=300, blank=True)
    pickup_city = models.CharField(max_length=100, blank=True)
    pickup_state = models.CharField(max_length=100, blank=True)
    pickup_pincode = models.CharField(max_length=6, blank=True)
    pickup_notes = models.CharField(max_length=1000, blank=True)
    version = models.PositiveIntegerField(default=0)
    completed_at = models.DateTimeField(null=True, blank=True)
    receipt_check = models.JSONField(default=dict, blank=True)
    receipt_check_digest = models.CharField(max_length=64, blank=True)
    delivery_proof = models.TextField(blank=True)
    delivery_note = models.CharField(max_length=1000, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(condition=models.Q(quantity__gt=0, quantity__lte=1000000), name="match_valid_quantity"),
            models.UniqueConstraint(fields=["donation", "request"], condition=~models.Q(status="Cancelled"), name="unique_live_donation_match"),
        ]


class Notification(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    title = models.CharField(max_length=120)
    message = models.CharField(max_length=500)
    link = models.CharField(max_length=200)
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class MatchEvent(models.Model):
    match = models.ForeignKey(DonationMatch, on_delete=models.CASCADE, related_name="events")
    actor = models.ForeignKey(User, null=True, on_delete=models.SET_NULL)
    title = models.CharField(max_length=120)
    message = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
