export async function initializeMonitoring(dsn) {
    if (!dsn) return;
    const Sentry = await import('@sentry/react');
    Sentry.init({
        dsn,
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
