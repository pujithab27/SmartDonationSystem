from django.contrib.auth import authenticate, login, logout
from django.db import IntegrityError, transaction
from django.db.models import F, Q
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import (
    User, Organization, Campaign, CampaignDocument, Donation, SavedCampaign,
    Preference, ContactMessage, Activity, LoginEvent, AccountReview,
)
from .serializers import (
    USER_FIELDS, CATEGORY_IMAGES, SignupInput, LoginInput, ProfileInput, UserSerializer,
    OrganizationSerializer, CampaignInput, CampaignSerializer, DonationInput, DonationSerializer,
    PreferenceSerializer, ContactSerializer, ActivitySerializer, ReviewInput,
    AccountReviewInput, BulkApprovalInput, AccountReviewSerializer,
)
from .models import ItemRequest, ItemRequestLine
from .donation_items import DONATION_ITEMS
from .serializers import ItemRequestInput, ItemRequestEditInput, ItemRequestStatusInput, ItemRequestSerializer


def require_role(request, role):
    if not request.user.is_authenticated or request.user.role != role:
        raise PermissionDenied(f"Please sign in as a {role} to continue.")


def session_data(user):
    if not user.is_authenticated or not user.can_login:
        return None
    return {"role": user.role, "email": user.email, "name": user.display_name}


def campaign_scope(user):
    query = Campaign.objects.select_related("organization__user", "document")
    if user.is_authenticated and user.role == "admin":
        return query
    public = Q(status__in=["Active", "Completed"], organization__status="Verified",
               organization__user__approval_status="Approved", organization__user__is_active=True)
    if user.is_authenticated and user.role == "ngo":
        public |= Q(organization__user=user)
    return query.filter(public)


def organization_scope(user):
    query = Organization.objects.select_related("user")
    if user.is_authenticated and user.role == "admin":
        return query
    public = Q(status="Verified", user__approval_status="Approved", user__is_active=True)
    if user.is_authenticated and user.role == "ngo":
        public |= Q(user=user)
    return query.filter(public)


def donation_scope(user):
    query = Donation.objects.select_related("donor", "campaign__organization__user")
    if not user.is_authenticated:
        return query.none()
    if user.role == "admin":
        return query
    if user.role == "ngo":
        return query.filter(campaign__organization__user=user)
    return query.filter(donor=user)


def item_request_scope(user):
    query = ItemRequest.objects.select_related("organization__user").prefetch_related("items", "matches__donation")
    if not user.is_authenticated or not user.can_login:
        return query.none()
    if user.role == "admin":
        return query
    if user.role == "ngo":
        return query.filter(organization__user=user)
    return query.filter(status="Open", organization__status="Verified",
                        organization__user__approval_status="Approved", organization__user__is_active=True)


class BaseView(APIView):
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "no-store"
        return response


class CsrfView(BaseView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"csrfToken": get_token(request)})


class HealthView(BaseView):
    permission_classes = [AllowAny]

    def get(self, request):
        User.objects.exists()
        return Response({"status": "ok", "database": "connected"})


class SignupView(BaseView):
    permission_classes = [AllowAny]
    throttle_scope = "auth"

    def post(self, request):
        serializer = SignupInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        fields = serializer.validated_data
        try:
            with transaction.atomic():
                user = User.objects.create_user(
                    email=fields["email"], password=fields["password"], role=fields["role"],
                    terms_accepted_at=timezone.now(), approval_status="Pending",
                    **{column: fields[key] for key, column in USER_FIELDS.items() if key in fields},
                )
                Preference.objects.create(user=user)
                if user.role == "ngo":
                    Organization.objects.create(
                        user=user, name=fields["ngoName"], registration_number=fields["registrationNumber"],
                        description=fields["description"], website=fields.get("website", ""),
                    )
                    Activity.objects.create(message=f"NGO registration awaiting review: {fields['ngoName']}")
        except IntegrityError:
            raise ValidationError("Email or NGO registration number is already registered.")
        return Response({"session": None, "user": UserSerializer(user).data,
                         "detail": "Your account is waiting for administrator approval. You can sign in once it is approved.",
                         "csrfToken": get_token(request)}, status=201)


