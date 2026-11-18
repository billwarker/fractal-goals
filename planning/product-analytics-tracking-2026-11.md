# Product Analytics: Assessment, Vendor Options, and S+ Plan

## Context

You're considering Snowplow for analytics tracking. The app is not starting from zero. It already has a careful first-party pipeline:

- **`product_events`** ([models/product_event.py](models/product_event.py)): user-scoped UI events. The server allowlists them ([services/telemetry_service.py](services/telemetry_service.py) `ALLOWED_EVENTS`, 20 names), the browser normalizes paths (UUIDs become `:rootId`/`:id`), events are sent in batches of up to 20, and props are capped at 1 KB.
- **The client** ([client/src/utils/telemetry.js](client/src/utils/telemetry.js)): collects only while signed in, honours Do Not Track, flushes on `visibilitychange`, and drops events on failure. [usePageViewTelemetry.js](client/src/hooks/usePageViewTelemetry.js) records page views.
- **Domain events**: `event_bus` ([services/events.py](services/events.py), ~79 event names) writes to `event_logs`, which is root-scoped and carries content in its payloads.
- **Warehouse**: [services/analytics_export_service.py](services/analytics_export_service.py) runs a nightly incremental export to BigQuery (`fractal_analytics`). It strips `event_logs` payloads and descriptions, rebuilds `users` with WRITE_TRUNCATE, and keeps 24 months.
- **Reporting**: the admin usage dashboard ([services/admin_usage_service.py](services/admin_usage_service.py)) shows DAU/WAU/MAU, top pages and events, a breakdown by event type, and retention controls.
- **Sentry** ([client/src/utils/monitoring.js](client/src/utils/monitoring.js)): tracing plus masked replay at 10%. It is **dormant in production**: `cloudbuild.yaml` never passes `VITE_SENTRY_DSN`.
- **Privacy policy** ([client/src/content/legal/privacy.md](client/src/content/legal/privacy.md)) §2.3, §6 and §7 make specific promises: an exact event list, no third-party analytics scripts, exactly two cookies, no consent banner, and legitimate interests as the legal basis with a right to object.

What's actually missing is analytics *capability* (funnels, activation, retention, anything before sign-in), plus a few correctness and compliance gaps. Collection plumbing already exists. Those gaps should drive the vendor decision.

---

## Grade of the current system: **B−**

| Area | Grade | Evidence |
|---|---|---|
| Privacy engineering | **A** | Server allowlist, path de-identification, DNT, payload stripping in the BigQuery export, bounded retention, masked replay |
| Collection plumbing | **B+** | Batched, rate-limited (60/min), idempotent-free but harmless. Events at the tail of a visit are lost: no `fetch keepalive`/`sendBeacon` on `pagehide` |
| Event schema governance | **C** | Names are allowlisted but `props` are an untyped 1 KB blob. No versions, no per-event property schema, no client↔server contract fixture (unlike `goal_deadline_cases.json`, `media_types.json`, etc.) |
| Policy ↔ code consistency | **D** | privacy.md §2.3 says **"only these six event types and nothing else"**, but `ALLOWED_EVENTS` holds **20** (14 `offline_*` health events). That makes the published policy inaccurate today. Sentry isn't listed as a subprocessor (fine while dormant, but a trap the moment the DSN is set) |
| Funnel coverage | **F** | Nothing before sign-in: the landing page, the demo tour, demo blocked-write toasts, the waitlist modal, the invite → signup path. This is the beta's most important funnel, and it's invisible |
| Activation / behaviour joins | **C** | Domain facts live in root-scoped `event_logs`. The warehouse can't attribute them to a user because `goals` isn't exported, so "user created first fractal → completed first session within 7 days" can't be queried |
| Sessionization / context | **D** | No visit/session id, no app version, no surface (app/demo), no viewport class. Every event is context-free |
| Warehouse + reporting | **B** | The export is solid and tested. Reporting is one admin page; there are no modelled tables (funnels, cohorts) |
| User control | **C** | Policy promises a right to object, but the only mechanism is DNT, which is deprecated. No GPC, no Settings toggle |
| Erasure propagation | **C+** | `users` is truncated nightly, but append tables in BigQuery keep `user_id` rows up to 24 months after deletion. That's defensible under the policy's retention table, but not S-grade |

---

## Vendor options

