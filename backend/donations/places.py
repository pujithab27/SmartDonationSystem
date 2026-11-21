"""Small, cached, user-triggered map lookups; providers can be changed in settings."""
import hashlib
import json
import math
import threading
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import URLError
from django.conf import settings
from django.core.cache import cache
from rest_framework import serializers
from rest_framework.exceptions import APIException, Throttled
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.throttling import UserRateThrottle
from .serializers import StrictSerializer
from .views import BaseView

geocode_lock = threading.Lock()
last_geocode = 0.0


class MapUnavailable(APIException):
    status_code = 503
    default_detail = 'Map search is temporarily unavailable. Please try again in a moment.'


class MapThrottle(UserRateThrottle):
    rate = '12/minute'


def get_json(url, body=None):
    request = Request(url, data=body, headers={'User-Agent': 'SmartDonationSystem/1.0 (local community donation app)', 'Accept': 'application/json', **({'Content-Type': 'application/x-www-form-urlencoded'} if body else {})})
    try:
        with urlopen(request, timeout=9) as response:
            raw = response.read(2_000_001)
        if len(raw) > 2_000_000:
            raise ValueError()
        return json.loads(raw)
    except (URLError, OSError, ValueError, TimeoutError):
        raise MapUnavailable()


def geocode(url, params):
    global last_geocode
    with geocode_lock:
        delay = 1.1 - (time.monotonic() - last_geocode)
        if delay > 0:
            time.sleep(delay)
        last_geocode = time.monotonic()
        return get_json(url + '?' + urlencode(params))


def location_details(row):
    address = row.get('address') or {}
    if not isinstance(address, dict):
        raise MapUnavailable()
    street = ' '.join(str(address.get(key, '')) for key in ['house_number', 'road']).strip()
    parts = [row.get('name', ''), street, address.get('neighbourhood', ''), address.get('suburb', '')]
    city = next((address[key] for key in ['city', 'town', 'village', 'municipality', 'city_district', 'county'] if address.get(key)), '')
    return {'address': ', '.join(dict.fromkeys(str(part) for part in parts if part))[:300] or str(row.get('display_name', ''))[:300],
            'city': str(city)[:100], 'state': str(address.get('state', ''))[:100],
            'pincode': str(address.get('postcode', '')).replace(' ', '')}


class Coordinates(StrictSerializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)

    def validate(self, attrs):
        if not all(math.isfinite(value) for value in attrs.values()):
            raise serializers.ValidationError('Enter a valid location.')
        return attrs


