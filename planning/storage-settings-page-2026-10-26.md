# Cloud Storage settings page + BYO storage implementation audit

## Context

`planning/byo-storage-audit-2026-10-26.md` records a finished local implementation of
bring-your-own media (Google Drive `drive.file` + Picker, Dropbox App Folder). I re-read the
code against that plan and re-ran the suites: **68 + 20 backend storage tests and 11 frontend
media tests pass**, and the wiring into notes, export, erasure, landing publication and Sentry
scrubbing is real (`services/note_service.py:659,712,753`, `app.py:22`, `services/user_service.py`,
`services/landing_publish_service.py`).

The weak area is **connection management**. Connecting and disconnecting are only available
inside the attach dialog (`CloudMediaDialog.jsx`). The OAuth return path doesn't work for a
user, and the connection model can't say whether an account needs attention. A Settings
page sits exactly on top of these gaps, so the plan fixes them together.

## Audit findings (verified by reading code)

| # | Sev | Finding | Evidence |
|---|---|---|---|
| A1 | P1 | **A revoked or expired grant reports "File unavailable", not "Reconnect".** Google/Dropbox return `400 invalid_grant` on refresh; `call()` maps every non-401/403/404/409/410/429 status to `502 storage_file_unavailable`. The connection stays "connected" forever with dead credentials. | `storage_providers.py:28-31`, `storage_connection_service.py:114-117` |
| A2 | P1 | **Disconnect usually doesn't revoke the grant at Google.** It revokes the *access* token, which is often expired (1h), so revocation fails silently and the refresh grant stays in the user's Google account. Google accepts the refresh token at `/revoke`, which kills the whole grant. Dropbox needs a valid access token, so it has to refresh first. Same issue in `disconnect_all` (erasure). | `storage_connection_service.py:127-128,143` |
| A3 | P1 (UX) | **The OAuth return lands nowhere.** On success the popup redirects to `/?storage=connected`, which no frontend code reads, so the full app loads inside the popup. On cancel/denial (`?error=access_denied`), expiry or account mismatch, the popup shows a **raw JSON error body**, because the blueprint error handler returns JSON. | `storage_api.py:28-34,77-90`; grep finds no `storage=` handling in `client/src` |
| A4 | P2 | **No connection status in the model.** `credentials IS NULL` means "user disconnected", "provider revoked" and "erasure" alike. There's no `connected_at`/`updated_at`/`scopes`/`status`, which the original plan specified ("granted scopes, status"). | `models/storage.py:15-27` |
| A5 | P2 | **Connection management lives in a file picker.** "Disconnect" and "Refresh connections" sit inside "Attach pictures or video". There's no place to see which accounts are connected, how many attachments depend on them, or the upload limits. | `CloudMediaDialog.jsx:104-117` |
| A6 | P2 | **Disconnect invalidates the entire query cache** (a predicate matching everything except itself), and the hook uses an ad-hoc key instead of `queryKeys`, against the index.md "narrow invalidation root" invariant. | `useStorageConnections.js:9,15` |
| A7 | P3 | Upload provider fallback is computed inline in a 160-char expression (`CloudMediaDialog.jsx:81`); the dialog's `connect()` popup logic belongs to the shared hook once two surfaces use it. | — |

Accurate claims I confirmed: PKCE + hashed single-use state + browser-bound Lax cookie,
fixed endpoints / no redirects, signature sniffing, range validation, the erasure lock, no
secrets in serialization, and support impersonation is denied.

## Grade of the current implementation (with respect to this plan)

| Dimension | Grade | Why |
|---|---|---|
| Security core (OAuth, tokens, streaming) | **A** | Careful PKCE/state/cookie binding, sealed creds, bounded streams. A2 is the gap. |
| Data model for connections | **C** | No status, timestamps or scopes; states are conflated (A4). |
| Failure semantics | **C** | Revoked grants are misreported (A1); callback errors are raw JSON (A3). |
| Connection-management UX | **D** | No settings surface; dead `?storage=connected`; disconnect is hidden in a picker. |
| Frontend data-layer conventions | **B-** | Ad-hoc key, global invalidation (A6). |
| **Overall** | **B-** | Strong engine; the user-facing lifecycle around it is unfinished. |

