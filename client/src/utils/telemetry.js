/**
 * First-party product telemetry client.
 *
 * Queues curated usage events (page views + non-route UI surfaces) and flushes
 * them in batches through the normal authenticated API client, so CSRF and
 * auth handling stay in one place. Telemetry is enabled only while a user is
 * authenticated, honors Do Not Track, and drops events on any failure —
 * telemetry must never affect app behavior.
 */
import { telemetryApi } from './api';
import { logDebug } from './logger';

const FLUSH_INTERVAL_MS = 10000;
const MAX_QUEUE_LENGTH = 40;
const MAX_BATCH_SIZE = 20;

const UUID_SEGMENT_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let queue = [];
let enabled = false;
let flushTimer = null;
let listenersBound = false;
let flushInFlight = false;

const doNotTrackActive = () => {
    if (typeof navigator === 'undefined') return false;
    return navigator.doNotTrack === '1' || (typeof window !== 'undefined' && window.doNotTrack === '1');
};

/**
 * Replace id path segments so stored paths stay low-cardinality:
 * `/8f3c.../session/91ab...` -> `/:rootId/session/:id`.
 */
export const normalizeTelemetryPath = (pathname) => {
    if (!pathname || typeof pathname !== 'string') return null;
    let sawRootId = false;
    return pathname
        .split('/')
        .map((segment) => {
            if (!UUID_SEGMENT_RE.test(segment)) return segment;
            if (!sawRootId) {
                sawRootId = true;
                return ':rootId';
            }
            return ':id';
        })
        .join('/');
};

export const extractRootIdFromPath = (pathname) => {
    if (!pathname || typeof pathname !== 'string') return null;
    const firstSegment = pathname.split('/').filter(Boolean)[0];
    return firstSegment && UUID_SEGMENT_RE.test(firstSegment) ? firstSegment : null;
};

async function flush() {
    if (!enabled || flushInFlight || queue.length === 0) return;
    const events = queue.splice(0, MAX_BATCH_SIZE);
    flushInFlight = true;
    try {
        await telemetryApi.recordEvents({ events });
    } catch (err) {
        // Telemetry is fire-and-forget: drop the batch, never retry-loop.
        logDebug('Telemetry flush dropped:', err?.message);
    } finally {
        flushInFlight = false;
    }
}

function bindLifecycleListeners() {
    if (listenersBound || typeof document === 'undefined') return;
    listenersBound = true;
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            flush();
        }
    });
}

export function setTelemetryEnabled(nextEnabled) {
    const shouldEnable = Boolean(nextEnabled) && !doNotTrackActive();
    if (shouldEnable === enabled) return;
    enabled = shouldEnable;

    if (enabled) {
        bindLifecycleListeners();
        if (!flushTimer) {
            flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
        }
    } else {
        if (flushTimer) {
            clearInterval(flushTimer);
            flushTimer = null;
        }
        queue = [];
    }
}

export function trackEvent(name, { path = null, rootId = null, props = null } = {}) {
    if (!enabled) return;
    if (queue.length >= MAX_QUEUE_LENGTH) {
        queue.shift();
    }
    const event = { name, ts: new Date().toISOString() };
    if (path) event.path = normalizeTelemetryPath(path);
    if (rootId) event.root_id = rootId;
    if (props) event.props = props;
    queue.push(event);
}

export function trackPageView(pathname) {
    trackEvent('page_view', {
        path: pathname,
        rootId: extractRootIdFromPath(pathname),
    });
}

// Exposed for tests.
export const __telemetryTestHooks = {
    flush,
    getQueue: () => queue,
    reset: () => {
        queue = [];
        enabled = false;
        if (flushTimer) {
            clearInterval(flushTimer);
            flushTimer = null;
        }
    },
};
