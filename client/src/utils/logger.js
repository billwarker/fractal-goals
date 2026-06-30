import * as Sentry from '@sentry/react';

/**
 * Centralized frontend logging chokepoint.
 *
 * Replaces scattered `console.error(...)` calls so production log noise is
 * filterable in one place and errors are forwarded to Sentry when a DSN is
 * configured (see main.jsx). In dev, everything still prints to the console
 * exactly as before; in prod, debug/warn output is suppressed while errors
 * are captured by Sentry instead of (or in addition to) the console.
 */

const isDev = Boolean(import.meta.env?.DEV);
const sentryEnabled = Boolean(import.meta.env?.VITE_SENTRY_DSN);

/**
 * Log a handled error. Pass a human message plus the caught error/context.
 * Mirrors the existing `console.error('message:', err)` call shape.
 */
export function logError(message, error, context) {
    if (isDev) {
        if (error !== undefined) {
            console.error(message, error);
        } else {
            console.error(message);
        }
    }

    if (sentryEnabled) {
        const captured = error instanceof Error ? error : new Error(message);
        Sentry.captureException(captured, {
            extra: { message, ...(context || {}), ...(error && !(error instanceof Error) ? { error } : {}) },
        });
    } else if (!isDev) {
        // No Sentry in this environment: keep a console trail so prod errors
        // are not silently swallowed.
        console.error(message, error ?? '');
    }
}

/** Non-error diagnostic. Suppressed in production. */
export function logWarn(message, ...args) {
    if (isDev) {
        console.warn(message, ...args);
    }
}

/** Verbose/dev-only diagnostic. Suppressed in production. */
export function logDebug(message, ...args) {
    if (isDev) {
        console.debug(message, ...args);
    }
}
