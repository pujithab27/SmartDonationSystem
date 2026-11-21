from django.test import SimpleTestCase
from .serializers import ItemQuantityInput
from .exchange import MatchInput
from .photo_analysis import normalize_suggestion


class WholeQuantityTests(SimpleTestCase):
    def test_all_units_require_whole_quantities(self):
        for item in ['rice', 'milk', 'backpack', 'cooking-oil']:
            for quantity in ['3.3', '0.5']:
                value = ItemQuantityInput(data={'itemId': item, 'quantity': quantity})
                self.assertFalse(value.is_valid(), (item, quantity))
            value = ItemQuantityInput(data={'itemId': item, 'quantity': '4'})
            self.assertTrue(value.is_valid(), value.errors)

    def test_matches_reject_fractions(self):
        for quantity in ['3.3', '0.5']:
            value = MatchInput(data={'donationId': 1, 'requestId': 1, 'quantity': quantity})
            self.assertFalse(value.is_valid())
        value = MatchInput(data={'donationId': 1, 'requestId': 1, 'quantity': '3'})
        self.assertTrue(value.is_valid(), value.errors)

    def test_photo_label_cannot_autofill_fractional_weight(self):
        value = {'status': 'recognized', 'itemId': 'rice', 'quantity': 3.3, 'quantityBasis': 'label'}
        self.assertIsNone(normalize_suggestion(value)['quantity'])
        self.assertEqual(normalize_suggestion({**value, 'quantity': 3})['quantity'], 3)