class PlaceReverseView(BaseView):
    permission_classes = [AllowAny]
    throttle_classes = [MapThrottle]

    def get(self, request):
        serializer = Coordinates(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        lat, lon = (round(serializer.validated_data[key], 6) for key in ['lat', 'lon'])
        key = f'map-reverse:{lat}:{lon}'
        result = cache.get(key)
        if result is None:
            row = geocode(settings.MAP_REVERSE_GEOCODER_URL, {'lat': lat, 'lon': lon, 'format': 'jsonv2', 'addressdetails': 1, 'zoom': 18, 'accept-language': 'en'})
            if not isinstance(row, dict) or not row.get('display_name'):
                raise MapUnavailable('No address was found here. Search for a nearby road or select another point.')
            result = {'lat': lat, 'lon': lon, 'name': row['display_name'], 'fields': location_details(row)}
            cache.set(key, result, 86400)
        return Response(result)


class PlaceSearchView(BaseView):
    permission_classes = [AllowAny]
    throttle_classes = [MapThrottle]

    def get(self, request):
        class Input(StrictSerializer):
            q = serializers.CharField(min_length=3, max_length=120)
        serializer = Input(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        query = serializer.validated_data['q']
        key = 'map-search-v2-' + hashlib.sha256(query.casefold().encode()).hexdigest()
        result = cache.get(key)
        if result is None:
            rows = geocode(settings.MAP_GEOCODER_URL, {'q': query, 'format': 'jsonv2', 'limit': 5, 'addressdetails': 1, 'accept-language': 'en'})
            if not isinstance(rows, list):
                raise MapUnavailable()
            try:
                result = [{'id': str(row.get('place_id', index)), 'name': row['display_name'], 'lat': float(row['lat']), 'lon': float(row['lon']), 'fields': location_details(row)} for index, row in enumerate(rows) if isinstance(row, dict) and all(key in row for key in ['display_name', 'lat', 'lon'])]
                if any(not math.isfinite(row['lat']) or not math.isfinite(row['lon']) or abs(row['lat']) > 90 or abs(row['lon']) > 180 for row in result):
                    raise ValueError()
            except (ValueError, TypeError):
                raise MapUnavailable()
            cache.set(key, result, 86400)
        return Response(result)


class NearbyServicesView(BaseView):
    throttle_classes = [MapThrottle]

    def get(self, request):
        class Input(StrictSerializer):
            lat = serializers.FloatField(min_value=-90, max_value=90)
            lon = serializers.FloatField(min_value=-180, max_value=180)

            def validate(self, attrs):
                if not all(math.isfinite(value) for value in attrs.values()):
                    raise serializers.ValidationError('Enter a valid location.')
                return attrs
        serializer = Input(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        lat, lon = (round(serializer.validated_data[key], 4) for key in ['lat', 'lon'])
        key = f'nearby-services:{lat}:{lon}'
        result = cache.get(key)
        if result is None:
            query = f'[out:json][timeout:7];nwr(around:5000,{lat},{lon})[amenity~"^(hospital|clinic|pharmacy|doctors)$"];out center tags 120;'
            payload = get_json(settings.MAP_OVERPASS_URL, urlencode({'data': query}).encode())
            if not isinstance(payload, dict) or 'elements' not in payload:
                raise MapUnavailable()
            result = []
            for entry in payload['elements']:
                tags, center = entry.get('tags', {}), entry.get('center', entry)
                if 'lat' not in center or 'lon' not in center:
                    continue
                result.append({'id': f"{entry['type']}/{entry['id']}", 'name': tags.get('name', tags.get('amenity', 'Health service').title()),
                    'type': tags.get('amenity', ''), 'lat': center['lat'], 'lon': center['lon'],
                    'address': ', '.join(tags[key] for key in ['addr:street', 'addr:suburb', 'addr:city'] if tags.get(key)),
                    'hours': tags.get('opening_hours', ''), 'emergency': tags.get('emergency') == 'yes'})
            cache.set(key, result, 900)
        return Response({'center': {'lat': lat, 'lon': lon}, 'places': result, 'radiusKm': 5, 'limit': 120})


class SuggestThrottle(UserRateThrottle):
    scope = 'map_suggest'
    rate = '40/minute'


class PlaceSuggestView(BaseView):
    permission_classes = [AllowAny]
    throttle_classes = [SuggestThrottle]

    def get(self, request):
        class Input(StrictSerializer):
            q = serializers.CharField(min_length=3, max_length=120)
        serializer = Input(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        # This service indexes towns/localities, not street addresses.
        query = serializer.validated_data['q'].split(',')[0].strip()
        query = {'bhm': 'Bhimavaram', 'kompally': 'Kompalli'}.get(query.casefold(), query)
        key = 'map-localities-v1-' + hashlib.sha256(query.casefold().encode()).hexdigest()
        result = cache.get(key)
        if result is None:
            payload = get_json('https://geocoding-api.open-meteo.com/v1/search?' + urlencode({'name': query, 'count': 8, 'language': 'en', 'countryCode': 'IN'}))
            try:
                rows = payload.get('results', [])
                if not isinstance(rows, list):
                    raise ValueError()
                result = []
                for row in rows[:8]:
                    lat, lon = float(row['latitude']), float(row['longitude'])
                    if not math.isfinite(lat) or not math.isfinite(lon) or abs(lat) > 90 or abs(lon) > 180:
                        raise ValueError()
                    label = str(row['name'])
                    detail = ', '.join(dict.fromkeys(str(row[k]) for k in ['admin3', 'admin2', 'admin1', 'country'] if row.get(k)))
                    result.append({'id': str(row['id']), 'label': label, 'detail': detail,
                                   'name': label + ', ' + detail, 'lat': lat, 'lon': lon,
                                   'fields': {'address': label, 'city': label, 'state': str(row.get('admin1', '')), 'pincode': ''}})
            except (AttributeError, KeyError, TypeError, ValueError):
                raise MapUnavailable()
            cache.set(key, result, 86400)
        return Response(result)
