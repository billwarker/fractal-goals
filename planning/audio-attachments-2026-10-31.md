# Audio attachments for notes and descriptions

## Context

Notes, goal descriptions, reviews, and completion notes can attach pictures and video stored in the user's Google Drive or Dropbox. Musicians and other practitioners also need to attach **audio**, such as a recording of a song in progress, as evidence. Today one allowlist (`MEDIA_TYPES`) rejects every audio file, and `MediaAttachment` only knows how to show `<img>` or `<video>`.

After this change, the paperclip, paste, drop, the Drive Picker, and the Dropbox chooser all accept common audio files (MP3, M4A, WAV, FLAC, OGG/Opus). They upload through the existing resumable pipeline and play back in an inline `<audio>` player wherever attachments appear.

No schema change is needed. `media_assets.mime_type` is already free text, and byte-range streaming (`open_content` + `bounded_range`) already supports seeking.

## Grade of the existing system for this plan: **A−**

| Area | Grade | Why |
|---|---|---|
| Storage model / DB | A | Provider-agnostic `media_assets` + `note_attachments`/`goal_attachments`. Mime type is free text. Ownership and liveness rules are already central. Audio needs zero migrations. |
| Validation boundary | A | `validate_file` + magic-byte `verify_signature` on both upload and import. Extending them is mechanical. |
| Streaming | A | Range-aware proxy, so audio seeking works without changes. |
| Type-list ownership | C | The allowlist is copied by hand into 4 places: `storage_common.MEDIA_TYPES`, `cloudUpload.UPLOAD_TYPES`, the Drive Picker mime string, and the `CloudMediaDialog` regex. Nothing checks that they agree. |
| Mime canonicalization | C | Dropbox metadata uses `mimetypes.guess_type`, which varies by platform (`.m4a` → `audio/mp4a-latm` on macOS, different on Linux). `open_content` compares provider mime to stored mime with strict equality. That's harmless for today's image/video types but **would break audio playback** ("source file changed" 409) unless it's fixed. |
| Renderer | B | Its binary image/else-video branch quietly treats any new type as video, including fetching a poster thumbnail. |

## S+ plan

### 1. One canonical media-type table (backend), `services/storage_common.py`

- Replace `MEDIA_TYPES` with a table keyed by canonical mime: `{extensions, kind ('image'|'video'|'audio'), aliases}`. Add:
  - `audio/mpeg` `.mp3`, aliases `audio/mp3`
  - `audio/mp4` `.m4a`, aliases `audio/x-m4a`, `audio/m4a`, `audio/mp4a-latm`, `audio/aac` *(only with `.m4a`)*
  - `audio/wav` `.wav`, aliases `audio/x-wav`, `audio/wave`, `audio/vnd.wave`
  - `audio/flac` `.flac`, aliases `audio/x-flac`
  - `audio/ogg` `.ogg` `.opus`, aliases `audio/opus`, `audio/x-opus+ogg`, `application/ogg`
- Add `canonical_media_type(mime, name)`. It maps an alias to its canonical type and, when the mime is generic or unknown (`application/octet-stream`, empty), falls back to the extension. `media_kind(mime)` returns image/video/audio.
- Call `canonical_media_type` in `validate_file` (callers then use the returned canonical value), in `StorageUploadService.start` before storing `StorageUpload.mime_type`, and in **both provider metadata normalizers** (`storage_providers.metadata` for Drive, `dropbox_metadata`). Replace the platform-dependent `mimetypes.guess_type` with the explicit extension table. Stored and live mime then always compare equal in `open_content`. Existing image/video rows map to themselves, so no data backfill is needed.
- Extend `verify_signature`:
  - MP3: `ID3` header or MPEG frame sync (`head[0]==0xFF and head[1]&0xE0==0xE0`)
  - M4A: `head[4:8]==b'ftyp'`
  - WAV: `RIFF` + `head[8:12]==b'WAVE'`
  - FLAC: `fLaC`
  - OGG: `OggS`
- Update the user-facing errors to "Choose a picture (JPEG, PNG, WebP, GIF), video (MP4, WebM) or audio (MP3, M4A, WAV, FLAC, OGG) file" and "…supported picture, video or audio format".
- `MediaService.thumbnail`: return 404 `media_no_thumbnail` straight away for non-video kinds, so no provider call is wasted.

### 2. Shared contract fixture (removes the C grade on drift)

