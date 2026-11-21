from django.conf import settings
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient
from .models import AccountReview, Organization, User
from .tests import PASSWORD, signup_payload


class AccountApprovalTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient(enforce_csrf_checks=True)
        self.admin = User.objects.create_superuser("reviewer@example.com", PASSWORD)

    def send(self, path, data, client=None):
        client = client or self.client
        token = client.get("/api/auth/csrf/").json()["csrfToken"]
        return client.post("/api/" + path, data, format="json", HTTP_X_CSRFTOKEN=token)

    def review(self, user, action="Approved", reason="", version=None):
        user.refresh_from_db()
        self.client.force_login(self.admin)
        return self.send(f"accounts/{user.pk}/review/", {
            "action": action, "reason": reason, "version": user.access_version if version is None else version,
        })

    def credentials(self, user):
        return {"email": user.email, "password": PASSWORD, "role": user.role}

    def test_donor_and_ngo_must_be_approved_before_first_login(self):
        for role in ["donor", "ngo"]:
            with self.subTest(role=role):
                applicant = APIClient(enforce_csrf_checks=True)
                result = self.send("auth/signup/", signup_payload(role, f"{role}@example.com"), applicant)
                self.assertEqual(result.status_code, 201, result.data)
                self.assertIsNone(result.data["session"])
                user = User.objects.get(email=f"{role}@example.com")
                self.assertFalse(user.can_login)
                denied = self.send("auth/login/", self.credentials(user), applicant)
                self.assertEqual(denied.status_code, 403)
                self.assertEqual(denied.data["approvalStatus"], "Pending")
                self.assertEqual(applicant.get("/api/auth/me/").status_code, 403)
                self.assertEqual(self.review(user).status_code, 200)
                result = self.send("auth/login/", self.credentials(user), applicant)
                self.assertEqual(result.status_code, 200, result.data)
                self.assertEqual(applicant.get("/api/auth/me/").data["user"]["approvalStatus"], "Approved")
                self.assertTrue(applicant.cookies[settings.SESSION_COOKIE_NAME]["httponly"])
                if role == "ngo":
                    self.assertEqual(Organization.objects.get(user=user).status, "Verified")
        self.assertEqual(AccountReview.objects.count(), 2)

    def test_rejection_needs_reason_and_can_be_reconsidered(self):
        user = User.objects.create_user("pending@example.com", PASSWORD)
        self.assertEqual(self.review(user, "Rejected").status_code, 400)
        self.assertEqual(self.review(user, "Rejected", "Please verify your contact details.").status_code, 200)
        applicant = APIClient(enforce_csrf_checks=True)
        denied = self.send("auth/login/", self.credentials(user), applicant)
        self.assertEqual(denied.status_code, 403)
        self.assertIn("contact details", denied.data["detail"])
        wrong = self.send("auth/login/", {**self.credentials(user), "password": "incorrect"}, applicant)
        self.assertEqual(wrong.status_code, 401)
        self.assertNotIn("approvalStatus", wrong.data)
        self.assertEqual(self.review(user).status_code, 200)
        self.assertEqual(self.send("auth/login/", self.credentials(user), applicant).status_code, 200)

    def test_deactivation_and_reactivation_never_restore_old_session(self):
        user = User.objects.create_user("approved@example.com", PASSWORD, approval_status="Approved")
        applicant = APIClient(enforce_csrf_checks=True)
        self.assertEqual(self.send("auth/login/", self.credentials(user), applicant).status_code, 200)
        old_cookie = applicant.cookies[settings.SESSION_COOKIE_NAME].value
        self.assertEqual(self.review(user, "Deactivated", "Checking account ownership.").status_code, 200)
        self.assertEqual(self.send("auth/login/", self.credentials(user), applicant).status_code, 401)
        self.assertEqual(self.review(user, "Activated").status_code, 200)
        stale = APIClient()
        stale.cookies[settings.SESSION_COOKIE_NAME] = old_cookie
        self.assertEqual(stale.get("/api/auth/me/").status_code, 403)
        self.assertEqual(self.send("auth/login/", self.credentials(user), applicant).status_code, 200)
        self.assertEqual(AccountReview.objects.count(), 2)

    def test_only_admin_can_review_and_accounts_cannot_approve_themselves(self):
        user = User.objects.create_user("member@example.com", PASSWORD, approval_status="Approved")
        payload = {"action": "Approved", "version": 0}
        self.assertEqual(self.send(f"accounts/{user.pk}/review/", payload).status_code, 403)
        self.client.force_login(user)
        self.assertEqual(self.send(f"accounts/{user.pk}/review/", payload).status_code, 403)
        self.assertEqual(self.send("accounts/approve/", {"accounts": [{"id": user.pk, "version": 0}]}).status_code, 403)
        self.assertEqual(self.client.get("/api/state/").data["data"]["accountActivity"], [])
        self.assertEqual(self.review(self.admin, "Deactivated", "Test").status_code, 403)
        pending = User.objects.create_user("forced@example.com", PASSWORD)
        self.client.force_login(pending)
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 403)
        self.assertEqual(self.review(pending, "Activated").status_code, 400)

    def test_stale_review_and_bulk_approval_are_atomic(self):
        first = User.objects.create_user("one@example.com", PASSWORD)
        second = User.objects.create_user("two@example.com", PASSWORD)
        self.assertEqual(self.review(first, "Rejected", "Needs more details").status_code, 200)
        self.assertEqual(self.review(first, "Approved", version=0).status_code, 409)
        bulk = {"accounts": [{"id": first.pk, "version": 0}, {"id": second.pk, "version": 0}]}
        self.assertEqual(self.send("accounts/approve/", bulk).status_code, 409)
        second.refresh_from_db()
        self.assertEqual(second.approval_status, "Pending")
        third = User.objects.create_user("three@example.com", PASSWORD)
        bulk["accounts"][0] = {"id": third.pk, "version": 0}
        response = self.send("accounts/approve/", bulk)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["approved"], 2)
        self.assertEqual(AccountReview.objects.filter(action="Approved").count(), 2)

    def test_signup_cannot_set_approval_and_writes_require_csrf(self):
        for privileged in [{"approvalStatus": "Approved"}, {"approval_status": "Approved"}, {"isActive": True}, {"accessVersion": 1}]:
            self.assertEqual(self.send("auth/signup/", {**signup_payload(), **privileged}).status_code, 400)
        self.client.force_login(self.admin)
        user = User.objects.create_user("csrf@example.com", PASSWORD)
        response = self.client.post(f"/api/accounts/{user.pk}/review/", {"action": "Approved", "version": 0}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_ngos_revoked_through_legacy_review_also_lose_login_access(self):
        user = User.objects.create_user("ngo@example.com", PASSWORD, role="ngo", approval_status="Approved")
        Organization.objects.create(user=user, name="Care Foundation", registration_number="CARE-1", description="Care", status="Verified")
        applicant = APIClient(enforce_csrf_checks=True)
        self.send("auth/login/", self.credentials(user), applicant)
        self.client.force_login(self.admin)
        result = self.send(f"ngos/{user.email}/review/", {"status": "Rejected", "reason": "Registration needs checking"})
        self.assertEqual(result.status_code, 200)
        user.refresh_from_db()
        self.assertEqual(user.approval_status, "Rejected")
        self.assertEqual(applicant.get("/api/auth/me/").status_code, 403)
        public = APIClient().get("/api/state/").data["data"]
        self.assertEqual(public["ngos"], [])
        self.assertEqual(public["accountActivity"], [])
