# Backend API

Django REST Framework service for account review, item requests, donor offers, matching, pickup scheduling and receipt confirmation. See the [project README](../README.md) for installation.

## Service configuration

API base: `/api/`. The frontend proxies this path to Django. Local Django address: `http://127.0.0.1:8000`.

| Variable | Purpose / configured default |
| --- | --- |
| `GEMINI_API_KEY` | Provider credential for photo analysis, receipt comparison and speech. |
| `GEMINI_MODEL` | Photo model; `gemini-2.5-flash`. |
| `GEMINI_SPEECH_MODEL` | Speech model; `gemini-3.1-flash-lite`. |
| `DJANGO_DEBUG` | Local development mode; `true`. |
| `DJANGO_SECRET_KEY` | Required when debug is disabled. Development creates an ignored local key file if omitted. |
| `DJANGO_DB_PATH` | SQLite file; defaults to `db/db.sqlite3` under the project root. |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated allowed hosts; defaults to localhost and loopback addresses. |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Comma-separated frontend origins; defaults to localhost and 127.0.0.1 on ports 3000 and 3001. |
| `MAP_GEOCODER_URL` | Address search; defaults to Nominatim `/search`. |
| `MAP_REVERSE_GEOCODER_URL` | Reverse lookup; defaults to Nominatim `/reverse`. |
| `MAP_OVERPASS_URL` | Retained nearby-service endpoint provider; defaults to Overpass. |

Only the three Gemini variables are read from `backend/.env`. Process environment values take precedence. Set other variables in the process environment and restart Django after changes. Keep real keys out of version control.

## Authentication and authorization

1. Fetch `GET auth/csrf/` and retain the cookie and returned CSRF token.
2. Send `X-CSRFToken` with state-changing requests and include session cookies.
3. Register with `POST auth/signup/`. New donor and NGO accounts require administrator approval.
4. Sign in with `POST auth/login/` using `email`, `password` and `role` (`donor`, `ngo` or `admin`). Use the refreshed CSRF token returned after login.
5. Sign out with `POST auth/logout/`.

The frontend also sends `X-Session-Scope`, a random selector for its browser tab. Django uses scoped session cookies so separate sign-ins can coexist in one browser. A selector without a valid session cookie grants no access. Account rejection or access revocation invalidates existing sessions.

Ownership is derived from the authenticated account. Administrators can inspect delivery records but cannot schedule pickups or confirm receipt on behalf of participants. `GET state/` returns only data visible to the caller; image payloads are loaded through authorized detail endpoints.

## Current endpoints

Paths below are relative to `/api/` and include trailing slashes.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `health/` | Service and database health. |
| GET | `auth/csrf/`, `auth/me/` | CSRF initialization and current identity. |
| POST | `auth/signup/`, `auth/login/`, `auth/logout/` | Account registration and sessions. |
| GET | `state/` | Scoped workspace snapshot and item catalog. |
| GET, PATCH | `profile/` | Own profile; PATCH uses the complete profile form. |
| PATCH | `preferences/` | Own preferences. |
| POST | `accounts/<id>/review/` | Administrator decision using `action`, `reason`, `version`. |
| POST | `accounts/approve/` | Administrator bulk approval of selected pending accounts. |
| GET | `ngos/` | Visible organization profiles. |
| POST | `ngos/<email>/review/` | Administrator organization review. |
| GET, POST | `item-requests/` | Scoped request list; verified NGOs create requests. |
| PATCH, DELETE | `item-requests/<id>/` | Owner updates or deletes an eligible request using its version. |
| POST | `item-donations/` | Approved donor creates an item offer. |
| GET, PATCH, DELETE | `item-donations/<id>/` | Authorized detail access; owner edits or deletes eligible offers. |
| GET | `item-donations/available/` | Verified NGO discovers unallocated offers. |
| POST | `item-donations/<id>/interest/` | NGO expresses interest using `quantity` or an existing `requestId`. |
| GET | `item-donations/<id>/candidates/` | Donor views eligible requests for their offer. |
| POST | `item-donations/analyse-photo/` | Donor photo recognition using `image`. |
| POST | `matches/` | Donor reserves an offer against an NGO request. |
| GET, PATCH | `matches/<id>/` | Authorized delivery details or participant action. |
| POST | `matches/<id>/check-receipt-photo/` | Compare `deliveryProof` with the matched item and donor photo when present. |
| POST | `notifications/read/` | Mark an owned notification read using `id`, or all own notifications with `{}`. |
| POST | `speech/transcribe/` | Authenticated voice transcription using `audio` and `mode`. |
| GET | `places/suggest/?q=...` | Locality suggestions from Open-Meteo. |
| GET | `places/search/?q=...` | Submitted address search. |
| GET | `places/reverse/?lat=...&lon=...` | Reverse geocoding. |
| POST | `contacts/` | Submit a contact message. |
| POST | `activities/<id>/resolve/` | Administrator marks an activity reviewed. |

