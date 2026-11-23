# Smart Donation System

A donation management application connecting donors and NGOs, with administrator account review and delivery tracking.

## Features

| Role | Capabilities |
| --- | --- |
| Donor | Offer items, browse NGO needs, reserve donations, schedule pickups and view delivery impact. |
| NGO | Publish requests, request available items, track incoming donations and confirm receipt. |
| Administrator | Approve accounts, manage donor and NGO profiles, and inspect requests, donations and delivery history. |

Photo recognition, receipt-photo comparison and voice transcription use a server-side Gemini integration. The backend enforces ownership, account approval, quantity limits and workflow transitions.

## Technology

- Frontend: Next.js App Router, React and Leaflet.
- Backend: Django and Django REST Framework.
- Database: SQLite for local development; schema managed by Django migrations.
- Authentication: server-side sessions, CSRF protection and separate browser-tab sign-ins.

Dependency versions are recorded in `frontend/package-lock.json` and `backend/requirements-lock.txt`.

## Installation

Prerequisites: Git, Node.js 22 LTS, Python 3.12 or later, and internet access to install dependencies. The project has been tested with Python 3.14.2. The following commands use Windows PowerShell.

### 1. Clone the project

Personal repository:

```powershell
git clone --branch BOLISETTY-PUJITHA https://github.com/pujithab27/SmartDonationSystem.git
cd SmartDonationSystem
```

Alternatively, clone the internship repository and enter its application folder:

```powershell
git clone --branch BOLISETTY-PUJITHA https://github.com/Springboard-Internship-2026/AI-Driven-Smart-Donation-Management-System-For-Intelligent-Resource-Allocat-And-Comm-Supp-OCT-2026.git internship-donations
cd internship-donations\ai_driven_smart_donation_system
```

This directory is the **project root** for the remaining instructions.

### 2. Set up the backend

From the project root:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt
Copy-Item .env.example .env
```

Edit `backend/.env` and enter your own `GEMINI_API_KEY`. Photo analysis, voice transcription and receipt-photo verification require a valid key and available provider quota. Registration, manual form entry, requests and matching work without the key; delivery completion requires successful receipt-photo verification.

```powershell
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py createsuperuser
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Keep this terminal open. The administrator account is created interactively; no default credentials are supplied.

### 3. Start the frontend

Open another PowerShell terminal at the project root:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Open http://localhost:3000. Administrator login is at http://localhost:3000/admin/login. Stop either server with `Ctrl+C`.

Each checkout has its own database and accounts. Repository uploads exclude `.env`, local databases, credentials, dependencies and generated files.

## Application workflow

1. Register donor and NGO accounts. An administrator reviews them under **Account approvals** before they can sign in.
2. The NGO publishes an item request, or selects an available donation and enters the quantity needed. The latter reuses the NGO's saved contact and address details.
3. The donor reviews the request and confirms a match. This reserves the agreed quantity; expressing interest alone does not reserve items.
4. The donor schedules the pickup. The NGO sees updates in **My requests**, **Deliveries & pickups** and **Notifications**.
5. After receiving the items, the NGO uploads a receipt photo, completes the comparison and confirms physical receipt.
6. The system updates received quantities, delivery history and donor impact. Administrators can inspect these records in their tracking pages.

All new quantities must be positive whole numbers, including kg and litres. Closed requests stop accepting new matches while retaining their history. Records with delivery history are protected from deletion.

## Project structure

```text
backend/     API, business rules, migrations and backend tests
frontend/    Pages, role workspaces, UI components and frontend tests
db/          Database documentation and schema reference
```

## Validation

From `backend`:

```powershell
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py test donations --noinput
```

From `frontend`:

```powershell
npm.cmd test
npm.cmd run build
```

The frontend build downloads its configured Google font and requires internet access. Automated provider tests use mocked responses; live Gemini checks require a working key and quota.

## Updating a checkout

Save or commit local changes, then run `git pull --ff-only` on the intended branch. If dependency files changed, rerun the relevant installation command. Run `manage.py migrate` after pulling database migrations and restart both servers.

The maintained branch in both repositories is `BOLISETTY-PUJITHA`. Do not push or merge into `main` without the repository owner's explicit confirmation.

## Configuration and limitations

- The frontend forwards `/api/` requests to Django at `http://127.0.0.1:8000`. Set `DJANGO_API_ORIGIN` in the frontend environment to change this address.
- Gemini settings are loaded from `backend/.env` or process environment variables. Other Django settings use process environment variables. Restart the relevant server after changing configuration.
- Camera and microphone features require permission and HTTPS or localhost. Current voice controls use Gemini; local model downloads are not required.
- Email verification, password recovery and payment processing are not implemented. Retained campaign APIs are outside the current item-donation interface.
- Public deployment requires production hosting, HTTPS, environment-specific secrets, host/origin configuration, backups and shared rate limiting. Django `runserver` is for development.

## Documentation

- [Backend API and configuration](backend/README.md)
- [Frontend architecture and routes](frontend/README.md)
- [Database model and schema](db/README.md)
