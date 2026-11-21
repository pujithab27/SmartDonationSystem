from django.conf import settings
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import Organization, User


PASSWORD = "TabIsolation!5938"
DONOR_TAB, NGO_TAB, OTHER_TAB = "a" * 32, "b" * 32, "c" * 32


class TabSessionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.donor = User.objects.create_user("tab-donor@example.test", PASSWORD, role="donor", approval_status="Approved")
        cls.other = User.objects.create_user("tab-other@example.test", PASSWORD, role="donor", approval_status="Approved")
        cls.ngo = User.objects.create_user("tab-ngo@example.test", PASSWORD, role="ngo", approval_status="Approved")
        cls.admin = User.objects.create_superuser("tab-admin@example.test", PASSWORD)
        Organization.objects.create(user=cls.ngo, name="Tab Test NGO", registration_number="TAB-1", status="Verified")

    def setUp(self):
        cache.clear()
        # All tab requests share this one cookie jar, just as browser tabs do.
        self.browser = APIClient(enforce_csrf_checks=True)

    def get(self, path, scope):
        return self.browser.get("/api/" + path, HTTP_X_SESSION_SCOPE=scope)

    def write(self, path, scope, data=None, token=None, method="post"):
        if token is None:
            token = self.get("auth/csrf/", scope).json()["csrfToken"]
        return getattr(self.browser, method)("/api/" + path, data or {}, format="json",
                                            HTTP_X_SESSION_SCOPE=scope, HTTP_X_CSRFTOKEN=token)

    def login(self, user, scope):
        response = self.write("auth/login/", scope, {"email": user.email, "password": PASSWORD, "role": user.role})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["session"]["email"], user.email)
        return response.data["csrfToken"]

    def assert_user(self, scope, user):
        response = self.get("state/", scope)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["session"]["email"], user.email)
        if user.role != "admin":
            self.assertEqual([row["email"] for row in response.data["data"]["users"]], [user.email])

    def test_donor_ngo_and_admin_coexist_and_cached_csrf_survives_other_logins(self):
        donor_token = self.login(self.donor, DONOR_TAB)
        ngo_token = self.login(self.ngo, NGO_TAB)
        self.login(self.admin, OTHER_TAB)
        for scope, user in [(DONOR_TAB, self.donor), (NGO_TAB, self.ngo), (OTHER_TAB, self.admin)]:
            self.assert_user(scope, user)
        fields = {"firstName": "Tab", "lastName": "Donor", "phone": "9876543210", "address": "Test address",
                  "city": "Hyderabad", "state": "Telangana", "pincode": "500001"}
        response = self.write("profile/", DONOR_TAB, fields, token=donor_token, method="patch")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["user"]["email"], self.donor.email)
        fields.update(ngoName="Tab Test NGO", registrationNumber="TAB-1", description="Test NGO", phone="9876543211")
        fields.pop("firstName")
        fields.pop("lastName")
        response = self.write("profile/", NGO_TAB, fields, token=ngo_token, method="patch")
        self.assertEqual(response.status_code, 200, response.data)
        self.donor.refresh_from_db()
        self.ngo.refresh_from_db()
        self.assertEqual(self.donor.phone, "9876543210")
        self.assertEqual(self.ngo.phone, "9876543211")

    def test_logout_only_revokes_the_selected_login_and_replay_is_rejected(self):
        self.login(self.donor, DONOR_TAB)
        self.login(self.ngo, NGO_TAB)
        name = f"{settings.SESSION_COOKIE_NAME}_{DONOR_TAB}"
        old_cookie = self.browser.cookies[name].value
        response = self.write("auth/logout/", DONOR_TAB)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.cookies[name]["max-age"], 0)
        self.assertIsNone(self.get("state/", DONOR_TAB).data["session"])
        self.assert_user(NGO_TAB, self.ngo)
        self.browser.cookies[name] = old_cookie
        self.assertEqual(self.get("auth/me/", DONOR_TAB).status_code, 403)
        self.assert_user(NGO_TAB, self.ngo)

    def test_two_donor_accounts_remain_separate(self):
        self.login(self.donor, DONOR_TAB)
        self.login(self.other, OTHER_TAB)
        self.assert_user(DONOR_TAB, self.donor)
        self.assert_user(OTHER_TAB, self.other)
        self.write("auth/logout/", OTHER_TAB)
        self.assert_user(DONOR_TAB, self.donor)

    def test_scoped_requests_never_inherit_legacy_or_other_scope_cookies(self):
        self.browser.force_login(self.admin)
        self.login(self.donor, DONOR_TAB)
        self.assert_user(DONOR_TAB, self.donor)
        self.assertIsNone(self.get("state/", OTHER_TAB).data["session"])
        self.assertEqual(self.browser.get("/api/auth/me/").data["session"]["email"], self.admin.email)
        outsider = APIClient(enforce_csrf_checks=True)
        self.assertEqual(outsider.get("/api/auth/me/", HTTP_X_SESSION_SCOPE=DONOR_TAB).status_code, 403)
        for invalid in ["", "donor", "../admin", "a" * 100]:
            self.assertEqual(self.get("state/", invalid).status_code, 400)

    def test_csrf_tokens_are_bound_to_their_scope_and_roles_stay_enforced(self):
        donor_token = self.login(self.donor, DONOR_TAB)
        self.login(self.ngo, NGO_TAB)
        self.assertEqual(self.write("auth/logout/", NGO_TAB, token=donor_token).status_code, 403)
        self.assertEqual(self.browser.post("/api/auth/logout/", {}, format="json", HTTP_X_SESSION_SCOPE=NGO_TAB).status_code, 403)
        self.assert_user(NGO_TAB, self.ngo)
        self.assertEqual(self.write("item-requests/", DONOR_TAB, {"role": "ngo"}, token=donor_token).status_code, 403)
        self.assertEqual(self.write("accounts/approve/", DONOR_TAB, {"accounts": []}, token=donor_token).status_code, 403)

    def test_revocation_invalidates_all_sessions_for_only_that_account(self):
        self.login(self.donor, DONOR_TAB)
        self.login(self.donor, OTHER_TAB)
        self.login(self.ngo, NGO_TAB)
        self.donor.access_version += 1
        self.donor.save(update_fields=["access_version"])
        self.assertIsNone(self.get("state/", DONOR_TAB).data["session"])
        self.assertIsNone(self.get("state/", OTHER_TAB).data["session"])
        self.assert_user(NGO_TAB, self.ngo)
        self.assertEqual(self.write("auth/logout/", DONOR_TAB).status_code, 200)

    @override_settings(SESSION_COOKIE_SECURE=True, CSRF_COOKIE_SECURE=True)
    def test_cookie_flags_and_cache_isolation_are_preserved(self):
        self.login(self.donor, DONOR_TAB)
        cookie = self.browser.cookies[f"{settings.SESSION_COOKIE_NAME}_{DONOR_TAB}"]
        self.assertTrue(cookie["httponly"])
        self.assertTrue(cookie["secure"])
        self.assertEqual(cookie["samesite"], "Lax")
        self.assertTrue(self.browser.cookies[f"{settings.CSRF_COOKIE_NAME}_{DONOR_TAB}"]["secure"])
        self.assertNotIn(settings.SESSION_COOKIE_NAME, self.browser.cookies)
        self.assertNotIn(settings.CSRF_COOKIE_NAME, self.browser.cookies)
        response = self.get("state/", DONOR_TAB)
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertIn("X-Session-Scope", response["Vary"])