class LoginView(BaseView):
    permission_classes = [AllowAny]
    throttle_scope = "auth"

    def post(self, request):
        serializer = LoginInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        fields = serializer.validated_data
        email = fields["email"].strip().lower()
        user = authenticate(request, email=email, password=fields["password"])
        credentials_valid = user is not None and user.role == fields["role"]
        valid = credentials_valid and user.can_login
        LoginEvent.objects.create(user=user if valid else None, email=email, role=fields["role"], successful=valid)
        if not credentials_valid:
            return Response({"detail": "Email, password, or selected role is incorrect."}, status=401)
        if not user.can_login:
            detail = "Your account is awaiting administrator approval. Please sign in after it has been approved."
            if user.approval_status == "Rejected":
                detail = "Your registration was not approved. " + (user.approval_note or "Please contact the administrator.")
            return Response({"detail": detail, "approvalStatus": user.approval_status}, status=403)
        login(request, user)
        return Response({"session": session_data(user), "csrfToken": get_token(request)})


class LogoutView(BaseView):
    # An expired/revoked session can still sign out locally. CSRF is enforced
    # for anonymous writes by CsrfSessionAuthentication as on every API write.
    permission_classes = [AllowAny]

    def post(self, request):
        logout(request)
        return Response({"detail": "Signed out."})


class MeView(BaseView):
    def get(self, request):
        return Response({"session": session_data(request.user), "user": UserSerializer(request.user).data})


class StateView(BaseView):
    """A read-only UI snapshot, scoped on the server to the current session."""
    permission_classes = [AllowAny]

    def get(self, request):
        from .exchange import exchange_state
        user = request.user
        context = {"request": request}
        users = User.objects.none()
        saved, settings, contacts, flags, account_activity = {}, {}, [], [], []
        if user.is_authenticated:
            users = User.objects.all() if user.role == "admin" else User.objects.filter(pk=user.pk)
            saved[user.email] = list(SavedCampaign.objects.filter(donor=user).values_list("campaign_id", flat=True))
            preference = Preference.objects.filter(user=user).first()
            settings[user.email] = PreferenceSerializer(preference).data if preference else {}
            if user.role == "admin":
                account_activity = AccountReviewSerializer(
                    AccountReview.objects.select_related("account__organization", "administrator")[:50], many=True,
                ).data
                contacts = ContactSerializer(ContactMessage.objects.order_by("-created_at"), many=True).data
                flags = ActivitySerializer(Activity.objects.order_by("-created_at"), many=True).data
        return Response({"session": session_data(user), "data": {
            "users": UserSerializer(users.select_related("organization"), many=True).data,
            "ngos": OrganizationSerializer(organization_scope(user), many=True, context=context).data,
            "requests": CampaignSerializer(campaign_scope(user), many=True, context=context).data,
            "donations": DonationSerializer(donation_scope(user), many=True, context=context).data,
            "saved": saved, "settings": settings, "contacts": contacts, "flags": flags,
            "accountActivity": account_activity,
            "itemCatalog": DONATION_ITEMS,
            **exchange_state(user),
            "itemRequests": ItemRequestSerializer(item_request_scope(user), many=True).data,
        }})


class ProfileView(BaseView):
    def get(self, request):
        return MeView().get(request)

    def patch(self, request):
        serializer = ProfileInput(data=request.data, context={"user": request.user})
        serializer.is_valid(raise_exception=True)
        fields = serializer.validated_data
        try:
            with transaction.atomic():
                user = User.objects.select_for_update().get(pk=request.user.pk)
                for key, column in USER_FIELDS.items():
                    if key in fields:
                        setattr(user, column, fields[key])
                user.save()
                if user.role == "ngo":
                    org = Organization.objects.select_for_update().get(user=user)
                    changed = org.name != fields["ngoName"] or org.registration_number != fields["registrationNumber"]
                    org.name = fields["ngoName"]
                    org.registration_number = fields["registrationNumber"]
                    org.description = fields["description"]
                    org.website = fields.get("website", "")
                    if changed or org.status == "Rejected":
                        org.status, org.review_note = "Pending", ""
                        org.reviewed_at, org.reviewed_by = None, None
                        user.approval_status, user.approval_note = "Pending", ""
                        user.reviewed_at, user.reviewed_by = None, None
                        user.access_version += 1
                        user.save(update_fields=["approval_status", "approval_note", "reviewed_at", "reviewed_by", "access_version"])
                        org.campaigns.filter(status="Active").update(status="Pending Approval")
                        Activity.objects.create(message=f"NGO profile requires another review: {org.name}")
                    org.save()
        except IntegrityError:
            raise ValidationError({"registrationNumber": "This registration number is already registered."})
        return Response({"session": session_data(user), "user": UserSerializer(user).data})


