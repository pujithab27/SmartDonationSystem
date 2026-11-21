# Smart Donation System frontend

Next.js UI for the Milestone 2 Django REST API. See [full setup and account instructions](../README.md).

## Run

Start Django on port 8000 in a separate terminal, then run here:

```powershell
npm.cmd run dev
```

Open http://localhost:3000. Dependencies already exist in this workspace; on a fresh checkout run `npm.cmd ci` first.

Register a donor or NGO account through the UI. Both remain signed out until approved in the administrator portal at `/dashboard/admin/approvals`. The old browser-local demo credentials no longer work. Create administrators using Django's `createsuperuser` command as described in the project README.

## Data flow

- `app/api/[...path]/route.js` proxies `/api/` to Django. Override `DJANGO_API_ORIGIN` in the frontend environment if needed.
- `lib/api.js` sends JSON with session cookies and CSRF tokens. Writes refresh the current user's server-scoped state.
- `lib/tabSession.js` saves a random cookie selector in this tab's `sessionStorage`. API requests send it as `X-Session-Scope`; Django keeps session credentials in scoped HttpOnly cookies. Separate sign-ins can coexist in one browser. Reload restores the tab's selector, and signing into a duplicated tab creates a new context.
- `lib/useAppData.js` shares that state between components and refreshes on window focus.
- No account passwords, role authority, donation records, or session tokens are written to localStorage/sessionStorage.
- The API controls permissions and validation; UI guards provide navigation and feedback.
- Pledges remain simulated: there is no real payment processing. Recommendations still match selected interests.

## Checks

```powershell
npm.cmd test
npm.cmd run build
# With both servers running and local QA accounts prepared:
npm.cmd run test:tabs:live
```

The build needs internet access for the existing Google font. Backend tests cover actual persistence and authorization; frontend tests cover request handling, errors, session refresh, and stale response races.

## Visual direction and photography

The current reference-inspired design uses sky blue, white, lavender, pink, plain sans-serif typography, and local photography. The earlier forest/linen and poster-style drafts were rejected. The reference websites were not copied.

Images are illustrative and do not depict verified campaign beneficiaries. Replace them in `public/images` or update `categoryImages` and sample campaign records in `lib/data.js`.

| Asset                | Source                                                       |
| -------------------- | ------------------------------------------------------------ |
| Children / hero      | https://images.unsplash.com/photo-1488521787991-ed7bbaae773c |
| Education materials  | https://images.unsplash.com/photo-1503676260728-1c00da094a0b |
| Community volunteers | https://images.unsplash.com/photo-1593113598332-cd288d649433 |
| Healthcare           | https://images.unsplash.com/photo-1576091160399-112ba8d25d1d |
| Food                 | https://images.unsplash.com/photo-1547592180-85f173990554    |
| Environment          | https://images.unsplash.com/photo-1441974231531-c6227db76b6e |


The admin overview and account directory use an original Smart Donation System design. Approval dialogs include account details, rejection notes, access controls, and confirmation for bulk approval. The sample screenshots informed the workflow, not the visual layout.

## Current reference design

The public site and administrator workspace use the blue and pastel design in `app/horizon.css`. Donor and NGO workspaces use the supplied donation-workflow references through `app/exchange.css`: white cards, a pale background, lavender navigation, purple actions, compact metrics, and serif section headings. Responsive layouts and keyboard focus treatments remain shared. The rejected `studio.css` draft is no longer active.

The landing photograph is preserved. Below it are exactly three primary sections: an interactive item-category explorer, active campaigns, and approved NGO profiles. Category selection changes the illustrative photo and leads approved donors to the corresponding open requests. The header has explicit Log in and Sign up controls on desktop and mobile. Promotional mission blocks and repeated closing imagery were removed. About has a separate layout, with mission and vision in a collapsed, optional section.

`HomeHero` uses responsive Next.js image optimization. The original illustration is `public/images/community-sky.png`, generated with the built-in imagegen tool; its complete prompt is in `public/images/community-sky.prompt.txt`. This is an illustrative scene, not evidence of a real event. Loading placeholders keep campaign areas stable while API data arrives. `RevealOnScroll` progressively enhances below-fold content; content stays visible without animation, and motion respects the operating system's reduced-motion preference.

Donor navigation includes Dashboard, My profile, Add donation, Browse requirements, My donations, Matches, Notifications, and Nearby services. NGO navigation includes Donation requests, Donor matches, Notifications, Nearby services, and Organization profile. Request creation and the requested-items board remain together. Campaign, pledge, saved-cause, Settings, and Verification pages are removed from these workspaces; old URLs redirect to the relevant item workflow. The duplicate donor NGO directory redirects to Browse requirements and preserves search/category filters. Both workspaces retain the account email and Sign out control. Administrator tools and approval requirements are unchanged.

The local refresh passed the production build, 14 frontend tests, HTTP route checks, and in-memory rendering of 19 workspace sections plus the homepage, About, header, and authentication layouts. See `../../output/reference-redesign-validation.md`. Browser preview controls were unavailable, so visual browser verification and Lighthouse scoring remain uncompleted.


## Item donations and delivery tracking

