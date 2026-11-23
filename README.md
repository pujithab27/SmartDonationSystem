# Smart Donation System 

The existing Next.js UI now uses a Django REST Framework backend and a SQLite database. Donor/NGO signup, login, profiles, item requests, campaigns, reviews, pledges, saved causes, preferences, and contact messages persist on the server.
## Teammate setup (Windows)

Install Git, Node.js 22 LTS and Python 3.12 or later. This workspace was tested with Python 3.14.2. Open PowerShell and clone the project:

```powershell
git clone --branch BOLISETTY-PUJITHA https://github.com/pujithab27/SmartDonationSystem.git
cd SmartDonationSystem
cd backend
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py createsuperuser
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Set your own `GEMINI_API_KEY` in `backend/.env` for photo recognition and receipt-photo verification. No key is included. Registration, manual item entry and matching work without a key; receipt-photo verification needs a configured provider with available quota.

Keep that terminal running. In a second PowerShell terminal, open the cloned repository:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Open http://localhost:3000. Sign in to http://localhost:3000/admin/login using the administrator created above. Keep both servers running; `Ctrl+C` stops a server. Each teammate creates their own local database and accounts; cloning does not copy anyone's credentials or donation records.

For the optional local speech model, run `npm.cmd run setup:voice` from `frontend` once with internet access. Generated models are not committed.

## Repositories and updates

- Personal copy: https://github.com/pujithab27/SmartDonationSystem
- Team repository: https://github.com/Springboard-Internship-2026/AI-Driven-Smart-Donation-Management-System-For-Intelligent-Resource-Allocat-And-Comm-Supp-OCT-2026
- Project branch in both repositories: `BOLISETTY-PUJITHA`.

After saving your own changes, obtain updates using `git pull --ff-only`. When dependencies change, rerun the installation commands above. Run `manage.py migrate` after pulling new migrations. Do not commit `.env`, database files, generated models, dependencies or local output. Team members can create their own branches and submit pull requests; do not push to `main`.

## Accounts and verification

- Register through `/donor/signup` or `/ngo/signup`. Django validates required fields, email uniqueness, phone, pincode, password strength, password confirmation, and consent. Emails are case-insensitive and unique across roles.
- Signup creates the user and profile in one transaction with `Pending` approval. Neither donors nor NGOs receive a login session until a platform administrator approves them.
- Login checks the email, password, selected role, approval status, and active-account status against the database. Failed attempts return a generic error. There is no placeholder-password or demo-account bypass.
- Passwords use Django's salted PBKDF2 hashing. A database session and HttpOnly cookie maintain login; logout invalidates the session. Login audit rows contain email, role, outcome, and time, never passwords.
- Each frontend sign-in has its own session context. You can sign in as a donor in one tab and an NGO or administrator in another tab of the same browser. Reloading keeps that tab's account; signing out does not affect a different sign-in. After upgrading from the shared-cookie version, reload existing tabs and sign in once in each.
- Signup/login and other writes require a CSRF token. Authentication endpoints have basic request throttling.
- Credential verification is implemented. Email verification by OTP/link and password recovery are not implemented.
- Existing browser-only prototype accounts are not imported. Create a new account with a password.

### Create an administrator

From `backend`, run:

```powershell
.\.venv\Scripts\python.exe manage.py createsuperuser
```

Choose the administrator's email and password at the prompts. Sign in with those credentials at http://localhost:3000/admin/login. The same account can inspect database records at http://127.0.0.1:8000/admin/.

Public signup cannot create administrators. No default administrator or public administrator password is included.

### Complete the workflow

1. Register an NGO. The success screen explains that administrator approval is required; signing in is blocked.
2. Sign in as the platform administrator at `/admin/login`. Open **Account approvals**, review the NGO details, and approve the account.
3. Sign in as the approved NGO. Open **Request items** to publish a need; **My requests** lists saved requests with delivery status.
4. Publish a request with the items, quantities, and the NGO's delivery location.
5. Register a donor, approve the donor under **Account approvals**, then sign in as the donor.
6. Open **Browse requirements** at `/dashboard/donor/requirements` and choose **Donate** beside an available item. The form keeps the selected NGO request; enter the quantity and your donation city, optionally expand **Add a photo or note** or **Use voice instead**, then choose **Find NGOs**. Category and unit are filled automatically from the item.
7. NGO suggestions load automatically. The selected request appears first when it is still eligible; other requests remain available. Review the NGO and quantity, then choose **Match donation** to reserve the items. Use **Refresh suggestions** to check availability again.
8. Enter a future pickup date and the donor's pickup address, then save the schedule. The receiving NGO gets an in-app notification.
9. After the physical delivery, sign in as the receiving NGO, open **Deliveries & pickups**, select the donation, and choose **Confirm physical receipt**. Upload a photo of the received items and confirm. Both accounts can view the delivery proof and tracking history; the request's received quantities update automatically.
10. Use **My requests** to open a request and its linked deliveries. **Deliveries & pickups** shows accepted donations, pickup details and receipt history. The dashboard refreshes periodically; Refresh loads updates immediately.

### NGO item requests and donor search

Open **Request items** after signing in as an approved NGO. Search the catalog, select items and quantities, then publish. **My requests** displays a compact list; select a request for full details, donor acceptance and pickup links. Requests can be edited, closed or reopened. Closing a request stops new offers while preserving delivery history.

The catalog has **50 donation items in eight categories**, with units assigned by the server. It includes the 47 specified items plus Towel, Bedsheet, and Soap. Quantities use whole numbers for pieces, pairs, packets, boxes, bottles, strips, and units; kg and litre quantities also use whole numbers. One request may contain up to all 50 items, without duplicate items.

**NGO delivery location** is where the organization receives the items. The form starts with the NGO profile's address, city, state, and pincode; each request can use a different receiving location. A needed-by date and notes are optional.

For example, create **Community kitchen essentials**, select **Rice — 25 kg**, **Cooking Oil — 5 litre**, and **Utensils — 10 piece**, and enter the NGO's receiving address. Click **Publish request**. Sign out using the button near the bottom-left account email, sign in as an approved donor, and open `/dashboard/donor/requirements`. Search the NGO name, city, or `rice` to see open requests, quantities, and delivery locations. Category filters narrow the results, and **Donate** keeps the chosen request selected through matching. The public `/ngos` directory also supports NGO search; requested items and delivery locations require an approved signed-in account.

Migration `0003_item_requests` adds the request and item tables without changing existing accounts or campaigns. Run `manage.py migrate` before using this feature on another checkout. Only approved, verified NGOs can publish or change their own requests; donors can read open requests from approved, active NGOs. Conflicting edits are rejected instead of overwriting newer changes.

### Admin account approvals

Open `/dashboard/admin` for the overview and `/dashboard/admin/approvals` for account reviews. The directory supports status tabs, donor/NGO filters, name/email/registration search, sorting, pagination, account details, and approval of selected pending accounts. Rejection and access-pausing require a reason. Every decision records its administrator and time.

Approved accounts can sign in; pending, rejected, and inactive accounts cannot. Pausing or rejecting an account invalidates its existing sessions. Restoring access requires a fresh login. Stale decisions from another browser are rejected instead of overwriting a newer review. NGO account approval also verifies its organization. Changing an NGO identity requires another review and signs the account out.

Migration `0002_account_approval` preserves existing NGO verification decisions and administrator access. Existing donors without a previous review start pending and need approval. Existing sessions need a fresh sign-in after this upgrade. The migration preserves profiles, campaigns, and donation records.

Only verified NGOs can submit campaigns, and only approved campaigns are public. Changing an NGO's name or registration number requires another review. The API enforces ownership and roles independently of the UI. Anonymous donor identities are omitted from NGO responses; administrators retain access to donor identities.

Pledges are transactional and use a per-donor idempotency reference to prevent double counting on retry. They do **not** charge money; no payment processor is connected.

## Database

The local database is `db/db.sqlite3`. Version-controlled migrations in `backend/donations/migrations` recreate its tables. Database files, the virtual environment, and the generated development secret are ignored by Git. See [database tables and relationships](db/README.md).

Three illustrative organizations and campaigns have been seeded. Their accounts have unusable passwords. The seed command never creates a login or administrator:

```powershell
.\.venv\Scripts\python.exe manage.py seed_sample_data
```

Running the command again preserves existing records. Sample opening funding balances are illustrative; donation analytics count recorded pledges.

## Configuration

### Testing accounts in multiple tabs

Open `/donor/login` in one tab and `/ngo/login` in another. Sign into each separately, then switch tabs or reload: each profile remains tied to its own account. A new tab starts signed out. A browser-duplicated tab may initially share the original session; signing into a different account in that copy creates a separate session. Signing out of a shared copied session also signs out its other copies. If browser storage is blocked, the current page remains isolated but a reload requires a new sign-in.

Only a random cookie selector is stored in `sessionStorage`; credentials remain in HttpOnly cookies. Server approval, expiry, and account revocation still apply to every session. See [the multi-tab test report](output/tab-session-test-report.md).

Next.js proxies same-origin `/api/` requests to `http://127.0.0.1:8000`. The browser receives the Django session cookie through that proxy, so local CORS configuration is unnecessary.

