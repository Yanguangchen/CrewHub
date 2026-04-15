# CrewHub — project context

Single source of truth for humans and AI assistants working on this repository. Update this file when schema, rules, API contracts, or flows change.

## Product

**CrewHub** is a mobile-first web app for a construction company. Goals:

- Replace paper timesheets with digital clock in/out.
- Reduce fraudulent meal claims via **time-gated** meal allowance UI (after 7:00 PM local clock-out).
- Give drivers a structured flow to submit **diesel receipts** and **dashboard photos** instead of informal channels (e.g. WhatsApp).
- **Worker identity:** **Phone / employee ID + 6-digit PIN only** on the worker ATM login screen. **No worker-name dropdown** on worker UI — the roster record supplies `workerName` after PIN verification. **Admins** sign in with **Google** on `admin.html`; the **primary owner UID** is in **`js/admin-owner.js`** (`CREWHUB_PRIMARY_ADMIN_UID`) and must match **`isCrewOwner()`** in `firestore.rules`. **Worker roster** uses the **Firestore client** (`setDoc` on `worker_credentials`). Optional **`/api/roster-upsert`** uses Bearer **Google** tokens; the **same primary owner UID** is always allowed server-side (`api/lib/adminAuth.js`), plus optional **`ADMIN_UIDS`** for extra admins.

## Tech stack

- **UI:** HTML, CSS (design tokens + components + layout), **vanilla ES modules** (no framework). No Tailwind in this repo.
- **Hosting:** Intended for **Vercel** (or any static host) with same-origin **`/api/*`** serverless routes.
- **Worker login & clock-in (server-side):**
  - Browser: `fetch()` to `POST /api/login`, `POST /api/clock-in`, `GET /api/session`, `POST /api/logout` with `credentials: "include"` where applicable (HttpOnly session cookie `crewhub_worker`).
  - Server: **`firebase-admin`** in `api/*.js`. Login verifies PIN in `worker_credentials`; clock-in writes `timesheets` **without GPS** (worker name comes from the session set at login).
- **Other worker actions & admin/driver:** Firebase **client** SDK for clock-out, meal, resume open shift, admin live tables, driver uploads, and **Anonymous Auth** where needed.
- **Firestore:** `timesheets`, `fleet_claims`, and (for API login) **`worker_credentials`**.
- **Storage:** claim images under `fleet_claims/**` (Firebase Storage).

Serve over **https** (not `file://`) so ES modules and cookies behave correctly.

## Vercel API (serverless)

| Path | Method | Purpose |
|------|--------|---------|
| `/api/login` | `POST` | Body: `{ employeeId, pin }`. Reads `workerName` from `worker_credentials/{id}`; sets **HttpOnly** cookie. |
| `/api/session` | `GET` | Returns `{ workerName, employeeId }` if cookie valid (page reload). |
| `/api/logout` | `POST` | Clears worker session cookie. |
| `/api/clock-in` | `POST` | Body: `{ siteName, date? }`. Worker name from cookie session; writes `timesheets` (no location). |
| `/api/admin-verify` | `GET` | `Authorization: Bearer <Firebase ID token>`. **Google** sign-in + primary owner UID (always) or **`ADMIN_UIDS`**. (Admin UI does not call this.) |
| `/api/roster-upsert` | `POST` | `Authorization: Bearer <Firebase ID token>` (Google). Body: `{ employeeId, workerName, pin }`. Same UID rules as admin-verify. |

**Shared libs:** `api/lib/firebaseAdmin.js` (init admin SDK), `api/lib/sessionCookie.js` (HMAC session token + cookie helpers).

**Environment variables (Vercel / local):**

- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` — service account for **admin** SDK (`\n` in private key string is supported).
- `SESSION_SECRET` — long random secret (≥16 chars) used to sign the worker session cookie value.
- `ADMIN_UIDS` (optional) — comma-separated **extra** Firebase Auth UIDs allowed on `/api/admin-verify` and `/api/roster-upsert` (Google only). The primary owner UID is **always** allowed without env (see `api/lib/adminAuth.js`; keep in sync with `js/admin-owner.js` / `firestore.rules`).

**Dependencies:** root `package.json` includes `firebase-admin` for deployed functions.

**Optional frontend:** if the static UI is not same-origin as the API, set `window.__CREWHUB_API_ORIGIN__ = "https://your-deployment.vercel.app"` before worker scripts load (see `js/api-worker.js`).

## Firestore schema

### `timesheets`

| Field | Type | Notes |
|-------|------|--------|
| `workerName` | string | |
| `siteName` | string | Worker UI: **Site A - Bukit Batok**, **Site B - Jurong West**, **HQ Office** |
| `employeeId` | string | Optional when created from client; set when clock-in goes through `/api/clock-in` |
| `clockInTime` | Timestamp | Set on clock in |
| `clockOutTime` | Timestamp or null | Set on clock out |
| `claimedMeal` | boolean | Default false; meal button sets true when eligible |
| `date` | string | `YYYY-MM-DD` for reporting |
| `location` | object | Optional legacy field; new clock-ins via API omit GPS |

### `worker_credentials` (server-only verification)

Used by **`/api/login`**. Document ID = normalized `employeeId` (see `api/login.js`). Example fields:

| Field | Type | Notes |
|-------|------|--------|
| `pin` | string | **Demo:** plain 6-digit PIN. **Production:** replace with hashed PIN + server-side compare. |
| `workerName` | string | **Required** — display name returned after login and stored on timesheets. |

**Rules (repo sample):** the **owner UID** in `isCrewOwner()` may **read/write** `worker_credentials` from the browser for the admin roster tab; everyone else is denied. **`/api/login`** still reads via **firebase-admin** (bypasses rules).

### `fleet_claims`

| Field | Type | Notes |
|-------|------|--------|
| `driverName` | string | |
| `employeeId` | string | Optional; set when driver unlocks identity on device |
| `destination` | string | |
| `mileage` | number | |
| `receiptPhotoUrl` | string | Storage download URL |
| `dashboardPhotoUrl` | string | Storage download URL |
| `timestamp` | Timestamp | Submission time |

## Business rules

### Meal allowance (“smart meal”)

- UI is **hidden** until after an eligible clock-out.
- Eligible when **clock-out time** is **strictly after 19:00:00** in the **device local** timezone (`isStrictlyAfterSevenPM` in `js/timesheets-crud.js`).
- One tap **Register meal taken** sets `claimedMeal: true` (no PIN stored in browser session for meal).

### Shift flow (worker)

- **Part 1 — Login:** ATM-style **ID + PIN** → `POST /api/login` → HttpOnly cookie + in-memory `workerName`.
- **Part 2 — Clock:** **Welcome, [name]** → job site dropdown only → **Clock In** / **Clock Out** (large green/red). **No worker dropdown.**
- After **clock-out** or **undo clock-in**, a **15-minute** client cooldown blocks another **Clock In** (anti-spam). Loading spinner on clock actions while requests run.
- **Clock out / undo / meal / resume:** Firestore client (`js/timesheets-crud.js`); `activeTimesheetId` in memory. While clocked in, **job site** dropdown is disabled.
- **Resume:** `GET /api/session` on load; then `findOpenTimesheetForDay` for today’s open row for that worker + selected site.

### Identity (worker)

- **Server session cookie** (HMAC) holds `employeeId` + `workerName` after PIN login.
- `js/crewhub-identity.js` is still used for **driver** PIN helpers and **admin** is unrelated.

## Security rules (repo)

Current `firestore.rules` (adjust for production):

- **`timesheets`:** in-repo sample may allow broad access for prototyping; **tighten** so only trusted clients or server paths can write.
- **`fleet_claims`:** authenticated users (`request.auth != null`).

`storage.rules`: read/write under `fleet_claims/**` for authenticated users.

Enable **Anonymous** auth for worker/driver client flows; enable **Google** for **admin** users. Admin page does **not** use anonymous sign-in.

## Design system (reusable UI)

| File | Purpose |
|------|---------|
| `css/tokens.css` | Colors, radii, shadows, typography base |
| `css/components.css` | Glass surfaces, buttons, inputs, tabs, tables, upload zones, badges, identity blocks, ATM login, clock-in/out, loading spinners |
| `css/layout.css` | App shell: header, main, responsive breakpoints |
| `css/login.css` | Hub copy spacing; oversized login-style fields reused on worker/driver identity |
| `css/theme-toggle.css` | Theme dialog |
| `styles.css` | Barrel: `@import` layers (single `<link>` in HTML) |

**JavaScript helpers (`js/ui.js`):** theme picker, `bindTabGroup`, `bindStackedViews`, `wireFileMeta`, `escapeHtml`, `attrSafe`.

## File map

| Path | Role |
|------|------|
| `index.html` | Hub: portal links; no global PIN gate |
| `worker.html` | Worker portal markup |
| `driver.html` | Driver portal markup |
| `admin.html` | Admin tables (timesheets + claims) |
| `styles.css` | Imports design-system CSS |
| `firebase-config.js` | Firebase **web** app config (client SDK) |
| `js/firebase-client.js` | Client Firebase app, auth, Firestore, Storage exports |
| `js/crewhub-auth.js` | Anonymous bootstrap + status line |
| `js/crewhub-helpers.js` | `formatDateKey`, `formatTs`, messages |
| `js/crewhub-identity.js` | Per-worker/driver sessionStorage keys; PIN field helpers |
| `js/api-worker.js` | `fetch` wrappers: login, session, logout, clock-in |
| `js/admin-owner.js` | Allowed admin Firebase UIDs (keep in sync with `firestore.rules` `isCrewOwner`) |
| `js/timesheets-crud.js` | Firestore CRUD helpers for timesheets + live subscribe |
| `js/worker-page.js` | Worker UX: ATM login → clock screen (site dropdown, green/red buttons, 15m clock-in cooldown), clock-out/meal/undo/resume |
| `js/driver-page.js` | Driver claims + identity gate |
| `js/admin-page.js` | Google sign-in (popup by default; optional redirect), UID gate, Firestore roster `setDoc`, live listeners |
| `js/index-page.js` | Hub theme init |
| `api/login.js` | Vercel: PIN verify + session cookie |
| `api/clock-in.js` | Vercel: cookie auth + timesheet create (no GPS) |
| `api/session.js` | Vercel: `GET` session payload for reload |
| `api/logout.js` | Vercel: clear worker cookie |
| `api/admin-verify.js` | Vercel: optional Google token check (`ADMIN_UIDS`) |
| `api/lib/adminAuth.js` | Shared admin Bearer verification (Google + primary owner UID + optional `ADMIN_UIDS`) |
| `api/roster-upsert.js` | Vercel: server roster write (Bearer + same auth) |
| `api/lib/firebaseAdmin.js` | Admin SDK singleton |
| `api/lib/sessionCookie.js` | Session signing + cookie parsing |
| `package.json` | `firebase-admin` for serverless |
| `firestore.rules` / `storage.rules` | Security rules |
| `context.md` | This document |

## Extension notes

- **Hardening:** hash PINs in `worker_credentials`; lock down `timesheets` rules; move clock-out/meal/resume to `/api/*` and remove secrets from the browser entirely.
- **New portal page:** copy an existing HTML shell (header + theme dialog + `app-main`), wire a new `js/*-page.js` module, add CSS only if new patterns appear.
- **Reuse glass UI:** apply `glass` + `panel` (or `glass-inner` for inner chrome).
