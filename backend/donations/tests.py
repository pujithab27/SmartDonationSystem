import base64
from datetime import timedelta
from decimal import Decimal
from django.conf import settings
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from .models import User, Organization, Campaign, Donation, CampaignDocument, LoginEvent, Preference, ContactMessage

PASSWORD = "GivingTogether!493"


def signup_payload(role="donor", email="new@example.com"):
    fields = {"role": role, "email": email, "password": PASSWORD, "confirmPassword": PASSWORD,
              "agree": True, "phone": "9876543210", "address": "12 Garden Road", "city": "Hyderabad",
              "state": "Telangana", "pincode": "500001"}
    if role == "ngo":
        fields.update(ngoName="New Foundation", registrationNumber="NGO-NEW", description="Supporting education.")
    else:
        fields.update(firstName="Pujitha", lastName="Bolisetty")
    return fields


class BackendTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.donor = User.objects.create_user("donor@example.com", PASSWORD, role="donor", first_name="Donor", approval_status="Approved")
        cls.other = User.objects.create_user("other@example.com", PASSWORD, role="donor", approval_status="Approved")
        cls.ngo_user = User.objects.create_user("ngo@example.com", PASSWORD, role="ngo", approval_status="Approved")
        cls.admin = User.objects.create_superuser("admin@example.com", PASSWORD)
        cls.org = Organization.objects.create(user=cls.ngo_user, name="Education Trust", registration_number="NGO-1", description="Education", status="Verified")
        cls.campaign = Campaign.objects.create(
            organization=cls.org, title="School supplies", category="Education", description="School kits",
            need=1000, start_date=timezone.localdate() - timedelta(days=1), end_date=timezone.localdate() + timedelta(days=30),
            location="Hyderabad", beneficiaries="Children", status="Active", image="/images/education.jpg",
        )

    def setUp(self):
        cache.clear()
        self.client = APIClient(enforce_csrf_checks=True)

    def send(self, path, data=None, method="post", client=None):
        client = client or self.client
        token = client.get("/api/auth/csrf/").json()["csrfToken"]
        return getattr(client, method)("/api/" + path, data or {}, format="json", HTTP_X_CSRFTOKEN=token)

    def as_user(self, user):
        user.refresh_from_db()
        self.client.force_login(user)

    def pledge(self, **updates):
        fields = {"campaignId": self.campaign.pk, "transactionId": "test-reference", "amount": "250.50", "anonymous": False, "message": "Glad to help"}
        fields.update(updates)
        return self.send("donations/", fields)

    def test_signup_hashes_password_and_waits_for_approval(self):
        response = self.send("auth/signup/", signup_payload())
        self.assertEqual(response.status_code, 201, response.data)
        user = User.objects.get(email="new@example.com")
        self.assertNotEqual(user.password, PASSWORD)
        self.assertTrue(user.password.startswith("pbkdf2_sha256$"))
        self.assertTrue(user.check_password(PASSWORD))
        self.assertIsNotNone(user.terms_accepted_at)
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 403)
        self.assertEqual(user.approval_status, "Pending")
        self.assertIsNone(response.data["session"])
        self.assertNotIn("password", response.data["user"])
        self.assertNotIn(settings.SESSION_COOKIE_NAME, self.client.cookies)
        self.assertEqual(Preference.objects.filter(user=user).count(), 1)

    def test_duplicate_email_is_case_insensitive(self):
        result = self.send("auth/signup/", signup_payload(email="DONOR@EXAMPLE.COM"))
        self.assertEqual(result.status_code, 400)
        self.assertIn("email", result.data)

    def test_signup_validation_and_no_privilege_escalation(self):
        for update in [{"role": "admin"}, {"is_staff": True}, {"password": "short", "confirmPassword": "short"},
                       {"confirmPassword": "different"}, {"phone": "123"}, {"pincode": "000000"}, {"agree": False}]:
            with self.subTest(update=update):
                self.assertEqual(self.send("auth/signup/", {**signup_payload(), **update}).status_code, 400)
        self.assertFalse(User.objects.filter(email="new@example.com").exists())

    def test_ngo_signup_is_pending_and_duplicate_registration_rejected(self):
        result = self.send("auth/signup/", signup_payload("ngo"))
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(Organization.objects.get(user__email="new@example.com").status, "Pending")
        result = self.send("auth/signup/", signup_payload("ngo", "different@example.com"))
        self.assertEqual(result.status_code, 400)

    def test_login_checks_password_and_selected_role_and_records_attempts(self):
        for password, role in [("wrong-password", "donor"), (PASSWORD, "admin")]:
            self.assertEqual(self.send("auth/login/", {"email": self.donor.email, "password": password, "role": role}).status_code, 401)
        response = self.send("auth/login/", {"email": "DONOR@EXAMPLE.COM", "password": PASSWORD, "role": "donor"})
        self.assertEqual(response.status_code, 200)
        self.donor.refresh_from_db()
        self.assertIsNotNone(self.donor.last_login)
        self.assertEqual(LoginEvent.objects.filter(successful=False).count(), 2)
        self.assertEqual(LoginEvent.objects.filter(successful=True).count(), 1)
        self.assertNotIn(PASSWORD, str(list(LoginEvent.objects.values())))

    def test_inactive_and_unusable_accounts_cannot_login(self):
        self.donor.is_active = False
        self.donor.save()
        self.assertEqual(self.send("auth/login/", {"email": self.donor.email, "password": PASSWORD, "role": "donor"}).status_code, 401)
        self.other.set_unusable_password()
        self.other.save()
        self.assertEqual(self.send("auth/login/", {"email": self.other.email, "password": "DemoDonor123!", "role": "donor"}).status_code, 401)

    def test_csrf_protects_signup_login_and_mutations(self):
        self.assertEqual(self.client.post("/api/auth/signup/", signup_payload(), format="json").status_code, 403)
        self.assertEqual(self.client.post("/api/auth/login/", {"email": self.donor.email, "password": PASSWORD, "role": "donor"}, format="json").status_code, 403)
        self.as_user(self.donor)
        self.assertEqual(self.client.post("/api/auth/logout/", {}, format="json").status_code, 403)

    def test_logout_revokes_old_session_and_private_endpoints(self):
        self.as_user(self.donor)
        stale = APIClient()
        stale.cookies[settings.SESSION_COOKIE_NAME] = self.client.cookies[settings.SESSION_COOKIE_NAME].value
        self.assertEqual(self.send("auth/logout/").status_code, 200)
        self.assertEqual(stale.get("/api/auth/me/").status_code, 403)
        self.assertEqual(self.client.get("/api/donations/").status_code, 403)

    def test_public_state_does_not_leak_accounts_private_campaigns_or_documents(self):
        CampaignDocument.objects.create(campaign=self.campaign, name="private.pdf", mime_type="application/pdf", data="secret-content")
        self.send("contacts/", {"name": "Person", "email": "contact@example.com", "subject": "Help", "message": "Private message"})
        self.as_user(self.donor)
        self.pledge()
        self.client.logout()
        state = self.client.get("/api/state/").json()["data"]
        for key in ["users", "donations", "contacts", "flags"]:
            self.assertEqual(state[key], [])
        self.assertIsNone(state["requests"][0]["document"])
        self.assertNotIn("phone", state["ngos"][0])
        self.campaign.status = "Draft"
        self.campaign.save()
        self.assertEqual(self.client.get("/api/campaigns/").json(), [])
        self.assertEqual(self.client.get(f"/api/campaigns/{self.campaign.pk}/").status_code, 404)

    def test_roles_are_enforced_on_api(self):
        self.as_user(self.donor)
        self.assertEqual(self.send("campaigns/", {}).status_code, 403)
        self.assertEqual(self.send(f"ngos/{self.ngo_user.email}/review/", {"status": "Verified"}).status_code, 403)
        self.assertEqual(self.send(f"campaigns/{self.campaign.pk}/review/", {"status": "Rejected", "reason": "Test"}).status_code, 403)
        self.assertEqual(self.send("profile/", {**signup_payload(), "role": "admin"}, method="patch").status_code, 400)

    def campaign_payload(self, **updates):
        fields = {"title": "New campaign", "category": "Education", "description": "School essentials", "need": 500,
                  "location": "Hyderabad", "beneficiaries": "Children", "startDate": str(timezone.localdate()),
                  "endDate": str(timezone.localdate() + timedelta(days=30)), "status": "Pending Approval"}
        return {**fields, **updates}

    def test_full_campaign_approval_and_donation_flow(self):
        self.org.status = "Pending"
        self.org.save()
        self.as_user(self.ngo_user)
        self.assertEqual(self.send("campaigns/", self.campaign_payload()).status_code, 403)
        draft = self.send("campaigns/", self.campaign_payload(status="Draft"))
        self.assertEqual(draft.status_code, 201, draft.data)
        pk = draft.data["id"]
        self.assertEqual(self.send(f"campaigns/{pk}/submit/").status_code, 403)
        self.as_user(self.admin)
        self.assertEqual(self.send(f"ngos/{self.ngo_user.email}/review/", {"status": "Verified"}).status_code, 200)
        self.as_user(self.ngo_user)
        self.assertEqual(self.send(f"campaigns/{pk}/submit/").status_code, 200)
        self.as_user(self.admin)
        self.assertEqual(self.send(f"campaigns/{pk}/review/", {"status": "Active"}).status_code, 200)
        self.as_user(self.donor)
        self.assertEqual(self.pledge(campaignId=pk, amount=500).status_code, 201)
        self.assertEqual(Campaign.objects.get(pk=pk).status, "Completed")

    def test_campaign_validation_and_uploads(self):
        self.as_user(self.ngo_user)
        for fields in [{"need": -1}, {"endDate": "2000-01-01"}, {"status": "Active"}, {"category": "Invalid"},
                       {"image": "javascript:alert(1)"}, {"image": "data:image/png;base64,YWJj"}]:
            with self.subTest(fields=fields):
                self.assertEqual(self.send("campaigns/", self.campaign_payload(**fields)).status_code, 400)
        document = {"name": "sample.pdf", "type": "application/pdf", "data": "data:application/pdf;base64," + base64.b64encode(b"%PDF-1.4\nSample file").decode()}
        result = self.send("campaigns/", self.campaign_payload(document=document))
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(CampaignDocument.objects.get(campaign_id=result.data["id"]).name, "sample.pdf")
        self.as_user(self.other)
        self.assertEqual(self.client.get(f"/api/campaigns/{result.data['id']}/").status_code, 404)

    def test_other_ngo_cannot_submit_or_read_private_documents(self):
        stranger = User.objects.create_user("stranger@example.com", PASSWORD, role="ngo", approval_status="Approved")
        Organization.objects.create(user=stranger, name="Other NGO", registration_number="NGO-2", description="Other", status="Verified")
        CampaignDocument.objects.create(campaign=self.campaign, name="secret.pdf", mime_type="application/pdf", data="private")
        self.as_user(stranger)
        self.assertEqual(self.send(f"campaigns/{self.campaign.pk}/submit/").status_code, 404)
        self.assertIsNone(self.client.get(f"/api/campaigns/{self.campaign.pk}/").json()["document"])

    def test_pledge_is_idempotent_and_validated(self):
        self.as_user(self.donor)
        first, retry = self.pledge(), self.pledge()
        self.assertEqual(first.status_code, 201)
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(first.data["id"], retry.data["id"])
        self.assertEqual(self.pledge(amount=300).status_code, 409)
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.raised, Decimal("250.50"))
        self.assertEqual(Donation.objects.count(), 1)
        for amount in [0, -1, "NaN", "10.001", 10000001]:
            self.assertEqual(self.pledge(amount=amount, transactionId="invalid").status_code, 400)

    def test_closed_campaign_does_not_accept_donations(self):
        self.as_user(self.donor)
        self.campaign.end_date = timezone.localdate() - timedelta(days=1)
        self.campaign.save()
        self.assertEqual(self.pledge().status_code, 400)
        self.assertEqual(Donation.objects.count(), 0)

    def test_receipt_is_private_and_anonymous_donor_hidden_from_ngo(self):
        self.as_user(self.donor)
        donation = self.pledge(anonymous=True)
        pk = donation.data["id"]
        self.as_user(self.other)
        self.assertEqual(self.client.get(f"/api/donations/{pk}/").status_code, 404)
        self.assertEqual(self.client.get("/api/donations/").json(), [])
        self.as_user(self.ngo_user)
        data = self.client.get(f"/api/donations/{pk}/").json()
        self.assertEqual(data["donorEmail"], "")
        self.assertEqual(data["donorName"], "Anonymous donor")
        self.assertNotIn(self.donor.email, str(data))
        self.as_user(self.admin)
        self.assertEqual(self.client.get(f"/api/donations/{pk}/").json()["donorEmail"], self.donor.email)

    def test_profile_identity_change_requires_reverification(self):
        self.as_user(self.ngo_user)
        fields = signup_payload("ngo", self.ngo_user.email)
        for key in ["role", "password", "confirmPassword", "agree"]:
            fields.pop(key)
        fields["ngoName"] = "Changed NGO"
        result = self.send("profile/", fields, method="patch")
        self.assertEqual(result.status_code, 200, result.data)
        self.org.refresh_from_db()
        self.campaign.refresh_from_db()
        self.assertEqual(self.org.status, "Pending")
        self.assertEqual(self.campaign.status, "Pending Approval")

    def test_favorites_preferences_and_contact_are_persistent_and_scoped(self):
        self.as_user(self.donor)
        self.assertTrue(self.send(f"campaigns/{self.campaign.pk}/saved/").data["saved"])
        self.assertEqual(self.send("preferences/", {"compact": True, "defaultAmount": 750}, method="patch").status_code, 200)
        state = self.client.get("/api/state/").json()["data"]
        self.assertEqual(state["saved"][self.donor.email], [self.campaign.pk])
        self.assertEqual(state["settings"][self.donor.email]["defaultAmount"], 750)
        self.assertFalse(self.send(f"campaigns/{self.campaign.pk}/saved/").data["saved"])
        self.assertEqual(self.send("contacts/", {"name": "Person", "email": "person@example.com", "subject": "Help", "message": "My question"}).status_code, 201)
        self.assertEqual(ContactMessage.objects.count(), 1)
        self.as_user(self.other)
        state = self.client.get("/api/state/").json()["data"]
        self.assertNotIn(self.donor.email, state["settings"])
        self.assertEqual(state["contacts"], [])
        self.as_user(self.admin)
        self.assertEqual(len(self.client.get("/api/state/").json()["data"]["contacts"]), 1)

    def test_rejection_requires_reason_and_unpublishes_campaigns(self):
        self.as_user(self.admin)
        path = f"ngos/{self.ngo_user.email}/review/"
        self.assertEqual(self.send(path, {"status": "Rejected"}).status_code, 400)
        self.assertEqual(self.send(path, {"status": "Rejected", "reason": "Details need correction"}).status_code, 200)
        self.campaign.refresh_from_db()
        self.assertEqual(self.campaign.status, "Pending Approval")

    def test_seed_is_idempotent_and_creates_no_usable_passwords(self):
        call_command("seed_sample_data", verbosity=0)
        call_command("seed_sample_data", verbosity=0)
        self.assertEqual(Campaign.objects.filter(pk__in=["req-101", "req-102", "req-103"]).count(), 3)
        self.assertFalse(User.objects.get(email="hello@brightfuture.example").has_usable_password())
