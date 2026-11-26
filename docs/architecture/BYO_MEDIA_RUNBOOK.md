# Bring-your-own media storage

The original image/video stays in the user's Google Drive or Dropbox account. PostgreSQL
stores encrypted connection credentials, stable file references and note attachment metadata.
Provider permissions are unchanged by attachment creation. Private content streams through
the authenticated API and is excluded from public landing snapshots and service-worker caches.

## Availability and configuration

Integrations report unavailable until their configuration exists. Do not register developer
apps with personal generated access tokens or service-account credentials: each user grants
their own OAuth connection. No developer apps existed at implementation time, so real-account
authorization, codec compatibility, provider quotas and mobile playback remain release gates.

Set these backend values through the deployment's secret/environment management:

| Variable | Purpose |
|---|---|
| `APP_BASE_URL` | Exact frontend origin, such as `https://my.fractalgoals.com`; OAuth callbacks must reach its `/api` proxy. |
| `STORAGE_ENCRYPTION_KEYS` | Comma-separated Fernet keys; the first encrypts and all can decrypt during rotation. Keep separate from JWT signing keys. |
| `GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` | Confidential OAuth web client. |
| `GOOGLE_PICKER_API_KEY` | Browser-visible Google Picker key, restricted to production origins and the required APIs. |
| `GOOGLE_PICKER_APP_ID` | Google Cloud numeric project number for Picker. |
| `DROPBOX_CLIENT_ID` / `DROPBOX_CLIENT_SECRET` | Dropbox scoped App Folder app key and secret. |
| `STORAGE_MAX_FILE_BYTES` | File ceiling; defaults to 100 MiB and cannot exceed 500 MiB. |

Generate a Fernet key on a trusted operator machine using the installed cryptography package;
put it directly into the secret manager. Never commit it, paste it into a ticket or print it
in deployment logs. Keep old keys available until credentials have been re-encrypted through
refresh/reconnection or a separately reviewed rotation job. Losing all decrypting keys requires
users to reconnect; a database backup alone does not recover these credentials.

Production should use `VITE_API_URL=/api`, the frontend nginx proxy, and secure session cookies.
Media elements do not use Axios bearer interceptors. Verify cookie-authenticated playback from
the actual frontend origin rather than assuming an API token in JavaScript authenticates an
`img` or `video` request. Deploy the frontend image and backend migration together.

### Production registration (Fractal Goals)

| | Google Drive | Dropbox |
|---|---|---|
| Console | Google Cloud project `fractal-goals` (number `195572181270`) → Google Auth Platform | Dropbox App Console |
| App name | Fractal Goals | Fractal Goals (scoped access, **App folder**; the folder is `Apps/Fractal Goals`, matching `DROPBOX_APP_FOLDER`) |
| Redirect URIs | `https://my.fractalgoals.com/api/storage/google_drive/callback`, `http://localhost:5173/api/storage/google_drive/callback` | `https://my.fractalgoals.com/api/storage/dropbox/callback`, `http://localhost:5173/api/storage/dropbox/callback` |
| Scopes | `drive.file` only (non-sensitive: brand verification, no security assessment) | `account_info.read`, `files.metadata.read`, `files.content.read`, `files.content.write` |
| Logo | `client/public/brand/logo-120.png` | `client/public/brand/logo-64.png`, `logo-256.png` |
| Home / privacy / terms | `https://fractalgoals.com`, `/privacy`, `/terms` | same |
| Secrets | `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_PICKER_API_KEY` | `DROPBOX_CLIENT_ID`, `DROPBOX_CLIENT_SECRET` |

`cloudbuild.yaml` deploys every one of these secrets (`tests/integration/test_deploy_gates.py` checks
it), so each must exist in Secret Manager, readable by `fractal-runtime@`, before a deploy; a missing
one fails the backend deploy step before traffic moves. The logos are generated with the rest of the
brand assets (`npm run brand:assets` in `client/`).

Google requires the privacy policy to state that use of Google user data follows the Google API
Services User Data Policy, including the Limited Use requirements; Privacy Policy 1.4 (§2.2,
"Optional connected media storage") does. Brand verification was submitted on 2026-11-22.
Dropbox's app stays in Development (up to 500 linked users) until it is approved for Production;
apply once 50 users have linked.

