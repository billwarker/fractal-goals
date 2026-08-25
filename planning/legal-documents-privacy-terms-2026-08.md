# Privacy Policy & Terms of Service — Fractal Goals

## Context

Fractal Goals is moving from a closed invite-only build toward real users. Today the app has **no legal documents at all** — no privacy policy, no terms, no consent capture, no age gate. Meanwhile `SettingsModal.jsx:231-232` and `:590-591` already render "Privacy Policy" and "Terms of Service" links pointing at `/privacy` and `/terms`, and **both are dead**: no such routes exist, so the catch-all at `AppRouter.jsx:653` bounces users to the selection page after a full page reload.

That is a live bug and a compliance gap. The app processes real personal data (emails, usernames, free-text notes, behavioural telemetry), copies it to a Google BigQuery warehouse with no retention limit, sends transactional email through Resend, and hosts everything on Google Cloud in `us-east1` with a Supabase-managed Postgres.

The goal is to write both documents to a review-ready standard, display them in Settings and on public routes, capture consent at signup, and — critically — **build the endpoints the Privacy Policy will promise** so its commitments are true rather than aspirational.

### Decisions taken

| Decision | Choice |
|---|---|
| Jurisdictional scope | Worldwide, incl. EU/UK — full GDPR machinery, plus CCPA/CPRA and PIPEDA sections |
| Legal entity | Incorporated company; `[LEGAL ENTITY NAME]` placeholders throughout |
| Governing law | Ontario, Canada; exclusive venue in Ontario courts. **No arbitration clause, no class waiver** |
| Deletion promise | Full erasure on request within 30 days — backed by a real endpoint, not manual email |
| Acceptance | Required signup checkbox + read-only display in Settings, version + timestamp recorded |
| Billing terms | Forward-looking; state service is currently free during beta |
| BigQuery | Disclosed by name, with a committed retention window that gets configured for real |
| Health framing | Explicit not-medical-advice disclaimer in the Terms |
| Minimum age | 16, attested via the signup checkbox (clears GDPR child-consent thresholds, avoids COPPA) |
| Placement | Settings tab + public `/privacy` + `/terms` routes + landing footer |

> **Not legal advice.** These documents are written to be as close to review-ready as possible so that a lawyer's review before public launch is cheap and fast. Have one done. Every `[BRACKETED]` placeholder is a blocker for launch.

---

## Database grade against this plan: **D**

Not because the schema is bad — it is well-built for its actual purpose — but graded *against the requirements of a privacy policy that promises GDPR/CPRA rights*, the gaps are structural:

| Area | Grade | Finding |
|---|---|---|
| Auth & credentials | **A** | PBKDF2 hashing, hashed reset tokens with 60-min TTL, hashed invite keys, HttpOnly + `SameSite=Strict` cookies, CSRF double-submit, failed-login lockout. Genuinely strong. |
| Data minimisation | **A−** | No IP column, no user-agent column, no DOB. Telemetry honors Do Not Track (`telemetry.js:25-28`), de-identifies UUID path segments client-side, and enforces a 6-event server-side allowlist. Exemplary restraint. |
| Consent capture | **F** | Nothing exists. No terms version, no acceptance timestamp, no age attestation. Cannot prove any user ever agreed to anything. |
| Right to erasure | **D** | `user_service.py:529-543` only anonymizes the identity row. Goals, sessions, notes, event logs all persist keyed to the same `user.id`. A policy claiming deletion today would be false. |
| Right to portability | **F** | No export endpoint of any kind. |
| Retention | **D** | Only `product_events` has a policy (180 d) and **its prune is manual** — no scheduler invokes `POST /api/admin/usage/prune`. BigQuery has no table expiration at all. Password-reset token rows are never purged. |
| Admin accountability | **D−** | No audit table. Admins can mint a temporary password for any account (`admin_service.py:340-351`) and read it in the response — a de facto takeover path with no durable trail. |
| Subprocessor clarity | **B** | Cleanly separable in code, but Sentry is code-complete and DSN-gated: flipping one env var silently enables **session replay** at 10% sampling with no text masking (`monitoring.js:8-11`). |

