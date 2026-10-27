export function privateStorageRecord(record) {
    const data = record?.data || {};
    return [data.url, data['http.url'], record?.description].some(privateStorageUrl);
}

function privateStorageUrl(value) {
    if (typeof value !== 'string') return false;
    try {
        const url = new URL(value.replace(/^(GET|POST|PUT|PATCH|DELETE|HEAD) /, ''), 'https://app.invalid');
        return /\/storage\/|\/media(?:\/|$)/.test(url.pathname)
            || ['googleapis.com', 'google.com', 'dropbox.com', 'dropboxapi.com'].some(
                (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
            )
            || ['access_token', 'oauth_token', 'upload_id'].some((key) => url.searchParams.has(key));
    } catch { return true; }
}

export function scrubStorageTelemetry(event) {
    if (privateStorageUrl(event.request?.url)) return null;
    if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.filter((item) => !privateStorageRecord(item));
    if (event.spans) event.spans = event.spans.filter((item) => !privateStorageRecord(item));
    return event;
}

export async function initializeMonitoring(dsn) {
    if (!dsn) return;
    const Sentry = await import('@sentry/react');
    Sentry.init({
        dsn,
        beforeBreadcrumb: (breadcrumb) => privateStorageRecord(breadcrumb) ? null : breadcrumb,
        beforeSend: scrubStorageTelemetry,
        beforeSendTransaction: scrubStorageTelemetry,
        integrations: [
            Sentry.browserTracingIntegration(),
            // Session replay records the DOM of real sessions. Goals, notes and
            // metrics are personal data, so text and media are masked at the
            // source: what reaches Sentry is layout, not content.
            //
            // Unmasking this would make the Privacy Policy inaccurate. See
            // "What we collect" in client/src/content/legal/privacy.md -- that
            // section must be updated, and the change disclosed to users,
            // before replay is ever allowed to capture content.
            Sentry.replayIntegration({
                maskAllText: true,
                maskAllInputs: true,
                blockAllMedia: true,
            }),
        ],
        // Sampled rather than 1.0: full-rate tracing is both a cost problem and
        // an unnecessary volume of behavioural data to retain.
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
    });
}