### Google Drive setup

1. Create/configure a Google Cloud project, enable Google Drive API and Google Picker API,
   and configure the OAuth consent branding/audience and authorized domains.
2. Register a web OAuth client. Its exact redirect is
   `<APP_BASE_URL>/api/storage/google_drive/callback`; register the frontend's origin as required.
3. Configure the API key for Picker with referrer/API restrictions and the project number.
4. Request only `https://www.googleapis.com/auth/drive.file`. Users select existing files with
   Picker; uploading creates files inside a visible **Fractal Goals** folder in My Drive.
5. Complete the provider's production publishing/verification requirements for the actual app.
   **The consent screen must be published ("In production"): while it is in Testing, Google expires every
   refresh token after seven days and everyone has to reconnect weekly.** Brand verification being pending
   doesn't cause that; the publishing status does.
6. Connections stay connected: access tokens renew from a stored refresh token, and the daily retention job
   uses any connection idle for 30 days (`StorageConnectionService.keep_alive`) because Google drops a refresh
   token unused for six months. Give that job the storage secrets the backend has; without them it skips this.
   Only `invalid_grant` ends a connection: a wrong client secret, say, leaves it as it was.

Picker needs a short-lived access token in browser memory. `/storage/google_drive/picker`
returns it with `private, no-store`; it is never placed in Markdown, a URL, React Query's
persisted cache, an outbox operation or account export. The backend keeps refresh credentials.
[Scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth),
[Picker](https://developers.google.com/workspace/drive/picker/guides/overview),
[web OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).

### Dropbox setup

1. Register a scoped **App Folder** API app. The UI explains that existing files must be in
   the app's folder under `Apps/`; it does not silently request Full Dropbox access.
2. Enable `account_info.read`, `files.metadata.read`, `files.content.read` and
   `files.content.write`. The callback is `<APP_BASE_URL>/api/storage/dropbox/callback`.
3. Configure the app key/secret and complete applicable production approval before broad use.
4. Test selection from the app folder, local uploads and streaming by file ID.

The implementation uses authenticated downloads, not expiring temporary download links.
Dropbox upload filenames have an upload-ID prefix so an ambiguous final response can be
recovered without overwriting or duplicating a user's original file.
[Access models](https://docs.dropboxapi.com/dropbox-api/docs/developer-resources/developer-guide),
[download API](https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/download).

## User workflow and limits

Open **Attach pictures, video or audio** in the shared note composer or an existing editable note.
Connect an account in the separate authorization window, return to the app and refresh its
connection list. Choose a Drive file, choose from the Dropbox app folder, or upload a local file.
Add a description and save the note/attachments. Notes, goal notes, goal reviews, session,
activity and circuit note cards share this renderer and attachment editor. Text remains required.

Supported formats are JPEG, PNG, WebP, GIF, MP4, WebM, MP3, M4A, WAV, FLAC and OGG/Opus. One
canonical table (`MEDIA_TYPES` in `services/storage_common.py`, mirrored by `client/src/utils/cloudUpload.js`
and checked against `tests/fixtures/media_types.json`) owns types, kinds, extensions and the aliases
browsers and providers use (`audio/x-m4a` → `audio/mp4`). Every boundary (upload start, Drive and
Dropbox metadata, import, playback revision checks) stores and compares the canonical type, so an
alias never reads as a changed file; Dropbox types come from the extension table, never the host's
mime database. Metadata, filename extensions and binary signatures are checked; browser codec
support still determines whether video or audio plays, and audio the browser reports it cannot
decode shows a link to the original instead of a dead player. Audio has no poster request.
HEIC/MOV conversion and transcoding are not implemented. There are at most 8 attachments per
note, 1,000 media references per fractal and 16 unfinished uploads per fractal. Completed upload
rows do not count toward the unfinished limit. Upload sessions expire after 24 hours and old
rows are pruned when starting another upload. A transfer can resume after a network failure
while its dialog/file remains open; reloading the page requires selecting the file again.

Uploads use bounded 1 MiB chunks. Confirmed offsets make chunk retries safe; Drive upload-status
queries and Dropbox correct-offset/file-ID recovery handle an ambiguous provider response.
Cancelling removes the local upload record. Files already committed to the provider remain
there; users can remove unwanted originals from Drive/Dropbox. Do not add automatic remote
deletion to note removal, cancellation or account erasure.

Stable file IDs survive moves/renames. Playback checks the content checksum/revision and size
before each read and refuses detected changes. These references are not archival copies:
editing a cloud file concurrently with a read can race its metadata check. Keep attached
originals unchanged and create distinct files for new evidence. A changed source requires
choosing a new provider file. Reconnecting a different account is rejected while references
to the original account remain; account switching/multiple accounts per provider is not supported.

## Acceptance record

Real-provider runs of the matrix above. Local runs use `http://localhost:5173` with the development
apps; the production row is the post-deploy smoke. Result: ✅ pass, ❌ fail (link the fix), ➖ not run.

| Case | Google Drive | Dropbox |
|---|---|---|
| Connect, cancel consent, reconnect | ➖ | ➖ |
| Choose an existing file (Picker / app folder) | ➖ | ➖ |
| Upload from device: picture, ~50 MB video, M4A, MP3, WAV | ➖ | ➖ |
| Interrupted upload resumes | ➖ | ➖ |
| Attach to a note and a goal description; save, reload | ➖ | ➖ |
| Play and seek (200 / 206 / 416), video poster | ➖ | ➖ |
| Open original, rename, move to trash (removed from every note) | ➖ | ➖ |
| Missing or replaced original refused | ➖ | ➖ |
| Disconnect; revoke at provider → Reconnect shown with count | ➖ | ➖ |
| Second account: other user's and other fractal's media refused | ➖ | ➖ |
| Blocked third-party cookies (callback still lands) | ➖ | ➖ |
| iOS Safari: Voice Memo M4A, video poster, OGG fallback link | ➖ | ➖ |
| Desktop Chromium playback | ➖ | ➖ |
| Production smoke after deploy (one file round trip) | ➖ | ➖ |

## Connection lifecycle and the OAuth return

`storage_connections.status` is `active`, `reconnect_required` or `disconnected`; a CHECK
constraint keeps credentials present exactly while a connection is `active`. A refresh answered
with `invalid_grant` (grant revoked or expired at the provider) destroys the dead credentials and
sets `reconnect_required`, so playback, Picker and uploads answer `409 storage_reconnect` and
Settings → Cloud Storage offers Reconnect with the count of affected attachments.

Uploads from a device, paste or drop go to the user's upload destination: the connection flagged
`upload_default` (one per user, enforced by a partial unique index; set with
`PUT /api/storage/upload-destination`) while it is active, otherwise the first active connection.

From a note's options menu, **Manage attachments** renames an original in the user's storage
(`PATCH /api/<root>/media/<asset>`; the extension and so the type cannot change, and the file ID and
content hash are unchanged) or deletes it (`DELETE …/media/<asset>` after `GET …/usage`). Deleting
moves the file to the Google Drive trash or Dropbox deleted files, where the user can restore it for a
limited time, and removes it from every note that used it. Drive only lets a file's owner trash it;
that refusal is reported as `storage_forbidden`, not as a reconnect. Removing an attachment from a note
never touches the original.

Each attachment's caption links to the original in a new tab through `GET …/media/<asset>/open`,
which checks ownership and redirects to a fixed provider host: Drive's file page (with its resource key
when one is needed), or the file's folder in Dropbox (`DROPBOX_APP_FOLDER`, default "Fractal Goals",
falling back to the app folder when the file has moved or Dropbox is disconnected). File IDs and
resource keys never appear in note data.

