"""Manual live Gemini smoke test with public site photos, never user uploads."""
import base64
import io
import json
import os
import sys
from pathlib import Path
from PIL import Image

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from donations.photo_analysis import analyse_photo

images = BASE.parent / 'frontend/public/images'
cases = [('unsupported-landscape', 'environment.jpg', None), ('mixed-school-items', 'education.jpg', None), ('four-books', 'education.jpg', (85, 505, 635, 785))]
results = []
for label, filename, crop in cases:
    picture = Image.open(images / filename).convert('RGB')
    if crop:
        picture = picture.crop(crop)
    buffer = io.BytesIO()
    picture.save(buffer, format='JPEG', quality=90)
    encoded = 'data:image/jpeg;base64,' + base64.b64encode(buffer.getvalue()).decode()
    try:
        result = analyse_photo(encoded)
        results.append({'case': label, 'result': result})
        print(label, json.dumps(result), flush=True)
    except Exception as error:
        # The service exception is sanitized; do not print request objects.
        results.append({'case': label, 'error': str(error)})
        print(label, str(error), flush=True)
        break
target = BASE.parent / 'output/qa-private/photo-ai-live.json'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(results, indent=2), encoding='utf-8')
