# Live Schedule Dashboard

## Account access

The dashboard (`index.html`) is a login-gated single-page app backed by a separate schedule API. Nobody can see dashboard features — filtering, downloads, the People directory, uploads — until they sign in with an approved account. `GET /api/schedule` and `GET /api/safety-badges` themselves are intentionally **public, unauthenticated reads** (restored at the user's explicit request so the no-login TV/kiosk card views keep working); everything else — registration/login/admin management, uploads, and People edits — still requires an approved bearer token.

On first load, the dashboard shows a **Sign in** screen with three tabs:

- **Sign in** — email + password for an approved account.
- **Request access** — email + a password you choose. This calls `POST /api/auth/register` and returns a pending status; the account cannot sign in until an admin approves it. No password is ever sent anywhere except this one request, and the backend only ever stores a secure hash of it — nobody, including admins, can see a user's password.
- **Admin sign in** — the existing bootstrap administrator username/PIN (the `ADMIN_USERNAME`/`ADMIN_PIN` configured on the backend, e.g. via Vercel environment variables). This calls `POST /api/admin/login` and always signs in with the `admin` role.

Enter the backend's HTTPS API base URL in the field above the forms (or open the dashboard with `?api=<base-url>` to have it filled in automatically). The dashboard stores only an account token and the API base in that browser's `localStorage`; it never stores a password. Every request to a protected endpoint sends `Authorization: Bearer <token>`. If any request comes back `401`/`403`, the dashboard immediately clears the stored token and returns to the sign-in screen — there is no fallback to cached or static schedule data.

## Admin: access and displays

An admin sees an **Admin: access & displays** button in the account bar. It opens a panel with two sections:

- **User access requests** — lists every registered account (`GET /api/admin/users`) with its email, status, and role. Changing the status (`pending`/`approved`/`rejected`/`revoked`) and/or role (`viewer`/`admin`) and clicking **Save** calls `PATCH /api/admin/users/:id` with the combined `{status, role}` body.
  - **Admin** accounts can upload schedule CSVs and safety-badge workbooks, publish them to the backend, and do everything a viewer can.
  - **Viewer** accounts can do everything except upload/publish schedule or safety-badge data — they can still view, filter, download reports, and manage the People directory below.
- **Display credentials (kiosk/TV)** — an optional, still-available backend capability for issuing separate, revocable scoped credentials (`POST /api/admin/display-credentials {name}`, `GET /api/admin/display-credentials`, `DELETE /api/admin/display-credentials/:id`). `card_view.html` and `index_display.html` no longer require one: since `GET /api/schedule`/`GET /api/safety-badges` are public reads, kiosk pages just need the backend API base URL (see below), not a setup code.

## People directory

Any approved account (admin or viewer) can open **People directory** from the account bar to remove a person from the shared roster or change their skill, via `PATCH`/`DELETE /api/people/:name`. These edits are persisted on the backend and are visible to every signed-in user — they are distinct from the browser-local, per-shift "mark absent" removals in the **Attendance changes** panel, which only hide a single shift card in the current browser and do not change anyone's profile.

## Unattended TV/kiosk displays

`card_view.html` and `index_display.html` read `GET /api/schedule` and `GET /api/safety-badges` as **public, unauthenticated requests** — no sign-in, setup code, or stored token is required. Each display page:

1. Reads the backend API base URL from a `?api=` query parameter and caches it to that device's `localStorage`, so the page keeps working across reloads/restarts without the query string (for example after a TV loses and regains power).
2. Calls the public schedule/safety-badge endpoints on a fixed interval with no `Authorization` header.
3. If a request fails (network error, backend unreachable), the page keeps showing the last successfully loaded schedule with a "Showing the last loaded schedule." status, or an inline error if nothing has loaded yet — it never falls back to `schedule.json` or a Gist.

Both pages send `Referrer-Policy: no-referrer` so the API base URL and any query parameters are never leaked to the backend via the `Referer` header.

From the dashboard, **Open DC cards**/**Open CDC cards** open `card_view.html` with only the non-secret team/search/role filters and the backend API base in the query string, for example:

`card_view.html?team=DC&api=https%3A%2F%2Fschedule.example.com`

Because `GET /api/schedule`/`GET /api/safety-badges` are public, this URL (and anyone who guesses the backend API base) can read schedule and safety-badge data without signing in — this is an explicit, accepted tradeoff to keep the old no-login kiosk/TV experience working. Writes (uploads, People edits, admin management) still require an approved human account.

## No public/static fallback

Earlier versions of this dashboard embedded a full roster directly in `index.html` and fell back to a committed `schedule.json` (and, for display links, an optional public GitHub Gist) whenever the shared backend was unreachable. All of that has been removed from this version: `index.html` no longer embeds any roster data, `schedule.json` no longer exists in the repository, and none of the dashboard or display pages fall back to it or to a Gist. If the backend is unreachable or a session/credential is invalid, the affected page shows an explicit error and stops — it never substitutes stale or public data.

**Note:** this repository's Git history still contains earlier commits with the embedded roster and `schedule.json`, and any public GitHub Pages deployment, fork, clone, or raw file URL created before this change may still contain copies of that data. Removing files from the current commit does not revoke access to that history; rewriting history was explicitly out of scope for this change.

## Monthly hours report

Select a **Team** (DC or CDC) and **Report month** on the dashboard, then choose **Download monthly hours report**. The Excel workbook includes separate **Monthly hours** and **Weekly hours** sheets. Both summarize scheduled hours, shift count, and coworker count by work role; the weekly sheet presents each Sunday-to-Saturday week as its own side-by-side table, ending with that week's total before the next week begins. Name, role, period, date-view, and other dashboard filters do not change this report.

## Shared safety badges

Admins can upload a safety workbook, which the dashboard normalizes into first-aid, fire-marshal, and working-at-height mappings and atomically publishes to `PUT /api/admin/safety-badges`; publish success or failure is shown without discarding the local result. **Clear safety badges** publishes the corresponding empty mapping. `GET /api/safety-badges` is a public read, so anyone (signed in or not, including the kiosk/TV pages) can see the same three safety badges rendered on cards.

## Backend API contract used by this frontend

- `POST /api/auth/register {email,password}` → `201 {status:"pending",message}`
- `POST /api/auth/login {email,password}` → `200 {token,user:{id,email,role,status}}` (only for approved accounts; pending/rejected/revoked get `403 {error,status}`)
- `GET /api/auth/me` (bearer) → `200 {id,email,role,status,bootstrap}`
- `POST /api/admin/login {username,password}` → `200 {token,user:{id:null,email,role:"admin",status:"approved",bootstrap:true}}`
- `GET /api/admin/users` (admin bearer) → `200 {users:[{id,email,role,status,created_at,updated_at}]}`
- `PATCH /api/admin/users/:id {status?,role?}` (admin bearer) → `200` safe user record
- `GET /api/schedule`, `GET /api/safety-badges` → **public, unauthenticated reads** (no bearer token required, restored at the user's explicit request); unchanged response shapes and `no-store` caching
- `PUT /api/admin/schedule`, `PUT /api/admin/safety-badges` (admin bearer only)
- `PATCH /api/people/:name {role}`, `DELETE /api/people/:name` (any approved bearer) → `200 {version,updated_at,rows_updated|rows_removed}`
- `POST /api/admin/display-credentials {name}` (admin bearer) → `201 {id,name,scope:"dashboard:read",created_at,setup_expires_at,revoked_at,setup_code}` — optional backend capability; not required by `card_view.html`/`index_display.html` now that schedule/badge reads are public
- `POST /api/display-credentials/exchange {code}` → `200 {token,scope:"dashboard:read",displayId}`
- `GET /api/admin/display-credentials` (admin bearer) → `200 {credentials:[{id,name,scope,created_at,revoked_at,activated,setup_pending}]}`
- `DELETE /api/admin/display-credentials/:id` (admin bearer) → `200` revoked metadata, `404` unknown

The backend must allow the dashboard's origin and the `Authorization` and `Content-Type` request headers through CORS.
