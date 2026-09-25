/**
 * Per-viewer UI preferences in localStorage. Storage can be missing or throw
 * (private windows, blocked site data), so every access is best-effort.
 */
export function readLocalStorageValue(key) {
    try {
        return globalThis.localStorage?.getItem?.(key) ?? null;
    } catch {
        return null;
    }
}

export function writeLocalStorageValue(key, value) {
    try {
        globalThis.localStorage?.setItem?.(key, value);
    } catch {
        // Optional preferences should not interrupt rendering in restricted storage contexts.
    }
}

export function removeLocalStorageValue(key) {
    try {
        globalThis.localStorage?.removeItem?.(key);
    } catch {
        // Optional preferences should not interrupt rendering in restricted storage contexts.
    }
}