| Variable | Purpose / default |
| --- | --- |
| `DJANGO_API_ORIGIN` | Set in the frontend terminal to change the backend origin; restart Next.js afterward. |
| `DJANGO_DB_PATH` | Optional absolute SQLite path; default `db/db.sqlite3`. |
| `DJANGO_DEBUG` | `true` for local development. |
| `DJANGO_SECRET_KEY` | Required when debug is false. Development generates an ignored persistent `.django-secret-key`. |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated hostnames; local hosts by default. |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Comma-separated frontend origins; localhost/127.0.0.1 ports 3000 and 3001 by default. |

If Next.js uses a different port, add that exact origin to `DJANGO_CSRF_TRUSTED_ORIGINS` in the backend terminal and restart Django. General Django configuration is read from process environment variables. The three Gemini settings are also loaded from the ignored `backend/.env` file.

For a public deployment, configure HTTPS, a private secret, allowed hosts/origins, backups, an appropriate database/service topology, and a production WSGI server. The included `runserver`, SQLite configuration, and in-process rate limiter target local Milestone 2 development. Email delivery, payment processing and independent organization-document verification are not configured. Photo recognition and receipt comparison use the configured Gemini provider.

## Validation

```powershell
# From backend
.\.venv\Scripts\python.exe manage.py test donations
.\.venv\Scripts\python.exe manage.py check

# From frontend
npm.cmd test
npm.cmd run build
```