**Path to S+:** the plan below closes consent (F→A), erasure (D→A), portability (F→A), retention (D→B+), and admin accountability (D−→B) — and puts a guard rail on the Sentry session-replay trap so the policy cannot silently become false.

---

## Part 1 — The documents

Two markdown files, imported with Vite `?raw` (precedent: `client/src/content/landingContent.js:1`) and rendered with the already-installed `react-markdown` + `remark-gfm` (`client/package.json:38,41`). This keeps legal copy editable without touching JSX.

- `client/src/content/legal/privacy.md`
- `client/src/content/legal/terms.md`
- `client/src/content/legal/legalContent.js` — exports both raw strings plus `PRIVACY_VERSION` / `TERMS_VERSION` / `LAST_UPDATED` constants parsed from each file's frontmatter-style header.

### Privacy Policy — required sections

Grounded strictly in the code audit. Every claim below is verified against a file.

1. **Who we are** — `[LEGAL ENTITY NAME]`, `[REGISTERED ADDRESS]`, controller identity, `privacy@fractalgoals.com`.
2. **What we collect**
   - *Account*: username, email, password hash, membership tier, quota overrides, preferences JSON, `last_login_at`, failed-login count, lockout timestamp (`models/user.py:16-35`).
   - *Content you create*: goals, sessions, activities, metrics, programs, targets, and **free-text notes** (`models/common.py:8-46`).
   - *Product telemetry*: 6 allowlisted event names only (`telemetry_service.py:22-29`), with de-identified paths. **Respects Do Not Track.**
   - *Domain event logs*: `event_logs`, scoped by `root_id`.
   - *Email delivery records*: send status, provider message id, no bodies (`models/user.py:126-160`), plus raw Resend webhook payloads which contain the recipient address (`:180`).
   - *Beta signup*: email, optional name, optional free-text "what goal are you trying to achieve" (`:80-105`).
   - **Explicitly state we do not store IP addresses or user-agent strings in our database.** True today — a genuine differentiator worth saying out loud.
3. **Lawful basis table** (GDPR Art. 6) — contract for account/service data; legitimate interests for security, abuse prevention and product analytics; consent for any future marketing.
4. **Cookies** — folded in, not a separate notice. Exactly two, both first-party: `fractal_auth_token` (HttpOnly) and `fractal_csrf_token` (JS-readable by design), `SameSite=Strict`, `Secure` in production. Session-only unless "remember me" is selected, in which case **10 days** (72 h JWT + 7 d refresh window, `auth_api.py:39-46`). **No third-party or advertising cookies.**
5. **Subprocessors** — named table with purpose and location:

   | Subprocessor | Purpose | Location |
   |---|---|---|
   | Google Cloud Platform | Application hosting (Cloud Run), build, container registry | `us-east1` (USA) |
   | Supabase | Managed PostgreSQL database | `[CONFIRM REGION — not in repo]` |
   | Resend | Transactional email delivery | USA |
   | Google BigQuery | Internal product analytics warehouse | `[CONFIRM DATASET LOCATION]` |

6. **International transfers** — data is processed in the United States; EU/UK transfers rely on Standard Contractual Clauses via the above providers' DPAs.
7. **Analytics warehouse** — disclose plainly that account records (id, username, email, role, tier, timestamps) and event history are exported to BigQuery for internal product analysis, **retained for 24 months**, never sold or shared with advertisers.
8. **Retention schedule** — table form:

   | Data | Retention |
   |---|---|
   | Account + content | Life of account, then 30 days after an erasure request |
   | Product events | 180 days |
   | BigQuery analytics | 24 months |
   | Password reset tokens | 60 minutes, purged after 30 days |
   | Email delivery / webhook events | 24 months |
   | Beta signup requests | Until invited or dismissed, then 12 months |