Goal descriptions and goal completion notes take attachments too. Completion notes are ordinary
notes. Description media lives in `goal_attachments` (cascades with the goal or asset); it is read on
demand rather than with goal trees, counted in Settings and usage, removed when the original is
deleted, exported per fractal, and stripped from public landing snapshots with every other
`attachments` key.

The provider redirect URIs stay `/api/storage/<provider>/callback`. The callback always answers
`303` to `/storage/connected?provider=<p>&result=<code>` with a fixed result allowlist
(`connected`, `cancelled`, `expired`, `wrong_browser`, `account_mismatch`, `permissions`,
`unavailable`, `failed`); provider error text is never reflected. That page tells open app tabs
the outcome over a `fractal-storage` BroadcastChannel and closes itself, or links to
`/?settings=storage` when it cannot close. Unknown provider paths answer 404, never a redirect.

Session-note attachment updates use the existing ordered outbox and retain rich metadata for
optimistic rendering. Uploads/selection/playback require connectivity; original file bytes are
never stored by the text outbox or offline query cache.

## Privacy, deletion and recovery

- Every media read authenticates inside an owned fractal and requires the media to be attached to a live note or goal, or attached to nothing yet (so its owner can preview it before saving). Media whose only attachments are on deleted notes or goals is refused, and media is only ever served to the user whose storage account it came from.
- Media is streamed in range pieces of at most 8 MiB (`MAX_RANGE_BYTES` in `services/media_stream.py`). Cloud Run rejects any response over 32 MiB that declares its length, so an open-ended `Range: bytes=0-` from a video player is cut to one piece, and a full download of a large file is sent chunked without a `Content-Length`.
- Video posters come from `GET /api/<root>/media/<id>/thumbnail`, which returns the provider's own preview image (Drive `thumbnailLink`, fetched only from `lhN.googleusercontent.com`; Dropbox `get_thumbnail_v2`). It uses the same access rule as playback, is capped at 2 MiB, and may be kept in the viewer's own browser cache for an hour (`private, max-age=3600`). Every other storage response is `private, no-store`. Nothing of the video itself loads until the user presses play.
  Admin support impersonation cannot use cloud-storage routes.