class PreferenceView(BaseView):
    def patch(self, request):
        with transaction.atomic():
            instance, _ = Preference.objects.get_or_create(user=request.user)
            serializer = PreferenceSerializer(instance, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
        return Response(serializer.data)


class OrganizationListView(BaseView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(OrganizationSerializer(organization_scope(request.user), many=True, context={"request": request}).data)


class OrganizationReviewView(BaseView):
    def post(self, request, email):
        require_role(request, "admin")
        serializer = ReviewInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        fields = serializer.validated_data
        if fields["status"] not in ["Verified", "Rejected"]:
            raise ValidationError("Invalid organization review status.")
        with transaction.atomic():
            user = get_object_or_404(User.objects.select_for_update(), email=email, role="ngo")
            apply_account_review(user, request.user, "Approved" if fields["status"] == "Verified" else "Rejected", fields["reason"])
            org = user.organization
        return Response(OrganizationSerializer(org, context={"request": request}).data)


class StaleAccountReview(APIException):
    status_code = 409
    default_detail = "This account was updated by another administrator. Refresh the list and review it again."


def apply_account_review(user, administrator, action, reason=""):
    """Caller holds the account row lock inside an atomic transaction."""
    if user.role not in ["donor", "ngo"]:
        raise PermissionDenied("Administrator accounts cannot be changed here.")
    if action in ["Activated", "Deactivated"]:
        if user.approval_status != "Approved":
            raise ValidationError("Approve this account before changing login access.")
        desired = action == "Activated"
        if user.is_active == desired:
            raise ValidationError("The account already has this access setting.")
        user.is_active = desired
    else:
        user.approval_status = action
        user.approval_note = reason.strip()
        if action == "Approved":
            user.is_active = True
        if user.role == "ngo":
            org = Organization.objects.select_for_update().get(user=user)
            org.status = "Verified" if action == "Approved" else "Rejected"
            org.review_note = reason.strip()
            org.reviewed_at, org.reviewed_by = timezone.now(), administrator
            org.save()
            if action == "Rejected":
                org.campaigns.filter(status="Active").update(status="Pending Approval")
            # Avoid a cached OneToOne instance returning the previous status.
            user.organization = org
    user.reviewed_at, user.reviewed_by = timezone.now(), administrator
    user.access_version += 1
    user.save(update_fields=["approval_status", "approval_note", "is_active", "reviewed_at", "reviewed_by", "access_version"])
    AccountReview.objects.create(account=user, administrator=administrator, action=action, reason=reason.strip())


class AccountReviewView(BaseView):
    def post(self, request, pk):
        require_role(request, "admin")
        serializer = AccountReviewInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        fields = serializer.validated_data
        with transaction.atomic():
            user = get_object_or_404(User.objects.select_for_update(), pk=pk)
            if user.access_version != fields["version"]:
                raise StaleAccountReview()
            apply_account_review(user, request.user, fields["action"], fields["reason"])
        return Response(UserSerializer(user).data)


class AccountBulkApprovalView(BaseView):
    def post(self, request):
        require_role(request, "admin")
        serializer = BulkApprovalInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        entries = serializer.validated_data["accounts"]
        versions = {entry["id"]: entry["version"] for entry in entries}
        with transaction.atomic():
            users = list(User.objects.select_for_update().filter(pk__in=versions).order_by("pk"))
            if len(users) != len(entries):
                raise StaleAccountReview()
            for user in users:
                if user.role not in ["donor", "ngo"] or user.approval_status != "Pending" or user.access_version != versions[user.pk]:
                    raise StaleAccountReview()
            for user in users:
                apply_account_review(user, request.user, "Approved")
        return Response({"approved": len(users)})


class CampaignListView(BaseView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(CampaignSerializer(campaign_scope(request.user), many=True, context={"request": request}).data)

    def post(self, request):
        require_role(request, "ngo")
        serializer = CampaignInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        fields = dict(serializer.validated_data)
        document = fields.pop("document", None)
        fields["start_date"], fields["end_date"] = fields.pop("startDate"), fields.pop("endDate")
        fields["image"] = fields["image"] or CATEGORY_IMAGES[fields["category"]]
        with transaction.atomic():
            org = get_object_or_404(Organization.objects.select_for_update(), user=request.user)
            if fields["status"] != "Draft" and org.status != "Verified":
                raise PermissionDenied("Your organization must be verified before submitting a campaign. You can save a draft.")
            campaign = Campaign.objects.create(organization=org, **fields)
            if document:
                CampaignDocument.objects.create(campaign=campaign, name=document["name"], mime_type=document["type"], data=document["data"])
            if campaign.status == "Pending Approval":
                Activity.objects.create(message=f"Campaign awaiting review: {campaign.title}")
        return Response(CampaignSerializer(campaign, context={"request": request}).data, status=201)


class CampaignDetailView(BaseView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        campaign = get_object_or_404(campaign_scope(request.user), pk=pk)
        return Response(CampaignSerializer(campaign, context={"request": request}).data)


class CampaignSubmitView(BaseView):
    def post(self, request, pk):
        require_role(request, "ngo")
        with transaction.atomic():
            campaign = get_object_or_404(Campaign.objects.select_for_update(), pk=pk, organization__user=request.user)
            if campaign.organization.status != "Verified":
                raise PermissionDenied("Your organization needs verification before submitting a campaign.")
            if campaign.status not in ["Draft", "Rejected"]:
                raise ValidationError("Only draft or rejected campaigns can be submitted.")
            campaign.status, campaign.review_note = "Pending Approval", ""
            campaign.save(update_fields=["status", "review_note"])
            Activity.objects.create(message=f"Campaign awaiting review: {campaign.title}")
        return Response({"detail": "Campaign submitted for review."})


class CampaignReviewView(BaseView):
    def post(self, request, pk):
        require_role(request, "admin")
        serializer = ReviewInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        fields = serializer.validated_data
        with transaction.atomic():
            campaign = get_object_or_404(Campaign.objects.select_for_update(), pk=pk)
            status = fields["status"]
            if status not in ["Active", "Rejected", "Completed"] or campaign.status in ["Draft", "Completed"]:
                raise ValidationError("Invalid campaign review.")
            if status == "Active" and campaign.organization.status != "Verified":
                raise ValidationError("Verify this NGO before approving its campaign.")
            if status == "Completed" and campaign.status != "Active":
                raise ValidationError("Only active campaigns can be marked completed.")
            campaign.status, campaign.review_note, campaign.reviewed_by = status, fields["reason"], request.user
            campaign.save(update_fields=["status", "review_note", "reviewed_by"])
            Activity.objects.create(message=f"Campaign {campaign.title}: {status}")
        return Response(CampaignSerializer(campaign, context={"request": request}).data)


class SavedCampaignView(BaseView):
    def post(self, request, pk):
        require_role(request, "donor")
        with transaction.atomic():
            existing = SavedCampaign.objects.filter(donor=request.user, campaign_id=pk)
            if existing.exists():
                existing.delete()
                return Response({"saved": False})
            campaign = get_object_or_404(campaign_scope(request.user), pk=pk)
            SavedCampaign.objects.create(donor=request.user, campaign=campaign)
        return Response({"saved": True})


class DonationListView(BaseView):
    def get(self, request):
        return Response(DonationSerializer(donation_scope(request.user), many=True, context={"request": request}).data)

    def post(self, request):
        require_role(request, "donor")
        serializer = DonationInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        fields = serializer.validated_data
        with transaction.atomic():
            # Serialize retries from the same donor as well as concurrent changes
            # to campaign totals. SQLite uses IMMEDIATE transactions in settings.
            User.objects.select_for_update().get(pk=request.user.pk)
            previous = Donation.objects.filter(donor=request.user, transaction_id=fields["transactionId"]).first()
            if previous:
                if (previous.campaign_id != fields["campaignId"] or previous.amount != fields["amount"]
                        or previous.anonymous != fields["anonymous"] or previous.message != fields["message"]):
                    return Response({"detail": "This contribution reference was already used with different details."}, status=409)
                return Response(DonationSerializer(previous, context={"request": request}).data)
            campaign = get_object_or_404(Campaign.objects.select_for_update(), pk=fields["campaignId"])
            today = timezone.localdate()
            if (campaign.status != "Active" or campaign.organization.status != "Verified" or not campaign.organization.user.can_login
                    or not campaign.start_date <= today <= campaign.end_date):
                raise ValidationError("This campaign is not accepting contributions.")
            donation = Donation.objects.create(
                donor=request.user, campaign=campaign, transaction_id=fields["transactionId"],
                amount=fields["amount"], anonymous=fields["anonymous"], message=fields["message"],
            )
            Campaign.objects.filter(pk=campaign.pk).update(raised=F("raised") + fields["amount"])
            campaign.refresh_from_db()
            if campaign.raised >= campaign.need:
                campaign.status = "Completed"
                campaign.save(update_fields=["status"])
        return Response(DonationSerializer(donation, context={"request": request}).data, status=201)


class DonationDetailView(BaseView):
    def get(self, request, pk):
        donation = get_object_or_404(donation_scope(request.user), pk=pk)
        return Response(DonationSerializer(donation, context={"request": request}).data)


class ContactView(BaseView):
    permission_classes = [AllowAny]
    throttle_scope = "contact"

    def post(self, request):
        serializer = ContactSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Your message is saved for the administrator."}, status=201)


class ActivityResolveView(BaseView):
    def post(self, request, pk):
        require_role(request, "admin")
        activity = get_object_or_404(Activity, pk=pk)
        activity.resolved = True
        activity.save(update_fields=["resolved"])
        return Response(ActivitySerializer(activity).data)


def locked_request_organization(request):
    require_role(request, "ngo")
    user = User.objects.select_for_update().get(pk=request.user.pk)
    org = get_object_or_404(Organization.objects.select_for_update(), user=user)
    if not user.can_login or org.status != "Verified":
        raise PermissionDenied("Your NGO must be approved before publishing donation requests.")
    return org


class ItemRequestListView(BaseView):
    def get(self, request):
        return Response(ItemRequestSerializer(item_request_scope(request.user), many=True).data)

    def post(self, request):
        require_role(request, "ngo")
        serializer = ItemRequestInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        fields = serializer.validated_data.copy()
        items = fields.pop("items")
        with transaction.atomic():
            org = locked_request_organization(request)
            entry = ItemRequest.objects.create(organization=org, **fields)
            ItemRequestLine.objects.bulk_create([ItemRequestLine(request=entry, **item) for item in items])
        return Response(ItemRequestSerializer(entry).data, status=201)


class ItemRequestDetailView(BaseView):
    def delete(self, request, pk):
        require_role(request, "ngo")
        from .exchange import DeleteInput
        serializer = DeleteInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            org = locked_request_organization(request)
            entry = get_object_or_404(ItemRequest.objects.select_for_update(), pk=pk, organization=org)
            if serializer.validated_data['version'] != entry.version:
                return Response({"detail": "This request changed. Refresh before deleting it."}, status=409)
            if entry.matches.exists() or entry.items.filter(fulfilled_quantity__gt=0).exists():
                raise ValidationError("Requests with donation history cannot be deleted. Close the request to stop receiving offers.")
            entry.delete()
        return Response({"deleted": True})

    def patch(self, request, pk):
        require_role(request, "ngo")
        with transaction.atomic():
            org = locked_request_organization(request)
            entry = get_object_or_404(ItemRequest.objects.select_for_update(), pk=pk, organization=org)
            serializer_class = ItemRequestStatusInput if "status" in request.data else ItemRequestEditInput
            serializer = serializer_class(data=request.data, context={"instance": entry})
            serializer.is_valid(raise_exception=True)
            fields = serializer.validated_data.copy()
            if fields.pop("version") != entry.version:
                return Response({"detail": "This request has changed. Refresh the list and open it again before saving."}, status=409)
            items = fields.pop("items", None)
            for name, value in fields.items():
                setattr(entry, name, value)
            entry.version += 1
            entry.save()
            if items is not None:
                from .exchange import LIVE
                proposed = {item["item_key"]: item["quantity"] for item in items}
                for line in entry.items.all():
                    reserved = sum((match.quantity for match in entry.matches.select_related("donation") if match.status in LIVE and match.donation.item_key == line.item_key), 0)
                    if proposed.get(line.item_key, 0) < line.fulfilled_quantity + reserved:
                        raise ValidationError("Requested quantities cannot be lower than received or reserved quantities. Cancel active matches before removing their items.")
                entry.items.exclude(item_key__in=proposed).delete()
                for item in items:
                    ItemRequestLine.objects.update_or_create(request=entry, item_key=item["item_key"], defaults={"quantity": item["quantity"]})
        return Response(ItemRequestSerializer(entry).data)
