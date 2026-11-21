import base64
import io
from PIL import Image
from datetime import timedelta
from decimal import Decimal
from uuid import uuid4
from unittest.mock import patch
from django.test import TestCase
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient
from .models import User, Organization, ItemRequest, ItemRequestLine, ItemDonation, DonationMatch, Notification


def sample_proof():
    buffer = io.BytesIO()
    Image.new('RGB', (16, 12), 'blue').save(buffer, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode()

PROOF = sample_proof()

class ItemExchangeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.donor = User.objects.create_user('giver@example.com', role='donor', approval_status='Approved')
        cls.other = User.objects.create_user('other-giver@example.com', role='donor', approval_status='Approved')
        cls.ngo = User.objects.create_user('receiver@example.com', role='ngo', approval_status='Approved')
        cls.other_ngo = User.objects.create_user('other-receiver@example.com', role='ngo', approval_status='Approved')
        cls.pending = User.objects.create_user('pending-giver@example.com', role='donor')
        cls.org = Organization.objects.create(user=cls.ngo, name='Community Kitchen', registration_number='EXCHANGE-1', status='Verified')
        cls.org2 = Organization.objects.create(user=cls.other_ngo, name='Second Kitchen', registration_number='EXCHANGE-2', status='Verified')
        cls.entry = ItemRequest.objects.create(organization=cls.org, title='Kitchen essentials', delivery_address='NGO Road', delivery_city='Bengaluru', delivery_state='Karnataka', delivery_pincode='560001')
        cls.line = ItemRequestLine.objects.create(request=cls.entry, item_key='rice', quantity=30)

    def setUp(self):
        cache.clear()

    def client_for(self, user=None):
        client = APIClient(enforce_csrf_checks=True)
        if user:
            user.refresh_from_db()
            client.force_login(user)
        return client

    def send(self, user, path, payload, method='post'):
        client = self.client_for(user)
        token = client.get('/api/auth/csrf/').json()['csrfToken']
        return getattr(client, method)(f'/api/{path}', payload, format='json', HTTP_X_CSRFTOKEN=token)

    def offer(self, user=None, **changes):
        payload = {'clientId': str(uuid4()), 'itemId': 'rice', 'quantity': '10', 'city': 'Bengaluru', 'address': '12 Test Road', 'state': 'Karnataka', 'pincode': '560001'}
        payload.update(changes)
        response = self.send(user or self.donor, 'item-donations/', payload)
        self.assertEqual(response.status_code, 201, response.data)
        return response.json()

    def match(self, donation=None, **changes):
        donation = donation or self.offer()
        payload = {'donationId': donation['id'], 'requestId': self.entry.pk, 'quantity': '10'}
        payload.update(changes)
        response = self.send(self.donor, 'matches/', payload)
        self.assertEqual(response.status_code, 201, response.data)
        return response.json()

    def schedule(self, match=None):
        match = match or self.match()
        response = self.send(self.donor, f"matches/{match['id']}/", {'action': 'schedule', 'version': match['version'], 'pickupAt': (timezone.now() + timedelta(days=1)).isoformat(), 'pickupAddress': 'Donor Road', 'pickupCity': 'Bengaluru', 'pickupState': 'Karnataka', 'pickupPincode': '560002', 'pickupNotes': 'Call at the gate'}, 'patch')
        self.assertEqual(response.status_code, 200, response.data)
        return response.json()

    def test_complete_flow_updates_progress_once_and_notifies_both_parties(self):
        match = self.schedule()
        self.check_receipt(match)
        self.assertNotEqual(match['pickupAddress'], match['deliveryAddress'])
        response = self.send(self.ngo, f"matches/{match['id']}/", {'action': 'confirm', 'deliveryProof': PROOF, 'itemMatchConfirmed': True, 'version': match['version']}, 'patch')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['status'], 'Completed')
        self.line.refresh_from_db()
        self.assertEqual(self.line.fulfilled_quantity, Decimal('10'))
        again = self.send(self.ngo, f"matches/{match['id']}/", {'action': 'confirm', 'deliveryProof': PROOF, 'itemMatchConfirmed': True, 'version': response.data['version']}, 'patch')
        self.assertEqual(again.status_code, 400)
        self.line.refresh_from_db()
        self.assertEqual(self.line.fulfilled_quantity, 10)
        self.assertEqual(Notification.objects.filter(title='Donation completed').count(), 2)
        self.assertEqual(DonationMatch.objects.get(pk=match['id']).delivery_proof, PROOF)
        for user in [self.ngo, self.donor]:
            detail = self.client_for(user).get(f"/api/matches/{match['id']}/").json()
            self.assertEqual(detail['deliveryProof'], PROOF)
            self.assertEqual([event['title'] for event in detail['events']], ['Donation matched', 'Pickup scheduled', 'Donation completed'])
        self.assertEqual(self.client_for(self.other).get(f"/api/matches/{match['id']}/").status_code, 404)
        state = self.client_for(self.ngo).get('/api/state/').json()['data']
        line = state['itemRequests'][0]['items'][0]
        self.assertEqual((line['fulfilled'], line['reserved'], line['remaining']), (10, 0, 20))
        donor_state = self.client_for(self.donor).get('/api/state/').json()['data']
        self.assertEqual(donor_state['itemDonations'][0]['status'], 'Completed')

    def test_ngo_state_tracks_acceptance_and_pickup_for_the_original_request(self):
        match = self.match()
        state = self.client_for(self.ngo).get('/api/state/').json()['data']
        accepted = next(entry for entry in state['matches'] if entry['id'] == match['id'])
        self.assertEqual(accepted['requestId'], self.entry.pk)
        self.assertEqual(accepted['status'], 'Pending')
        self.assertTrue(any(str(match['id']) in notice['link'] for notice in state['notifications']))
        self.assertEqual(self.client_for(self.other_ngo).get('/api/state/').json()['data']['matches'], [])
        self.schedule(match)
        state = self.client_for(self.ngo).get('/api/state/').json()['data']
        scheduled = next(entry for entry in state['matches'] if entry['id'] == match['id'])
        self.assertEqual(scheduled['status'], 'Pickup scheduled')
        self.assertEqual(scheduled['pickupAddress'], 'Donor Road')
        self.assertTrue(scheduled['pickupAt'])

    def test_duplicate_offer_is_idempotent_and_changed_retry_conflicts(self):
        client_id = str(uuid4())
        first = self.offer(clientId=client_id)
        payload = {'clientId': client_id, 'itemId': 'rice', 'quantity': 10, 'city': 'Bengaluru', 'address': '12 Test Road', 'state': 'Karnataka', 'pincode': '560001'}
        retry = self.send(self.donor, 'item-donations/', payload)
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(retry.data['id'], first['id'])
        payload['quantity'] = 11
        self.assertEqual(self.send(self.donor, 'item-donations/', payload).status_code, 409)
        self.assertEqual(ItemDonation.objects.count(), 1)
        self.assertEqual(Notification.objects.count(), 1)

    def test_offer_requires_csrf_approved_donor_and_fixed_units(self):
        payload = {'clientId': str(uuid4()), 'itemId': 'book', 'quantity': '1.5', 'city': 'Bengaluru', 'address': '12 Test Road', 'state': 'Karnataka', 'pincode': '560001'}
        for user in [None, self.pending, self.ngo]:
            self.assertEqual(self.send(user, 'item-donations/', payload).status_code, 403)
        self.assertEqual(self.send(self.donor, 'item-donations/', payload).status_code, 400)
        payload['itemId'] = 'rice'
        payload['unit'] = 'boxes'
        self.assertEqual(self.send(self.donor, 'item-donations/', payload).status_code, 400)
        del payload['unit']
        self.assertEqual(self.client_for(self.donor).post('/api/item-donations/', payload, format='json').status_code, 403)

    def test_invalid_images_rejected(self):
        response = self.send(self.donor, 'item-donations/', {'clientId': str(uuid4()), 'itemId': 'rice', 'quantity': 1, 'city': 'Bengaluru', 'address': '12 Test Road', 'state': 'Karnataka', 'pincode': '560001', 'image': 'data:image/png;base64,SGVsbG8='})
        self.assertEqual(response.status_code, 400)

    def test_candidates_match_exact_item_and_prioritize_same_city(self):
        distant = ItemRequest.objects.create(organization=self.org2, title='Other city', delivery_address='NGO Street', delivery_city='Delhi', delivery_state='Delhi', delivery_pincode='110001', priority='High')
        ItemRequestLine.objects.create(request=distant, item_key='rice', quantity=10)
        donation = self.offer()
        result = self.client_for(self.donor).get(f"/api/item-donations/{donation['id']}/candidates/").json()
        self.assertEqual([entry['requestId'] for entry in result], [self.entry.pk, distant.pk])
        self.assertTrue(result[0]['sameCity'])
        self.assertEqual(self.client_for(self.other).get(f"/api/item-donations/{donation['id']}/candidates/").status_code, 404)
        wheat = self.offer(itemId='wheat')
        self.assertEqual(self.client_for(self.donor).get(f"/api/item-donations/{wheat['id']}/candidates/").json(), [])

    def test_duplicate_and_overallocated_matches_are_rejected(self):
        donation = self.offer(quantity=20)
        self.match(donation, quantity=15)
        duplicate = self.send(self.donor, 'matches/', {'donationId': donation['id'], 'requestId': self.entry.pk, 'quantity': 1})
        self.assertEqual(duplicate.status_code, 409)
        second = self.offer(quantity=20)
        response = self.send(self.donor, 'matches/', {'donationId': second['id'], 'requestId': self.entry.pk, 'quantity': 16})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(DonationMatch.objects.count(), 1)

    def test_donation_capacity_cannot_be_allocated_across_two_requests(self):
        donation = self.offer()
        self.match(donation)
        entry = ItemRequest.objects.create(organization=self.org2, title='Another need', delivery_address='Street', delivery_city='Bengaluru', delivery_state='Karnataka', delivery_pincode='560001')
        ItemRequestLine.objects.create(request=entry, item_key='rice', quantity=20)
        response = self.send(self.donor, 'matches/', {'donationId': donation['id'], 'requestId': entry.pk, 'quantity': 1})
        self.assertEqual(response.status_code, 409)

    def test_only_owner_can_schedule_and_only_receiving_ngo_can_confirm(self):
        match = self.schedule()
        for user in [self.donor, self.other, self.other_ngo]:
            response = self.send(user, f"matches/{match['id']}/", {'action': 'confirm', 'deliveryProof': PROOF, 'itemMatchConfirmed': True, 'version': match['version']}, 'patch')
            self.assertIn(response.status_code, [403, 404])
        self.assertEqual(self.client_for(self.other).get('/api/state/').json()['data']['matches'], [])
        for user in [None, self.other, self.other_ngo]:
            self.assertIn(self.client_for(user).get(f"/api/item-donations/{match['donationId']}/").status_code, [403, 404])

    def test_cancel_releases_reserved_quantity(self):
        match = self.match()
        response = self.send(self.ngo, f"matches/{match['id']}/", {'action': 'cancel', 'version': 0}, 'patch')
        self.assertEqual(response.status_code, 200)
        donation = ItemDonation.objects.get(pk=match['donationId'])
        from .exchange import available, line_available
        self.assertEqual(available(donation), 10)
        self.assertEqual(line_available(self.line), 30)
        self.match({'id': donation.pk})

    def test_stale_action_rejected_and_confirmation_requires_pickup(self):
        match = self.match()
        self.assertEqual(self.send(self.ngo, f"matches/{match['id']}/", {'action': 'confirm', 'deliveryProof': PROOF, 'itemMatchConfirmed': True, 'version': 0}, 'patch').status_code, 400)
        self.schedule(match)
        self.assertEqual(self.send(self.ngo, f"matches/{match['id']}/", {'action': 'confirm', 'deliveryProof': PROOF, 'itemMatchConfirmed': True, 'version': 0}, 'patch').status_code, 409)
        self.line.refresh_from_db()
        self.assertEqual(self.line.fulfilled_quantity, 0)

    def test_pickup_validation_rejects_past_date_or_incomplete_address(self):
        match = self.match()
        base = {'action': 'schedule', 'version': 0, 'pickupAt': (timezone.now() - timedelta(days=1)).isoformat(), 'pickupAddress': 'Street', 'pickupCity': 'City', 'pickupState': 'State', 'pickupPincode': '560001'}
        self.assertEqual(self.send(self.donor, f"matches/{match['id']}/", base, 'patch').status_code, 400)
        base['pickupAt'] = (timezone.now() + timedelta(days=1)).isoformat()
        del base['pickupAddress']
        self.assertEqual(self.send(self.donor, f"matches/{match['id']}/", base, 'patch').status_code, 400)

    def test_suspended_counterparty_cannot_receive_or_schedule(self):
        match = self.match()
        self.ngo.is_active = False
        self.ngo.save()
        response = self.send(self.donor, f"matches/{match['id']}/", {'action': 'schedule', 'version': 0, 'pickupAt': (timezone.now() + timedelta(days=1)).isoformat(), 'pickupAddress': 'Street', 'pickupCity': 'City', 'pickupState': 'State', 'pickupPincode': '560001'}, 'patch')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.send(self.donor, f"matches/{match['id']}/", {'action': 'cancel', 'version': 0}, 'patch').status_code, 200)

    def test_request_edit_preserves_received_quantities_and_rejects_removal(self):
        match = self.schedule()
        self.check_receipt(match)
        self.send(self.ngo, f"matches/{match['id']}/", {'action': 'confirm', 'deliveryProof': PROOF, 'itemMatchConfirmed': True, 'version': match['version']}, 'patch')
        self.entry.refresh_from_db()
        payload = {'version': self.entry.version, 'title': 'Updated need', 'contactPhone': '9876543210', 'items': [{'itemId': 'rice', 'quantity': 40}], 'deliveryAddress': 'NGO Road', 'deliveryCity': 'Bengaluru', 'deliveryState': 'Karnataka', 'deliveryPincode': '560001'}
        response = self.send(self.ngo, f'item-requests/{self.entry.pk}/', payload, 'patch')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['items'][0]['fulfilled'], 10)
        payload['version'] = response.data['version']
        payload['items'][0]['quantity'] = 5
        self.assertEqual(self.send(self.ngo, f'item-requests/{self.entry.pk}/', payload, 'patch').status_code, 400)
        payload['items'] = [{'itemId': 'book', 'quantity': 2}]
        self.assertEqual(self.send(self.ngo, f'item-requests/{self.entry.pk}/', payload, 'patch').status_code, 400)
        self.line.refresh_from_db()
        self.assertEqual((self.line.quantity, self.line.fulfilled_quantity), (40, 10))

    def test_notifications_are_private_and_read_state_persists(self):
        self.match()
        notice = Notification.objects.filter(user=self.ngo).first()
        self.assertEqual(self.send(self.other, 'notifications/read/', {'id': notice.pk}).status_code, 404)
        self.assertEqual(self.send(self.ngo, 'notifications/read/', {'id': notice.pk}).status_code, 200)
        notice.refresh_from_db()
        self.assertTrue(notice.read)
        public = self.client_for().get('/api/state/').json()['data']
        self.assertEqual(public['itemDonations'], [])
        self.assertEqual(public['matches'], [])
        self.assertEqual(public['notifications'], [])

    def test_closed_or_expired_requests_cannot_match(self):
        donation = self.offer()
        for changes in [{'status': 'Closed'}, {'status': 'Open', 'needed_by': timezone.localdate() - timedelta(days=1)}]:
            for key, value in changes.items():
                setattr(self.entry, key, value)
            self.entry.save()
            self.assertEqual(self.send(self.donor, 'matches/', {'donationId': donation['id'], 'requestId': self.entry.pk, 'quantity': 1}).status_code, 400)
            self.assertEqual(self.client_for(self.donor).get(f"/api/item-donations/{donation['id']}/candidates/").json(), [])

    @patch('donations.places.get_json')
    def test_map_validates_coordinates_and_uses_only_fixed_queries(self, fetch):
        client = self.client_for(self.donor)
        for query in ['lat=NaN&lon=77', 'lat=91&lon=77', 'lat=12&lon=181', 'lat=12&lon=77&url=https://evil.example']:
            self.assertEqual(client.get('/api/places/nearby/?' + query).status_code, 400)
        fetch.assert_not_called()
        fetch.return_value = {'elements': [{'type': 'node', 'id': 5, 'lat': 12.97, 'lon': 77.59, 'tags': {'amenity': 'hospital', 'name': 'Community Hospital', 'emergency': 'yes'}}]}
        result = client.get('/api/places/nearby/?lat=12.97&lon=77.59')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertTrue(result.data['places'][0]['emergency'])
        client.get('/api/places/nearby/?lat=12.97&lon=77.59')
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(self.client_for().get('/api/places/nearby/?lat=12.97&lon=77.59').status_code, 403)

    def test_receipt_requires_valid_photo_and_rejects_proof_for_other_actions(self):
        match = self.schedule()
        for proof in [None, "data:image/png;base64,SGVsbG8=", "data:image/svg+xml;base64,PHN2Zz4="]:
            payload = {'action': 'confirm', 'version': match['version']}
            if proof is not None:
                payload['deliveryProof'] = proof
            response = self.send(self.ngo, f"matches/{match['id']}/", payload, 'patch')
            self.assertEqual(response.status_code, 400)
        self.line.refresh_from_db()
        self.assertEqual(self.line.fulfilled_quantity, 0)
        invalid = self.send(self.ngo, f"matches/{match['id']}/", {'action': 'cancel', 'version': match['version'], 'deliveryProof': PROOF}, 'patch')
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(DonationMatch.objects.get(pk=match['id']).status, 'Pickup scheduled')

    def test_phone_is_required_validated_and_visible_on_the_request_and_match(self):
        payload = {'title': 'Daily supplies', 'items': [{'itemId': 'rice', 'quantity': 10}], 'deliveryAddress': 'NGO Street', 'deliveryCity': 'Bengaluru', 'deliveryState': 'Karnataka', 'deliveryPincode': '560001'}
        self.assertEqual(self.send(self.ngo, 'item-requests/', payload).status_code, 400)
        payload['contactPhone'] = '123'
        self.assertEqual(self.send(self.ngo, 'item-requests/', payload).status_code, 400)
        payload['contactPhone'] = '+91 98765 43210'
        result = self.send(self.ngo, 'item-requests/', payload)
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(result.data['contactPhone'], '+919876543210')
        match = self.match(requestId=result.data['id'])
        self.assertEqual(match['contactPhone'], '+919876543210')

    def check_receipt(self, match, status='match', user=None, proof=PROOF):
        result = {'status': status, 'expectedItem': 'Rice', 'observedItem': 'Shirt' if status == 'mismatch' else 'Rice', 'explanation': 'Test comparison', 'comparedWithDonorPhoto': False}
        with patch('donations.receipt_analysis.compare_receipt', return_value=result):
            response = self.send(user or self.ngo, f"matches/{match['id']}/check-receipt-photo/", {'deliveryProof': proof})
        self.assertEqual(response.status_code, 200, response.data)
        return response

    def test_receipt_check_is_required_and_mismatches_cannot_complete(self):
        match = self.schedule()
        payload = {'action': 'confirm', 'deliveryProof': PROOF, 'itemMatchConfirmed': True, 'version': match['version']}
        self.assertEqual(self.send(self.ngo, f"matches/{match['id']}/", payload, 'patch').status_code, 400)
        for status in ['mismatch', 'unclear']:
            DonationMatch.objects.filter(pk=match['id']).update(receipt_check={}, receipt_check_digest='')
            self.check_receipt(match, status)
            response = self.send(self.ngo, f"matches/{match['id']}/", payload, 'patch')
            self.assertEqual(response.status_code, 400)
            self.assertEqual(DonationMatch.objects.get(pk=match['id']).status, 'Pickup scheduled')
            self.line.refresh_from_db()
            self.assertEqual(self.line.fulfilled_quantity, 0)

    def test_checked_photo_cannot_be_swapped_and_other_users_cannot_check(self):
        match = self.schedule()
        self.check_receipt(match)
        buffer = io.BytesIO()
        Image.new('RGB', (16, 12), 'red').save(buffer, format='PNG')
        swapped = 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode()
        payload = {'action': 'confirm', 'deliveryProof': swapped, 'itemMatchConfirmed': True, 'version': match['version']}
        self.assertEqual(self.send(self.ngo, f"matches/{match['id']}/", payload, 'patch').status_code, 400)
        self.assertEqual(self.send(self.other_ngo, f"matches/{match['id']}/check-receipt-photo/", {'deliveryProof': PROOF}).status_code, 404)
        self.assertEqual(self.send(self.donor, f"matches/{match['id']}/check-receipt-photo/", {'deliveryProof': PROOF}).status_code, 403)

    def test_completed_delivery_check_persists_warning_without_changing_totals(self):
        match = self.schedule()
        DonationMatch.objects.filter(pk=match['id']).update(status='Completed', delivery_proof=PROOF)
        self.line.fulfilled_quantity = 10
        self.line.save()
        self.check_receipt(match, 'mismatch', user=self.donor)
        for user in [self.donor, self.ngo]:
            response = self.client_for(user).get(f"/api/matches/{match['id']}/")
            self.assertEqual(response.data['receiptCheck']['status'], 'mismatch')
            self.assertEqual(response.data['status'], 'Completed')
        self.line.refresh_from_db()
        self.assertEqual(self.line.fulfilled_quantity, 10)
        self.check_receipt(match, 'mismatch', user=self.ngo)

    def test_mismatch_notifies_only_donor_once_for_repeated_photo(self):
        match = self.schedule()
        Notification.objects.all().delete()
        self.check_receipt(match, 'mismatch')
        self.check_receipt(match, 'mismatch')
        notice = Notification.objects.get()
        self.assertEqual(notice.user_id, self.donor.pk)
        self.assertEqual(notice.title, 'Not matching')
        self.assertIn(f"?match={match['id']}", notice.link)

    def test_matching_or_unclear_photo_does_not_send_mismatch_notification(self):
        match = self.schedule()
        Notification.objects.all().delete()
        for status in ['match', 'unclear']:
            DonationMatch.objects.filter(pk=match['id']).update(receipt_check={}, receipt_check_digest='')
            self.check_receipt(match, status)
        self.assertFalse(Notification.objects.exists())

    def test_admin_can_track_all_exchanges_and_read_proof_but_not_change_delivery(self):
        admin = User.objects.create_user('tracking-admin@example.com', role='admin', approval_status='Approved')
        match = self.match()
        client = self.client_for(admin)
        state = client.get('/api/state/').json()['data']
        self.assertEqual(len(state['itemDonations']), 1)
        self.assertEqual(state['itemDonations'][0]['donorEmail'], self.donor.email)
        self.assertEqual(state['matches'][0]['ngoEmail'], self.ngo.email)
        self.assertEqual(client.get(f"/api/matches/{match['id']}/").status_code, 200)
        response = self.send(admin, f"matches/{match['id']}/", {'action': 'cancel', 'version': match['version']}, method='patch')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(DonationMatch.objects.get(pk=match['id']).status, 'Pending')
        for user in [self.other, self.other_ngo]:
            isolated = self.client_for(user)
            self.assertEqual(isolated.get('/api/state/').json()['data']['matches'], [])
            self.assertEqual(isolated.get(f"/api/matches/{match['id']}/").status_code, 404)
        self.assertEqual(self.client_for().get('/api/state/').json()['data']['itemDonations'], [])
