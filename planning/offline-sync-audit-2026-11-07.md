# Offline Sync Audit: November 7, 2026

**Why:** recurring sync errors during production sessions.

**Grade before fixes: B-.** The design in ADR 0004 is sound, but the implementation had several ways to turn a brief problem into a visible error or a lost change.

**Evidence limit:** findings come from reading the code plus one local limiter experiment. Production logs and telemetry were not reviewed, so this audit does not establish which finding causes which production error. The new `offline_detected` event and the existing `offline_op_rejected` and `offline_sync_drained` events can answer that once deployed.

## Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| S1 | Critical | The queue lock was held across network calls, so a tap could wait for the whole drain before being saved or shown. Closing the app during that wait lost the change | Fixed |
| S2 | Critical | Eight answered failures rejected a change in about 61–123 s, shorter than the 120 s stale-claim window. Later changes still synced, out of order | Fixed |
| S3 | Critical | Clock correction ran on every send, so a retry could hit 422 `idempotency_key_mismatch`, even if the first attempt had applied | Fixed |
| S4 | High | A 403 from `/auth/refresh` or a CSRF failure permanently rejected the op | Fixed |
| S5 | High | Any timed-out request marked the whole app offline | Fixed |
| S6 | High | Each online save invalidated about 12 query roots. Default limits of 500/hour and 2,000/day per route and IP also applied to GET routes | Fixed; production impact unconfirmed |
| S7 | Medium | A repeated pause or resume returned 400 and was rejected | Fixed |
| S8 | Medium | One toast per rejected op, and Review showed "Change" for many kinds | Fixed |
| S9 | Medium | `whenDrained` had no timeout when adding a circuit | Fixed |
| S10 | Low | A failure storing the response leaves a stale claim, so a successful change can re-run after 2 minutes | Accepted: needs a schema change. S7 and create replays reduce the impact |
| S11 | Low | ADR 0004 stated both 24 h and 7 days for the action-time limit | Fixed |

## Experiment behind S6

With Flask-Limiter 3.8.0, a default limit of 2/hour and a blueprint limit of 180/minute restricted to write methods: the third GET to a route returned 429, a second route had its own bucket, and POSTs were unaffected. So blueprint write limits do not replace the defaults for GETs.

## Decisions for the owner

- **`--min-instances 1`:** production runs one worker with 4 threads, `max-instances 1`, and no `min-instances` in `cloudbuild.yaml`. A minimum instance would remove cold starts during sessions, at added Cloud Run cost.
- **Production check after deploy:** aggregate `offline_op_rejected` by code, `offline_detected` by reason, and 429s in Cloud Run logs.