9. **Your rights** — access, rectification, erasure, portability, restriction, objection, withdrawal of consent, complaint to a supervisory authority (EU/UK) or the OPC (Canada). **State the 30-day response window** and point at the self-service export and erasure controls built in Part 3.
10. **CCPA/CPRA** — categories collected, right to know/delete/correct, and an unambiguous **"we do not sell or share your personal information"**. True: no ad tech, no payment processor, no data broker.
11. **Security** — hashing, cookie hardening, CSRF, rate limiting, lockout, tenant isolation. **Do not overclaim** — no SOC 2, no encryption-at-rest guarantee beyond the providers' defaults.
12. **Beta status** — the service is in private beta; data loss is possible; keep your own copies of anything critical.
13. **Sensitive data** — ask users **not** to enter health conditions, biometrics or other special-category data into free-text notes, since the service is not designed to hold Article 9 data.
14. **Children** — not for under-16s; we delete such accounts on discovery.
15. **Changes** — versioned; material changes trigger in-app notice and re-acceptance.
16. **Contact** — `privacy@fractalgoals.com`, `[REGISTERED ADDRESS]`.

### Terms of Service — required sections

1. **Agreement & eligibility** — 16+, capacity to contract, invite-key-gated private beta.
2. **The service & beta status** — provided "as is", availability not guaranteed, features may change or be withdrawn, **no data-durability guarantee**. This is the single most important liability shield at this stage.
3. **Accounts** — accuracy, credential security, one account per person, responsibility for activity under your account.
4. **Your content** — **you own it.** You grant `[LEGAL ENTITY]` a limited, non-exclusive, worldwide, royalty-free licence to host, store, back up, transmit and display it **solely to operate and improve the service**. The licence ends when the content is deleted.
5. **Anonymised & aggregated data** — reserve the right to derive and use de-identified, aggregated statistics (which cannot reasonably identify any user) for product improvement and publication.
6. **Featuring content publicly** — the landing page showcase currently publishes **admin-owned fractals only** (`services/landing_publish_service.py`). Include a clause reserving the right to feature user content publicly **only with that user's prior express consent**, so the option exists without a rewrite.
7. **Acceptable use** — no illegal content, harassment, IP infringement, malware, reverse engineering, scraping, automated bulk access, circumventing quotas or rate limits, resale or sublicensing, or probing security controls.
8. **Not medical, health or fitness advice** — the service tracks activities and metrics that users may apply to training or health goals; it is a record-keeping tool, not advice. Consult a qualified professional. Use at your own risk.
9. **Fees & subscriptions (forward-looking)** — the service is **currently free during private beta**. Reserve: paid plans, published pricing, automatic renewal, price changes with 30 days' notice, taxes, and a stated refund position. Written to be activated without amendment when billing lands.
10. **Quotas & limits** — tier-based resource and storage quotas apply and may change (`services/quota_service.py`).
11. **Suspension & termination** — either party may terminate at any time; we may suspend for breach or security risk. **Commit to a 30-day data-retrieval window** before deletion following termination-without-cause, except where breach or law requires otherwise.
12. **Disclaimers** — "as is" / "as available", no warranty of merchantability, fitness or non-infringement, to the maximum extent permitted by law.
13. **Limitation of liability** — no indirect, incidental, special, consequential or punitive damages; aggregate cap at **the greater of amounts paid in the preceding 12 months or CAD $100**. Include an explicit carve-out preserving consumer rights that cannot be waived (necessary for Quebec and EU consumers).
14. **Indemnity** — user indemnifies for content and misuse.
15. **Changes to terms** — versioned, notice, continued use constitutes acceptance, material changes require re-acceptance.
16. **Governing law & venue** — Ontario and the federal laws of Canada; exclusive jurisdiction of the courts of Ontario. **No arbitration clause, no class-action waiver.**
17. **Miscellaneous** — severability, no waiver, assignment, entire agreement, notices.

---

## Part 2 — Display surfaces

### 2a. Shared renderer

New `client/src/components/legal/LegalDocument.jsx` — thin wrapper over `MarkdownNoteContent` (`client/src/components/notes/MarkdownNoteContent.jsx`) with its **own CSS module**. Do not reuse `MarkdownNoteContent.module.css` directly: it is tuned for compact note excerpts (`h1` at `1.15em`, all of `h3`–`h6` at `1em`, `white-space: pre-wrap`), which is wrong for a long-form document. The new module needs a real type scale, paragraph rhythm, a readable measure, and table styling for the subprocessor and retention tables.

