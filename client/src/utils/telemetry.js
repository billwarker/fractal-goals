/**
 * First-party product telemetry client.
 *
 * Queues curated usage events (page views + non-route UI surfaces) and flushes
 * them in batches through the normal authenticated API client, so CSRF and
 * auth handling stay in one place. Telemetry is enabled only while a user is
 * authenticated and hasn't turned it off in Settings, honors Global Privacy
 * Control and Do Not Track, and drops events on any failure — telemetry must
 * never affect app behavior. services/tracking_plan.json lists every event and
 * property the server keeps; utils/__tests__/trackingPlan.test.js checks call sites.
 */
import { telemetryApi } from './api';
import { logDebug } from './logger';
import { browserPrivacySignal, telemetryDebugEnabled } from './privacySignals';
import { isOnline } from '../offline/connectivity';

const FLUSH_INTERVAL_MS = 10000;
const MAX_QUEUE_LENGTH = 40;
const MAX_BATCH_SIZE = 20;
// A visit ends after this long without an event; the next event starts a new one.
const VISIT_IDLE_MS = 30 * 60 * 1000;
const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'dev';

const UUID_SEGMENT_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let queue = [];
let enabled = false;
let flushTimer = null;
let listenersBound = false;
let flushInFlight = false;
// Held only in this page's memory (never stored on the device): it groups one visit's events.
let visit = { id: null, lastEventAt: 0 };

const randomId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null);

function currentVisitId(now = Date.now()) {
    if (!visit.id || now - visit.lastEventAt > VISIT_IDLE_MS) visit = { id: randomId(), lastEventAt: now };
    visit.lastEventAt = now;
    return visit.id;
}

function batchContext() {
    const context = { app_version: APP_VERSION };
    if (visit.id) context.visit_id = visit.id;
    return context;
}

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

async function flush({ keepalive = false } = {}) {
    // Keep events while offline; a failed send would drop the batch.
    if (!enabled || flushInFlight || queue.length === 0 || !isOnline()) return;
    const events = queue.splice(0, MAX_BATCH_SIZE);
    flushInFlight = true;
    try {
        const response = await telemetryApi.recordEvents({ events, context: batchContext() }, { keepalive });
        if (telemetryDebugEnabled()) console.info('[telemetry] sent', events, 'server kept', response?.data);
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
    // The page is going away: a keepalive request outlives it, so the last events arrive.
    window.addEventListener('pagehide', () => flush({ keepalive: true }));
}

export function setTelemetryEnabled(nextEnabled) {
    const shouldEnable = Boolean(nextEnabled) && !browserPrivacySignal();
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
    currentVisitId();
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
    getVisitId: () => visit.id,
    currentVisitId,
    reset: () => {
        queue = [];
        enabled = false;
        visit = { id: null, lastEventAt: 0 };
        if (flushTimer) {
            clearInterval(flushTimer);
            flushTimer = null;
        }
    },
};
