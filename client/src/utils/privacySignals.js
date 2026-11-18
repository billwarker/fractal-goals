/**
 * Browser privacy signals the Privacy Policy promises to honour: Global Privacy Control
 * and Do Not Track. Either one turns off every analytics event, signed in or not.
 */
export function browserPrivacySignal(nav = typeof navigator === 'undefined' ? null : navigator) {
    if (!nav) return false;
    const win = typeof window === 'undefined' ? null : window;
    return nav.globalPrivacyControl === true || nav.doNotTrack === '1' || win?.doNotTrack === '1';
}

/** `?telemetry_debug=1` logs each event and what the server kept, to check instrumentation. */
export function telemetryDebugEnabled() {
    if (typeof window === 'undefined') return false;
    try {
        return new URLSearchParams(window.location.search).get('telemetry_debug') === '1';
    } catch {
        return false;
    }
}
