"""Create labelled sample accounts through the live signup and approval API.

Run from backend while both servers are running:
    .venv/Scripts/python.exe scripts/prepare_exchange_qa.py
Only the new QA administrator is disabled after setup. Existing data is untouched.
Credentials are written to the ignored output/qa-private directory.
"""
import base64
import http.cookiejar
import io
import json
import os
from pathlib import Path
import secrets
import sys
import urllib.error
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django
django.setup()
from donations.models import User
from PIL import Image, ImageDraw

origin = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000").rstrip("/")
suffix = secrets.token_hex(4)
password = secrets.token_urlsafe(20)
output = Path(__file__).resolve().parents[2] / "output" / "qa-private"
output.mkdir(parents=True, exist_ok=True)

def client():
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

def call(browser, path, method="GET", body=None, expected=200):
    headers = {"Accept": "application/json", "Origin": origin}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if method != "GET":
        headers["X-CSRFToken"] = call(browser, "auth/csrf/")["csrfToken"]
    req = urllib.request.Request(origin + "/api/" + path, headers=headers, method=method,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        response = browser.open(req, timeout=60)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        payload = json.load(response)
        assert response.status == expected, (path, response.status, payload)
        return payload

administrator = User.objects.create_superuser(f"qa-admin-{suffix}@example.test", password)
accounts = {}
try:
    admin = client()
    assert call(admin, "health/")["database"] == "connected"
    call(admin, "auth/login/", "POST", {"role": "admin", "email": administrator.email, "password": password})
    for role in ["donor", "ngo"]:
        email = f"qa-{role}-{suffix}@example.test"
        fields = {"role": role, "email": email, "password": password, "confirmPassword": password,
                  "agree": True, "phone": "9876543210", "address": f"QA sample {role} address",
                  "city": "Hyderabad", "state": "Telangana", "pincode": "500001"}
        fields.update({"firstName": "QA", "lastName": "Donor"} if role == "donor" else {
            "ngoName": f"QA Community Kitchen {suffix}", "registrationNumber": f"QA-{suffix}",
            "description": "Synthetic test organization for donation workflow verification."})
        applicant = client()
        signup = call(applicant, "auth/signup/", "POST", fields, 201)
        assert signup["session"] is None
        credentials = {"role": role, "email": email, "password": password}
        call(applicant, "auth/login/", "POST", credentials, 403)
        user = User.objects.get(email=email)
        call(admin, f"accounts/{user.pk}/review/", "POST", {"action": "Approved", "version": user.access_version})
        assert call(applicant, "auth/login/", "POST", credentials)["session"]["email"] == email
        call(applicant, "auth/logout/", "POST", {})
        accounts[role] = {**credentials, "fields": fields}
        print(f"PASS: {role} signup, pending login block, admin approval, login and logout")
    image = Image.new("RGB", (240, 140), "#dbeafe")
    ImageDraw.Draw(image).text((16, 60), "QA SAMPLE - RICE DELIVERY", fill="#1e3a8a")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    (output / "proof.png").write_bytes(buffer.getvalue())
    fixture = {"origin": origin, "suffix": suffix, "accounts": accounts,
               "proof": "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()}
    (output / "accounts.json").write_text(json.dumps(fixture, indent=2), encoding="utf-8")
    print(f"Sample account credentials: {output / 'accounts.json'}")
finally:
    administrator.is_active = False
    administrator.set_unusable_password()
    administrator.save(update_fields=["is_active", "password"])