Tests cover authentication, hashing, sessions, CSRF, role/ownership boundaries, validation, document visibility, approval flow, donation idempotency, anonymous donor privacy, persistent preferences, item catalogs/quantities/delivery locations, request editing and visibility, NGO search, and frontend API failure/race handling. The Next.js build fetches the existing Google font and needs internet access.

See [backend API details](backend/README.md).

## Repeat the donor and NGO integration checks

With Django and Next.js running, create fresh, clearly labelled QA accounts from `backend`:

```powershell
.\.venv\Scripts\python.exe scripts\prepare_exchange_qa.py
```

Then, from `frontend`:

```powershell
npm.cmd run test:exchange:live
npm.cmd run test:routes:live
npm.cmd run test:tabs:live
```

The exchange check submits the real React forms in jsdom and uses the running Next.js proxy and Django database. It verifies NGO request publishing/editing/closing/reopening, donor request selection, matching, pickup scheduling, NGO photo confirmation, both roles' tracking and notifications, cancellation, profiles, and persistence after login. Both roles share one browser cookie store with independent frontend tab state. The tab check adds reload, duplicated-tab login, profile-write, logout, and private-data isolation scenarios. These checks create sample records and keep them available for manual review. Run the preparation command again before each full exchange run. Credentials, a sample PNG, snapshots, and detailed results are saved in ignored `output/qa-private/`; the temporary QA administrator is disabled after setup.

The DOM test adapts Next navigation and bitmap decoding. Visual layout, real browser navigation, camera/microphone permissions, canvas resizing, and live map providers need a browser check. The separate route check verifies the running Next server's active workspace routes and retired-page redirects. See [the October 30 test report](output/donation-test-report.md).
