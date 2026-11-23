# Brand logo + finalize Google Drive and Dropbox connections

Branch: `feat/storage-connections-and-logo` (cut from `main`; the unmerged heatmap-day-filter commit is not on it).

## Context

Two things stand between the app and launch:

1. **No brand mark.** The browser tab shows `client/public/favicon.svg`, an old maroon/white concentric-circle node, and the PWA manifest uses that same SVG. The app's identity is the Ultimate-goal **twelve-point star** (three nested sets of three squares rotated 0°/30°/60°, drawn in `client/src/components/atoms/GoalIcon.jsx:94-125, 242-268`). You want it in red and black (sampled from your screenshot: `#b8311d` stroke on a `#000000` fill) as the logo everywhere, browser tab included. Both OAuth consent screens (Google, Dropbox) also need an app logo, so the logo has to come first.
2. **Cloud storage is built but not live.** BYO media (Drive `drive.file` + Picker, Dropbox App Folder) is fully built and tested against mocks (`docs/architecture/BYO_MEDIA_RUNBOOK.md`). What's left is outside the code:
   - **Dropbox:** no app is registered. `DROPBOX_CLIENT_ID/SECRET` aren't in `.env.*` or `cloudbuild.yaml:130`, so it reports `unavailable`.
   - **Google Drive:** keys are set in dev and prod. We don't know whether the consent screen is still in *Testing*. If it is, refresh tokens die after 7 days and only listed test users can connect.
   - **Acceptance:** the runbook's real-account acceptance matrix has never been recorded (`planning/byo-storage-audit-2026-10-26.md:310-328` calls it the only remaining gap to S+).

## Grade of the current state

| Area | Grade | Why |
|---|---|---|
| Storage source code (OAuth/PKCE, encryption, status lifecycle, streaming, tests) | **A** | Audited twice; status model, reconnect, range streaming and allowlisted callbacks are done and tested. |
| Storage deploy wiring | **C** | Drive secrets are in Cloud Build; Dropbox is missing entirely; no `DROPBOX_APP_FOLDER` pinned. |
| Provider registration / publishing | **D** | Dropbox app doesn't exist; Drive consent-screen status unknown; no branding on either. |
| Release evidence | **F** | The acceptance matrix the runbook requires before general use has never been run. |
| Brand identity | **D** | Placeholder favicon unrelated to the product's mark; SVG-only manifest icon (iOS ignores it; no `apple-touch-icon`, no maskable icon, no PNG fallback). |
| **Overall** | **C** | Strong engineering, but nothing a user can actually connect to or recognise. |

## Plan to S+

### Part A: Logo and icons (I do all of this)

