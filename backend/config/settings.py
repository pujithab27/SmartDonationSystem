import os
from pathlib import Path
from django.core.management.utils import get_random_secret_key

BASE_DIR = Path(__file__).resolve().parent.parent
# Only these server-side AI settings are read from the ignored local file.
# Real environment variables take precedence in deployed environments.
_ai_local = {}
if (BASE_DIR / '.env').exists():
    for _line in (BASE_DIR / '.env').read_text(encoding='utf-8-sig').splitlines():
        _name, _sep, _value = _line.partition('=')
        if _sep and _name.strip() in {'GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_SPEECH_MODEL'}:
            _ai_local[_name.strip()] = _value.strip().strip('\"\'')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', _ai_local.get('GEMINI_API_KEY', ''))
GEMINI_MODEL = os.getenv('GEMINI_MODEL', _ai_local.get('GEMINI_MODEL', 'gemini-2.5-flash'))
GEMINI_SPEECH_MODEL = os.getenv('GEMINI_SPEECH_MODEL', _ai_local.get('GEMINI_SPEECH_MODEL', 'gemini-3.1-flash-lite'))
DEBUG = os.getenv("DJANGO_DEBUG", "true").lower() == "true"
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if not DEBUG:
        raise RuntimeError("Set DJANGO_SECRET_KEY when DJANGO_DEBUG=false.")
    key_file = BASE_DIR / ".django-secret-key"
    if not key_file.exists():
        try:
            with key_file.open("x", encoding="utf-8") as handle:
                handle.write(get_random_secret_key())
        except FileExistsError:
            pass
    SECRET_KEY = key_file.read_text(encoding="utf-8").strip()

ALLOWED_HOSTS = os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,[::1]").split(",")
CSRF_TRUSTED_ORIGINS = os.getenv(
    "DJANGO_CSRF_TRUSTED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001",
).split(",")
INSTALLED_APPS = [
    "django.contrib.admin", "django.contrib.auth", "django.contrib.contenttypes",
    "django.contrib.sessions", "django.contrib.messages", "django.contrib.staticfiles",
    "rest_framework", "donations",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "donations.middleware.SessionScopeMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates", "DIRS": [],
    "APP_DIRS": True, "OPTIONS": {"context_processors": [
        "django.template.context_processors.request", "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages",
    ]},
}]
DATABASES = {"default": {
    "ENGINE": "django.db.backends.sqlite3",
    "NAME": os.getenv("DJANGO_DB_PATH", str(BASE_DIR.parent / "db" / "db.sqlite3")),
    "OPTIONS": {"timeout": 20, "transaction_mode": "IMMEDIATE"},
}}
AUTH_USER_MODEL = "donations.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["donations.authentication.CsrfSessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"auth": "20/minute", "contact": "10/hour", "photo_analysis": "12/hour", "speech": "30/hour"},
    "COERCE_DECIMAL_TO_STRING": False,
}
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
SESSION_COOKIE_NAME = "allofus_sessionid"
CSRF_COOKIE_NAME = "allofus_csrftoken"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = 60 * 60 * 24
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_AGE = SESSION_COOKIE_AGE
SECURE_CONTENT_TYPE_NOSNIFF = True
DATA_UPLOAD_MAX_MEMORY_SIZE = 2_500_000

# User-triggered, low-volume local map lookups. Use a hosted provider for larger deployments.
MAP_GEOCODER_URL = os.getenv("MAP_GEOCODER_URL", "https://nominatim.openstreetmap.org/search")
MAP_REVERSE_GEOCODER_URL = os.getenv("MAP_REVERSE_GEOCODER_URL", "https://nominatim.openstreetmap.org/reverse")
MAP_OVERPASS_URL = os.getenv("MAP_OVERPASS_URL", "https://overpass-api.de/api/interpreter")
