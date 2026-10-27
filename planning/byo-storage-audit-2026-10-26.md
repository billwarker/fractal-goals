# App readiness and bring-your-own-storage audit — October 26, 2026

## Verdict and scope

The app has a sound extension point for media: canonical notes already attach to goals,
sessions, programs, activities and circuit contexts. Keep that ownership model and build one
attachment system around it. Recommend Google Drive first for private selected-file access,
followed by Dropbox; retain pasted public links as a separate, explicitly shared option.

Current rank: strong architectural foundation, below S+ production readiness. A production
frontend build succeeds, but checked-in quality gates fail and durable private attachments
do not exist. This is a repository audit with focused executable checks, not a complete
security assessment, full-suite certification or inspection of deployed cloud settings.
No application behavior was changed during this audit.

## Current implementation

| Area | Evidence and implication |
|---|---|
| Architecture | `index.md`, service-owned mutations, root ownership, React Query, offline outbox and append-only migrations provide appropriate boundaries. Extend these rather than adding provider logic to components or duplicating goal notes. |
| Notes | `models/common.py:Note` stores text and context references; `services/note_service.py` checks root/context ownership. `validators/notes.py` limits content to 5,000 characters. There is no attachment relation or connected-storage model. |
| Existing embeds | `client/src/utils/videoEmbeds.js` recognizes YouTube, Instagram, Drive file previews and HTTPS video paths ending in known extensions. A Drive folder stays a link. Standard Dropbox share links have no dedicated parser. |
| Pictures | React Markdown can render `![description](https://host/image.jpg)`. A provider's HTML sharing page is not an image URL. There is no dedicated image picker, uploader, thumbnail lifecycle, responsive image renderer or image error UI. |
| Safety and playback | No raw note HTML is injected. Executable frames use a provider allowlist and sandbox; source links remain available. Native videos use `preload="none"`. These are useful foundations, but do not authorize private media. |
| Account operations | `services/data_export_service.py` exports note text. `_landing_public_tree.py` publishes note data into public examples. New attachment references need explicit export and publication rules. |
| Offline | `client/vite.config.js` caches the app shell/assets, not arbitrary external media. Text availability offline does not imply video/image availability. |
| CI | Backend/frontend workflows define migration, coverage, dependency, build and browser checks. Their existence is useful evidence of process, not evidence that the current checkout passes them. |

## Prioritized findings

### P1 — nginx security headers are lost on the app shell

`client/nginx.conf:8–18` declares CSP, HSTS, frame protection and other security headers at
server scope. `/index.html`, `/`, service-worker and asset locations declare their own
`add_header Cache-Control`. With default nginx inheritance, that suppresses the entire
parent `add_header` set. The intended iframe policy therefore is not reliably applied to
the HTML document. Confirm response headers in the production container and deployed edge.

