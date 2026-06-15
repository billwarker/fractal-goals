# Migrate the landing page to the root of fractalgoals.com

## Context

The goal is to make the public landing page appear at `https://fractalgoals.com/` (the apex/root) and `https://www.fractalgoals.com/`, while the authenticated app stays at `https://my.fractalgoals.com/`.

The **application code is already finished**. [`client/src/utils/marketingHost.js`](client/src/utils/marketingHost.js) already serves the landing page at `/` for `fractalgoals.com` and `www.fractalgoals.com`, and keeps the authenticated fractal-selection root for `my.fractalgoals.com` and local dev. Both hostnames are intended to be served by the **same** `fractal-frontend` Cloud Run service.

This is therefore **not a code task** — it is a **Cloudflare DNS / routing task**, plus one small backend CORS env-var addition so the apex can call the API.

### Current observed state (verified)

- Nameservers are Cloudflare (`patryk.ns.cloudflare.com`, `anna.ns.cloudflare.com`) → you control DNS in Cloudflare.
- `my.fractalgoals.com` → `ghs.googlehosted.com`, HTTP 200. Already live via a **Cloud Run domain mapping**.
- `fractalgoals.com` (apex) and `www.fractalgoals.com` → **no DNS records exist**. The landing page has nowhere to render.
- The frontend `*.run.app` URL is `https://fractal-frontend-195572181270.us-east1.run.app` (HTTP 200).
- **Key constraint:** Cloud Run ingress returns **404 for any Host it does not recognize** (verified: a request to the run.app URL with `Host: fractalgoals.com` 404s at Cloud Run's edge, *before* Nginx). Cloud Run only routes Hosts equal to the `*.run.app` URL or a registered domain mapping.
- Backend CORS (in [`cloudbuild.yaml`](cloudbuild.yaml)) currently allows `https://my.fractalgoals.com` and the run.app frontend, but **not** the apex/www. `LANDING_CACHE_WARM_URL` already points at `https://www.fractalgoals.com/api/public/landing-examples`.

### Chosen approach (from your answers)

- **Routing:** Cloudflare proxy → Run URL (orange cloud), **not** a GCP apex domain mapping.
- **Canonical:** `fractalgoals.com` is canonical; `www` 301-redirects to the apex.

Because of the Cloud Run "unknown Host = 404" behavior, the Cloudflare-proxy approach **requires a Host Header rewrite** so Cloudflare forwards the request to Cloud Run with `Host: fractal-frontend-195572181270.us-east1.run.app`. Without this rewrite, the apex would 404. This is the one subtlety that makes or breaks the migration.

---

## Database grade

**Not applicable — graded N/A (no database changes).**

This migration touches **DNS, Cloudflare routing, and one Cloud Run env var only**. No schema, model, migration, or query is involved, so there is nothing in the database to grade against this plan. (Recording this explicitly per CLAUDE.md, which asks for a DB grade on every plan.)

The path to an **S+ outcome** for *this* task is therefore measured on infrastructure quality, not DB quality:
- apex resolves and serves the landing page over valid TLS;
- `www` cleanly 301s to apex (single canonical URL, clean SEO);
- the landing-examples API and beta-signup POST work same-origin from the apex (no CORS breakage);
- no regression to `my.` (the live authenticated app);
- changes are reversible and documented.

---

## Plan

> **Revision (Cloudflare plan limitation):** Cloudflare's Host Header Override
> (Origin Rules) is **Enterprise-only**, so we cannot rewrite the Host at
> Cloudflare's edge. Verified facts that drive the revised approach:
> - The `fractal-frontend` Cloud Run service only routes Hosts that have a
>   **domain mapping** — even `my.fractalgoals.com` 404s when sent to the raw
>   run.app URL; it works because it has a managed domain mapping.
> - `my.fractalgoals.com` is a **managed domain mapping in `us-east1`** on
>   `fractal-frontend` → mappings work in this region (proven by the live app).
> - `fractalgoals.com` is **already a verified domain** in the Google account
>   (`gcloud domains list-user-verified`), so the apex mapping needs no extra
>   verification.
>
> Revised approach: create Cloud Run **domain mappings** for the apex and www
> (same mechanism as `my.`), then add the DNS records GCP returns into
> Cloudflare as **DNS-only (grey-cloud)**. No Enterprise feature, no Host
> rewrite, no Worker.

### Step 1 — Create Cloud Run domain mappings for apex + www

**DONE** — both mappings created on `fractal-frontend` / `us-east1`. The DNS
records GCP returned (paste into Cloudflare, Step 2):

Apex `fractalgoals.com` — **A**: `216.239.32.21`, `216.239.34.21`,
`216.239.36.21`, `216.239.38.21`; **AAAA**: `2001:4860:4802:32::15`,
`2001:4860:4802:34::15`, `2001:4860:4802:36::15`, `2001:4860:4802:38::15`.

`www` — **CNAME** → `ghs.googlehosted.com`.

Commands used (for reference / rollback context):

Managed Cloud Run domain mappings require the `beta` gcloud component (already
installed). Create both mappings on the `fractal-frontend` service in
`us-east1`:

```bash
gcloud beta run domain-mappings create \
  --service=fractal-frontend --platform=managed --region=us-east1 \
  --domain=fractalgoals.com

gcloud beta run domain-mappings create \
  --service=fractal-frontend --platform=managed --region=us-east1 \
  --domain=www.fractalgoals.com
```

Then read back the DNS records each mapping wants (apex returns **A/AAAA**,
www returns a **CNAME** to `ghs.googlehosted.com.`):

```bash
gcloud beta run domain-mappings describe --domain=fractalgoals.com \
  --platform=managed --region=us-east1 \
  --format='value(status.resourceRecords)'

gcloud beta run domain-mappings describe --domain=www.fractalgoals.com \
  --platform=managed --region=us-east1 \
  --format='value(status.resourceRecords)'
```

### Step 2 — Add the returned records into Cloudflare (DNS-only / grey)

In Cloudflare → **DNS → Records**, add exactly what Step 1 returned:

- **Apex (`@`)**: the four **A** records and (if returned) **AAAA** records GCP
  lists for `fractalgoals.com`. Proxy status: **DNS-only (grey cloud)**.
- **`www`**: a **CNAME** → `ghs.googlehosted.com`. Proxy status: **Proxied (orange cloud)** — needed so the www→apex Redirect Rule (Step 4) fires. With www proxied, its TLS is served by Cloudflare's Universal SSL edge cert; the Cloud Run www-mapping cert may stay pending, which is fine since the redirect means no real traffic is served from that mapping.
- Leave the existing `my` record untouched.

DNS-only means Cloudflare resolves straight to Google and Google serves its own
managed cert — no Cloudflare SSL-mode interplay to get wrong. (You lose
Cloudflare CDN/WAF on these hosts, which is fine for a static landing page +
same-origin API proxy.)

### Step 3 — Wait for Google-managed TLS certs to provision

After the records resolve, Cloud Run auto-provisions managed certs for both
domains. This typically takes 15 min–~24 h. Check status:

```bash
gcloud beta run domain-mappings describe --domain=fractalgoals.com \
  --platform=managed --region=us-east1 \
  --format='value(status.conditions)'
```

Wait until the `CertificateProvisioned` / `Ready` conditions are `True` before
relying on HTTPS.

### Step 4 — Cloudflare: www → apex 301 redirect

`www` will have its own working mapping, but we want a single canonical URL.
In Cloudflare → **Rules → Redirect Rules** (available on the free plan), add:

- **When:** `Hostname equals www.fractalgoals.com`
- **Then:** Dynamic redirect → `concat("https://fractalgoals.com", http.request.uri.path)`, status **301**, preserve query string.

A redirect rule on a DNS-only (grey) record is still evaluated by Cloudflare
because the request hits Cloudflare's resolver first only for DNS — **note:**
redirect rules require the hostname to be **proxied (orange)** to run at the
edge. Since www is DNS-only here, the redirect will not fire at Cloudflare.
Two clean options:
- **(a)** Proxy *only* the `www` CNAME (orange) so the redirect rule runs, while
  keeping the apex DNS-only. SSL/TLS mode must be **Full (strict)**.
- **(b)** Skip the Cloudflare redirect and let `www` serve the landing page
  directly via its own mapping (both hosts serve identically). Simpler, but two
  canonical URLs.

Recommended: **(a)** — proxy www, keep the 301 to apex, so `fractalgoals.com`
stays the single canonical URL.

### Step 5 — Backend CORS: allow the apex + www origins

The only code/config change. In [`cloudbuild.yaml`](cloudbuild.yaml), the `Deploy Backend` step's `CORS_ORIGINS` currently is:

```
CORS_ORIGINS=https://my.fractalgoals.com;https://fractal-frontend-195572181270.us-east1.run.app
```

Add the apex and www origins:

```
CORS_ORIGINS=https://my.fractalgoals.com;https://fractalgoals.com;https://www.fractalgoals.com;https://fractal-frontend-195572181270.us-east1.run.app
```

Notes:
- The public landing API (`/api/public/landing-examples`) and beta-signup POST (`/api/public/beta-signups`) are reached **same-origin** through the frontend Nginx `/api/` proxy, so in the normal path CORS is not even exercised for the landing page. Adding these origins is correct hardening and covers any direct cross-origin call.
- `LANDING_CACHE_WARM_URL` is already `https://www.fractalgoals.com/...`. Since `www` will now 301 to apex, the warm call may follow a redirect. **Optional:** retarget it to `https://fractalgoals.com/api/public/landing-examples` so the publish cache-warm hits the canonical host directly without a redirect hop. (Low priority; warm is best-effort and never blocks publish.)
- This requires a redeploy of the backend (next Cloud Build run) to take effect. No frontend rebuild is required — the frontend image already contains the marketing-host logic.

### Step 6 — (Optional, recommended) Update index.md note

After verification, the `index.md` line describing routing is already accurate (it states the root serves the landing page on apex/www). No change needed unless the canonical/redirect detail is worth recording. Skip unless you want it documented.

---

## Verification (end-to-end, after DNS propagates)

Run from the local shell:

```bash
# 1. DNS resolves and is proxied through Cloudflare (expect Cloudflare IPs)
dig +short fractalgoals.com
dig +short www.fractalgoals.com

# 2. Apex serves the landing page (expect HTTP 200, Nginx security headers present)
curl -sS -D - -o /dev/null https://fractalgoals.com/

# 3. www 301-redirects to apex
curl -sS -o /dev/null -w "%{http_code} -> %{redirect_url}\n" https://www.fractalgoals.com/

# 4. Landing-examples API works same-origin on apex (expect 200 JSON)
curl -sS -o /dev/null -w "%{http_code}\n" https://fractalgoals.com/api/public/landing-examples

# 5. No regression: authenticated app still 200 on my.
curl -sS -o /dev/null -w "%{http_code}\n" https://my.fractalgoals.com/
```

Browser checks:
- Open `https://fractalgoals.com/` → landing page renders, hero/examples/features/beta sections present, valid padlock (TLS).
- Submit the beta-signup email form on the landing page → succeeds (confirms `/api/public/beta-signups` POST through the proxy, incl. CSRF/CORS).
- Open `https://my.fractalgoals.com/` → still the authenticated fractal-selection app, login flow intact.
- Confirm `https://www.fractalgoals.com/` lands on the apex URL in the address bar.

## Rollback

Fully reversible with no data impact:
- Delete the apex + www CNAME records (or set proxy to DNS-only) → apex stops resolving, returns to pre-migration state.
- Remove the Host-rewrite Origin Rule and the www redirect rule.
- Revert the `CORS_ORIGINS` change in `cloudbuild.yaml` on the next deploy.
`my.fractalgoals.com` is never modified, so the live app is unaffected throughout.
