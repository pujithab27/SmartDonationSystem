from .test_exchange import ItemExchangeTests
from .models import Notification, DonationMatch


class AvailableDonationTests(ItemExchangeTests):
    def test_discovery_and_interest_notify_donor_without_reserving(self):
        offer = self.offer()
        result = self.client_for(self.ngo).get('/api/item-donations/available/')
        self.assertEqual(result.status_code, 200)
        entry = result.json()[0]
        self.assertEqual(entry['id'], offer['id'])
        self.assertEqual(entry['requests'][0]['id'], self.entry.pk)
        for field in ['address', 'pincode', 'donorPhone', 'donorName']:
            self.assertNotIn(field, entry)
        path = f"item-donations/{offer['id']}/interest/"
        for _ in range(2):
            response = self.send(self.ngo, path, {'requestId': self.entry.pk})
            self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Notification.objects.filter(user=self.donor, title='NGO interested').count(), 1)
        self.assertEqual(DonationMatch.objects.count(), 0)
        notice = Notification.objects.get(title='NGO interested')
        self.assertIn(f"donation={offer['id']}&request={self.entry.pk}", notice.link)
        notice.read = True
        notice.save()
        self.assertTrue(self.client_for(self.ngo).get('/api/item-donations/available/').json()[0]['requests'][0]['interested'])
        self.match(offer)
        self.assertEqual(self.client_for(self.ngo).get('/api/item-donations/available/').json(), [])
        self.assertEqual(self.send(self.ngo, path, {'requestId': self.entry.pk}).status_code, 400)

    def test_only_ngos_can_browse_and_only_own_matching_requests_can_express_interest(self):
        offer = self.offer()
        for user in [None, self.donor, self.pending]:
            self.assertEqual(self.client_for(user).get('/api/item-donations/available/').status_code, 403)
        response = self.send(self.other_ngo, f"item-donations/{offer['id']}/interest/", {'requestId': self.entry.pk})
        self.assertEqual(response.status_code, 404)
        self.assertFalse(Notification.objects.filter(title='NGO interested').exists())
        self.entry.status = 'Closed'
        self.entry.save()
        self.assertEqual(self.send(self.ngo, f"item-donations/{offer['id']}/interest/", {'requestId': self.entry.pk}).status_code, 404)

    def test_quantity_shortcut_reuses_item_and_profile_and_is_idempotent(self):
        from .models import ItemRequest
        self.ngo.address = 'NGO address'
        self.ngo.city = 'Hyderabad'
        self.ngo.state = 'Telangana'
        self.ngo.pincode = '500001'
        self.ngo.phone = '9876543210'
        self.ngo.save()
        offer = self.offer()
        path = f"item-donations/{offer['id']}/interest/"
        before = ItemRequest.objects.count()
        response = self.send(self.ngo, path, {'quantity': 3})
        self.assertEqual(response.status_code, 200, response.data)
        entry = ItemRequest.objects.get(pk=response.data['requestId'])
        self.assertEqual(entry.delivery_address, self.ngo.address)
        self.assertEqual(entry.contact_phone, self.ngo.phone)
        self.assertEqual(entry.items.get().item_key, 'rice')
        self.assertEqual(entry.items.get().quantity, 3)
        self.assertEqual(ItemRequest.objects.count(), before + 1)
        self.assertEqual(self.send(self.ngo, path, {'quantity': 3}).data['requestId'], entry.pk)
        self.assertEqual(ItemRequest.objects.count(), before + 1)
        self.assertEqual(Notification.objects.filter(title='NGO interested').count(), 1)
        self.assertEqual(DonationMatch.objects.count(), 0)
        choices = self.client_for(self.donor).get(f"/api/item-donations/{offer['id']}/candidates/").json()
        self.assertEqual(next(row for row in choices if row['requestId'] == entry.pk)['suggestedQuantity'], 3)
        match = self.match(offer, requestId=entry.pk, quantity=3)
        self.assertEqual(match['requestId'], entry.pk)

    def test_quantity_shortcut_validates_quantity_and_requires_saved_contact(self):
        from .models import ItemRequest
        offer = self.offer()
        before = ItemRequest.objects.count()
        path = f"item-donations/{offer['id']}/interest/"
        for payload in [{'quantity': 0}, {'quantity': 11}, {'quantity': 1.5}, {'quantity': 3}, {'quantity': 2, 'requestId': self.entry.pk}]:
            response = self.send(self.ngo, path, payload)
            self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(ItemRequest.objects.count(), before)
        self.assertFalse(Notification.objects.filter(title='NGO interested').exists())
