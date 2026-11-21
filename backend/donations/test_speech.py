import base64
import io
import json
import wave
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError
from django.test import SimpleTestCase, override_settings
from rest_framework.exceptions import PermissionDenied
from rest_framework.views import exception_handler
from .speech import SpeechInput, SpeechServiceError, SpeechTranscriptionView, transcribe_audio, normalize_donation_speech


def recording(seconds=1, rate=16000):
    data = io.BytesIO()
    with wave.open(data, 'wb') as audio:
        audio.setnchannels(1); audio.setsampwidth(2); audio.setframerate(rate)
        audio.writeframes(b'\x01\x00' * int(seconds * rate))
    return base64.b64encode(data.getvalue()).decode()


class SpeechTests(SimpleTestCase):
    @override_settings(GEMINI_API_KEY='test-key')
    @patch('donations.speech.urlopen')
    def test_daily_quota_has_clear_message_and_provider_retry_header(self, outbound):
        payload = {'error': {'message': 'private provider detail test-key', 'details': [
            {'@type': 'type.googleapis.com/google.rpc.QuotaFailure', 'violations': [
                {'quotaId': 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', 'quotaValue': '20'}]},
            {'@type': 'type.googleapis.com/google.rpc.RetryInfo', 'retryDelay': '76761s'}]}}
        outbound.side_effect = HTTPError('https://example.test', 429, 'test-key', {},
                                         io.BytesIO(json.dumps(payload).encode()))
        with self.assertRaises(SpeechServiceError) as caught:
            transcribe_audio(recording())
        response = exception_handler(caught.exception, {})
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response['Retry-After'], '76761')
        self.assertIn('daily reset', str(response.data))
        self.assertNotIn('test-key', str(response.data))
        outbound.assert_called_once()

    @override_settings(GEMINI_API_KEY='test-key')
    @patch('donations.speech.urlopen')
    def test_short_rate_limit_reports_wait_without_claiming_daily_exhaustion(self, outbound):
        payload = {'error': {'details': [
            {'@type': 'type.googleapis.com/google.rpc.RetryInfo', 'retryDelay': '12.3s'}]}}
        outbound.side_effect = HTTPError('https://example.test', 429, 'quota', {},
                                         io.BytesIO(json.dumps(payload).encode()))
        with self.assertRaises(SpeechServiceError) as caught:
            transcribe_audio(recording())
        self.assertIn('Wait 13 seconds', str(caught.exception))
        self.assertNotIn('daily', str(caught.exception))

    @override_settings(GEMINI_API_KEY='test-key')
    @patch('donations.speech.urlopen')
    def test_malformed_quota_metadata_has_safe_fallback(self, outbound):
        for body in [b'private test-key', b'[]', b'{"error":null}',
                     b'{"error":{"details":[null,{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"999999s"}]}}']:
            with self.subTest(body=body):
                outbound.side_effect = HTTPError('https://example.test', 429, 'quota', {}, io.BytesIO(body))
                with self.assertRaises(SpeechServiceError) as caught:
                    transcribe_audio(recording())
                self.assertEqual(caught.exception.status_code, 429)
                self.assertIn('usage limit', str(caught.exception))
                self.assertNotIn('test-key', str(caught.exception))
                self.assertIsNone(caught.exception.wait)

    def test_explicit_mixed_transcript_overrides_incorrect_provider_status(self):
        for text in ['I want to donate two books and three blankets in Guntur.',
                     'Donate 2 notebooks, 3 t-shirts.',
                     'Donate five kilograms of rice and two shirts.']:
            with self.subTest(text=text):
                result = normalize_donation_speech({'text': text, 'status': 'recognized',
                    'fields': {'itemId': 'book', 'quantity': '2', 'city': 'Guntur'}})
                self.assertEqual(result['fields'], {'itemId': '', 'quantity': '', 'city': 'Guntur'})
                self.assertIn('one item type', result['warnings'][0])

    def test_counted_list_guard_preserves_corrections_addresses_and_one_item_type(self):
        for text in ['Donate two books and three books in Guntur.',
                     'Donate two books, sorry, three blankets in Guntur.',
                     'Donate three shirts. Pickup at 2 Book Street.',
                     'Donate twenty five t-shirts in Guntur.']:
            with self.subTest(text=text):
                result = normalize_donation_speech({'text': text, 'status': 'recognized',
                    'fields': {'itemId': 'shirt', 'quantity': '3'}})
                self.assertEqual(result['fields'], {'itemId': 'shirt', 'quantity': '3'})
                self.assertEqual(result['warnings'], [])

    def test_complete_donation_fields_and_partial_followup(self):
        fields = {'itemId':'shirt', 'quantity':'3', 'address':'12 Main Road', 'city':'Guntur',
                  'state':'Andhra Pradesh', 'pincode':'522001', 'notes':'New shirts'}
        result = normalize_donation_speech({'text':'Three shirts at 12 Main Road, Guntur, Andhra Pradesh 522001. New shirts.',
                                           'status':'recognized', 'fields':fields})
        self.assertEqual(result['fields'], fields)
        self.assertEqual(result['warnings'], [])
        partial = normalize_donation_speech({'text':'My city is Hyderabad.', 'status':'partial',
                                             'fields':{'itemId':'', 'quantity':'', 'city':'Hyderabad', 'pincode':''}})
        self.assertEqual(partial['fields'], {'city':'Hyderabad'})

    def test_mixed_and_unsupported_items_cannot_reuse_a_previous_item_or_quantity(self):
        for status in ['mixed', 'unsupported']:
            result = normalize_donation_speech({'text':'Two books and five shirts.', 'status':status,
                                                'fields':{'itemId':'book','quantity':'2','city':'Guntur'}})
            self.assertEqual(result['fields'], {'itemId':'','quantity':'','city':'Guntur'})
            self.assertTrue(result['warnings'])

    def test_donation_values_are_bounded_and_not_rounded(self):
        for quantity in ['2.5','0','-3','1000001','three','nan','1e2']:
            result = normalize_donation_speech({'text':'Donation details', 'status':'recognized',
                                               'fields':{'itemId':'rice','quantity':quantity,'pincode':'000000'}})
            self.assertEqual(result['fields']['quantity'], '')
            self.assertEqual(result['fields']['pincode'], '')
            self.assertTrue(result['warnings'])
        result = normalize_donation_speech({'text':'Unknown item', 'status':'recognized',
                                           'fields':{'itemId':'not-in-catalog','quantity':'2','city':'x'*101}})
        self.assertEqual(result['fields'], {'itemId':'','quantity':''})
        self.assertTrue(result['warnings'])

    def test_silence_never_returns_invented_fields(self):
        result = normalize_donation_speech({'text':'', 'status':'recognized', 'fields':{'itemId':'book','quantity':'1'}})
        self.assertEqual(result, {'text':'','fields':{},'warnings':[]})
        self.assertFalse(SpeechInput(data={'audio':recording(), 'mode':'untrusted-mode'}).is_valid())

    @override_settings(GEMINI_API_KEY='test-key', GEMINI_SPEECH_MODEL='gemini-2.5-flash')
    @patch('donations.speech.urlopen')
    def test_donation_mode_requests_structured_fields_and_returns_validated_result(self, outbound):
        raw = {'text':'I live at number 12. Donate three shirts in Guntur.', 'status':'recognized',
               'fields':{'itemId':'shirt','quantity':'3','address':'12','city':'Guntur'}}
        response = MagicMock()
        response.read.return_value = json.dumps({'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':json.dumps(raw)}]}}]}).encode()
        outbound.return_value.__enter__.return_value = response
        self.assertEqual(transcribe_audio(recording(), mode='donation')['fields']['quantity'], '3')
        sent = json.loads(outbound.call_args.args[0].data)
        self.assertIn('fields', sent['generationConfig']['responseSchema']['required'])
        self.assertIn('pincode', sent['generationConfig']['responseSchema']['properties']['fields']['properties'])
        self.assertIn('Never use a house number', sent['contents'][0]['parts'][0]['text'])

    def test_bounded_pcm_audio_only(self):
        self.assertTrue(SpeechInput(data={'audio': recording()}).is_valid())
        for value in ['bad base64', base64.b64encode(b'not audio').decode(), recording(.1), recording(21), recording(1,8000)]:
            self.assertFalse(SpeechInput(data={'audio': value}).is_valid())

    @override_settings(GEMINI_API_KEY='test-key', GEMINI_SPEECH_MODEL='gemini-2.5-flash')
    @patch('donations.speech.urlopen')
    def test_transcribes_without_changing_names_or_quantities(self, outbound):
        response = MagicMock()
        response.read.return_value = json.dumps({'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':json.dumps({'text':'Three backpacks in Guntur.'})}]}}]}).encode()
        outbound.return_value.__enter__.return_value = response
        self.assertEqual(transcribe_audio(recording()), {'text':'Three backpacks in Guntur.'})
        sent = outbound.call_args.args[0]
        self.assertNotIn('test-key', sent.full_url)
        self.assertEqual(json.loads(sent.data)['contents'][0]['parts'][1]['inlineData']['mimeType'], 'audio/wav')

    @override_settings(GEMINI_API_KEY='test-key', GEMINI_MODEL='photo-model-must-not-be-used')
    @patch('donations.speech.urlopen')
    def test_speech_model_selects_endpoint_and_compatible_thinking_settings(self, outbound):
        response = MagicMock()
        response.read.return_value = json.dumps({'candidates': [{'finishReason': 'STOP',
            'content': {'parts': [{'text': json.dumps({'text': 'Three shirts.'})}]}}]}).encode()
        outbound.return_value.__enter__.return_value = response
        for model, thinking in [('gemini-2.5-flash', {'thinkingBudget': 0}),
                                ('gemini-3.1-flash-lite', {'thinkingLevel': 'low'})]:
            with self.subTest(model=model), override_settings(GEMINI_SPEECH_MODEL=model):
                self.assertEqual(transcribe_audio(recording()), {'text': 'Three shirts.'})
                sent = outbound.call_args.args[0]
                self.assertEqual(sent.full_url,
                    f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent')
                self.assertEqual(json.loads(sent.data)['generationConfig']['thinkingConfig'], thinking)

    @override_settings(GEMINI_API_KEY='test-key')
    @patch('donations.speech.urlopen')
    def test_errors_do_not_leak_provider_details(self, outbound):
        for status in [400,401,429,500]:
            outbound.side_effect = HTTPError('https://example.test',status,'test-key',{},None)
            with self.assertRaises(SpeechServiceError) as error:
                transcribe_audio(recording())
            self.assertNotIn('test-key', str(error.exception))

    @override_settings(GEMINI_API_KEY='')
    def test_missing_configuration(self):
        with self.assertRaises(SpeechServiceError):
            transcribe_audio(recording())

    @override_settings(GEMINI_API_KEY='test-key')
    @patch('donations.speech.urlopen')
    def test_network_failure_is_actionable_without_leaking_details(self, outbound):
        outbound.side_effect = URLError(PermissionError(13, 'private request test-key'))
        with self.assertLogs('donations.speech', level='WARNING') as logs:
            with self.assertRaises(SpeechServiceError) as error:
                transcribe_audio(recording())
        self.assertIn('server could not connect', str(error.exception))
        self.assertIn('PermissionError', ' '.join(logs.output))
        self.assertNotIn('test-key', str(error.exception) + ' '.join(logs.output))

    @override_settings(GEMINI_API_KEY='test-key')
    @patch('donations.speech.urlopen', side_effect=TimeoutError('private request test-key'))
    def test_timeout_has_a_specific_message(self, outbound):
        with self.assertRaises(SpeechServiceError) as error:
            transcribe_audio(recording())
        self.assertIn('took too long', str(error.exception))
        self.assertNotIn('test-key', str(error.exception))

    @patch('donations.speech.transcribe_audio', return_value={'text':'Four shirts.'})
    def test_only_active_donors_and_ngos_can_transcribe(self, service):
        for role, active in [('admin',True),('ngo',False),('donor',False)]:
            request = SimpleNamespace(user=SimpleNamespace(is_authenticated=True,can_login=active,role=role), data={'audio':recording()})
            with self.assertRaises(PermissionDenied):
                SpeechTranscriptionView().post(request)
        service.assert_not_called()
        for role in ['donor','ngo']:
            request = SimpleNamespace(user=SimpleNamespace(is_authenticated=True,can_login=True,role=role), data={'audio':recording()})
            self.assertEqual(SpeechTranscriptionView().post(request).data,{'text':'Four shirts.'})

    @patch('donations.speech.transcribe_audio', return_value={'text': 'Four shirts.'})
    def test_registered_speech_url_accepts_donor_and_ngo_recordings(self, service):
        from django.urls import resolve
        from rest_framework.test import APIRequestFactory, force_authenticate
        from django.core.cache import cache
        route = resolve('/api/speech/transcribe/')
        self.assertIs(route.func.cls, SpeechTranscriptionView)
        for role in ['donor', 'ngo']:
            cache.clear()
            request = APIRequestFactory().post('/api/speech/transcribe/', {'audio': recording()}, format='json')
            force_authenticate(request, user=SimpleNamespace(is_authenticated=True, can_login=True, role=role, pk=12345))
            response = route.func(request)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data, {'text': 'Four shirts.'})
        self.assertEqual(service.call_count, 2)

    def test_registered_speech_url_returns_json_for_unsigned_requests(self):
        response = self.client.post('/api/speech/transcribe/', data={'audio': recording()}, content_type='application/json')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response['Content-Type'], 'application/json')