`markdownComponents.jsx:5-15` already has an `isSafeHref` allowlist permitting `/` and `#` relative hrefs — anchor links within the documents work for free.

### 2b. Settings "Legal" tab

- **Tab button**: insert after `SettingsModal.jsx:225`, matching the full className ternary chain used by `general`/`styling`/`account` (L205-222) — **not** the abbreviated chain the `getting-started` tab uses at L224, which is an existing inconsistency.
- **Tab panel**: insert after `SettingsModal.jsx:414`, following the `<div className={styles.tabContent}> → <section> → <h3 className={styles.sectionTitle}>` convention.
- **Panel component**: new `client/src/components/legal/LegalSettingsPanel.jsx`, modelled on the 6-line `client/src/components/onboarding/OnboardingSettingsPanel.jsx`. Shows a Privacy / Terms toggle, the rendered document, its version and last-updated date, and the timestamp of the user's recorded acceptance.
- **Fix the dead links**: repoint `SettingsModal.jsx:231-232` (desktop) and `:590-591` (mobile) from `<a href="/privacy">` to handlers that call `setActiveTab('legal')` with the right document preselected. Existing CSS at `SettingsModal.module.css:101,106,113,416` is reused.
- The modal shell is a fixed `min(600px, viewport-32px)` height and `.contentArea` is already `overflow-y: auto`, so long documents scroll correctly with no layout change.

### 2c. Public `/privacy` and `/terms` routes

Follow the **`/reset-password` precedent exactly** (`AppRouter.jsx:433, 555-561`): a pathname branch placed *before* the authenticated `<Routes>` block, lazily loaded inside a `ComponentErrorBoundary` + `Suspense`.

- New `client/src/pages/Legal.jsx` handling both paths.
- Add to `getPageTitle` (`AppRouter.jsx:429-444`): `'Privacy Policy'` / `'Terms of Service'`.
- Suppress `NavigationHeader` for these paths by extending the condition at `AppRouter.jsx:527`, matching how `/reset-password` is handled.
- **Must render unauthenticated.** Verify `AuthProvider` does not block or redirect; these routes need to work for a logged-out visitor arriving from the landing footer or the signup checkbox.
- `client/public/sitemap.xml` — add both URLs.

### 2d. Landing footer

There is currently **no footer component anywhere** — `Landing.jsx` closes `</main>` at L945-947 with nothing after it.

- Add a `<footer>` after `Landing.jsx:945`.
- Source its links from markdown: add a `## Footer` section to `client/src/content/landing.md` and a matching `content.footer` block in `landingContent.js`. The parser already has a `readLinks` helper (`landingContent.js:240`) that parses `- [Label](href)` lists — exactly the shape needed, so this is a markdown-and-parser change, not bespoke JSX.
- Must not disturb the desktop horizontal scroll-snap layout: the footer belongs inside the final `#beta` snap section, **not** as a sibling of the snap container, or it will become a fifth snap target.

---

## Part 3 — Making the promises true

Everything above is prose until these exist. This is what moves the grade.

### 3a. Consent capture at signup

- **Migration**: add to `users` — `terms_accepted_version` (String), `terms_accepted_at` (DateTime), `privacy_accepted_version` (String), `privacy_accepted_at` (DateTime). Columns rather than a `preferences` JSON key, because consent evidence must be queryable and must not be lost to a preferences overwrite.
- **Validator**: `validators/auth.py:22-39` — `UserSignupSchema` gains a required `accepted_terms` boolean that must be `True`, plus `terms_version` and `privacy_version` strings.
- **Service**: `services/auth_service.py` signup path stamps all four columns inside the existing transaction.
- **UI**: `client/src/components/modals/AuthModal.jsx` signup form gains a required checkbox — *"I am 16 or older and I agree to the Terms of Service and Privacy Policy"* — with both phrases linking to `/privacy` and `/terms` in a new tab. Submit stays disabled until checked. The age attestation lives in this sentence; no separate DOB field.
- **Expose** acceptance state through `/api/auth/me` so the Settings Legal tab can show *"You accepted version 1.0 on 25 August 2026."*

