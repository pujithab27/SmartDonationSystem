r"""Check the approval workflow through a running Next.js proxy.

Run from backend: .\.venv\Scripts\python.exe scripts/smoke_http.py http://localhost:3000
Both servers must use the database configured in this process.
Creates random test accounts and removes only those accounts afterward.
"""
import http.cookiejar
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
from donations.models import Activity, User, LoginEvent

origin = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000").rstrip("/")
suffix = secrets.token_hex(8)
password = secrets.token_urlsafe(24)
emails = [f"http-{role}-{suffix}@example.test" for role in ["admin", "donor", "ngo"]]
ngo_name = f"HTTP Foundation {suffix}"


def browser():
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def call(client, path, method="GET", body=None, csrf=True):
    headers = {"Accept": "application/json", "Origin": origin}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if method != "GET" and csrf:
        _, token = call(client, "auth/csrf/")
        headers["X-CSRFToken"] = token["csrfToken"]
    request = urllib.request.Request(origin + "/api/" + path, data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method)
    try:
        response = client.open(request, timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, json.load(response)


try:
    administrator = User.objects.create_superuser(emails[0], password)
    admin_client = browser()
    assert call(admin_client, "health/")[1]["database"] == "connected"
    assert call(admin_client, "auth/login/", "POST", {}, csrf=False)[0] == 403
    assert call(admin_client, "auth/login/", "POST", {"role": "admin", "email": emails[0], "password": password})[0] == 200
    for role, email in zip(["donor", "ngo"], emails[1:]):
        applicant = browser()
        fields = {"role": role, "email": email, "password": password, "confirmPassword": password, "agree": True,
                  "phone": "9876543210", "address": "Sample street", "city": "Hyderabad", "state": "Telangana", "pincode": "500001"}
        fields.update({"firstName": "HTTP", "lastName": "Check"} if role == "donor" else {"ngoName": ngo_name, "registrationNumber": suffix, "description": "Local approval workflow check."})
        status, payload = call(applicant, "auth/signup/", "POST", fields)
        assert status == 201 and payload["session"] is None, (status, payload)
        user = User.objects.get(email=email)
        assert user.check_password(password)
        assert call(applicant, "auth/me/")[0] == 403
        assert call(applicant, "auth/signup/", "POST", fields)[0] == 400
        credentials = {"role": role, "email": email, "password": password}
        assert call(applicant, "auth/login/", "POST", credentials)[0] == 403
        assert call(applicant, "auth/login/", "POST", {**credentials, "password": "wrong"})[0] == 401
        review_path = f"accounts/{user.pk}/review/"
        assert call(admin_client, review_path, "POST", {"action": "Approved", "version": 0})[0] == 200
        assert call(applicant, "auth/login/", "POST", credentials)[0] == 200
        assert call(applicant, "auth/me/")[1]["session"]["email"] == email
        assert call(admin_client, review_path, "POST", {"action": "Deactivated", "reason": "HTTP verification", "version": 1})[0] == 200
        assert call(applicant, "auth/me/")[0] == 403
        assert call(applicant, "auth/login/", "POST", credentials)[0] == 401
        assert call(admin_client, review_path, "POST", {"action": "Activated", "version": 2})[0] == 200
        assert call(applicant, "auth/login/", "POST", credentials)[0] == 200
        assert call(applicant, "auth/logout/", "POST", {})[0] == 200
        assert call(applicant, "state/")[1]["session"] is None
    print("HTTP smoke passed for donors and NGOs: proxy, CSRF, pending signup, blocked login, admin approval, successful login, access pause, session revocation, reactivation, and logout.")
finally:
    LoginEvent.objects.filter(email__in=emails).delete()
    Activity.objects.filter(message=f"NGO registration awaiting review: {ngo_name}").delete()
    User.objects.filter(email__in=emails).delete()