Use a common header include in the necessary locations, or a deliberately supported
inheritance strategy with a pinned nginx version. The floating `nginx:alpine-slim` image
currently prevents assuming a particular version. Test `/`, a deep SPA URL, `/index.html`,
assets, service-worker files and errors. API response CSP does not secure the separately
served frontend document. [nginx inheritance documentation](https://nginx.org/en/docs/http/ngx_http_headers_module.html#add_header).

### P1 — current quality checks fail

`./run-tests.sh lint` passes ESLint, then stops at frontend maintainability violations:

- Size budgets: `GoalHierarchySelector.test.jsx` 460/450, `SessionPlanCard.jsx` 460/450,
  `offline/outbox.js` 478/450, `Analytics.jsx` 572/560, `CreateSession.jsx` 658/625,
  `utils/api/__tests__/core.test.js` 687/665 lines.
- Import ordering: `PlanActivitySummary.jsx`, `useGoalCharts.js`,
  `useSessionDetailController.js`, `AppUpdatePrompt.jsx`, `sessionOpHandlers.js`.
- Undefined `--color-bg-surface-hover` token and 187 compact-label selectors against a 184 budget.

Independent type checks also fail: backend reports 15 errors across activities/circuits
routes, idempotency responses, session updates, circuit timing/services and goal review rules.
Frontend reports `programCalendarGoalEvents.js:74`, accessing `id` on `object`.
Resolve underlying contracts and coherent module ownership; do not increase budgets or add
baseline suppressions merely to obtain a passing result.

### P1 for private-media release — attachment authorization and secret storage are absent

Current embeds rely on provider sharing permissions/browser state. They do not turn a
restricted file into app-authorized content. No external OAuth credential lifecycle,
encrypted refresh-token store or media authorization service was found.
The existing delegated agent OAuth server issues credentials for access *to this app*;
its hashed credentials are not a reusable outbound provider token store.

### P2 — Drive parsing discards resource keys

`videoEmbeds.js:138` reconstructs the preview from the ID alone, dropping query parameters
such as `resourcekey`. Some link-shared files require that key, so the original link can
work while the reconstructed preview does not. Preserve applicable access metadata and
test a real resource-key-protected preview. [Google resource keys](https://developers.google.com/workspace/drive/api/guides/resource-keys).

### P2 — failure handling and image performance need completion

`VideoEmbed.jsx:70` has no native-video `onError` state. Drive relies on iframe `onError`,
which cannot reliably classify a provider's rendered permission/error page across origins.
Use backend metadata/access checks for connected assets; for plain shared embeds retain an
honest fallback rather than claiming to detect every denial. Add responsive, lazy images,
alt text, stable aspect ratios and accessible retry/open-original controls.

### P2 — public policy content still contains unresolved placeholders

`client/src/content/legal/privacy.md:185,187` contains `[CONFIRM REGION]` and
`[CONFIRM DATASET LOCATION]`. Verify operational facts and replace them before release.
Document provider connections, transient media processing, caching, revocation and deletion
when BYOS is implemented. This finding concerns incomplete product content, not a legal opinion.

## Integration options

| Mode | User experience | Tradeoff |
|---|---|---|
| Paste shared link | Paste a Drive/Dropbox sharing link into a note. | Smallest implementation; availability follows sharing settings, and the link may be usable outside Fractal Goals. |
| Select existing private file | Connect account, select image/video, attach without changing its sharing settings. | Recommended core product. Requires OAuth, stable references and authenticated media delivery. |
| Upload to user's storage | Pick a local image/video and upload into the connected account. | Useful follow-on; requires progress, resumability, quota/error handling and abandoned-upload cleanup. |

“Bring your own storage” means the original bytes live in the user's provider account.
Fractal Goals still stores attachment metadata and must pay for any proxy bandwidth,
thumbnails, requests and temporary processing. It does not provide a backup of deleted
provider files. Providers are not a substitute for a measured video delivery pipeline.

### Google Drive

Register a Google Cloud OAuth web client, enable Drive and Picker, configure exact origins
and redirect URLs, and use Google Picker with `drive.file`. This permits selected/app-created
files without requesting unrestricted Drive access. It is not a read-only scope; keep app
operations narrower than its permission ceiling. Confirm consent/brand/domain requirements
for the actual production configuration. [Google scope guidance](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

Persist file ID, connection identity, resource key when applicable, MIME type and revision
metadata. For private binary files, download through the authenticated Drive API with
`files.get?alt=media`; forward supported byte ranges through the app's authorized media
route. A `/preview` iframe does not inherit the app's OAuth permission.
[Downloads and partial downloads](https://developers.google.com/workspace/drive/api/guides/manage-downloads).

For local uploads, use resumable uploads and an explicit user-visible app folder. Prove the
chosen direct-browser or mediated upload flow on production origins before depending on it.
[Drive uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads).

### Dropbox

For a quick shared-content option, use Chooser preview links and the official Embedder.
Embedder follows the shared link's permissions and traffic limits. Chooser direct URLs and
thumbnails expire after four hours; they are unsuitable as durable attachment references.
[Chooser](https://www.dropbox.com/developers/chooser?_ad=faq4&_camp=chooser&_tk=support_lp),
[Embedder](https://docs.dropboxapi.com/dropbox-api/docs/pre-built-components/embedder).

For private uploads/media, choose an App Folder integration if users can keep files in
`Apps/Fractal Goals`. Access to arbitrary existing files through the API requires the broader
Full Dropbox content-access model; it is not equivalent to Drive's selected-file scope.
Choose that scope only if arbitrary-file access is a product requirement, and complete the
applicable production review. [Dropbox access models](https://docs.dropboxapi.com/dropbox-api/docs/developer-resources/developer-guide).

Persist Dropbox file ID and revision; use authenticated download behind the app media route.
`get_temporary_link` expires after four hours and its documentation explicitly discourages
direct browser display. Do not build a durable `<img>`/`<video>` architecture around those
links. Validate range handling for the actual download path before shipping video seeking.
[Download](https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/download),
[Temporary-link constraints](https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/get-temporary-link).

## Proposed canonical implementation

Suggested tables, additive migrations and service boundaries:

- `storage_connections`: user, provider, provider account ID, granted scopes, status and
  encrypted refresh credentials with encryption-key version. Use server-managed encryption,
  refresh concurrency control and revocation. Never expose secrets through serialization,
  browser persistence, analytics, logs or exports.
- `media_assets`: root, owner, connection, stable provider file ID, resource key if needed,
  file name, verified MIME/size, revision, dimensions/duration and availability state.
- `note_attachments`: note, asset, position, caption and alt text. Validate root/owner equality
  for both sides. Reuse assets only inside authorized scope. Goal evidence uses goal notes;
  avoid a second goal-specific attachment store. If attachment-only notes are desired,
  explicitly revise the current nonempty-content contract.
- `StorageConnectionService` owns outbound OAuth and credentials; `MediaService` owns
  root/asset/note authorization and metadata; provider adapters own provider API behavior.
  Extend `NoteService` atomically to link attachments and invalidate the existing note/timeline
  read models. Render one shared `MediaAttachment` on every note surface.

Proposed routes: account-scoped connect/callback/disconnect, root-scoped attachment creation,
and `GET /api/<root>/media/<asset>/content`. The content route must authenticate and check a
live authorized attachment before each request, including ranges; never accept an arbitrary
remote URL for the server to fetch. Existing cookie auth can support same-origin `<video>` and
`<img>` requests; Axios bearer interceptors do not run for these elements. Verify this against
actual production origin/cookie configuration. Do not put account/provider tokens in URLs.

Stream bytes without loading entire videos into memory. Support correct `206`, `416`,
`Content-Range`, content type and cancellation; bound concurrency, bytes and upstream timeouts.
Measure hosting request-duration and worker constraints and use a separately scaled media
service if needed. Use `private, no-store` initially and exclude media endpoints from PWA
caching. Public previews remain separate from private content delivery.

File handling should allow verified raster formats and browser-playable video formats, with
size/dimension limits. Reject active content and misleading MIME/extensions. A `.mov` suffix
alone does not establish browser codec support. Provide a download/open-provider fallback;
defer transcoding unless real compatibility data justifies its operational cost.

Lifecycle contract:

- Removing an attachment unlinks it; deleting a note/account does not silently delete originals
  in the user's cloud account. Any remote deletion needs a distinct explicit user action.
- Disconnect revokes/destroys credentials and disables playback while retaining useful
  unavailable-file metadata. Logout clears user caches. Deleted/replaced/moved files and
  expired grants produce actionable states, with reconnect/relink actions.
- Export metadata and references without secrets; make clear that a metadata export and DB
  restore do not restore original cloud bytes. Define a separate opt-in media export if needed.
- Public landing snapshots exclude private attachments, credentials and playback URLs by
  default. Publishing a note must never silently publish owner-authorized media.
- Treat shared URLs/resource keys as sensitive references. Existing note domain events copy
  `note_content`; do not insert provider tokens or temporary playback capabilities into Markdown.
- Keep text outbox semantics. First release may require connectivity for attachment selection
  and playback; show this clearly. A later upload queue must be separate from text writes and
  reconcile partial success without duplicate files or attachments.

## Plan and S+ acceptance criteria

1. Restore current type/maintainability gates and nginx header delivery, with container-level
   header regressions. Resolve privacy content facts. No provider feature should hide these failures.
2. Prove Drive private image/video playback with two accounts, restricted files, blocked
   third-party cookies, production CSP and seeking. Record bandwidth/latency/memory results.
3. Implement the shared asset model, outbound OAuth, media authorization and reusable renderer;
   integrate with notes/goals and existing export, deletion, publication and cache boundaries.
4. Add resumable uploads only after playback is proven. Include quota exceeded, cancellation,
   interrupted upload, retry/idempotency and abandoned-file recovery.
5. Add Dropbox through the same services/rendering. Start with App Folder private storage;
   offer shared-link Chooser/Embedder separately where that permission model meets the need.
6. Release only with passing normal CI and real-provider desktop/mobile evidence: cross-user
   and cross-root denial, token refresh/revocation, disconnect/account deletion, stale revisions,
   missing files, throttling/backoff, offline behavior, large-image layout, codec fallback,
   `200/206/416`, blocked embedding, and absence of private media/secrets in public snapshots,
   telemetry, browser persistent storage and exports. Document operational limits and recovery.

Remove superseded media code when a new path becomes canonical. Low-value existing cleanup:
`NoteComposer` has an always-true `supportsMarkdown` flag and creates its own Markdown wrapper
despite the shared renderer; `VideoEmbed` comments describe outdated Drive facade/Instagram HTML
behavior. Consolidate these during implementation while preserving existing saved Markdown links.

## Verification performed

| Check | Result |
|---|---|
| `cd client && npm run build` | Passed; enforced route bundle budgets passed; generated PWA assets. |
| Focused Markdown/VideoEmbed/video URL suites | 3 files, 46 tests passed. |
| `./run-tests.sh file tests/unit/services/test_note_service.py` | 16 tests passed against isolated PostgreSQL. |
| `./run-tests.sh lint` | Failed at frontend maintainability; ESLint completed successfully. |
| `./run-tests.sh typecheck` | Failed: 15 backend errors; runner stops before frontend. |
| `cd client && npm run typecheck` | Failed: 1 frontend error, recorded above. |
| `cd client && npm run check:responsive` | Passed. |
| Backend maintainability script | Passed. |

Not executed: complete backend/frontend suites and coverage, current dependency vulnerability
audits, migrations/restore drill, production container/header checks, real provider authorization,
or desktop/mobile media playback. Existing passing component tests do not prove those properties.

## Original audit-only completion (before implementation)

The audit and proposed design are complete and distinguish existing behavior from recommended
work. Only this document and the index were changed. The distance to S+ is concrete: fix the
current release-gate failures and header defect, then complete the private-media authorization,
lifecycle and real-provider acceptance work above. A successful Vite build alone is insufficient.

Audit-only suggested commit (superseded below): `docs: audit production readiness and plan bring-your-own storage`

## Implementation and delivery audit — 2026-10-26

The preceding sections preserve the original audit. The implementation now exists; the
original completion statement above describes the audit-only stage, not the current worktree.

### Delivered behavior

- Google Drive selected-file OAuth/Picker and Dropbox App Folder OAuth share one connection,
  asset, attachment and streaming boundary. Configuration is blank by default; the UI explains
  unavailable integrations without losing the note draft. No developer apps or production
  credentials were created, and no production deployment was performed.
- Shared note composition/cards support selected images/videos, descriptions, attachment
  management and bounded resumable local uploads across notes, goal notes/reviews and session,
  activity and circuit note surfaces. Existing pasted embeds remain compatible. Text is required;
  there is no separate competing goal-media store.
- PostgreSQL stores encrypted refresh/access credentials and upload sessions, stable provider
  file IDs and scoped attachments. OAuth uses PKCE and expiring, hashed, single-use state.
  A dedicated HttpOnly Lax cookie binds callbacks to the initiating browser, with a Secure
  `__Host-` prefix in production; forwarded consent URLs fail closed while auth cookies stay
  Strict. Provider requests use fixed HTTPS endpoints, finite deadlines and no redirects. Imports validate
  metadata, extensions and binary signatures; playback authenticates each request and requires
  a live attachment in the owner's fractal. Support impersonation is denied.
- Media responses support validated single ranges (`200/206/416`), bounded streaming and close
  upstream connections on cancellation. Cookies authenticate native image/video reads; no bearer
  token is embedded in media URLs. Media bytes and Picker credentials are excluded from offline
  persistence. Session attachment edits reuse the existing ordered outbox.
- Disconnect and erasure destroy local credentials even when revocation is unavailable; hard
  deletion cascades metadata and never deletes cloud originals. OAuth completion rechecks and
  locks the account after remote consent to prevent reintroducing credentials during erasure.
  Public landing snapshots omit structured attachments; account exports omit credentials and
  playback capabilities. Callback access logs and provider telemetry capabilities are filtered.
- Uploads use 1 MiB chunks and confirmed offsets, including lost-response recovery. Limits are
  8 attachments/note, 1,000 assets/fractal, 16 unfinished uploads/fractal and a default 100 MiB
  file ceiling (operator cap 500 MiB). Sessions expire in 24 hours. Resumption requires the
  dialog/file to remain open; cancellation preserves files already committed in the provider.

### Repairs and consolidation

Restored the existing type, maintainability and responsive gates without lowering their budgets.
Removed the always-true Markdown branch and duplicate note-link picker; inline and hoisted
composition now reuse `ComposeLinkPanel`. Extracted existing responsibilities from oversized
modules rather than adding competing mutation/data layers. Removed dead styling and reused
existing design tokens/components. Updated generated agent/offline schemas from canonical
sources and pruned resolved type-baseline entries.

Fixed nginx security-header inheritance on cache-controlled locations and added container-level
CI verification. Updated production dependencies with known fixes. Browser verification also
exposed a real offline tag-catalog omission: session details now preload and persist the shared
catalog before going offline. Browser fixtures were updated to the existing canonical tag API,
explicit week selection and current UI controls; query/performance budgets were preserved.

Full backend verification exposed a suite-dependent analytics plan regression: stale tenant
statistics let PostgreSQL scan every root session against every activity instance before
checking an empty explicit-link table. Captured plans showed the quadratic join (roughly
12 seconds at 10,000 instances). A correlated, bounded session lookup now uses its primary
key; tenant and deletion checks remain outside the bounded lookup. The 24 focused analytics
service/scaling checks pass without increasing query or timing budgets. A fresh 10,000-instance
run measures roughly 139 ms; the final complete sequence is recorded below.

The index maps the current ownership. Setup, permissions, encryption-key rotation, file limits,
provider setup and operational recovery live in
[`BYO_MEDIA_RUNBOOK.md`](../docs/architecture/BYO_MEDIA_RUNBOOK.md).

### Remaining distance to production S+

Source implementation and local protocol tests cannot certify live provider behavior. Production
enablement remains gated on creating the Google OAuth/Picker and Dropbox App Folder apps,
configuring production origins/callbacks/keys, and recording the runbook's real-account acceptance
matrix: two-account isolation, refresh/revocation, missing/replaced files, interrupted transfers,
blocked third-party cookies, desktop/mobile codecs, seeking, quotas, and concurrency/egress/memory.
Large streams occupy application workers; hosting limits must be measured before general use.

Source revision metadata is checked before reads; references are not archival snapshots and
concurrent cloud edits can race that check. Keep attached originals unchanged. Files removed
from a cloud account cannot be recovered from an application DB backup. No transcoding,
offline media-byte cache, multiple accounts per provider or automatic cloud deletion is promised.

The user confirmed US East hosting; the privacy disclosure now states United States without
inventing a specific vendor region identifier. Legal entity/address placeholders remain at the
user's explicit request. Finalize and version the legal documents and acceptance record before
publishing the revised production policy. Integrations should remain unconfigured until provider
acceptance is complete. **Production S+ is conditional on these external release gates.**

### Delivery verification

| Check | Final evidence |
|---|---|
| Static quality gate | `./run-tests.sh lint` passes ESLint, frontend/backend maintainability, responsive source audit, TypeScript and basedpyright. Existing budgets were retained. |
| Frontend coverage | 394 files / 2,102 tests passed; statements 69.85%, branches 64.81%, functions 67.03%, lines 71.91%, all above the configured gates, including browser telemetry and note-save recovery regressions. |
| Final storage/security regressions | 88 backend tests passed, covering browser-bound OAuth completion, concurrent erasure, cross-tenant authorization, note linking, refresh/disconnect, signatures, resumable recovery, ranges and telemetry. |
| Authenticated media/migration checks | Earlier focused integration run passed 173 tests; separate authenticated `200/206/416` and migration run passed 86 tests. These are overlapping runs, not additive totals. |
| Schema/restore | Fresh full Alembic upgrade, metadata parity, latest downgrade/reapply and parity passed in disposable PostgreSQL. Logical backup/restore drill passed (11.38 seconds). |
| Production image | Final frontend Docker image built; actual nginx header checks passed on app/deep-link, HTML shell, service worker, manifest and error responses. |
| Production dependency audits | Python application, MCP adapter and npm production audits passed with zero known vulnerabilities. This is not a claim about development-only dependency advisories. |
| Adapter | 7 protocol/server tests passed against the regenerated schema. |

The frontend coverage run used the existing local `VITEST_WALL_TIMEOUT_MS=900000` override and
two workers because default local runs hit the 180-second wall budget under this machine's load;
the final successful coverage run took 206 seconds. Repository/CI time budgets were not
relaxed. Coverage reports were written outside source; pre-existing tracked HTML reports were
restored after earlier test runs cleared them. The final complete runs are recorded below.


| Final complete gate | Result |
|---|---|
| Backend coverage suite | **1,763 passed** in 653.37 seconds; **84.88%** services/blueprints coverage, above the unchanged 80% gate. The previously failing 10,000-instance analytics case passes in the complete sequence. |
| Desktop/mobile browser suite | **59 passed, 3 intentionally skipped** in 3.6 minutes. Includes unavailable-provider draft preservation, offline edits, goal reviews, responsive notes and navigation. |
| Final frontend source | **394 files / 2,102 tests passed**, with all configured coverage thresholds met. |
| Backend production image | Python 3.12 image built; import and `/api/healthz` smoke test passed with network disabled and disposable test configuration; `pip check` found no broken requirements. This liveness test does not claim production database readiness. |
| Final frontend image/static checks | Final Docker build and nginx header checks passed; final lint/type/maintainability/responsive gates passed. |

### Final implementation assessment

The authorized local implementation is complete, and the automated source/build gates are green.
The audit also repaired the analytics plan regression rather than increasing its timing budget.
No temporary probe tests, generated coverage files or production credentials are included in the
changes. The index and operational runbook describe the implemented ownership and limits.

**Distance to production S+:** configure and approve the developer apps; collect real-provider,
production-origin desktop/mobile playback and capacity evidence; finalize the legal placeholders
and publish/version the updated disclosure. These are release requirements, not claims established
by local mocks or successful builds. Keep integrations unavailable until the provider acceptance
matrix is complete. No production deployment or external account modification was performed.

Suggested commit: `feat: add private bring-your-own media attachments`

## Follow-up — connection management (2026-10-26)

A re-audit found the connection lifecycle unfinished: revoked grants surfaced as "file unavailable",
Google disconnects often left the grant active, the OAuth return showed raw JSON or a dead
`?storage=connected` page, and accounts could only be managed inside the attach dialog. These are
fixed, together with a Settings → Cloud Storage page, in
[storage-settings-page-2026-10-26.md](storage-settings-page-2026-10-26.md).

