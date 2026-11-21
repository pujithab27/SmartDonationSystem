import json
from unittest.mock import patch, MagicMock
from urllib.error import HTTPError
from django.test import SimpleTestCase, override_settings
from .photo_analysis import analyse_photo, normalize_suggestion, PhotoServiceError


class PhotoAnalysisTests(SimpleTestCase):
    def test_model_arrays_are_validated_without_silently_selecting_mixed_items(self):
        book = {'status': 'recognized', 'itemId': 'book', 'quantity': 4, 'quantityBasis': 'visible_count'}
        self.assertEqual(normalize_suggestion([book])['quantity'], 4)
        self.assertEqual(normalize_suggestion([book, book])['status'], 'mixed')
        self.assertEqual(normalize_suggestion([])['status'], 'unclear')

    def test_catalog_is_authoritative_and_invalid_quantity_never_autofills(self):
        for quantity in [-1, 0, 1000001, True, '4', float('nan'), 2.5]:
            value = normalize_suggestion({'status': 'recognized', 'itemId': 'book', 'quantity': quantity, 'quantityBasis': 'visible_count'})
            self.assertIsNone(value['quantity'])
        value = normalize_suggestion({'status': 'recognized', 'itemId': 'book', 'category': 'Food', 'quantity': 4, 'quantityBasis': 'visible_count'})
        self.assertEqual((value['category'], value['quantity'], value['unit']), ('Education', 4, 'unit'))
        self.assertEqual(normalize_suggestion({'status': 'recognized', 'itemId': 'car'})['status'], 'unsupported')

    def test_weight_requires_readable_label_and_rejected_images_never_suggest_fields(self):
        value = {'status': 'recognized', 'itemId': 'rice', 'quantity': 5, 'quantityBasis': 'visible_count'}
        self.assertIsNone(normalize_suggestion(value)['quantity'])
        self.assertEqual(normalize_suggestion({**value, 'quantityBasis': 'label'})['quantity'], 5)
        for status in ['mixed', 'unsupported', 'unclear', 'invalid']:
            result = normalize_suggestion({'status': status, 'itemId': 'rice', 'quantity': 10})
            self.assertEqual(result['itemId'], '')
            self.assertIsNone(result['quantity'])
            self.assertTrue(result['warning'])

    @override_settings(GEMINI_API_KEY='test-only-key', GEMINI_MODEL='gemini-2.5-flash')
    @patch('donations.photo_analysis.urlopen')
    def test_service_uses_header_auth_and_validates_structured_response(self, outbound):
        response = MagicMock()
        response.read.return_value = json.dumps({'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': json.dumps({'status': 'recognized', 'itemId': 'book', 'quantity': 3, 'quantityBasis': 'visible_count'})}]}}]}).encode()
        outbound.return_value.__enter__.return_value = response
        result = analyse_photo('data:image/png;base64,YQ==')
        self.assertEqual(result['quantity'], 3)
        sent = outbound.call_args.args[0]
        self.assertNotIn('test-only-key', sent.full_url)
        self.assertEqual(sent.get_header('X-goog-api-key'), 'test-only-key')
        self.assertEqual(json.loads(sent.data)['contents'][0]['parts'][1]['inlineData']['mimeType'], 'image/png')

    @override_settings(GEMINI_API_KEY='test-only-key')
    @patch('donations.photo_analysis.urlopen')
    def test_provider_errors_are_readable_and_contain_no_secrets(self, outbound):
        for status in [400, 401, 403, 429, 500]:
            outbound.side_effect = HTTPError('https://example.test', status, 'test-only-key', {}, None)
            with self.assertRaises(PhotoServiceError) as error:
                analyse_photo('data:image/png;base64,YQ==')
            self.assertNotIn('test-only-key', str(error.exception))

    @override_settings(GEMINI_API_KEY='')
    def test_missing_configuration_does_not_invent_results(self):
        with self.assertRaises(PhotoServiceError):
            analyse_photo('data:image/png;base64,YQ==')
