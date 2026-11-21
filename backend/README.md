# Django REST API

## Photo recognition and item management (3 November 2026)

Set `GEMINI_API_KEY` and optionally `GEMINI_MODEL` in the backend environment or ignored `backend/.env` (see `.env.example`). The server calls Gemini; the browser never receives the key. `POST /api/item-donations/analyse-photo/` requires an approved donor session, CSRF, a validated image, and is limited to 12 calls per hour per user. The response contains an editable catalog item/category suggestion, a quantity when readable, or an unsupported/unclear/mixed warning. Weights and volumes require a readable package label; arbitrary model item names and invalid quantities are rejected. Provider failures leave manual entry available. Do not include `.env` in uploads or builds.

Before an NGO confirms receipt, it can send the received-item photo to `POST /api/matches/<id>/check-receipt-photo/`. The endpoint compares it with the donor's photo when available and the matched catalog item, and returns match, mismatch or unclear for human review. It requires the NGO on that match, CSRF and a validated image; it shares the 12/hour photo-analysis limit. The NGO must review the photo and attest that it matches before the delivery can be completed. Receipt photos are stored only when the NGO confirms delivery.

Item donations require `address`, `city`, `state` and a six-digit `pincode`. Matches copy that address for pickup review. Donors may PATCH or DELETE their own unused item donations with the current `version`. NGOs may DELETE their own unused item requests with the current `version`; existing request editing remains available. Records with match/receipt history cannot be deleted, and matched donor offers cannot be rewritten. Close requests or cancel active matches using the existing actions. Run migrations 0006 and 0007 before serving the updated UI.

`scripts/check_photo_ai.py` tests Gemini directly with public site photos. With the servers running and fresh QA accounts prepared, `scripts/check_photo_api_live.py` tests the entire authenticated proxy/API/Gemini path. These are explicit live checks, not part of offline unit tests.

