from types import SimpleNamespace
from unittest.mock import patch
from django.core.cache import cache
from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate
from . import places


ROW = {'place_id': 1, 'lat': '12.9716', 'lon': '77.5946', 'display_name': '34-147/1 Main Road, Bengaluru, Karnataka, 560001',
       'address': {'house_number': '34-147/1', 'road': 'Main Road', 'city': 'Bengaluru', 'state': 'Karnataka', 'postcode': '560001'}}


class LocationTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        places.last_geocode = 0
        self.factory = APIRequestFactory()

    def get(self, view, params, authenticated=True):
        request = self.factory.get('/api/places/', params)
        if authenticated:
            force_authenticate(request, user=SimpleNamespace(is_authenticated=True, pk=1))
        return view.as_view()(request)

    @patch('donations.places.get_json', return_value=ROW)
    def test_reverse_returns_separate_fields_preserves_door_number_and_caches(self, provider):
        response = self.get(places.PlaceReverseView, {'lat':12.9716, 'lon':77.5946})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['fields'], {'address':'34-147/1 Main Road', 'city':'Bengaluru', 'state':'Karnataka', 'pincode':'560001'})
        self.assertEqual(self.get(places.PlaceReverseView, {'lat':12.9716, 'lon':77.5946}).data, response.data)
        provider.assert_called_once()

    @patch('donations.places.get_json', return_value=[ROW])
    def test_search_returns_fields_without_second_provider_request(self, provider):
        response = self.get(places.PlaceSearchView, {'q':'Main Road'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]['fields']['pincode'], '560001')
        self.assertIn('addressdetails=1', provider.call_args.args[0])

    @patch('donations.places.get_json')
    def test_invalid_coordinates_do_not_call_provider(self, provider):
        for lat in ['nan', 'inf', '91', 'invalid']:
            self.assertEqual(self.get(places.PlaceReverseView, {'lat':lat,'lon':77}).status_code, 400)
        provider.assert_not_called()

    @patch('donations.places.time.sleep')
    @patch('donations.places.get_json', side_effect=[ROW, [ROW]])
    def test_uncached_requests_share_provider_rate_limit(self, provider, sleep):
        self.assertEqual(self.get(places.PlaceReverseView, {'lat':12,'lon':77}).status_code, 200)
        self.assertEqual(self.get(places.PlaceSearchView, {'q':'Bengaluru'}).status_code, 200)
        self.assertEqual(provider.call_count, 2)
        sleep.assert_called_once()

    @patch('donations.places.get_json', return_value={'error':'Unable to geocode'})
    def test_missing_provider_address_returns_recoverable_error(self, provider):
        self.assertEqual(self.get(places.PlaceReverseView, {'lat':12,'lon':77}).status_code, 503)

    @patch('donations.places.get_json', return_value=ROW)
    def test_registration_can_reverse_lookup_with_anonymous_throttling(self, provider):
        for _ in range(12):
            response = self.get(places.PlaceReverseView, {'lat':12,'lon':77}, False)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data['fields']['state'], 'Karnataka')
        self.assertEqual(self.get(places.PlaceReverseView, {'lat':12,'lon':77}, False).status_code, 429)
        provider.assert_called_once()

    @patch('donations.places.get_json', return_value=[ROW])
    def test_registration_can_search_by_pincode(self, provider):
        response = self.get(places.PlaceSearchView, {'q':'560001'}, False)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]['fields']['pincode'], '560001')

    @patch('donations.places.get_json')
    def test_suggestion_alias_and_cache(self, provider):
        provider.return_value = {'results': [{'id': 1, 'name': 'Kompalli', 'latitude': 17.54, 'longitude': 78.48, 'admin1': 'Telangana', 'admin2': 'Medchal', 'country': 'India'}]}
        response = self.get(places.PlaceSuggestView, {'q': 'Kompally,Hyder'}, False)
        self.assertEqual(response.status_code, 200)
        self.assertIn('name=Kompalli', provider.call_args.args[0])
        self.assertEqual(response.data[0]['fields']['state'], 'Telangana')
        self.assertEqual(response.data[0]['fields']['pincode'], '')
        self.assertEqual(self.get(places.PlaceSuggestView, {'q': 'kompally'}, False).data, response.data)
        provider.assert_called_once()