1. **One canonical source:** `client/src/brand/logoGeometry.js` exports the star's layers as data: the layer sizes `{x,y,size}` 20/60, 30/40 and 40/20, the rotations `[0,30,60]`, stroke 5, and core r=6. Brand colours `BRAND_RED = '#b8311d'` and `BRAND_INK = '#000000'` go into `design-tokens.css` as `--color-brand-mark` / `--color-brand-mark-ink`, the same in both themes because a logo shouldn't re-tint.
2. **`client/src/components/atoms/BrandMark.jsx`:** an inline SVG rendering that geometry (props: `size`, `title`; `aria-hidden` unless titled). Paint order matches the `GoalIcon` static branch (layer 0 unmasked, inner layers on top; the inner layers already sit inside the outer silhouette, so the mask isn't needed in a static mark).
3. **Generated static assets:** `client/scripts/build-brand-assets.mjs` imports the same geometry, writes the SVGs, and rasterises PNGs with the repo's existing Playwright Chromium (no new dependency). Outputs are committed, and `npm run brand:assets` regenerates them:
   - `public/favicon.svg`: transparent star, plus a `prefers-color-scheme` style inside the SVG giving the black fill a faint light outline so it stays visible on dark tab strips.
   - `public/favicon-32.png` / `favicon-16.png`: PNG fallback.
   - `public/apple-touch-icon.png`: 180×180, star at ~70% on `#121419`, opaque.
   - `public/icons/icon-192.png`, `icon-512.png` (`purpose: any`), and `icon-maskable-512.png` (star inside the 80% safe zone).
   - `public/brand/logo-oauth-120.png` (Google consent screen: 120×120 square) and `logo-256.png` / `logo-64.png` (Dropbox app icons). These are not precached.
4. **Wire it in:**
   - `client/index.html`: `<link rel="icon" href="/favicon.svg?v=3" type="image/svg+xml">`, a PNG fallback, `apple-touch-icon`, and `<meta name="theme-color">`.
   - `vite.config.js` manifest `icons`: svg + 192 + 512 + maskable.
   - Workbox `globPatterns` gains `png` only for `icons/*` and `apple-touch-icon` (keeps `og-cover.png` and `brand/` out of the precache).
   - Check `scripts/check_frontend_headers.py` still passes for the new static paths.
5. **Use it in the product:** the boot loader in `index.html` / `public/boot/shell.js`, the Landing header beside "Fractal Goals", and the app navigation header's home link (where the name/back link sits today). `client/vite.svg` and `src/assets/react.svg` are deleted if unreferenced.
6. **Tests:**
   - A Vitest (node env) check that `public/favicon.svg` equals the script's output for the current geometry, so the two can't drift.
   - A `BrandMark` render test.
   - Add Landing/header surfaces to the sweep run.

### Part B: Finalize providers (you click consoles; I wire and verify)

**B1. Google Drive: confirm, then publish** (checklist I'll give you; ~10 min in Cloud Console):
- OAuth consent screen → Branding: app name "Fractal Goals", logo `logo-oauth-120.png`, support email, home page `https://fractalgoals.com`, privacy `https://fractalgoals.com/legal/privacy` (I'll confirm the route), terms link, authorized domain `fractalgoals.com` (verified in Search Console).
- Audience: if it's *Testing*, click **Publish app**. `drive.file` is non-sensitive, so brand verification is quick and no CASA security assessment is needed. Note: uploading a logo triggers brand verification (a few business days), and the screen shows the app name without the logo until it's approved.
- Clients: confirm the redirect URIs `https://my.fractalgoals.com/api/storage/google_drive/callback` and `http://localhost:5173/api/storage/google_drive/callback` (dev), and the Picker API key's HTTP-referrer restriction covers both origins.

**B2. Dropbox: register the app** (walkthrough):
- App Console → Create app → Scoped access → **App folder** → name **Fractal Goals** (this becomes `Apps/Fractal Goals`, matching the `DROPBOX_APP_FOLDER` default).
- Permissions: `account_info.read`, `files.metadata.read`, `files.content.read`, `files.content.write`.
- Redirect URIs: the prod and localhost `/api/storage/dropbox/callback`.
- Branding: icons 64 + 256, website, privacy URL.
- You put the key/secret into `.env.local`/`.env.development` and Secret Manager (`DROPBOX_CLIENT_ID`, `DROPBOX_CLIENT_SECRET`); I never see or print them.
- Development status allows 500 users. Apply for **Production** once 50 users have linked, or earlier if you want; I'll draft the application text.

**B3. Deploy wiring (code, me):**
- `cloudbuild.yaml`: add `DROPBOX_CLIENT_ID` and `DROPBOX_CLIENT_SECRET` to `--set-secrets`, and `DROPBOX_APP_FOLDER=Fractal Goals` to `--set-env-vars`.
- Add a pre-deploy check in `scripts/deploy_gates.py` that the referenced secrets exist (if it already has a secrets check, extend it), so a missing secret fails the build instead of the revision.
- Confirm nginx/CSP allows what Picker needs (`apis.google.com`, `docs.google.com` frames). The audit says yes, and I'll check it against the live header test.

**B4. Real-account acceptance pass (recorded):**
- I run the local stack with both providers configured. You do the consent clicks (I can't sign in to your accounts), and I drive the rest via Playwright/the API and inspect the DB and logs.
- For each provider:
  - connect, Picker/app-folder selection, device upload (small image, ~50 MB video, M4A, MP3, WAV)
  - attach to a note and a goal description; play with seek (200/206/416), poster, open original, rename, trash + restore
  - disconnect, then reconnect; revoke at the provider → `reconnect_required` shown in Settings
  - second test account: cross-user and cross-root access denied
  - interrupted upload resumes
- You check iOS Safari (Voice Memo M4A, video poster, OGG fallback link) on your phone and tell me what you see.
- Results become an **Acceptance record** table in `BYO_MEDIA_RUNBOOK.md` (date, provider, case, result, notes). Any defect found gets fixed on this branch with a regression test.
- Prod verification after deploy: the same smoke cases against `my.fractalgoals.com` with one account per provider.

### Part C: Docs
- `index.md`: one line under Frontend for the brand mark (geometry source, generated assets, `npm run brand:assets`). Update the media paragraph's "integrations remain unavailable without provider configuration" wording.
- Runbook: provider registration details (app names, folder, redirect URIs), the acceptance record, and the release decision.
- `planning/brand-logo-and-storage-finalization-2026-11.md`: this plan, saved after approval.

## Critical files

`client/src/components/atoms/GoalIcon.jsx` (reference geometry), new `client/src/brand/logoGeometry.js`, new `client/src/components/atoms/BrandMark.jsx`, new `client/scripts/build-brand-assets.mjs`, `client/public/*` icons, `client/index.html`, `client/vite.config.js`, `client/src/styles/design-tokens.css`, `cloudbuild.yaml`, `scripts/deploy_gates.py`, `docs/architecture/BYO_MEDIA_RUNBOOK.md`, `index.md`.

## Verification

- `npm run brand:assets` is idempotent (a second run gives no git diff). Visually check the favicon at 16/32 in a light and a dark tab strip, plus a screenshot of the apple-touch/maskable icons.
- `./run-tests.sh lint`, `./run-tests.sh frontend`, `./run-tests.sh backend`; then `npm run build` and the browser smoke run. Rebuild the client before Playwright, since e2e serves the built `dist`.
- `npm run sweep:quick` for Landing/header/boot loader in both themes.
- Lighthouse PWA installability: manifest icons resolve, the maskable icon passes.
- Storage: the B4 acceptance record is fully filled in with no open defects. After deploy, Settings → Cloud Storage in prod shows both providers as connectable, and a one-file round trip works per provider.

Nothing gets committed until you've reviewed it.

## Delivery notes (2026-11-22)

Part A and B3 are done on this branch. Deviations from the plan above:

- **Rasteriser:** `@resvg/resvg-js` (already used by `generate:og-image`) instead of Playwright.
- **One stroke weight:** a thicker small-size stroke was tried for favicons and dropped. At 32px it
  filled in the black weave; the canonical stroke 5 reads better. 16px is inherently muddy for nine
  overlapping squares, and modern tabs use the SVG at device resolution.
- **OAuth logos** are `public/brand/logo-120.png`, `logo-64.png` and `logo-256.png`.
- **No colour tokens:** the mark's colours are constants in `logoGeometry.js`. It never re-tints by
  theme, and the static assets need literal values.
- **In-app navigation unchanged:** its left slot is the fractal switcher showing the user's own root
  icon, and a second star there would compete with it. The logo appears on the Landing header, the
  landing boot shell and the OG cover, which also lost the old concentric-circle mark.
- **No `theme-color` meta:** the app has light and dark themes, so a fixed colour would be wrong
  half the time.
- **Manifest favicon versioned** (`/favicon.svg?v=3`): nginx serves static files as immutable for a
  year, so installed PWAs would otherwise keep the old icon.
- **No secrets preflight gate:** it needs the Cloud Build service account to read Secret Manager
  metadata, which isn't confirmed. A missing secret already fails the backend deploy before traffic
  moves. Instead, a test pins every storage secret and env var in `cloudbuild.yaml`, and the runbook
  states that the secrets must exist first. **Do not merge until `DROPBOX_CLIENT_ID` and
  `DROPBOX_CLIENT_SECRET` exist in Secret Manager.**
- **Privacy policy:** Privacy Policy 1.4 (effective 2026-11-22) adds the Google Limited Use
  statement that brand verification requires. Existing accounts review it on next sign-in.
- **Consent-screen logos** (`brand/logo-*.png`) are transparent; only the home-screen and install
  icons keep the dark tile.

B1 done (Google brand verification submitted 2026-11-22). Still open: B2 (Dropbox app), then B4 (acceptance record in the runbook).