| Option | Fit | Cost (unverified 3rd-party figures) | Policy impact | Verdict |
|---|---|---|---|---|
| **Snowplow BDP (managed)** | Excellent conceptually: schema-first (Iglu), entities, first-party collector, native BigQuery loader, Python server tracker | Reportedly ~$800–1,500+/mo; enterprise is quote-only | Minimal if the collector sits on your own domain | **Over-sized for a private beta.** Revisit at scale |
| **Snowplow self-hosted** | Same | Infra plus ops time | Same | **Not viable.** Since Jan 2024, Collector/Enrich/loaders/Iglu use the Snowplow Limited Use License, which **prohibits production use** without a commercial licence. Community Edition is for testing only. Trackers (JS/Python) are still BSD/Apache |
| OpenSnowcat (community fork) / Snowcat Cloud | Snowplow-compatible | Hosting plus ops | Same | Third-party fork risk; a single-person app shouldn't run a Kafka/PubSub pipeline |
| **PostHog Cloud (EU/US)** | Best out-of-box UI: funnels, retention, paths, flags, replay, surveys. ~1M events/mo free | Free at beta volume | **Breaks** "no third-party analytics scripts" (mitigate with a reverse proxy on your domain). Needs a policy rewrite and a new subprocessor. Overlaps existing feature flags and Sentry replay | Best choice **if** you want dashboards without building any. Second choice overall |
| Plausible / Umami / Fathom | Landing-page-only aggregate stats, cookieless | ~$9–20/mo, or free self-hosted Umami | Small addition | Solves only the top of the funnel, with no join to activation |
| GA4 / Mixpanel / Amplitude / Segment | Ad-tech heritage, or CDP overkill | Varies | Contradicts the policy's spirit | Reject |
| **Extend first-party pipeline (recommended)** | Already 70% built. Add Snowplow's *ideas* (versioned schemas, context entities, server-side facts) to the existing stack | ~$0 incremental (BigQuery free tier + Looker Studio) | Policy stays truthful with small, honest additions | **Recommended** |

**Recommendation:** don't adopt Snowplow now. Build a "Snowplow-shaped" first-party pipeline instead: self-describing events with a schema version, a context envelope, and a tracking plan as code, warehoused in your existing BigQuery. That gets ~90% of Snowplow's value at your scale. The event contract stays close enough to Snowplow's self-describing JSON that switching later to BDP (or to PostHog via its BigQuery import) changes only the collection layer. Phase 6 defines when to revisit.

---

## Confirmed goals

1. **Landing traffic:** unique visitors per day/week, top referrers and UTM campaigns, demo starts.
2. **Signup conversion:** visitors → demo → waitlist submitted → invited → signed up → first fractal.
3. **In-app usage:** which features people use, and the KPI, **Weekly Active Practitioners (WAP)**: distinct users who complete at least one session in an ISO week.

Phases are ordered so each one delivers one of these. Anything that doesn't serve them is in "Deferred".

---

## S+ plan

### Phase 0: Compliance groundwork (required before any new tracking ships)

Public tracking changes what the policy must say, so this goes first.

1. **Policy ↔ allowlist sync test.** Add an architecture test, in the same style as the one tying `index.html` to `landing.md`. It asserts the event list in privacy.md §2.3 equals the tracking-plan fixture (Phase 1). Rewrite §2.3 honestly in three groups: *usage* (6), *reliability* (`offline_*`: counts and error codes only), and *public site* (Phase 2: cookieless, aggregate). Bump `PRIVACY_VERSION` ([legalVersions.js](client/src/content/legal/legalVersions.js) plus `config.PRIVACY_VERSION`). The `LegalAcceptanceModal` review flow on this branch then asks users to re-accept.
2. **Opt-out that matches the policy's right to object:** honour `navigator.globalPrivacyControl` and the `Sec-GPC` header alongside DNT. Add **Settings → Privacy → "Share usage analytics"** (default on), stored in `user.preferences.privacy.usage_analytics` and enforced on the server. Reuse `SettingsRow` and `atoms/Switch`.
3. **Sentry tripwire:** a check fails the build if `VITE_SENTRY_DSN` is set while privacy.md doesn't list Sentry.
4. **Erasure reaches BigQuery:** erased user ids queue in `analytics_erasures`. The next export run deletes their `product_events` rows in BigQuery and clears the queue. Unit-test it with the existing fake BigQuery client.

### Phase 1: Minimal tracking plan (the contract everything below uses)

1. **`tests/fixtures/tracking_plan.json`:** for each event it lists name, `schema_version`, surface (`app | public`), category, and typed props (enums, ints and bools only, so free text can never get in).
2. **Server:** `services/tracking_plan.py` loads the fixture and replaces `ALLOWED_EVENTS`. `record_events` drops unknown or invalid props instead of passing the 1 KB blob through.
3. **Client:** `utils/trackingPlan.js` imports the same JSON. In dev, a warning fires on unregistered names or props.
4. **Context, sent once per batch:** `app_version`, `surface`, `viewport_class`, and `visit_id` (random, in `sessionStorage`, rotating after 30 minutes idle). A migration adds `schema_version`, `visit_id`, `surface` and `app_version` to `product_events` and to the export schema.
5. **Lossless tail:** on `pagehide`, flush with `fetch(..., {keepalive: true})`.