### 3b. Self-service data export (Right to portability)

- `GET /api/auth/account/export` in `blueprints/auth_api.py`, rate-limited (suggest 2/hour), password-confirmed like the existing delete route at `:461-462`.
- New `services/data_export_service.py` returning a single JSON document: profile, preferences, all root fractals and their goal trees, sessions, activities, activity groups, targets, programs, notes, session templates, event logs, and the user's own product events. Reuse existing serializers in `services/serializers.py` rather than writing new ones.
- Streamed or size-bounded — a heavy account should not blow the 200 s Nginx / 210 s Gunicorn ceilings. If a synchronous export risks that, generate it as a Cloud Run Job and email a signed link instead.
- **UI**: a "Download my data" button in the Settings **Account** tab (panel at `SettingsModal.jsx:416-587`).

### 3c. Real erasure (Right to be forgotten)

The current `services/user_service.py:529-543` anonymize-only path is the single largest gap between what the policy will say and what the code does.

- Add `services/user_service.py::request_account_erasure()` — password-confirmed, marks the account for deletion, sets `is_active = False`, records `erasure_requested_at`, sends a confirmation email (new `account_erasure_requested` template alongside the four in `services/email_templates/`).
- Reuse the existing, already-correct `admin_service.py:374-395` `_hard_delete_roots` cascade as the execution engine — do not write a second deletion path.
- **30-day grace window**, matching the policy: a scheduled Cloud Run Job executes the hard delete for accounts past the window. This also gives users a recovery window against accidental or malicious deletion.
- Fix the residue the current cascade leaves: `email_delivery_events.recipient_user_id` is `SET NULL` (rows survive de-linked, which is fine and defensible), but `password_reset_tokens` rows and `email_webhook_events` payloads containing the address need explicit handling.
- **UI**: replace the existing delete control in the Account tab with one that states plainly what happens and when.

### 3d. Retention enforcement

- **BigQuery**: set table expiration to 24 months on the `fractal_analytics` dataset so the policy's retention claim is enforced by infrastructure rather than intention. Configure in `services/analytics_export_service.py` at table-creation time and document in `cloudbuild.yaml`.
- **Product events**: `POST /api/admin/usage/prune` exists (`blueprints/admin_api.py:105-107`) but **nothing calls it**. Add a scheduled Cloud Run Job, alongside the existing `export-analytics` job pattern at `cloudbuild.yaml:70-83`.
- **Password reset tokens**: purge rows older than 30 days in the same job.
- **Confirm the Supabase region** out of band and fill the `[CONFIRM REGION]` placeholder. A data-residency claim cannot be verified from this repo.

### 3e. Admin accountability

- **Migration**: new `admin_audit_events` table — `actor_user_id`, `action`, `target_user_id`, `metadata` JSON, `created_at`.
- Write from `services/admin_service.py` for the actions that matter: tier change, quota change, suspend/reactivate, role change, **temporary password generation** (`:340-351` — the de facto takeover path), soft delete, hard delete, invite key creation and revocation.
- This makes the Privacy Policy's "access to your data is limited and logged" statement true. Without it, that sentence should not be written.

### 3f. Sentry session-replay guard rail

`client/src/utils/monitoring.js:8-11` enables `Sentry.replayIntegration()` at `replaysSessionSampleRate: 0.1` with **no `maskAllText` or `blockAllMedia`**. Sentry is inert today only because `VITE_SENTRY_DSN` is unset — one env var in `cloudbuild.yaml` silently turns on session recording of user content and makes the Privacy Policy false.

- Set `maskAllText: true` and `blockAllMedia: true` now, before the DSN is ever set.
- Add a comment at that call site pointing at the privacy policy section that would need updating if replay is ever enabled unmasked.
- Reduce `tracesSampleRate` from `1.0` — 100% transaction sampling is both a cost and a data-volume problem in production.

---

## Files