- Credentials and provider upload sessions use authenticated encryption. OAuth state is random,
  stored hashed, expires in ten minutes and is consumed once; exchanges use PKCE. A separate
  HttpOnly, SameSite=Lax browser cookie binds the callback to the browser that initiated consent
  while the main production auth cookie stays Strict. Production uses a Secure `__Host-` cookie.
- Disconnect destroys local credentials first, then attempts provider revocation even if the
  access token has expired: Google revokes the refresh token (ending the whole grant); Dropbox
  refreshes an expired access token before revoking. Users can also revoke the app in their
  provider's security settings.
- Erasure requests disconnect storage. Foreign-key cascades remove connection, authorization,
  upload and attachment metadata on hard account/root deletion. Provider originals remain.
- Exports contain attachment metadata and provider file IDs, never credentials or playback
  capabilities. An export/DB restore does not restore deleted cloud files.
- Public publication removes attachment data recursively and avoids loading private asset
  relationships for its bulk goal-note projection. Do not publish private media via owner tokens.
- nginx excludes OAuth callbacks from access logs. Gunicorn logs URL paths without query strings.
  Server/browser Sentry excludes storage requests/capability breadcrumbs and spans; server
  frame-local capture is disabled and replay continues to mask text/inputs and block media.

The privacy disclosure describes optional storage and US hosting. The legal entity/address
placeholders remain at the user's explicit request. Finalize/version the legal documents and
their acceptance record before publishing a production privacy-policy revision.

## Operational verification and release gates

Run `./run-tests.sh lint`, the normal suites, production dependency audits and browser checks.
The frontend CI builds nginx and runs `scripts/check_frontend_headers.py`, checking security
headers on `/`, deep links, the HTML shell, worker, manifest and 404 responses. Do not relax
header inheritance or bypass that check to add caching rules.

The API streams at most the recorded file size, reads bounded chunks, validates partial-range
responses, closes upstream connections on cancellation and uses finite connect/read/stream
deadlines. Large media occupies WSGI threads and incurs proxy egress. Before enabling the
integrations for general users, measure concurrent image/video playback against hosting request
and worker budgets; use a separately scaled media service if those measurements require one.

Real-provider acceptance must record: two accounts with cross-user/root denial; selection and
upload without public sharing; refresh/expired consent; logout/disconnect; missing/replaced files;
blocked third-party cookies; Safari/iOS and desktop Chromium playback, including an iPhone Voice Memo
(M4A), an MP3 and a WAV attached from each provider; codec fallback (OGG on Safari); seeking
with `200`, `206` and `416`; quota/throttling; cancellation and lost-response recovery; and
latency/memory/bandwidth at the supported file limit. Local protocol mocks do not establish those
provider/browser properties. Keep the integration unconfigured until this evidence is collected.