## S+ plan

### 1. Backend: connection lifecycle (fixes A1, A2, A4)

**Migration** `migrations/versions/<rev>_storage_connection_status.py` (append-only):
- Add `status` String(24) NOT NULL with CHECK `IN ('active','reconnect_required','disconnected')`.
  Backfill: `credentials IS NULL` → `disconnected`, else `active`.
- Add `connected_at` DateTime (backfill from `created_at`), `updated_at` DateTime, and
  `scopes` Text (nullable; populated on the next connect).
- Downgrade drops the columns. Extend `tests/integration/test_storage_migration.py` with a
  backfill + downgrade/reapply case.

`models/storage.py:StorageConnection`: add the columns. `status` is the single source of truth.
`credentials` stays as the secret, and the invariant is `status == 'active' ⇔ credentials IS NOT NULL`.
Enforce it with a CHECK constraint in the same migration.

`services/storage_providers.py`:
- `token_request` accepts `400` and raises `StorageError(..., 409, 'storage_reconnect')` when
  the body's `error` is `invalid_grant` (other 400s stay 502). Parse only the `error` field and
  never log the body.
- `revoke(provider, credentials)`: Google posts the **refresh token**; Dropbox revokes with an
  access token the caller has just ensured is fresh.

`services/storage_connection_service.py`:
- `access_token`: on `storage_reconnect` from refresh, set `status='reconnect_required'`,
  `credentials=None`, `updated_at`, commit, then re-raise. Every caller (media, picker, upload)
  then gets the right code, and Settings shows it.
- `callback`: set `status='active'`, `connected_at`, `scopes`, `updated_at`.
- `disconnect` / `disconnect_all`: share one `_revocation(row)` helper (Google: refresh token;
  Dropbox: refresh-if-expired, then access token). Destroy local credentials and set
  `status='disconnected'` first, commit, then do best-effort remote revocation (the
  `disconnect_all` ordering already does this; `disconnect` adopts it so a slow provider
  never holds the row lock).
- `connection()` also requires `status == 'active'`.
- `list_connections` returns `{providers: [...], limits: {...}}`. Each provider has
  `provider, configured, status ('unavailable'|'not_connected'|'active'|'reconnect_required'|'disconnected'),
  account_label, connected_at, attachment_count`. `attachment_count` comes from one grouped query:
  live `note_attachments` joined to `media_assets` and to `notes` with `deleted_at IS NULL`.
  `limits` = `{max_file_bytes: config.STORAGE_MAX_FILE_BYTES, max_attachments: MAX_ATTACHMENTS}`.
  No secrets, scopes or provider account IDs leave the server.
- `services/storage_common.serialize_asset`: `available` derives from `connection.status == 'active'`.

### 2. Backend: user-facing OAuth return (fixes A3)

`blueprints/storage_api.py` `callback`:
- Wrap the whole body. Every outcome is a `303` to
  `{APP_BASE_URL}/storage/connected?provider=<p>&result=<code>`, and the state cookie is always
  cleared. `result` is from a fixed allowlist: `connected`, `cancelled` (provider `error` param
  present), `expired`, `wrong_browser`, `account_mismatch`, `permissions`, `unavailable`, `failed`.
  Map from `StorageError.code`. Add explicit codes where the service currently uses the generic
  `storage_error` (mismatch → `storage_account_mismatch`, scopes → `storage_permissions`).
  Provider text, codes and state are never reflected.
- An unknown `provider` in the path still gets a 404 JSON response, so the route can't act as
  an open redirect.

### 3. Frontend: shared connection hook (fixes A6, A7)

- `hooks/queryKeys.js`: add `storageConnections: () => ['storage', 'connections']`. Logout
  already clears the cache per user.
