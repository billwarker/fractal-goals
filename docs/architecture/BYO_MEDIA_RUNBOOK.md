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

### Google Drive setup

1. Create/configure a Google Cloud project, enable Google Drive API and Google Picker API,
   and configure the OAuth consent branding/audience and authorized domains.
2. Register a web OAuth client. Its exact redirect is
   `<APP_BASE_URL>/api/storage/google_drive/callback`; register the frontend's origin as required.
3. Configure the API key for Picker with referrer/API restrictions and the project number.
4. Request only `https://www.googleapis.com/auth/drive.file`. Users select existing files with
   Picker; uploading creates files inside a visible **Fractal Goals** folder in My Drive.
5. Complete the provider's production publishing/verification requirements for the actual app.
   Confirm refresh-token behavior while the consent screen remains in Testing.

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

Open **Attach pictures or video** in the shared note composer or an existing editable note.
Connect an account in the separate authorization window, return to the app and refresh its
connection list. Choose a Drive file, choose from the Dropbox app folder, or upload a local file.
Add a description and save the note/attachments. Notes, goal notes, goal reviews, session,
activity and circuit note cards share this renderer and attachment editor. Text remains required.

Supported formats are JPEG, PNG, WebP, GIF, MP4 and WebM. Metadata, filename extensions and
binary signatures are checked; browser codec support still determines whether a video plays.
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

- Every media read authenticates and checks a live note attachment inside an owned fractal.
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
blocked third-party cookies; Safari/iOS and desktop Chromium playback; codec fallback; seeking
with `200`, `206` and `416`; quota/throttling; cancellation and lost-response recovery; and
latency/memory/bandwidth at the supported file limit. Local protocol mocks do not establish those
provider/browser properties. Keep the integration unconfigured until this evidence is collected.
