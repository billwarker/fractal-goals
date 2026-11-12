// The live demo runs the real app read-only against the published examples
// (server boundary: blueprints/demo_access.py). This module is the client half:
// a process-wide switch DemoRoot turns on before rendering, and the guard the
// API layer applies so no write ever leaves the browser.

export const DEMO_BASE_PATH = '/demo';
export const DEMO_WRITE_BLOCKED_EVENT = 'demo:write_blocked';
// A blocked write usually trips its caller's own error toast too; those are muted this long.
const BLOCKED_TOAST_QUIET_MS = 2000;

let demoMode = false;
let lastBlockedAt = 0;

export const isDemoMode = () => demoMode;

export function setDemoMode(enabled) {
    demoMode = Boolean(enabled);
}

export class DemoReadOnlyError extends Error {
    constructor() {
        super('The demo is read-only');
        this.name = 'DemoReadOnlyError';
        this.isDemoReadOnly = true;
    }
}

export const isDemoReadOnlyError = (error) => Boolean(error?.isDemoReadOnly);

const READ_METHODS = new Set(['get', 'head', 'options']);

/** Writes are refused before sending; public endpoints (waitlist, demo session) stay open. */
export function shouldBlockDemoRequest(config) {
    if (!demoMode) return false;
    const method = String(config?.method || 'get').toLowerCase();
    if (READ_METHODS.has(method)) return false;
    return !String(config?.url || '').includes('/public/');
}

export function reportBlockedDemoWrite(config) {
    lastBlockedAt = Date.now();
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(DEMO_WRITE_BLOCKED_EVENT, {
            detail: { method: config?.method, url: config?.url },
        }));
    }
}

export const isQuietAfterBlockedWrite = (now = Date.now()) => demoMode && now - lastBlockedAt < BLOCKED_TOAST_QUIET_MS;

export function isDemoLocation(pathname = (typeof window === 'undefined' ? '' : window.location.pathname)) {
    return pathname === DEMO_BASE_PATH || pathname.startsWith(`${DEMO_BASE_PATH}/`);
}
