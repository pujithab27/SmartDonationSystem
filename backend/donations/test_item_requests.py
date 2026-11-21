from copy import deepcopy
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from .donation_items import DONATION_ITEMS, ITEM_BY_ID
from .models import User, Organization, ItemRequest, ItemRequestLine


class ItemRequestTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.ngo = User.objects.create_user("request-ngo@example.com", role="ngo", approval_status="Approved")
        cls.org = Organization.objects.create(user=cls.ngo, name="Community Kitchen", registration_number="ITEM-TEST-1", status="Verified", description="Food support")
        cls.other = User.objects.create_user("other-ngo@example.com", role="ngo", approval_status="Approved")
        cls.other_org = Organization.objects.create(user=cls.other, name="Other NGO", registration_number="ITEM-TEST-2", status="Verified")
        cls.donor = User.objects.create_user("request-donor@example.com", role="donor", approval_status="Approved")
        cls.pending = User.objects.create_user("request-pending@example.com", role="ngo")
        cls.admin = User.objects.create_superuser("request-admin@example.com")

    def client_for(self, user=None):
        client = APIClient(enforce_csrf_checks=True)
        if user:
            user.refresh_from_db()
            client.force_login(user)
        return client

    def send(self, client, data, pk=None):
        token = client.get("/api/auth/csrf/").json()["csrfToken"]
        path = f"/api/item-requests/{pk}/" if pk else "/api/item-requests/"
        return (client.patch if pk else client.post)(path, data, format="json", HTTP_X_CSRFTOKEN=token)

    def payload(self, **changes):
        data = {"title": "Community kitchen essentials", "contactPhone": "9876543210", "items": [{"itemId": "rice", "quantity": "25"}, {"itemId": "utensils", "quantity": "10"}],
                "deliveryAddress": "12 Community Road", "deliveryCity": "Hyderabad", "deliveryState": "Telangana", "deliveryPincode": "500001",
                "notes": "Deliver between 10 am and 4 pm.", "neededBy": str(timezone.localdate() + timedelta(days=7))}
        data.update(changes)
        return data

    def create(self):
        response = self.send(self.client_for(self.ngo), self.payload())
        self.assertEqual(response.status_code, 201, response.data)
        return response.json()

    def test_catalog_contains_all_requested_items_with_fixed_units(self):
        self.assertEqual(len(DONATION_ITEMS), 50)
        self.assertEqual(len(ITEM_BY_ID), 50)
        expected = {
            "unit": ["Backpack", "Blanket", "Book", "Textbook", "School Bag", "Laptop", "Desktop Computer", "Mobile Phone", "Tablet", "Furniture", "Bedsheet"],
            "piece": ["Handbag", "Wallet", "Shirt", "T-Shirt", "Pants", "Jeans", "Dress", "Jacket", "Sweater", "Coat", "Trousers", "Saree", "Notebook", "Pen", "Pencil", "Toothbrush", "Utensils", "Towel", "Soap"],
            "kg": ["Rice", "Wheat", "Pulses", "Flour", "Sugar", "Dal / Pulses"],
            "litre": ["Cooking Oil", "Milk"], "packet": ["School Stationery", "Groceries", "Biscuits", "Sanitary Pads"],
            "pair": ["Shoes", "Slippers", "Sandals"], "strip": ["Medicine"],
            "box": ["First Aid Kit", "Medical Kit", "Medical Supplies"], "bottle": ["Water Bottle"],
        }
        self.assertEqual({item["name"]: item["unit"] for item in DONATION_ITEMS}, {name: unit for unit, names in expected.items() for name in names})
        state = self.client_for().get("/api/state/").json()["data"]
        self.assertEqual(state["itemCatalog"], DONATION_ITEMS)

    def test_verified_ngo_publishes_and_donor_reads_persisted_items_and_location(self):
        entry = self.create()
        self.assertEqual(ItemRequest.objects.get(pk=entry["id"]).organization, self.org)
        self.assertEqual(ItemRequestLine.objects.count(), 2)
        self.assertEqual(entry["items"][0]["unit"], "kg")
        donor = self.client_for(self.donor)
        loaded = donor.get("/api/item-requests/").json()[0]
        self.assertEqual(loaded["deliveryAddress"], "12 Community Road")
        self.assertEqual(loaded["deliveryPincode"], "500001")
        self.assertEqual(loaded["items"][0]["quantity"], 25)
        self.assertEqual(donor.get("/api/state/").json()["data"]["itemRequests"][0], loaded)

    def test_only_approved_verified_ngos_can_publish(self):
        for user in [None, self.donor, self.admin, self.pending]:
            with self.subTest(user=user):
                self.assertEqual(self.send(self.client_for(user), self.payload()).status_code, 403)
        self.org.status = "Pending"
        self.org.save()
        self.assertEqual(self.send(self.client_for(self.ngo), self.payload()).status_code, 403)
        self.assertFalse(ItemRequest.objects.exists())

    def test_csrf_is_required(self):
        client = self.client_for(self.ngo)
        self.assertEqual(client.post("/api/item-requests/", self.payload(), format="json").status_code, 403)

    def test_all_50_items_can_be_requested_together(self):
        items = [{"itemId": item["id"], "quantity": "3"} for item in DONATION_ITEMS]
        response = self.send(self.client_for(self.ngo), self.payload(items=items))
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(len(response.data["items"]), 50)

    def test_invalid_quantities_and_item_names_do_not_partially_save(self):
        bad_lines = [
            {"itemId": "rice", "quantity": "0"}, {"itemId": "rice", "quantity": "-1"},
            {"itemId": "rice", "quantity": "1000001"}, {"itemId": "rice", "quantity": "1.234"},
            {"itemId": "shirt", "quantity": "1.5"}, {"itemId": "invented-item", "quantity": "2"},
            {"itemId": "rice", "quantity": "2", "unit": "piece"},
        ]
        client = self.client_for(self.ngo)
        for line in bad_lines:
            with self.subTest(line=line):
                response = self.send(client, self.payload(items=[{"itemId": "book", "quantity": "1"}, line]))
                self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(ItemRequest.objects.exists())
        self.assertFalse(ItemRequestLine.objects.exists())

    def test_duplicate_empty_or_too_many_items_are_rejected(self):
        client = self.client_for(self.ngo)
        for items in [[], [{"itemId": "rice", "quantity": "1"}] * 2, [{"itemId": "rice", "quantity": "1"}] * 51]:
            self.assertEqual(self.send(client, self.payload(items=items)).status_code, 400)

    def test_required_delivery_details_dates_and_extra_fields_are_checked(self):
        client = self.client_for(self.ngo)
        for changes in [{"deliveryAddress": " "}, {"deliveryCity": ""}, {"deliveryPincode": "000000"},
                        {"neededBy": str(timezone.localdate() - timedelta(days=1))}, {"organizationId": self.other_org.pk}, {"status": "Closed"}]:
            with self.subTest(changes=changes):
                self.assertEqual(self.send(client, self.payload(**changes)).status_code, 400)

    def test_owner_edits_atomically_and_stale_versions_cannot_overwrite(self):
        entry = self.create()
        client = self.client_for(self.ngo)
        fields = self.payload(title="Updated essentials", items=[{"itemId": "cooking-oil", "quantity": "5"}], version=entry["version"])
        response = self.send(client, fields, entry["id"])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["version"], 1)
        self.assertEqual(ItemRequestLine.objects.count(), 1)
        self.assertEqual(self.send(client, fields, entry["id"]).status_code, 409)
        bad = deepcopy(fields)
        bad.update(version=1, items=[{"itemId": "shirt", "quantity": "0.5"}])
        self.assertEqual(self.send(client, bad, entry["id"]).status_code, 400)
        self.assertEqual(ItemRequest.objects.get(pk=entry["id"]).title, "Updated essentials")
        self.assertEqual(ItemRequestLine.objects.get().item_key, "cooking-oil")

    def test_other_ngos_and_donors_cannot_edit_or_close_requests(self):
        entry = self.create()
        changes = {"status": "Closed", "version": 0}
        self.assertEqual(self.send(self.client_for(self.other), changes, entry["id"]).status_code, 404)
        self.assertEqual(self.send(self.client_for(self.donor), changes, entry["id"]).status_code, 403)
        self.assertEqual(self.client_for(self.other).get("/api/item-requests/").json(), [])
        self.assertEqual(ItemRequest.objects.get(pk=entry["id"]).status, "Open")

    def test_close_and_reopen_update_donor_visibility(self):
        entry = self.create()
        owner, donor = self.client_for(self.ngo), self.client_for(self.donor)
        closed = self.send(owner, {"status": "Closed", "version": 0}, entry["id"])
        self.assertEqual(closed.status_code, 200)
        self.assertEqual(donor.get("/api/item-requests/").json(), [])
        self.assertEqual(owner.get("/api/item-requests/").json()[0]["status"], "Closed")
        self.assertEqual(self.send(owner, {"status": "Open", "version": 1}, entry["id"]).status_code, 200)
        self.assertEqual(len(donor.get("/api/item-requests/").json()), 1)

    def test_anonymous_or_revoked_accounts_cannot_read_delivery_locations(self):
        self.create()
        anonymous = self.client_for()
        self.assertEqual(anonymous.get("/api/item-requests/").status_code, 403)
        self.assertEqual(anonymous.get("/api/state/").json()["data"]["itemRequests"], [])
        donor = self.client_for(self.donor)
        for fields in [{"is_active": False}, {"approval_status": "Rejected"}]:
            User.objects.filter(pk=self.ngo.pk).update(**fields)
            self.assertEqual(donor.get("/api/item-requests/").json(), [])
            User.objects.filter(pk=self.ngo.pk).update(is_active=True, approval_status="Approved")
        Organization.objects.filter(pk=self.org.pk).update(status="Rejected")
        self.assertEqual(donor.get("/api/item-requests/").json(), [])
