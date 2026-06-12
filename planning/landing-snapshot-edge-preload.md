# Landing Examples: Publish-Time Pre-Positioning (Option 3)

## Context

The landing page's example explorer and feature showcase render from `/api/public/landing-examples`, which serves the snapshot that admin "Publish" writes to `app_settings.landing_example_cache` in Postgres. Today the first visitor pays a full waterfall: HTML → download/parse JS bundle → `main.jsx` boot → prefetch fires (`client/src/utils/landingPrefetch.js`) → Nginx → Flask → Postgres. Visitors stare at shimmer skeletons during that chain.

Goal (chosen as "option 3"): make publish pre-position the data at the edge and start the browser fetch at HTML-parse time, so the landing page has data essentially instantly — without rebuilding the frontend on publish and without new infrastructure.

Three cooperating changes:

1. **Boot-time fetch in `index.html`** — start the request when HTML parses, in parallel with the JS bundle download.
2. **Nginx proxy cache in the frontend container** — serve the JSON from the same container as the HTML; Flask/Postgres drop off the hot path.
3. **Publish warms the cache** — after a successful publish, the backend hits the public URL with a cache-bypass header so Nginx stores the fresh snapshot immediately. This is the "publish does an operation that pre-loads it" semantics.

## Database grading (current state, relative to this plan)

**Grade: A.** The data layer is already exactly the right shape for this feature: publish materializes a versioned (`schema_version: 5`), fully self-contained, sanitized read model into `app_settings.landing_example_cache`; the public endpoint is read-only, auth-free, changes only on publish, and already emits `Cache-Control: public, max-age=300, stale-while-revalidate=86400`. No schema or data-model changes are needed — that is what makes option 3 cheap.

What keeps it from S today: every cache-miss read still does a Postgres round trip per request, nothing positions the data at the edge, and publish ends at the DB write with no propagation step. This plan closes those gaps with zero DB changes, which is the S+ move: the database is already the system of record for a published artifact; we add edge materialization and publish-time propagation on top instead of duplicating state in it.

## Changes

### 1. `client/index.html` — inline preload script

Add a tiny inline `<script>` in `<head>` (before the module script) that mirrors the landing-entry check and starts the fetch:

- Condition: `pathname === '/landing'`, or `pathname === '/'` and hostname is `fractalgoals.com` / `www.fractalgoals.com` (mirror of `isPublicMarketingHost` + `isLandingEntryPath`; add a keep-in-sync comment in both places).
- Action: `window.__fgLandingExamplesPreload = fetch('/api/public/landing-examples', { credentials: 'same-origin' }).then(r => { if (!r.ok) throw new Error(...); return r.json(); })`, plus a no-op `.catch()` to avoid unhandled-rejection noise.
- Uses an explicit `fetch` promise handoff instead of `<link rel="preload" as="fetch">` — preload-cache matching against the axios XHR (with `withCredentials = true`) is brittle and silently double-fetches on mode/credentials mismatch; a window promise is deterministic and testable.
- Same-origin `/api` is correct in both dev (Vite proxy, `client/vite.config.js`) and prod (Nginx proxy). No CSP header blocks inline scripts on the frontend.

### 2. `client/src/utils/landingPrefetch.js` — consume the preload

In `fetchLandingExamples`: if `API_BASE === '/api'` (guard against cross-origin deployments) and `window.__fgLandingExamplesPreload` exists, consume it **once** (clear the global immediately so retries/refetches use the network), return its JSON on success, and fall back to the existing axios call on rejection. Both `main.jsx`'s prefetch and `Landing.jsx`'s `useQuery` route through this one function, so no other frontend call sites change.

### 3. `client/nginx.conf` — edge cache for the one endpoint

