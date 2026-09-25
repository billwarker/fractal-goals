# Proxy identity and session revocation runbook

Operational procedures for the trusted-proxy rate-limit identity (`request_identity.py`)
and revocable session tokens (`users.session_version`).

## How client identity works

Browser traffic reaches Flask as: browser → Cloud Run (frontend) → nginx → Cloud Run
(backend) → gunicorn. Without help, every request appears to come from an infrastructure
address, so all users would share one rate-limit bucket.

- nginx sends `X-Fractal-Proxy-Token: $TRUSTED_PROXY_SECRET` on every `/api/` proxy location,
  overwriting any client-supplied value.
- The backend applies `ProxyFix(x_for=TRUSTED_PROXY_HOPS)` **only** when that token matches.
  Direct calls to the public backend URL keep their connection address, so a forged
  `X-Forwarded-For` never chooses a rate-limit bucket.
- Production refuses to start unless `TRUSTED_PROXY_HOPS >= 1` and the secret is at least
  32 characters.

## First deployment

1. Create the secret (once):

   ```bash
   openssl rand -base64 48 | tr -d '\n' | \
     gcloud secrets create TRUSTED_PROXY_SECRET --data-file=-
   gcloud secrets add-iam-policy-binding TRUSTED_PROXY_SECRET \
     --member=serviceAccount:fractal-runtime@fractal-goals.iam.gserviceaccount.com \
     --role=roles/secretmanager.secretAccessor
   ```

2. Deploy through `cloudbuild.yaml`. Both services mount the secret; the backend sets
   `TRUSTED_PROXY_HOPS=3`.
3. Verify the hop count (below).
4. Existing beta sessions predate the session claims, so each tester logs in once more.

## Verify the hop count

The backend access log prints the forwarded chain as `xff="..."`. Make one request from a
known IP address through `https://my.fractalgoals.com`, then read the line:

```bash
gcloud logging read \
  'resource.labels.service_name="fractal-backend" AND textPayload:"xff="' \
  --limit=5 --format='value(textPayload)'
```

Count entries from the **right** of the chain to your own IP address. That position is the
correct `TRUSTED_PROXY_HOPS`. If it differs from the deployed value, update the backend's
`--set-env-vars` in `cloudbuild.yaml` and redeploy.

- A value that is too **low** resolves to an infrastructure address (safe, but users share a
  bucket again).
- A value that is too **high** can select a client-supplied entry. Never round up.

The `http.rate_limited` ops event logs the resolved `remote_addr`. After a correct
deployment it shows client addresses, not `169.254.x.x` or Google front-end addresses.

## Rotate the proxy secret

Both services read `TRUSTED_PROXY_SECRET:latest` at deploy time. Rotating it causes a short
window in which attestation fails and requests fall back to the shared connection bucket.
They are not rejected, so this is safe during low traffic.

```bash
openssl rand -base64 48 | tr -d '\n' | \
  gcloud secrets versions add TRUSTED_PROXY_SECRET --data-file=-
gcloud run services update fractal-backend --region=us-east1 \
  --update-secrets=TRUSTED_PROXY_SECRET=TRUSTED_PROXY_SECRET:latest
gcloud run services update fractal-frontend --region=us-east1 \
  --update-secrets=TRUSTED_PROXY_SECRET=TRUSTED_PROXY_SECRET:latest
```

## Revoke a user's sessions

Every session token carries the user's `session_version`. Incrementing it revokes all of
their outstanding tokens on the next request or refresh.

- **User-initiated:** Settings → Account → **Sign out of all devices**
  (`POST /api/auth/sessions/revoke`).
- **Automatic:** password change (the acting device receives a replacement token), password
  reset, admin temporary password, suspension, and soft delete.
- **Suspected compromise** (operator): suspend and reactivate the account from the admin
  console. Suspension revokes; reactivation does not revive old tokens. Alternatively, issue
  a temporary password, which also forces a password change.

Sessions also expire absolutely `SESSION_MAX_LIFETIME_DAYS` (default 30) after the original
login, whatever the refresh history.

## Rotating `JWT_SECRET_KEY`

Rotation invalidates every session token and every agent internal token at once. Prefer
per-user revocation. Rotate only when the signing key itself may be exposed.