**New**
```
client/src/content/legal/privacy.md
client/src/content/legal/terms.md
client/src/content/legal/legalContent.js
client/src/components/legal/LegalDocument.jsx
client/src/components/legal/LegalDocument.module.css
client/src/components/legal/LegalSettingsPanel.jsx
client/src/pages/Legal.jsx
services/data_export_service.py
services/email_templates/account_erasure_requested.*
migrations/versions/<rev>_add_legal_acceptance_columns.py
migrations/versions/<rev>_add_admin_audit_events.py
```

**Modified**
```
client/src/components/modals/SettingsModal.jsx      # Legal tab @225, panel @414, fix dead links @231-232 + @590-591
client/src/components/modals/AuthModal.jsx          # signup consent checkbox
client/src/AppRouter.jsx                            # /privacy + /terms branch, getPageTitle, header suppression
client/src/pages/Landing.jsx                        # footer inside #beta section
client/src/content/landing.md                       # ## Footer section
client/src/content/landingContent.js                # footer block via existing readLinks helper
client/src/utils/monitoring.js                      # mask replay, lower trace sampling
client/public/sitemap.xml                           # add both URLs
validators/auth.py                                  # UserSignupSchema consent fields
services/auth_service.py                            # stamp acceptance on signup
services/user_service.py                            # request_account_erasure
services/admin_service.py                           # audit writes
services/analytics_export_service.py                # BigQuery table expiration
blueprints/auth_api.py                              # export + erasure routes
models/user.py                                      # acceptance columns
cloudbuild.yaml                                     # prune + erasure scheduled jobs
```

---

## Verification

1. **Dead links** — from a fresh session, open Settings on desktop and mobile; both legal links open the Legal tab rather than navigating away. Confirm the pre-existing `/` redirect no longer occurs.
2. **Public routes logged out** — in a private window on `my.fractalgoals.com`, visit `/privacy` and `/terms`. Both render fully with no nav header, no auth redirect, and **no authenticated API calls** (check the network tab — this mirrors the existing landing-page provider test at `PublicLandingRoot`).
3. **Landing footer** — on desktop ≥981px, confirm the footer sits inside the `#beta` snap section and does **not** create a fifth horizontal snap target. Confirm normal vertical flow below 981px.
4. **Signup consent** — attempt signup with the checkbox unchecked: submit is disabled, and a direct API call without `accepted_terms` returns 400. On success, assert all four acceptance columns are populated and surfaced via `/api/auth/me`.
5. **Export** — call `GET /api/auth/account/export` with a password; assert the JSON contains goals, sessions, notes, activities, programs and the user's product events, and that a second user's data is absent. Confirm the rate limit fires on the third call in an hour.
6. **Erasure** — request erasure on a seeded account, then run the scheduled job with the clock advanced past 30 days. Assert the user row, all root goals and descendants, notes, event logs and product events are gone, and that a re-run is idempotent.
7. **Retention** — confirm BigQuery table expiration is set on `fractal_analytics`; run the prune job and assert `product_events` older than the configured window are removed.
8. **Audit** — perform a tier change and a temporary-password generation as admin; assert both write `admin_audit_events` rows with actor, target and action.
9. **Migrations** — the standard gate: upgrade-to-head on a clean PostgreSQL database, `alembic check` reports no pending operations, and one-step downgrade/re-upgrade round-trips cleanly.
10. **Tests** — add `SettingsModal` Legal-tab tests (**note: no test file exists for SettingsModal today**), `AuthModal` consent-gating tests, `Legal.jsx` route tests, and backend tests for export, erasure and audit writes.
11. **Placeholder sweep** — `grep -rn "\[LEGAL ENTITY\|\[REGISTERED ADDRESS\|\[CONFIRM" client/src/content/legal/` must return **zero results before launch**.

---

## Launch blockers

- [ ] Incorporate, and fill `[LEGAL ENTITY NAME]` + `[REGISTERED ADDRESS]`
- [ ] Confirm the Supabase Postgres region and the BigQuery dataset location
- [ ] Stand up `privacy@fractalgoals.com`
- [ ] Sign DPAs with Google Cloud, Supabase and Resend (all three offer standard ones)
- [ ] **Lawyer review of both documents**
- [ ] If EU/UK users are material in volume, assess whether an Art. 27 EU representative is required