- File top (outside `server {}`; conf.d templates are included in `http` context): `proxy_cache_path /var/cache/nginx/landing levels=1:2 keys_zone=landing_cache:1m max_size=10m inactive=7d use_temp_path=off;`
- New `location = /api/public/landing-examples` block, ahead of the generic `/api/` location: same `proxy_pass ${BACKEND_URL}` + proxy headers as `/api/`, but with `proxy_buffering on` (required for caching; the generic block disables it), `proxy_cache landing_cache`, `proxy_cache_lock on`, `proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504`, `proxy_cache_bypass $http_x_landing_cache_warm`, and `add_header X-Cache-Status $upstream_cache_status always` for observability.
- Freshness comes from the upstream `Cache-Control` (max-age=300 + stale-while-revalidate=86400, which modern Nginx honors natively): visitors get instant cached/stale-while-revalidate responses; `proxy_cache_bypass` makes the warm request re-fetch from Flask **and overwrite** the stored entry, so a publish is reflected immediately rather than after TTL expiry.
- Cloud Run note: cache is per-instance and ephemeral — fine. A cold instance's first request falls through to Flask exactly as today; current beta profile is `--max-instances=1`.

### 4. Backend — warm the edge cache on publish

- `config.py`: new `LANDING_CACHE_WARM_URL = os.getenv('LANDING_CACHE_WARM_URL', '')` — full public URL of the endpoint as served by the frontend (e.g. `https://www.fractalgoals.com/api/public/landing-examples`). Empty ⇒ warming skipped (dev/test default). One warm covers both apex and `www` because the default proxy cache key uses `$proxy_host` (the backend host), which is identical for both domains.
- `services/admin_service.py` → `publish_landing_examples()`: after the existing `commit()` (same post-commit side-effect placement as event emission), call a new private `_warm_landing_cache()`: best-effort `requests.get(url, headers={'X-Landing-Cache-Warm': '1'}, timeout=5)` in try/except; log a warning on failure; never fail the publish. `requests==2.33.0` is already in `requirements.txt`.
- Add `cache_warm: 'ok' | 'skipped' | 'failed'` to the publish response payload.

### 5. Admin UI — surface warm status

In the Admin landing tab's publish success handling (`client/src/pages/Admin.jsx`), when `cache_warm === 'failed'`, append a non-blocking warning (same pattern as existing `showcase_warnings` surfacing) telling the admin the publish succeeded but the edge cache will refresh within ~5 minutes on its own.

### 6. Deploy config

`cloudbuild.yaml` backend deploy step (`--set-env-vars`, line ~82): append `LANDING_CACHE_WARM_URL=https://www.fractalgoals.com/api/public/landing-examples`.

### 7. Docs

Update `index.md` landing-page bullets (frontend design choices + SaaS admin bullet) to describe the boot preload, edge cache, and warm-on-publish flow.

## Tests

- **`client/src/utils/__tests__/landingPrefetch.test.js`** (extend): preload promise is consumed and cleared after first use; rejection falls back to the axios path; non-`/api` `API_BASE` ignores the preload; absent global behaves exactly as today.
- **`tests/integration/test_admin_api.py`** (extend `test_admin_can_manage_and_publish_landing_examples` area): with `LANDING_CACHE_WARM_URL` set (monkeypatch config + mock `requests.get`), publish issues the warm GET with the bypass header and reports `cache_warm: 'ok'`; with warm raising, publish still returns 200 with `cache_warm: 'failed'`; with the default empty URL, `cache_warm: 'skipped'` and no HTTP call.
- Existing `Landing.test.jsx` / `Admin.test.jsx` should pass unchanged (they mock at the API/query layer); fix up only if the new response key surfaces.

## Verification

1. `./run-tests.sh frontend` and `./run-tests.sh backend`.
2. Nginx config sanity: render the template and run `nginx -t` in the `nginx:alpine-slim` image via docker (envsubst `BACKEND_URL` to any https URL).
3. Manual dev check: start backend + Vite, open `http://localhost:5173/landing`, confirm in the network tab that exactly **one** request to `/api/public/landing-examples` fires (initiated by the document, not the JS bundle) and the explorer hydrates from it; confirm the authenticated root (`/`) fires none.
4. Publish flow check: with `LANDING_CACHE_WARM_URL` pointed at a local listener (or just unit coverage), confirm publish logs/returns warm status and never fails on warm errors.

## After approval

Per project convention, save this plan as `planning/landing-snapshot-edge-preload.md` before implementing.