- `hooks/useStorageConnections.js` (rewrite, keep the name): returns
  `{ providers, limits, isLoading, isError, refetch, connect(provider), disconnect(provider), isDisconnecting }`.
  - `connect` takes over the popup logic from `CloudMediaDialog.connect` (synchronous
    `window.open('about:blank')`, `opener = null`, then set the location; close it on failure).
  - `disconnect` invalidates only the attachment-bearing roots: `allNotesRoot`, `goalNotesRoot`,
    `sessionNotesRoot`, `goalTimelinesRoot`, `activity-definition-notes`, `previous-session-notes`.
    Add an `attachmentReadModelRoots(rootId)` helper in the hook's module. Disconnect is
    account-scoped, so invalidate by key prefix without `rootId`.
  - It subscribes to `BroadcastChannel('fractal-storage')` (feature-detected) and refetches on a
    `storage-connection` message. It keeps `refetchOnWindowFocus` as the fallback.
- New `pages/StorageConnected.jsx` (lazy) at `/storage/connected`:
  - Reads `provider`/`result` from the allowlist and posts it on the channel.
  - Calls `window.close()`. If the window stays open (same-tab or blocked popup), it renders a
    short status with copy per result and an "Open cloud storage settings" link to `/?settings=storage`.
  - `AppRouter.jsx`: add it alongside `/reset-password` in the pre-`<Routes>` branch, and exclude
    it from `agentShellAvailable`/nav (otherwise `activeRootId` would read `"storage"`).
- `AppRouter.jsx`: `?settings=<tab>` opens `SettingsModal` with `initialTab`, then strips the
  param with `navigate(..., { replace: true })`.

### 4. Frontend: Settings → Cloud Storage tab (fixes A5)

- `components/modals/SettingsModal.jsx`: add `{ id: 'storage', label: 'Cloud Storage' }` after
  "AI Connections". Accept an `initialTab` prop (`useState(initialTab || 'general')`). Render
  `<StorageConnectionsPanel />`. The file is 578/650 lines, so the net addition stays at ~8 lines.
