# Frontend

Next.js App Router application for donor, NGO and administrator workspaces. See the [project README](../README.md) for installation and account setup.

## Commands

Run from `frontend` with the Django backend available on port 8000.

| Command | Purpose |
| --- | --- |
| `npm.cmd ci` | Install dependencies from the lockfile. |
| `npm.cmd run dev` | Start the development server. |
| `npm.cmd test` | Run automated frontend tests. |
| `npm.cmd run build` | Create a production build; requires network access for the configured font. |
| `npm.cmd start` | Serve an existing production build. |

Set `DJANGO_API_ORIGIN` in the frontend environment if the backend is not at `http://127.0.0.1:8000`.

## Workspace routes

| Role | Routes under `/dashboard/<role>/` |
| --- | --- |
| Donor | `give`, `requirements`, `items`, `matches`, `impact`, `notifications`, `profile` |
| NGO | `create`, `available`, `requests`, `matches`, `notifications`, `profile` |
| Administrator | `approvals`, `donors`, `ngos`, `requests`, `donations`, `tracking`, `settings` |

The base `/dashboard/<role>` route opens the overview. `requests?request=<id>` opens an NGO request; `matches?match=<id>` opens a specific delivery. Request details link to related deliveries, and delivery details link back to the original request. Administrator account directories are separate from the approval queue.

Legacy campaign pages redirect to the NGO directory. Removed workspace routes are handled by `lib/workspaceRoutes.js`; nearby-service pages are not part of the current navigation.

## Data flow

1. `app/api/[...path]/route.js` proxies same-origin API calls to Django.
2. `lib/api.js` handles JSON, CSRF, cookies and state refresh after writes.
3. `lib/tabSession.js` assigns a browser-tab session selector. Authentication remains in server-managed cookies.
4. `lib/useAppData.js` shares the scoped API snapshot with workspace components.
5. `DashboardShell.js` refreshes visible workspaces every 30 seconds and on window focus.

Django remains responsible for authorization and validation. UI state does not grant permissions. Passwords and donation records are not persisted in browser storage.

## Input and receipt handling

- Photo input can suggest catalog items and quantities. Users review suggestions before saving; uncertain results leave manual entry available.
- Current voice controls use `lib/speechInput.js`, which delegates to `lib/geminiSpeech.js`. Recordings are sent to the authenticated backend transcription endpoint. Browser microphone permission and HTTPS or localhost are required.
- Historical browser-speech and local-model utilities remain in the source but are not the active voice path. `setup:voice` is not required for normal setup.
- New donation and request forms start with blank fields. Saved address controls explicitly copy profile data; editing loads the selected record.
- On receipt confirmation, choosing a proof photo triggers comparison. Completion requires a matching result for that exact photo and the NGO's confirmation. A mismatch, unclear result or provider failure blocks completion until a successful check.

## Styling and assets

Shared styles are in `app/`. `workflow.css` controls compact request lists and delivery details; `admin-directory.css` controls donor and NGO directories; `impact-tracking.css` controls impact and tracking views. Local images are in `public/images`.

Image source records:

| Asset | Source |
| --- | --- |
| Children | https://images.unsplash.com/photo-1488521787991-ed7bbaae773c |
| Education | https://images.unsplash.com/photo-1503676260728-1c00da094a0b |
| Community | https://images.unsplash.com/photo-1593113598332-cd288d649433 |
| Healthcare | https://images.unsplash.com/photo-1576091160399-112ba8d25d1d |
| Food | https://images.unsplash.com/photo-1547592180-85f173990554 |
| Environment | https://images.unsplash.com/photo-1441974231531-c6227db76b6e |

## Browser checks

With both servers running, `node scripts/check-ngo-progress.mjs` checks request-to-delivery navigation using controlled API fixtures. `node scripts/check-account-offers.mjs` checks account directories and quantity-only NGO interest forms. These require a locally installed Chrome browser and save screenshots under ignored `output/` folders.

Fixture-based browser checks validate presentation and navigation, not live provider accuracy or a physical delivery. The live exchange scripts create database records and require separate QA account preparation; they are not installation steps.
