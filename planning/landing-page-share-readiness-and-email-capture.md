# Landing Page: Share-Readiness + Beta Email Capture

> Plan to take the public landing page from "impressive but leaky" to S+ — actually
> shareable on the internet, and every captured beta email visible, exportable, and actionable.

## Context & Audit Summary

The landing page at [client/src/pages/Landing.jsx](../client/src/pages/Landing.jsx) is unusually strong for a
pre-beta page: it embeds a live, interactive product demo (real FlowTree, working
view toggles, feature showcase from a published snapshot). Copy lives in
[client/src/content/landing.md](../client/src/content/landing.md), not markup. The signup backend is hygienic:
rate-limited (12/hr), email normalized/sanitized/deduped, unique index, upsert-on-resubmit.

**But it is not ready to drive traffic**, for two disqualifying reasons:

1. **Captured emails are invisible.** No admin view, no notification, no export. `grep`
   for "beta" in `Admin.jsx` / `admin_service.py` returns nothing. Signups land in
   `beta_signup_requests` with no way to see or act on them.
2. **Near-invisible to search/social.** No static `og:image`, `twitter:card`,
   `description`, `canonical`, `robots.txt`, or `sitemap.xml`. The runtime meta injection
   in [Landing.jsx:494-545](../client/src/pages/Landing.jsx#L494-L545) is invisible to crawlers/unfurlers, which read
   static HTML. Shared links render as a bare title — killing click-through on exactly
   the channels (Twitter/Reddit/Discord) beta traffic comes from.

### Current Database Grade vs. This Plan: **A−**

| Dimension | Grade | Notes |
|-----------|-------|-------|
| Schema | A− | `beta_signup_requests` is well-modeled: unique email index, status field, source, timestamps. One blemish: `name`/`use_case` are `NOT NULL` but the form only sends email, so the service backfills fake placeholder strings ("Beta access request"), polluting any future export. |
| API hygiene | A | Rate-limited, sanitized, deduped, idempotent upsert. |
| Observability | F | **The captured data is write-only from the operator's perspective.** No read path exists at all. This is the single biggest gap. |

The schema is genuinely good; the failure is purely that **nothing consumes it**.
This plan keeps the strong schema, fixes the placeholder blemish, and builds the missing
read/export path + share polish to reach **S+**.

---

## Decisions (confirmed)

- **Capture flow:** Admin dashboard view + CSV export (no external mail provider this round).
- **Share polish:** Full pre-launch SEO pack (static meta + og:image + robots + sitemap + privacy-friendly analytics hook).
- **Form field:** Add a second field — "What goal are you trying to achieve?" — persisted via the existing `use_case` column. Optional (does not block submit), so it raises signal without adding friction.

---

## Phase 1 — Make captured emails visible & actionable (P0)

Goal: an operator can, in the existing Admin page, see every beta signup, search/filter
it, change its status, and export the whole list as CSV — with no external accounts.

### 1a. Schema cleanup (migration)
- Make `BetaSignupRequest.name` and `use_case` **nullable** in [models/user.py](../models/user.py#L72-L89).
- Add Alembic migration to drop the `NOT NULL` constraints (data already present stays valid).
- Update [services/public_service.py](../services/public_service.py#L31-L32) `create_beta_signup_request` to stop backfilling
  fake `"Beta access request"` / `"interested beta user"` placeholders — store `NULL`
  when the field is absent so exports show real data only.
- Keep the existing upsert/dedup/status-reactivation behavior intact.

### 1b. Admin API: list + status + export
Add to [blueprints/admin_api.py](../blueprints/admin_api.py) (mirroring the existing `require_admin` →
service → serialize pattern used by `list_admin_users`):
- `GET  /api/admin/beta-signups` — paginated list, `status` filter, `q` search (email
  contains), newest-first. Returns `{ requests: [...], total, status_counts }`.
- `PATCH /api/admin/beta-signups/<id>` — update `status` (`new` → `invited` → `dismissed`),
  validated by a new `BetaSignupStatusSchema` in [validators.py](../validators.py).
- `GET  /api/admin/beta-signups/export.csv` — streams `text/csv`
  (`email,status,source,created_at,updated_at,note`), `Content-Disposition: attachment`.
- All routes admin-gated via the existing `_admin_service_or_response` helper.

Add to [services/admin_service.py](../services/admin_service.py) (NOT the public service — this is operator-side):
- `list_beta_signups(status, q, page, page_size)` with `status_counts` aggregate.
- `update_beta_signup_status(signup_id, status)`.
- `iter_beta_signups_for_export()` generator for CSV streaming.
Reuse the existing `PublicService.serialize_beta_signup` serializer for shape parity.

### 1c. Admin UI: "Beta signups" tab
In [client/src/pages/Admin.jsx](../client/src/pages/Admin.jsx):
- Add a top-level `Beta signups` tab alongside the existing admin tabs.
- Table: email, status badge, source, requested-at. Search box + status filter chips
  with counts (`New 12 · Invited 3 · Dismissed 1`).
- Per-row status dropdown (mutation → invalidate query).
- **"Export CSV"** + **"Copy all emails"** buttons (the copy-all is the fastest path to
  pasting into a real mail tool later).
- New query/mutation hooks in `client/src/hooks/` following the centralized
  `queryKeys` + `adminApi` module pattern; add keys to [client/src/hooks/queryKeys.js](../client/src/hooks/queryKeys.js)
  and a `betaSignups` group to the admin API module.

### 1d. Tests
- Backend: extend [tests/integration/test_admin_api.py](../tests/integration/test_admin_api.py) — list (admin-only, pagination,
  status filter, search), status PATCH, CSV export headers/body, non-admin 403.
- Backend: update existing public beta-signup tests for the nullable/no-placeholder change.
- Frontend: Admin tab renders rows, filter/search, status mutation, copy-all/export wiring.

---

## Phase 2 — Make the page shareable & measurable (P0/P1)

### 2a. Static social + SEO meta in [client/index.html](../client/index.html)
The shell currently has only charset/viewport/title. Add static (crawler-visible) tags:
- `<meta name="description">` (from landing.md SEO copy, hardcoded as the default shell value).
- `og:title`, `og:description`, `og:type=website`, `og:url`, **`og:image`** (absolute URL).
- `twitter:card=summary_large_image`, `twitter:title/description/image`.
- `<link rel="canonical" href="https://fractalgoals.com/">`.
- Keep [Landing.jsx](../client/src/pages/Landing.jsx#L494-L545) runtime injection for in-app navigation, but the **static shell
  values become the source of truth for unfurlers**. Ensure they don't conflict.
- Fix the viewport anti-pattern: remove `user-scalable=no` / `maximum-scale=1.0` so
  pinch-zoom works (accessibility; some auditors flag this).

### 2b. og:image asset
- Add a 1200×630 `og-cover.png` (or `.svg`→exported) to `client/public/` — branded hero
  with the headline + a goal-tree visual. Reference it by absolute production URL.
- Add an apple-touch-icon if not already covered by the favicon set.

### 2c. robots.txt + sitemap.xml
- `client/public/robots.txt` — allow all, point to sitemap.
- `client/public/sitemap.xml` — apex landing URL (+ `my.` app entry if desired).
- Confirm the Nginx config ([client/nginx.conf](../client/nginx.conf)) serves these at root (they're static
  assets, so the existing static handling should already cover them — verify).

### 2d. Privacy-friendly analytics hook
- Add a single, opt-in, lightweight analytics include (Plausible-style: one script tag,
  no cookies, GDPR-friendly) gated behind a `VITE_ANALYTICS_DOMAIN` env var so it's a
  no-op when unset (local/dev safe).
- Fire one custom event on successful beta signup (`beta_signup`) so conversion rate on
  earned traffic is measurable from day one.

### 2e. Post-signup expectation-setting copy
- In [client/src/content/landing.md](../client/src/content/landing.md) Beta Form section, upgrade the success message to set
  a "what happens next" expectation (e.g. "You're on the list — we email new testers in
  small batches as slots open."). Pure copy edit, no logic.

---

## Phase 3 — Polish & guardrails (P2, optional but cheap)

- **Honeypot field** on the signup form (hidden input; reject if filled) to cut spam
  without a CAPTCHA — the 12/hr rate limit helps but won't stop distributed bots.
- **Duplicate-friendly success copy**: already idempotent server-side; ensure the UI
  treats re-submit of an existing email as success, not a confusing error.
- **Admin empty state** for the Beta signups tab ("No requests yet").

---

## Files Touched (summary)

**Backend**
- `models/user.py` — nullable name/use_case
- `migrations/` — new Alembic revision
- `services/public_service.py` — drop placeholder backfill
- `services/admin_service.py` — list/status/export methods
- `blueprints/admin_api.py` — 3 new admin routes
- `validators.py` — `BetaSignupStatusSchema`
- `tests/integration/test_admin_api.py` (+ public signup tests)

**Frontend**
- `client/index.html` — static SEO/social meta, viewport fix
- `client/public/` — `og-cover.png`, `robots.txt`, `sitemap.xml`
- `client/src/pages/Admin.jsx` — Beta signups tab
- `client/src/hooks/queryKeys.js` + admin API module + new hooks
- `client/src/content/landing.md` — success-message copy
- analytics include (index.html or main.jsx, env-gated)
- matching frontend tests

---

## Why This Reaches S+

- **Engineering quality:** closes the only structural gap (write-only data) with the
  same service→serializer→query-key patterns already in the codebase; fixes the schema
  placeholder blemish; everything tested.
- **Product usability:** an operator can run the entire beta funnel — see requests,
  triage status, export/copy emails for outreach — without leaving the admin they already use.
- **Overall:** the page becomes genuinely shareable (rich unfurls, indexable) and
  measurable (conversion events), so traffic you work to earn actually converts and is
  counted, instead of disappearing into an invisible table.

## Explicitly Out of Scope (this round)
- Transactional/marketing email sending (no mail provider wired — chosen deferral).
- Direct push to Mailchimp/ConvertKit/Loops (the CSV/copy-all export bridges this manually).
- Double opt-in / verification emails.