- New `components/settings/StorageConnectionsPanel.jsx` + `.module.css`, following
  `AgentConnectionsPanel` structure (sections, `providerCard`) and reusing existing tokens and
  `atoms/Button`:
  - **Intro**: "Attach pictures and video from your own cloud storage. Originals stay in your
    account; Fractal Goals stores only a reference."
  - **One card per provider**, with state-driven content:
    - `unavailable`: "Not available on this deployment yet." No button.
    - `not_connected` / `disconnected`: a one-line permission explainer (Drive: "Only files you
      pick or upload through Fractal Goals." Dropbox: "Only the Apps/Fractal Goals folder."),
      then **Connect**. For `disconnected` with `attachment_count > 0`: "N attachments are
      unavailable until you reconnect this account." The button reads **Reconnect**.
    - `active`: account label, "Connected <date>", "Used by N attachments", where uploads go,
      then **Disconnect**.
    - `reconnect_required`: warning tone, "Access expired or was removed in <Provider>. N
      attachments are unavailable." Primary **Reconnect**.
  - **Disconnect** opens `DeleteConfirmModal` (`confirmText="Disconnect"`) with copy that
    attachments stop displaying, files stay in the provider and access is revoked.
  - **Limits** footer: max file size (formatted from `limits.max_file_bytes`), `max_attachments`
    per note, supported formats, "Media needs an internet connection", link to `/privacy`.
  - Loading, error (with retry) and in-flight states; `role="status"`/`alert` like the agent panel.
  - Results arriving over the channel show an inline status line (e.g. "Dropbox connected." /
    "Connection cancelled.") using the same allowlist copy as `StorageConnected`. Put the copy
    in `utils/storageConnectionCopy.js`, shared by both.
- `components/notes/CloudMediaDialog.jsx`: use the hook's `connect`. **Remove** Disconnect and
  "Refresh connections" (superseded). Show `reconnect_required` as **Reconnect**. Add a "Manage
  cloud storage" link to `/?settings=storage`, opened in a new tab so the note draft is preserved.
  Extract the upload provider choice into a named `uploadProvider` const (A7).

### 5. Docs

- `index.md` media paragraph: connection `status` lifecycle, the Settings → Cloud Storage
  ownership (`StorageConnectionsPanel`, `useStorageConnections`), and the `/storage/connected`
  return route.
- `docs/architecture/BYO_MEDIA_RUNBOOK.md`: the callback now redirects to `/storage/connected`
  (the provider console redirect URI is unchanged: `/api/storage/<p>/callback`); reconnect
  semantics; and that revocation uses the refresh token.
- After approval, save this plan as `planning/storage-settings-page-2026-10-26.md` and add a
  short "Follow-up" pointer to it in the BYO audit doc.

## Critical files

Backend: `models/storage.py`, `services/storage_providers.py`,
`services/storage_connection_service.py`, `services/storage_common.py`, `blueprints/storage_api.py`,
new migration, `tests/unit/services/test_storage_service.py`, `test_storage_providers.py`,
`tests/integration/test_storage_migration.py`.

Frontend: `hooks/queryKeys.js`, `hooks/useStorageConnections.js`, `components/modals/SettingsModal.jsx`,
new `components/settings/StorageConnectionsPanel.jsx(+css)`, new `pages/StorageConnected.jsx`,
new `utils/storageConnectionCopy.js`, `AppRouter.jsx`, `components/notes/CloudMediaDialog.jsx`,
plus tests under each `__tests__/`, and `e2e/note-media.spec.js` (or a new `settings-storage.spec.js`).

## Verification

Backend (`./run-tests.sh file …`):
- Refresh `400 invalid_grant` → status `reconnect_required`, credentials destroyed, `409 storage_reconnect`.
  Other 400s still map to 502.
- Disconnect posts the Google **refresh** token to `/revoke`. Dropbox refreshes an expired access
  token before revoking. Remote failure still leaves `status='disconnected'` and `credentials=None`.
- Callback: each failure maps to the right `result`, the cookie is always cleared, and no
  provider text appears in the `Location` header. An unknown provider gives a 404.
- `list_connections`: per-state output, attachment counts exclude soft-deleted notes, and
  there are no secrets/scopes/account IDs (assert on the key set).
- Migration backfill, CHECK invariant, and downgrade/reapply.

Frontend (`npx vitest run …`):
- The panel renders all five states, and Disconnect confirm → mutation → narrow invalidation
  (spy on `invalidateQueries` keys).
- A channel message triggers refetch + status line.
- `StorageConnected` posts the allowlisted message and calls `window.close`; an unknown
  `result` → `failed`.
- `SettingsModal` honours `initialTab`. `CloudMediaDialog` no longer renders Disconnect.

Gates: `./run-tests.sh lint` (ESLint, maintainability budgets unchanged, responsive audit,
tsc, basedpyright) and `cd client && npm run build` (bundle budgets: the panel and page are lazy).

Browser: run the app with providers unconfigured and with fake client IDs. Open Settings →
Cloud Storage at desktop and mobile widths. Hit `/storage/connected?provider=dropbox&result=cancelled`
directly to check the fallback page and `/?settings=storage` deep link. Add a Playwright case
covering the unavailable state and the deep link.

Out of scope (the real-provider release gates in the BYO audit still apply): live Google/Dropbox
app creation, multiple accounts per provider, encryption-key-version column (MultiFernet rotation
is documented in the runbook).

## Implementation notes (2026-10-26)

Delivered as planned, with these deliberate deviations:

- **Inline disconnect confirmation** inside the provider card instead of `DeleteConfirmModal`. That
  modal always says "This action cannot be undone", which is false for a disconnect, and it would have
  stacked a second modal on Settings.
- **Status badge uses `atoms/Badge`**. Bespoke badge selectors exceeded the maintainability
  compact-label budget (184), which was kept unchanged.
- **Flask SPA route added** for `/storage/connected` in `blueprints/pages.py` (nginx already falls back
  to `index.html`); found by the new browser spec.
- **Deep link** `?settings=<tab>` is handled with render-time state adjustment keyed on
  `location.key` (only the URL strip is an effect), satisfying `react-hooks/set-state-in-effect`.
- The first storage migration test now re-applies `f3a5c7e9b1d4` so the shared test schema ends at head.

Verification: backend storage 68 + 18 new + 20 provider + 2 migration tests; client route test;
19 new/updated frontend tests (panel, return page, hook, dialog); `./run-tests.sh lint` and
typecheck green; production build within budgets; `alembic upgrade head` + `check` + downgrade/reapply
on a disposable database; Playwright `settings-storage.spec.js` + `note-media.spec.js` 8/8 on
desktop and mobile.