Full route definitions: [donations/urls.py](donations/urls.py).

## Request and offer payloads

Example NGO request:

```json
{
  "title": "Kitchen essentials",
  "items": [{"itemId": "rice", "quantity": 25}],
  "deliveryAddress": "12 Community Road",
  "deliveryCity": "Hyderabad",
  "deliveryState": "Telangana",
  "deliveryPincode": "500001",
  "contactPhone": "+919876543210",
  "priority": "High",
  "neededBy": null,
  "notes": "Call before collection."
}
```

Item IDs and units come from `state/`'s `data.itemCatalog`. New quantities are whole numbers from 1 to 1,000,000 for every unit. Request item IDs must be unique. The server assigns ownership; callers cannot supply another account as the owner.

A donor offer uses `clientId` (UUID), `itemId`, `quantity`, `address`, `city`, `state` and `pincode`, with optional `notes` and `image`. Identical retries using the same donor and `clientId` return the existing offer; conflicting retries are rejected.

For quantity-only NGO interest, the server copies the NGO's saved address and phone into a request tied to the source donation. An existing interest returns its request ID instead of creating a duplicate. This action notifies the donor but does not reserve stock. Supplying an existing `requestId` instead remains supported; do not send both fields.

Request edits and donor-offer edits require the current `version`. Closing a request uses `{"status":"Closed","version":<current version>}`. Deletion also requires the current version and is restricted to records without protected history.

## Matching and delivery states

`POST matches/` takes `donationId`, `requestId` and `quantity`. The server checks ownership, eligibility, item compatibility and available capacity before reserving both sides atomically.

| Stored status | Meaning | Next action |
| --- | --- | --- |
| `Pending` | Donor accepted; quantity reserved. | Donor schedules pickup. |
| `Pickup scheduled` | Collection details saved. | NGO receives items and verifies proof. |
| `Completed` | NGO confirmed receipt. | Read-only delivery history. |
| `Cancelled` | Reservation released. | Read-only cancellation history. |

`PATCH matches/<id>/` requires the current `version` and one action:

- `schedule`: donor supplies future `pickupAt` with timezone, `pickupAddress`, `pickupCity`, `pickupState`, `pickupPincode` and optional `pickupNotes`.
- `confirm`: receiving NGO supplies `deliveryProof`, `itemMatchConfirmed: true` and optional `deliveryNote`. A scheduled pickup and successful comparison for the exact proof are required.
- `cancel`: either participant releases a pending or scheduled reservation. Completed deliveries cannot be cancelled.

Receipt confirmation updates fulfilled quantities, appends a tracking event and notifies both participants in one transaction. Request lines expose `fulfilled`, `reserved` and `remaining`. Edits cannot reduce quantities below received plus reserved amounts.

## AI and map integrations

Receipt comparison returns `match`, `mismatch` or `unclear`. Only a saved `match` result for the current proof permits completion. Replacing the photo requires a new check. Missing provider access or quota leaves the delivery scheduled for a later retry. The comparison assesses item type, not delivered quantity or physical condition.

Voice uses short recordings of up to 20 seconds. `mode` is `dictation` or `donation`; the latter returns structured donation fields. Audio is sent to Gemini and is not persisted by the application. Manual input remains available if transcription fails.

Address suggestions use Open-Meteo locality search; explicit address searches and reverse lookups use the configured geocoder. Map responses are cached and rate-limited. Production deployments need provider capacity and shared cache/rate-limit controls appropriate to their worker count.

## Errors and troubleshooting

| Response / symptom | Check |
| --- | --- |
| 400 | Required fields, whole-number quantities, request eligibility and current delivery state. |
| 401 or login rejected | Email, password, selected role and account approval. |
| 403 | Session/CSRF state and role or ownership restrictions. |
| 404 | Resource existence and visibility for the signed-in account. |
| 409 | Stale version or conflicting idempotency reference; refresh before retrying. |
| 429 | Application or provider rate limit; respect any retry information. |
| 503 / AI unavailable | Provider key, configured model, quota and outbound HTTPS connectivity. |
| Frontend cannot reach API | Confirm Django is running and `DJANGO_API_ORIGIN` is correct. |

Uploads are validated server-side. JPEG, PNG and WebP item/receipt photos are limited to 700 KB. The proxy and Django also impose request-body limits.

## Compatibility and deployment

Campaign, pledge, saved-campaign and nearby-service endpoints remain for compatibility, but their pages are outside the current item-donation workflow. `donations/` refers to retained pledge records; physical item offers use `item-donations/`. No payment processor is connected.

For public deployment, disable debug, set a private secret and explicit hosts/origins, use HTTPS and production application hosting, and establish database backups and shared throttling. Email verification and password recovery are not implemented. Application photo checks do not establish independent organization or delivery verification.

Run `manage.py migrate` to apply all migrations before serving an updated checkout. Validate with `manage.py check` and `manage.py test donations --noinput` from the backend environment.
