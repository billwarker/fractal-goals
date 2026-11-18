/**
 * Anonymous public-site events: the landing page, the live demo and the waitlist.
 *
 * No account, cookie or device storage is involved; the server counts unique visitors with
 * a hash it rotates daily (services/web_telemetry_service.py). Global Privacy Control and
 * Do Not Track turn it off. Events are batched briefly and sent with `keepalive` when the
 * page goes away, since a demo link navigates off the landing page right after its click.
 */
import { publicApi } from './api/publicApi';
import { browserPrivacySignal, telemetryDebugEnabled } from './privacySignals';
import { attributionContext } from './visitAttribution';

const FLUSH_DELAY_MS = 1000;
const MAX_BATCH_SIZE = 10;

let queue = [];
let timer = null;
let listenerBound = false;

function flushPublicEvents({ keepalive = false } = {}) {
    clearTimeout(timer);
    timer = null;
    if (queue.length === 0) return Promise.resolve();
    const events = queue.splice(0, MAX_BATCH_SIZE);
    const context = { path: window.location.pathname, ...attributionContext() };
    return publicApi.recordPublicEvents({ events, context }, { keepalive })
        .then((response) => {
            if (telemetryDebugEnabled()) console.info('[telemetry] public', events, 'server kept', response?.data);
        })
        .catch(() => {
            // Fire-and-forget: telemetry never affects the page.
        });
}

export function trackPublicEvent(name, props = null) {
    if (typeof window === 'undefined' || browserPrivacySignal()) return;
    if (!listenerBound) {
        listenerBound = true;
        window.addEventListener('pagehide', () => flushPublicEvents({ keepalive: true }));
    }
    queue.push(props ? { name, props } : { name });
    if (queue.length >= MAX_BATCH_SIZE) flushPublicEvents();
    else if (!timer) timer = setTimeout(flushPublicEvents, FLUSH_DELAY_MS);
}

export const __publicTelemetryTestHooks = {
    flush: flushPublicEvents,
    getQueue: () => queue,
    reset: () => {
        queue = [];
        clearTimeout(timer);
        timer = null;
    },
};