### Phase 2: Landing traffic and the funnel before sign-in (goals 1 and 2)

1. **New `web_events` table:** no `user_id`, IP or UA. Columns: `event_name`, `schema_version`, `path`, `props`, `visitor_day_hash`, `referrer_host`, `utm_source/medium/campaign`, `created_at`. It keeps 90 days live and is exported to BigQuery.
2. **Cookieless unique visitors:** `visitor_day_hash = sha256(daily_salt ‖ ip ‖ ua ‖ host)`. The salt lives in `app_settings` and the retention job rotates and discards it daily. The real IP comes from `request_identity.py`. No cookie is set, so §7's "two cookies, no banner" stays true.
3. **Endpoint:** `POST /api/public/telemetry`, unauthenticated, limited to 30/min per IP. It accepts only `public`-surface plan events and honours DNT and GPC.
4. **Events:** `landing_view` (with referrer and UTM taken from the first hit of the visit), `demo_started` (`example_id`, `tour`), `demo_tour_completed`, `demo_write_blocked` (`action_kind`), `waitlist_opened` (`source`), `waitlist_submitted`, `invite_link_opened`. Instrument them in `pages/Landing.jsx`, `demo/DemoGuide.jsx`, `demo/demoMode.js`, `demo/DemoSignupModal.jsx` and `demo/DemoWriteNotice.jsx`.
5. **Signup attribution without stitching:** `waitlist_submitted` copies the visit's `utm_source` (or `demo:<example>`) onto `BetaSignupRequest.source`. Invite acceptance carries it to the new `users.acquisition_source` column. The funnel is therefore aggregate until the waitlist and per user after it, and anonymous visitors are never linked to accounts.
6. **Conversion steps that already exist as data:** the waitlist (`beta_signup_requests.created_at`), invited (`signup_invite_keys`), signed up (`users.created_at`), and first fractal (the first `goal.created` with no parent).

### Phase 3: In-app usage and WAP (goal 3)

1. **Make domain events attributable:** the export writes `event_logs.owner_user_id` by joining `root_id → goals.owner_id` at export time. Payloads stay stripped. Every session completion, goal completion, program or note becomes joinable to a user with no new write path.
2. **WAP needs no new collection.** It's the distinct `owner_user_id` on `session.completed` per ISO week, excluding the demo and admin roles. Postgres can compute it today from `event_logs` joined to `goals`, and the admin card reads it live.
3. **Feature adoption** comes from `page_view` normalized paths (already collected) plus a small set of new usage events for surfaces that aren't routes: `quick_session_logged`, `analytics_view_saved`, `agent_chat_opened`, `goal_review_written`. Each needs a plan entry and a policy line.

### Phase 4: Reporting

1. **Admin overview gets an "Acquisition & engagement" card**, read from Postgres over a bounded window:
   - **Traffic:** unique visitors per day (sparkline), top 5 referrers and UTM sources, demo starts
   - **Conversion:** a funnel bar (visitors → demo → waitlist → invited → signed up → first fractal) with the rate at each step
   - **WAP:** this week vs. last, an 8-week trend, and WAP ÷ total active accounts
   - **Feature adoption:** the share of WAP who used each surface this week

   Reuse the existing Chart.js wrapper and the admin date-range filter.
2. **Deeper analysis in BigQuery:** version-controlled views in `infra/analytics/models/*.sql` (`funnel_daily`, `wap_weekly`, `retention_weekly` by signup cohort, `feature_adoption`), applied with `CREATE OR REPLACE VIEW` by the export job. Looker Studio sits over them if you want ad-hoc slicing.

### Phase 5: Quality gates

- **Contract tests:** unknown names and props are dropped (boundary cases: size limit, enum miss, wrong type); client and server load one fixture; the policy list equals the plan; no free-string props; `web_events` has no IP or UA column; the salt rotates.
- **WAP boundary tests:** the ISO week edge in the user's timezone vs. UTC, demo and admin exclusion, and quick sessions counting.
- **Playwright:** `landing.spec.js` and `demo.spec.js` assert the public event sequence; `onboarding.spec.js` asserts the app events. Rebuild `client/dist` first.
- **Dev debugging:** `?telemetry_debug=1` logs each queued event and its validation result.

### Deferred (not needed for the three goals)

Sessionized `visits` models, a dbt project, multi-touch attribution, replay, and any external vendor. **Revisit trigger:** a paid acquisition channel, a dedicated analyst, or hand-built reports costing more than ~$800/month of your time. At that point, the tracking plan's self-describing shape maps onto Snowplow BDP schemas or PostHog `capture()` with only `telemetry.js` and the collector changing.

---

## Critical files