---

# Implementation Notes (completed 2026-08-25)

## Deviations from the plan

**No Legal tab in Settings.** The plan added one; it was built, then removed at your
direction. The sidebar footer links (which already existed but were dead) now open the
public `/privacy` and `/terms` routes in a new tab instead. `LegalSettingsPanel` was
deleted. Net effect: one place the documents live, not two, and the `LegalDocument`
chunk is no longer pulled into the Settings bundle.

**`legalVersions.js` split out of `legalContent.js`.** `AuthProvider` needs the document
versions to record consent, but it sits inside the public landing provider envelope,
which has a hard 175 kB gzip budget enforced by the production build. Importing
`legalContent.js` there would have pushed ~16 kB of legal markdown into that bundle.
The versions now live in a separate 2-line module, with a test asserting they match the
markdown headers so they cannot drift.

**Account stays active during the erasure grace window.** The plan said deletion should
set `is_active = False`. Implementing that revealed a real bug: `token_required`
(`blueprints/auth_api.py:179`) rejects inactive users, so deactivating immediately would
have locked users out of the cancellation endpoint the Privacy Policy promises — turning
a reversible 30-day window into an instant, irreversible lockout. The account now stays
active and identifiable until the sweep runs. Caught by
`test_cancel_account_deletion`.

**Erasure reuses `AdminService.hard_delete_user` rather than a second cascade.** The
existing cascade is thorough and correct; duplicating it would guarantee drift. The sweep
passes a `_SystemActor` sentinel because `hard_delete_user` refuses self-deletion.

## Migration verification (PostgreSQL, isolated database)

Revision `a1b3c5d7e9f2`. All four gates passed:

1. Fresh zero-to-head upgrade — clean
2. `alembic check` — "No new upgrade operations detected"
3. One-step downgrade then re-upgrade — clean
4. `alembic check` after the round-trip — clean

Two real defects were caught by gate 2 and fixed: the audit table used `sa.JSON()` where
`models/base.py` resolves `JSON_TYPE` to `JSONB`, and the partial index on
`users.erasure_requested_at` was declared only in the migration, not on the model.

## Test results

- **Frontend: 246 files, 1117 tests, all passing.** Includes 7 new legal-document tests,
  3 public-route tests, and 2 new consent-gating tests in `AuthModal`.
- **Backend:** new coverage for consent capture, export (including tenant isolation),
  erasure + grace window + cancellation, and the admin audit trail (including that the
  trail survives a hard delete). Existing signup tests were updated to send the now-required
  consent fields; the old `test_delete_account_success` was rewritten because it asserted
  the anonymize-only contract that was deliberately replaced.
- **Known pre-existing issue, not introduced here:** running two integration files that
  each create schema in the same pytest invocation races on `CREATE TABLE`
  (`duplicate key value violates unique constraint "pg_type_typname_nsp_index"`).
  Reproduced with only original files and no new code involved. Worth fixing separately.

## Bundle impact

Public landing initial transfer: **146.0 kB JS gzip + 10.7 kB CSS gzip**, unchanged and
well inside the 175 kB / 20 kB budget. The legal documents compile to their own
lazy-loaded chunk reachable only from `/privacy` and `/terms`.

## Still outstanding — launch blockers

- [ ] Incorporate; fill `[LEGAL ENTITY NAME]` and `[REGISTERED ADDRESS]` (4 placeholders)
- [ ] Confirm the Supabase Postgres region and BigQuery dataset location
      (`[CONFIRM REGION]`, `[CONFIRM DATASET LOCATION]`)
- [ ] Stand up `privacy@fractalgoals.com`
- [ ] Sign DPAs with Google Cloud, Supabase and Resend
- [ ] **Lawyer review of both documents**
- [ ] Create the `data-retention` Cloud Run job and attach a daily Cloud Scheduler trigger
      (cloudbuild updates it; the job must exist first)
- [ ] Assess whether an Art. 27 EU representative is required

Verify placeholders before launch with:
`grep -rn "\[LEGAL ENTITY\|\[REGISTERED ADDRESS\|\[CONFIRM" client/src/content/legal/`