Provider references: [Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding) and [generateContent API](https://ai.google.dev/api/generate-content).

See [project setup](../README.md) for installation, server commands, and administrator creation.

### Voice service connection troubleshooting

If voice or photo comparison reports a usage limit, check the project's [Gemini rate-limit dashboard](https://aistudio.google.com/rate-limit). On 4 November 2026, the configured project returned `GenerateRequestsPerDayPerProjectPerModel-FreeTier` with `quotaValue: 20`. This is an observed account quota, not a universal Gemini limit. Photo analysis and receipt comparison share the photo model quota. Speech uses Gemini 3.1 Flash Lite and its model quota. The app's separate 12/hour photo and 30/hour speech limits do not increase the provider allowance. Live QA calls also consume it.

Provider quota errors return HTTP 429. Structured daily-quota failures show a daily-reset message; short rate limits show the provider's suggested wait. A validated retry delay is returned as `Retry-After`. Provider error bodies and credentials are never exposed. The app does not automatically retry exhausted requests or change billing. Manual typing remains available. Use mocked tests while the quota is exhausted.

Voice transcription uses `GEMINI_API_KEY` and `GEMINI_SPEECH_MODEL` (default `gemini-3.1-flash-lite`), read from the environment or ignored `backend/.env`. `GEMINI_MODEL` controls photo recognition separately. Restart the backend after changing these settings. Requests use the model-specific thinking configuration described in [Google's thinking configuration documentation](https://ai.google.dev/gemini-api/docs/generate-content/thinking).

The running Django process needs outbound HTTPS access to `generativelanguage.googleapis.com` for voice and photo recognition. A backend started in a restricted agent sandbox may serve local API requests while all Gemini requests fail. In particular, `Speech provider connection failed: type=PermissionError errno=13 winerror=10013` indicates a blocked network connection. Stop that restricted backend and start it from a normal local terminal (from `backend`: `.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000`), or start it with approved network access. Do not disable the Windows firewall. Confirm through the frontend's `VOICE_TEST_FULL_API=1` test, which uses the actual running backend. The voice logs record failure type/status only, never keys, recordings or transcripts.

The API accepts JSON. Field names match the existing UI (`firstName`, `ngoName`, `campaignId`, etc.). All responses disable caching. Money is stored as decimal values in the database.

## Session authentication

1. `GET /api/auth/csrf/` to receive a CSRF cookie and `csrfToken` in JSON.
2. Include cookies and `X-CSRFToken: <token>` with every POST/PATCH.
3. `POST /api/auth/signup/` creates a pending account without a login session. After approval, `POST /api/auth/login/` creates an HttpOnly session cookie and returns a rotated `csrfToken`.
4. Use the rotated token for subsequent writes. The frontend handles this automatically.
5. `POST /api/auth/logout/` invalidates the server session.

The browser frontend includes `X-Session-Scope`, a random 32-character lowercase hexadecimal selector saved in that tab's `sessionStorage`, on every request. `SessionScopeMiddleware` selects `allofus_sessionid_<scope>` and `allofus_csrftoken_<scope>` before Django processes sessions and CSRF, and preserves cookie flags on the response. A new sign-in creates a fresh scope; selecting a scope alone grants no access without its valid session cookie. An unknown scope never inherits an unscoped or different scope's login. Invalid selectors return 400. Responses vary by cookie and scope and remain uncached.

Requests without this header retain standard Django cookies for direct API clients and Django admin. The middleware does not change global settings per request. Account revocation and CSRF enforcement remain in place; logout is CSRF-protected and idempotent for an expired session. Frontend callers capture the session context before asynchronous work, and ignore stale state responses during account transitions.

Login request:

```json
{"email":"your-email@example.com","password":"your password","role":"donor"}
```

Donor signup also requires `firstName`, `lastName`, `phone`, `address`, `city`, `state`, `pincode`, `confirmPassword`, and `agree: true`. NGO signup uses `ngoName`, `registrationNumber`, and `description` instead of the donor names; `website` is optional.

## Routes

| Method | `/api/` path | Access / purpose |
| --- | --- | --- |
| GET | `health/` | Database connectivity check |
| GET | `auth/csrf/` | CSRF initialization |
| POST | `auth/signup/` | Donor/NGO registration |
| POST | `auth/login/` | Email/password/role verification |
| POST | `auth/logout/` | Revoke current session |
| GET | `auth/me/` | Current user's safe profile |
| GET | `state/` | Read-only snapshot filtered by current identity for the UI |
| POST | `accounts/<id>/review/` | Admin; `{action, reason, version}`. Actions: Approved, Rejected, Activated, Deactivated. |
| POST | `accounts/approve/` | Admin; `{accounts: [{id, version}]}`; atomically approve 1-50 selected pending accounts. |
| GET, PATCH | `profile/` | Own profile; PATCH accepts the complete profile form |
| PATCH | `preferences/` | Own workspace preferences |
| GET | `ngos/` | Public verified NGOs; own NGO and all NGOs for admins |
| POST | `ngos/<email>/review/` | Admin; `{status, reason}` |
| GET, POST | `item-requests/` | Authenticated scoped list; approved, verified NGOs create item requests. |
| PATCH | `item-requests/<id>/` | Owning NGO edits the complete request or changes Open/Closed status; requires current `version`. |
| GET, POST | `campaigns/` | Scoped list; NGO creates Draft/Pending Approval campaigns |
| GET | `campaigns/<id>/` | Public or owned campaign; admins see all |
| POST | `campaigns/<id>/submit/` | Owning verified NGO submits draft/rejected campaign |
| POST | `campaigns/<id>/review/` | Admin; `{status, reason}` |
| POST | `campaigns/<id>/saved/` | Donor toggles a saved cause |
| GET, POST | `donations/` | Scoped list; donor records an idempotent pledge |
| GET | `donations/<id>/` | Donor's own receipt, receiving NGO, or admin |
| POST | `contacts/` | Store a contact message; inbox is admin-only |
| POST | `activities/<id>/resolve/` | Admin marks activity reviewed |

Invalid fields return 400, incorrect credentials return 401, forbidden/CSRF failures return 403, inaccessible objects return 404, stale account reviews/item request edits and reused donation references with different data return 409, and throttled requests return 429.

## Item requests

`GET state/` includes `data.itemCatalog` (50 canonical items with `id`, `name`, `category`, `unit`) and `data.itemRequests`. NGOs see their own requests, approved donors see open requests from approved active NGOs, and admins see all. Anonymous visitors receive an empty request list.

Create an item request with `POST item-requests/`:

```json
{
  "title": "Community kitchen essentials",
  "items": [{"itemId": "rice", "quantity": 25.5}, {"itemId": "utensils", "quantity": 10}],
  "deliveryAddress": "12 Community Road",
  "deliveryCity": "Hyderabad",
  "contactPhone": "+919876543210",
  "priority": "High",
  "deliveryState": "Telangana",
  "deliveryPincode": "500001",
  "notes": "Deliver between 10 am and 4 pm.",
  "neededBy": null
}
```

The server sets ownership and units. All request items and the receiving address save in one transaction. Empty, duplicate, unknown, or more than 50 items are rejected. Quantities must be positive and at most 1,000,000; kg/litre support two decimal places and other units require whole numbers. A new needed-by date cannot be in the past.

For editing, PATCH the complete form plus the current `version`. To close/reopen, PATCH only `{"status":"Closed","version":0}` or `{"status":"Open","version":1}` using the version actually returned by the API. Each successful update increments the version. Closing preserves the record but hides it from donors. Apply migration `0003_item_requests` before starting the updated server.

## Storage and authorization

The server determines ownership from `request.user`; callers cannot set another user's email as an owner or set privileged account flags. Password hashes and session keys never appear in API responses. The `state/` endpoint is not a writable database dump: public callers see no users, donations, messages, or activity. Signed-in callers see only their permitted records.

Campaign images are validated JPG/PNG/WebP data URLs up to 700 KB. Supporting PDF/JPG/PNG documents are limited to 700 KB and stored in a separate database table; only the owner/admin receives their contents. Image payloads are decoded and checked with Pillow, including a pixel limit. PDF headers are checked; this is not antivirus or independent document verification. Use sample documents in this educational deployment.

Sample funding balances and pledges are distinct concepts. `Campaign.raised` includes its illustrative opening balance plus accepted pledges. The Django admin is a trusted maintenance tool; use the frontend/API workflow for normal campaign approvals and pledge creation so workflow validation and totals remain consistent.

`LoginEvent` records outcomes, not submitted passwords. Django's `django_session` table stores the session lifecycle. `User.last_login` records the most recent successful sign-in. Credential verification does not verify ownership of an email inbox.

## References

- [DRF session authentication and CSRF](https://www.django-rest-framework.org/api-guide/authentication/#sessionauthentication)
- [Django custom users and password handling](https://docs.djangoproject.com/en/5.2/topics/auth/customizing/)

Account approval and access changes are recorded in `AccountReview`. `User.access_version` is included in the session authentication hash so reactivation cannot restore an old cookie. Rejected accounts disclose their review note only after correct credential and role verification. Admin state includes recent account decisions; public and non-admin state contains no account review history.


## Item-donation workflow

Migrations 0004 and 0005 add item offers, quantity reservations, delivery proof, tracking events, and notifications. Existing requests retain their quantities; request phones are populated from the NGO profile where available. New and edited request forms require a valid `contactPhone`.

| Method | `/api/` path | Purpose |
| --- | --- | --- |
| POST | `item-donations/` | Approved donor; `{clientId, itemId, quantity, city, notes?, image?}`. UUID `clientId` makes identical retries idempotent. |
| GET | `item-donations/<id>/` | Donor or matched NGO; item details and original photo. |
| GET | `item-donations/<id>/candidates/` | Owning donor; exact catalog item matches, same city first, then priority and needed date. Closed/expired/full requests are excluded. |
| POST | `matches/` | Owning donor; `{donationId, requestId, quantity}` reserves both offer and request capacity atomically. |
| GET | `matches/<id>/` | Participating donor/NGO only; contacts, original photo, delivery proof, pickup and tracking events. |
| PATCH | `matches/<id>/` | Current `version` plus an action described below. |
| POST | `notifications/read/` | `{id}` marks an owned notification read; `{}` marks all own notifications read. |
| GET | `places/search/?q=...` | Authenticated, cached, rate-limited place search triggered by a user. |
| GET | `places/nearby/?lat=...&lon=...` | Authenticated, validated coordinates; hospitals, clinics and pharmacies within 5 km (up to 120). |

Match actions:

- `schedule`: donor supplies future `pickupAt` (ISO timestamp with timezone), `pickupAddress`, `pickupCity`, `pickupState`, `pickupPincode`, and optional `pickupNotes`.
- `confirm`: receiving NGO supplies `deliveryProof` (validated JPG/PNG/WebP data URL, max 700 KB) and optional `deliveryNote`. Requires a scheduled pickup. The same transaction updates received quantities, marks completion, records the event, and notifies both participants.
- `cancel`: either participant may release a pending/scheduled reservation. Completed matches cannot be cancelled or confirmed again.

The state snapshot exposes `itemDonations`, `matches`, `notifications`, and `unreadNotifications`, scoped by user. Images are returned by authorized detail endpoints instead of being embedded in the polling snapshot. Request lines expose `fulfilled`, `reserved`, and `remaining` quantities. Edits cannot remove items or reduce quantities below reserved plus received amounts.

Maps use `MAP_GEOCODER_URL` and `MAP_OVERPASS_URL` from environment settings. Defaults are Nominatim and Overpass. The default cache and geocoding limiter are suitable for local, single-process use; configure a shared cache/global limiter or a hosted provider before using multiple production workers. Search requires a deliberate submit; no autocomplete or background geocoding. See the [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/) and [tile policy](https://operations.osmfoundation.org/policies/tiles/).

The donation pickup picker also uses `MAP_REVERSE_GEOCODER_URL` (default `https://nominatim.openstreetmap.org/reverse`). Search and reverse lookups share the same provider limiter and cache. Public Nominatim permits at most one request per second across the application, requires attribution and identifying requests, and prohibits autocomplete. The picker submits explicit searches and coalesces user pin adjustments; deploy a shared global limiter or another configured provider for multiple workers. Reverse coordinates are validated; missing mapped city/state/PIN values remain blank for manual completion. Confirming copies address fields into the unsaved donation form; coordinates are displayed for review but are not persisted as donation coordinates.


### Receipt photo verification

Run migrations through 0008. New receipt confirmations require a saved `match` comparison for the exact uploaded proof, donor reference, and catalog item. Mismatched, unclear, unchecked, or replaced photos cannot mark a delivery completed. Provider outages leave the delivery scheduled so the NGO can retry. Checks are reused for unchanged photos.

Both participants can check the saved proof on a completed delivery. The comparison and warning persist in `receiptCheck`; historical status and fulfilled quantities remain unchanged. Existing completed records without a check display as unchecked. Photo comparison identifies item type, not quantity or condition, and is not a guarantee of physical delivery.