- Backend: [services/telemetry_service.py](services/telemetry_service.py), new `services/tracking_plan.py`, new `services/web_telemetry_service.py`, [models/user.py](models/user.py) (`acquisition_source`, `BetaSignupRequest.source`), [validators/telemetry.py](validators/telemetry.py), [blueprints/telemetry_api.py](blueprints/telemetry_api.py) (plus the public route), [models/product_event.py](models/product_event.py) and a new `WebEvent` model, new migration(s), [services/analytics_export_service.py](services/analytics_export_service.py), [services/data_retention_service.py](services/data_retention_service.py), [services/user_service.py](services/user_service.py) (erasure hook), [services/admin_usage_service.py](services/admin_usage_service.py)
- Client: [client/src/utils/telemetry.js](client/src/utils/telemetry.js), new `utils/trackingPlan.js`, [hooks/usePageViewTelemetry.js](client/src/hooks/usePageViewTelemetry.js), Landing/demo components, `components/settings/` (privacy row)
- Policy: [client/src/content/legal/privacy.md](client/src/content/legal/privacy.md), `legalVersions.js`, `config.py`
- Shared: `tests/fixtures/tracking_plan.json`, `infra/analytics/models/`

## Verification

1. `./run-tests.sh backend` and `frontend`: the new contract, plan-fixture, policy-sync, erasure-export (fake BigQuery client), GPC/DNT and preference-off tests pass.
2. `./run-tests.sh lint`: the maintainability rule catches an unregistered `trackEvent` literal (try one deliberately).
3. Rebuild the client, then run `npm run test:browser:smoke` and the extended onboarding/demo e2e specs, which assert event sequences on both endpoints.
4. Locally: open the landing page and demo with `?telemetry_debug=1`, check the console log, and confirm rows in `web_events` with no IP or UA. Sign in, toggle Settings → Privacy off, and confirm no new `product_events` rows.
5. Run the export against a staging dataset. Confirm `event_logs.owner_user_id` is populated, the views build, and an erased test user's rows are gone after the next run.
6. Check the admin card's funnel and WAP numbers against hand-written SQL on seeded data.
7. After approval, save this plan as `planning/product-analytics-tracking-2026-11.md`.

## Sources

- [Snowplow Limited Use License FAQ](https://docs.snowplow.io/docs/resources/limited-use-license-faq/)
- [Snowplow licence change announcement](https://snowplow.io/blog/introducing-snowplow-limited-use-license)
- [Snowplow Community Edition (testing only)](https://docs.snowplow.io/docs/getting-started-on-community-edition)
- [Snowplow Micro](https://docs.snowplow.io/docs/testing/snowplow-micro/)
- [OpenSnowcat fork](https://github.com/opensnowcat)
- [Snowplow pricing (Toolradar, third party)](https://toolradar.com/tools/snowplow/pricing) and [Software Advice](https://www.softwareadvice.com/master-data-management/snowplow-insights-profile/)
- [PostHog pricing guide (Schematic, third party)](https://schematichq.com/blog/posthog-pricing)

---

## Delivery notes (2026-11-18, branch `product-analytics`)

Shipped as planned, with these deliberate differences:

- **Tracking plan location:** `services/tracking_plan.json` (not `tests/fixtures/`), because the backend
  image excludes `client/` and `tests/` would be odd for a runtime contract. The client reads it only in
  tests (call-site scan), so it adds nothing to the landing bundle; `?telemetry_debug=1` logs what the
  server kept instead of validating in the browser.
- **Prop types:** `int` (bounded), `bool`, `enum`, and `code` (identifier pattern, ≤64), used for op kinds and
  error names where an enum would drift. No free string type exists.
- **Opt-out preference key:** `preferences.usage_analytics` (top level; the preferences PATCH merges
  shallowly, so a nested `privacy` object would be overwritten wholesale).
- **Nothing stored on the device:** the signed-in visit id lives in page memory (rotates after 30 idle
  minutes or a reload), and public-site attribution travels in the demo links, not `sessionStorage`, so
  the ePrivacy storage rule and §7 ("exactly two cookies, no banner") stay true.
- **Feature adoption** comes from `page_view` route segments among the week's practitioners; no new
  in-app usage events were needed (domain facts already reach the warehouse via `event_logs.owner_user_id`).
- **Reporting views** are documented SQL in `docs/bigquery-export.md` rather than applied by the export
  job, so the export never issues DDL.
- **Activation** (a completed session within 7 days of sign-up) was added to the funnel.
- **App version** comes from `VITE_APP_VERSION` (Cloud Build passes `$BUILD_ID`).

**Rollout note:** privacy.md is now 1.3 (effective 2026-11-18). §16 promises notice *before* a material
change takes effect; the version bump makes every signed-in user re-accept through the review modal. Deploy
when you're ready for that, and consider waiting a few days after the notice before relying on the data.