- Donor: `/dashboard/donor/give` saves an item offer, `/dashboard/donor/requirements` browses needs, `/dashboard/donor/items` shows history, and `/dashboard/donor/matches` runs matching and schedules pickups.
- Choosing **Donate** on an open requirement carries its item and NGO request through the donation form and matching page. **Find NGOs** saves the donation and loads suggestions automatically, highlighting that request first; the donor must still confirm **Match donation**. **Refresh suggestions** checks availability again. Closed, expired, or fully reserved requests cannot be selected, and an unavailable request leaves the saved donation available for other eligible NGOs.
- NGO: `/dashboard/ngo` is the overview, `/dashboard/ngo/create` creates or edits a request, `/dashboard/ngo/requests` lists and manages requests, and `/dashboard/ngo/matches` manages receipt confirmation.
- A receiving NGO must upload a valid photo before confirming receipt. View details shows the original donation and received-item photo, contact numbers, pickup address, and timestamped tracking history.
- Photos are prepared locally (input up to 12 MB; large images resized). The backend verifies image content and stores images up to 700 KB. Only the donor and receiving NGO can access match photos.
- Voice input uses server-side Gemini transcription, fills an editable draft, and never submits automatically. The form discloses audio processing; microphone permission is required. Manual input remains available.
- Notifications are in-app messages, refreshed after actions, on focus, and every 30 seconds while the dashboard is visible. Read state is saved. No SMS/email provider is configured.
- The notification bell is available in the donor and NGO top bars, with unread counts, a scrollable dropdown, direct links, and mark-as-read controls. Pickup and completion notifications have distinct icon colors.
- Request fulfillment uses numbers with each item's own unit (for example, 10 kg of 25 kg received). Reservations and received quantities remain separate; different units are never added together.
- `/dashboard/donor/nearby` and `/dashboard/ngo/nearby` provide location search, health-service filters, and an OpenStreetMap map. Location is requested only from the button. Internet access is required; provider failures show a retryable error. Set `NEXT_PUBLIC_MAP_TILE_URL` at build time to change tile providers, preserving appropriate attribution.

Local development includes migrations through 0007. On a new checkout run backend migrations and `npm.cmd ci` before starting the app. Changes remain local until an upload is requested.

The October 29 reference update and dashboard cleanup pass 37 frontend tests, the production build, and in-memory rendering of 11 populated donor/NGO screens. Checks include retired-page redirects, preserved request filters, and the absence of retired links from both workspaces. Browser visual verification is still pending because this session exposed no usable browser or native UI connection.


## Camera, photo suggestions and field dictation

The donation form offers voice/photo tools before the manual fields. Open front camera starts a live preview; Take picture captures it, Switch camera changes the preferred facing direction, and Close releases the stream. File upload and native device capture remain available. Actual camera availability and browser permission are required.

A new photo is sent through the authenticated backend to Gemini. Supported items fill the catalog selection (which supplies category and unit) and a count/readable labeled quantity. Unclear, unrelated or mixed photos show warnings. Changing/removing a photo discards stale model replies and clears unchanged values derived from the previous image. Manual edits made during analysis are preserved; Use these details explicitly applies a later suggestion.

Voice input uses the browser Web Speech API (`SpeechRecognition` or `webkitSpeechRecognition`) with Indian English (`en-IN`). It does not load Whisper or call the app's transcription endpoint. The browser speech provider may process audio remotely; this is not an offline-only feature. No model setup is needed for the active voice controls.

Click the microphone, allow access, speak when Listening appears, then choose **Done**. The donation panel shows a live transcript preview; only final recognition results fill fields. Full donations allow up to 90 seconds and individual fields 30 seconds, although the browser may end earlier. Review the result and use **Fill from text** for corrections. Manual edits made during recording are preserved. Address formatting supports spoken dash/slash and literal door numbers such as `34-147/1`.

Run `npm test` for regression checks. With the frontend running, `node scripts/test-voice-live.mjs` runs simulated browser speech events and form-filling checks. Add `--native` to test Chrome's actual speech service using the existing synthetic microphone fixture. Set `VOICE_TEST_ORIGIN` to the local frontend origin. Simulated checks do not measure microphone accuracy. The local Whisper files and diagnostic script remain available but are not used by the app's voice controls.
New donor/request forms start with blank text and quantity fields. Saved donor addresses are inserted only through Use my saved address. Editing intentionally loads the existing record. Donor history and the NGO request list expose Edit and Delete; permanent deletion asks for a second click, and records with match history are preserved.


Item donations, NGO requests and matches now accept whole-number quantities only (for every unit, including kg and litres). Decimal voice/photo suggestions are not rounded or autofilled. Existing historical records are retained.

The donor's **Use voice instead** tool fills the spoken item, quantity, pickup address, city, state, PIN and notes. Missing details stay blank, and another recording can add them. Explicit lists of different counted catalog items clear the item/quantity suggestions and ask for one item type, even if the provider labels the recording as a single donation. Always review names and numbers: the live synthetic checks caught an intermittent house-number transcription error.

Before the NGO confirms a delivery, it can check the received-item photo against the donor's photo and matched item name. The check sends those photos to Gemini only after the NGO selects **Check against donation**. A match, mismatch or unclear result is guidance; the NGO must review the photo and attest that it matches before completing the delivery. If the donor did not upload a photo or the AI check is unavailable, the NGO can still review the received photo and make that confirmation.
