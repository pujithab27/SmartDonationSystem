"""Live photo path: Next proxy -> authenticated Django view -> Gemini."""
import base64
import http.cookiejar
import io
import json
import urllib.request
from urllib.parse import urlparse
from pathlib import Path
from uuid import uuid4
from PIL import Image

root = Path(__file__).resolve().parents[2]
fixture = json.loads((root / 'output/qa-private/accounts.json').read_text())
origin = fixture['origin']
assert urlparse(origin).hostname in ['localhost', '127.0.0.1']
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
scope, token = uuid4().hex, ''


def call(path, body=None):
    global token
    headers = {'Origin': origin, 'X-Session-Scope': scope}
    if body is not None:
        headers.update({'Content-Type': 'application/json', 'X-CSRFToken': token})
    request = urllib.request.Request(origin + '/api/' + path, headers=headers, data=json.dumps(body).encode() if body is not None else None)
    with opener.open(request, timeout=45) as response:
        result = json.load(response)
    if isinstance(result, dict) and result.get('csrfToken'):
        token = result['csrfToken']
    return result


call('auth/csrf/')
account = fixture['accounts']['donor']
call('auth/login/', {'email': account['email'], 'password': account['password'], 'role': 'donor'})
results = []
try:
    for name, filename, crop, status in [
        ('unrelated landscape', 'environment.jpg', None, 'unsupported'),
        ('mixed donation items', 'education.jpg', None, 'mixed'),
        ('four books', 'education.jpg', (85, 505, 635, 785), 'recognized'),
    ]:
        picture = Image.open(root / 'frontend/public/images' / filename).convert('RGB')
        if crop:
            picture = picture.crop(crop)
        buffer = io.BytesIO()
        picture.save(buffer, format='JPEG', quality=90)
        result = call('item-donations/analyse-photo/', {'image': 'data:image/jpeg;base64,' + base64.b64encode(buffer.getvalue()).decode()})
        assert result['status'] == status, (name, result)
        if status == 'recognized':
            assert (result['itemId'], result['category'], result['quantity']) == ('book', 'Education', 4), result
        else:
            assert result['itemId'] == '' and result['quantity'] is None and result['warning']
        print('PASS:', name, result['status'], result['quantity'], flush=True)
        results.append({'case': name, 'result': result})
finally:
    call('auth/logout/', {})
(root / 'output/qa-private/photo-api-live.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