- New `tests/fixtures/media_types.json` listing the canonical types, extensions, kinds, and aliases, following the `note_categories.json` pattern.
- A pytest asserts the server table equals the fixture. A vitest asserts `cloudUpload.UPLOAD_TYPES` equals the fixture.
- Derive from `UPLOAD_TYPES` the Drive Picker mime list (canonical types + aliases, so Drive's own labels match) and the `CloudMediaDialog` filter (`mediaKind(file.mime_type)`). Neither is hand-copied any more.

### 3. Frontend upload path, `client/src/utils/cloudUpload.js`

- Mirror the table: `UPLOAD_TYPES`, `canonicalMediaType(type, name)`, `mediaKind(type)`.
- `uploadProblem` canonicalizes first, because macOS Chrome reports `.m4a` as `audio/x-m4a` and some browsers leave `file.type` empty for `.flac`/`.opus`.
- `UPLOAD_ACCEPT` includes the extensions as well as the mime types (e.g. `.m4a,.flac`) so OS file pickers don't grey out files.
- `runCloudUpload`/`storageApi.startUpload` send the canonical mime type.
- `namePastedFile` uses `mediaKind` ("Pasted audio …").

### 4. Playback, `client/src/components/notes/MediaAttachment.jsx`

- Switch on `mediaKind(asset.mime_type)`: image → `<img>`; video → `<video poster>` as today; **audio → `<audio controls preload="none">`** at full card width, with no poster or thumbnail request and an `aria-label` of the alt text or name. `preload="none"` keeps feeds from making provider calls until the user presses play, the same as video.
- Unsupported codec: before rendering, check `audio.canPlayType(mime)`. If it returns `''` (e.g. OGG Vorbis on older Safari), show "This browser can't play {EXT} audio. Open it in {Provider}." with the existing source link instead of a dead player. The existing Retry fallback still covers network errors.
- Small CSS in `MediaAttachment.module.css`: audio row padding, a music-note glyph next to the caption, and `color-scheme` inheritance so native controls match the dark theme.
- Compact chips (`NoteAttachmentsEditor` / `AttachableField`) gain a kind icon (picture/video/audio) so a `.mp3` chip reads as a recording at a glance.

### 5. Copy

"Pictures or video" becomes "pictures, video or audio" in:
- `AttachMenuButton` (aria-label + title: "Attach pictures, video or audio (you can also paste or drop them)")
- the `NoteCard` options item
- the `GoalEditForm` placeholder
- the `useAttachmentDraft` notices ("Attachments need an internet connection", "…to save files from this device")
- `content/legal/privacy.md` line 75

### 6. Docs

- `index.md` media paragraph: add audio support, the canonical-type table and its fixture, and alias canonicalization at every provider and upload boundary.
- `docs/architecture/BYO_MEDIA_RUNBOOK.md`: add a real-account gate step "upload and play an M4A voice memo and an MP3".

## Critical files

- `services/storage_common.py`, `services/storage_providers.py`, `services/storage_upload_service.py`, `services/media_service.py`
- `client/src/utils/cloudUpload.js`, `client/src/utils/googleDrivePicker.js`, `client/src/components/notes/CloudMediaDialog.jsx`
- `client/src/components/notes/MediaAttachment.jsx` (+ `.module.css`), `NoteAttachmentsEditor.jsx`, `AttachMenuButton.jsx`
- `tests/fixtures/media_types.json` (new)

## Verification

- **pytest**: `tests/unit/services/test_storage_service.py`, `test_storage_providers.py`
  - each audio type passes `validate_file` and `verify_signature`
  - mismatched bytes are rejected (e.g. `.mp3` name with WAV header)
  - aliases canonicalize (`audio/x-m4a` → `audio/mp4`)
  - Dropbox `.m4a` metadata comes back as `audio/mp4` regardless of the platform mime db
  - `open_content` on an audio asset doesn't 409
  - thumbnail returns 404 for audio without calling the provider
  - fixture-parity test
- **vitest**:
  - `MediaAttachment.test.jsx` renders `<audio>` with no poster, and the "can't play" fallback when `canPlayType` returns `''`
  - `useAttachmentDraft.test.jsx` accepts `audio/x-m4a` `.m4a` and an empty-type `.flac`
  - `cloudUpload` fixture parity
- **Playwright** `client/e2e/note-media.spec.js`: a new test drops an MP3 into a goal completion note, sees upload progress, saves, and sees an `<audio>` player on the note card.
- **Manual**: `npm run dev` + backend. In the goal completion modal from the screenshot, attach an iPhone Voice Memo (`.m4a`) and an MP3 via the paperclip, play and seek them in the note card (Chrome and Safari), and re-open the note after reload. Repeat via the Drive Picker and Dropbox chooser.

After approval, save this plan to `planning/audio-attachments-2026-10-31.md`.

## Outcome (2026-10-31)

Delivered as planned, with these adjustments:

- The `canPlayType` check covers audio only. Video behaves as before, and jsdom answers `''` for every type.
- Kind icons appear on compact and in-progress chips. The full rename row already shows the extension.
- Revision checks in `open_content` and in upload `finish` compare `canonical_media_type(provider_mime, stored_name)` against the stored type, so an alias reported by a provider never reads as a changed file.
- The e2e test covers dropping an `audio/x-m4a` Voice Memo and an MP3, checking the canonical upload types and the chips. Playback rendering is covered in vitest (`MediaAttachment.test.jsx`). The Playwright server serves `client/dist`, so rebuild before running it.

Verification:
- Backend: storage suites pass. Of the full backend suite, 2017 tests pass and 4 fail; all 4 fail without this change too (analytics least-privilege role, 3 performance budgets).
- Frontend: vitest 2268/2268. `e2e/note-media.spec.js` 15 passed, 1 skipped.
- Still to do: the real-account gates in the BYO media runbook.
