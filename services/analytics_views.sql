-- BigQuery views over the analytics export, applied by the export job after each
-- successful run (services/analytics_export_service.py). `{dataset}` is replaced with the
-- dataset reference, and each statement ends with a semicolon at the end of its line.
-- Definitions match the Admin overview (services/growth_metrics_service.py).

-- Dedupe views: a rare post-load, pre-watermark crash can load one batch twice.
CREATE OR REPLACE VIEW `{dataset}.product_events_deduped` AS
SELECT * EXCEPT(row_number)
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY created_at DESC) AS row_number
  FROM `{dataset}.product_events`
)
WHERE row_number = 1;

CREATE OR REPLACE VIEW `{dataset}.event_logs_deduped` AS
SELECT * EXCEPT(row_number)
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY timestamp DESC) AS row_number
  FROM `{dataset}.event_logs`
)
WHERE row_number = 1;

CREATE OR REPLACE VIEW `{dataset}.email_delivery_events_deduped` AS
SELECT * EXCEPT(row_number)
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY created_at DESC) AS row_number
  FROM `{dataset}.email_delivery_events`
)
WHERE row_number = 1;

CREATE OR REPLACE VIEW `{dataset}.email_webhook_events_deduped` AS
SELECT * EXCEPT(row_number)
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY created_at DESC) AS row_number
  FROM `{dataset}.email_webhook_events`
)
WHERE row_number = 1;

-- Weekly Active Practitioners: accounts completing at least one session in an ISO week.
-- Session completion is the `session.completed` event; demo and admin accounts excluded.
CREATE OR REPLACE VIEW `{dataset}.wap_weekly` AS
SELECT DATE_TRUNC(DATE(e.timestamp), ISOWEEK) AS week_start,
       COUNT(DISTINCT e.owner_user_id) AS practitioners
FROM `{dataset}.event_logs_deduped` e
JOIN `{dataset}.users` u ON u.id = e.owner_user_id
WHERE e.event_type = 'session.completed' AND u.role NOT IN ('demo', 'admin')
GROUP BY week_start;

-- Public-site visitors and funnel steps per day (visitors are counted per day).
CREATE OR REPLACE VIEW `{dataset}.public_funnel_daily` AS
SELECT DATE(created_at) AS day,
       COUNT(DISTINCT visitor_day_hash) AS visitors,
       COUNT(DISTINCT IF(event_name = 'demo_started', visitor_day_hash, NULL)) AS demo_visitors,
       COUNT(DISTINCT IF(event_name = 'demo_tour_completed', visitor_day_hash, NULL)) AS tour_completers,
       COUNT(DISTINCT IF(event_name = 'waitlist_submitted', visitor_day_hash, NULL)) AS waitlist_submitters
FROM `{dataset}.web_events`
GROUP BY day;

-- Sign-ups by acquisition source and week, with how many practised in their first 7 days.
CREATE OR REPLACE VIEW `{dataset}.signups_by_source` AS
SELECT DATE_TRUNC(DATE(u.created_at), ISOWEEK) AS signup_week,
       COALESCE(u.acquisition_source, 'unknown') AS source,
       COUNT(DISTINCT u.id) AS signups,
       COUNT(DISTINCT IF(e.timestamp < TIMESTAMP_ADD(u.created_at, INTERVAL 7 DAY), u.id, NULL)) AS activated
FROM `{dataset}.users` u
LEFT JOIN `{dataset}.event_logs_deduped` e
  ON e.owner_user_id = u.id AND e.event_type = 'session.completed'
WHERE u.role NOT IN ('demo', 'admin')
GROUP BY signup_week, source;

-- Weekly retention by sign-up cohort: practising weeks since sign-up.
CREATE OR REPLACE VIEW `{dataset}.retention_weekly` AS
SELECT DATE_TRUNC(DATE(u.created_at), ISOWEEK) AS cohort_week,
       DATE_DIFF(DATE_TRUNC(DATE(e.timestamp), ISOWEEK), DATE_TRUNC(DATE(u.created_at), ISOWEEK), WEEK) AS weeks_since_signup,
       COUNT(DISTINCT u.id) AS practitioners
FROM `{dataset}.users` u
JOIN `{dataset}.event_logs_deduped` e
  ON e.owner_user_id = u.id AND e.event_type = 'session.completed'
WHERE u.role NOT IN ('demo', 'admin')
GROUP BY cohort_week, weeks_since_signup;
