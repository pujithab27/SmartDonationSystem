from uuid import uuid4
from unittest.mock import patch
from django.test import TestCase
from django.core.cache import cache
from rest_framework.test import APIClient
from .models import User, Organization, ItemRequest, ItemRequestLine, ItemDonation, DonationMatch


class ItemManagementTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.donor = User.objects.create_user('manage-donor@example.test', role='donor', approval_status='Approved')
        cls.other = User.objects.create_user('other-donor@example.test', role='donor', approval_status='Approved')
        cls.ngo = User.objects.create_user('manage-ngo@example.test', role='ngo', approval_status='Approved')
        cls.org = Organization.objects.create(user=cls.ngo, name='Management QA', registration_number='MANAGE-QA', status='Verified')

    def setUp(self):
        cache.clear()
        self.client = APIClient(enforce_csrf_checks=True)
        self.payload = {'itemId': 'book', 'quantity': 4, 'city': 'Hyderabad', 'address': '12 QA Street', 'state': 'Telangana', 'pincode': '500001', 'notes': '', 'image': ''}

    def send(self, user, method, path, data):
        self.client.force_login(user)
        csrf = self.client.get('/api/auth/csrf/').data['csrfToken']
        return getattr(self.client, method)('/api/' + path, data, format='json', HTTP_X_CSRFTOKEN=csrf)

    def offer(self):
        result = self.send(self.donor, 'post', 'item-donations/', {**self.payload, 'clientId': str(uuid4())})
        self.assertEqual(result.status_code, 201, result.data)
        return result.data

    def request_entry(self):
        entry = ItemRequest.objects.create(organization=self.org, title='Books', delivery_address='NGO QA Street', delivery_city='Hyderabad', delivery_state='Telangana', delivery_pincode='500002')
        ItemRequestLine.objects.create(request=entry, item_key='book', quantity=10)
        return entry

    def test_blank_or_invalid_full_address_is_rejected_and_match_preserves_address(self):
        for changes in [{'address': ''}, {'state': ''}, {'pincode': '000000'}, {'city': ''}]:
            response = self.send(self.donor, 'post', 'item-donations/', {**self.payload, **changes, 'clientId': str(uuid4())})
            self.assertEqual(response.status_code, 400)
        offer, entry = self.offer(), self.request_entry()
        response = self.send(self.donor, 'post', 'matches/', {'donationId': offer['id'], 'requestId': entry.id, 'quantity': 2})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['pickupAddress'], self.payload['address'])
        self.assertEqual(response.data['pickupPincode'], self.payload['pincode'])

    def test_donor_edit_delete_ownership_versions_and_match_history(self):
        offer = self.offer()
        path = f"item-donations/{offer['id']}/"
        edit = {**self.payload, 'quantity': 5, 'version': offer['version']}
        self.assertEqual(self.send(self.other, 'patch', path, edit).status_code, 404)
        updated = self.send(self.donor, 'patch', path, edit)
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(updated.data['quantity'], 5)
        self.assertEqual(self.send(self.donor, 'patch', path, edit).status_code, 409)
        self.assertEqual(self.send(self.donor, 'delete', path, {'version': 0}).status_code, 409)
        self.assertEqual(self.send(self.other, 'delete', path, {'version': 1}).status_code, 404)
        entry = self.request_entry()
        DonationMatch.objects.create(donation_id=offer['id'], request=entry, quantity=2, status='Cancelled')
        self.assertEqual(self.send(self.donor, 'patch', path, {**edit, 'version': 1}).status_code, 400)
        self.assertEqual(self.send(self.donor, 'delete', path, {'version': 1}).status_code, 400)
        unused = self.offer()
        self.assertEqual(self.send(self.donor, 'delete', f"item-donations/{unused['id']}/", {'version': 0}).status_code, 200)
        self.assertFalse(ItemDonation.objects.filter(pk=unused['id']).exists())

    def test_ngo_delete_checks_role_version_and_history(self):
        entry = self.request_entry()
        path = f'item-requests/{entry.id}/'
        self.assertEqual(self.send(self.donor, 'delete', path, {'version': 0}).status_code, 403)
        self.assertEqual(self.send(self.ngo, 'delete', path, {'version': 1}).status_code, 409)
        self.assertEqual(self.send(self.ngo, 'delete', path, {'version': 0}).status_code, 200)
        entry = self.request_entry()
        DonationMatch.objects.create(donation_id=self.offer()['id'], request=entry, quantity=2)
        self.assertEqual(self.send(self.ngo, 'delete', f'item-requests/{entry.id}/', {'version': 0}).status_code, 400)

    @patch('donations.photo_analysis.analyse_photo')
    def test_photo_analysis_requires_donor_csrf_and_valid_image(self, analyse):
        path = 'item-donations/analyse-photo/'
        self.assertEqual(self.send(self.ngo, 'post', path, {'image': 'bad'}).status_code, 403)
        self.assertEqual(self.send(self.donor, 'post', path, {'image': 'bad'}).status_code, 400)
        self.assertEqual(self.client.post('/api/' + path, {'image': 'bad'}, format='json').status_code, 403)
        analyse.assert_not_called()
