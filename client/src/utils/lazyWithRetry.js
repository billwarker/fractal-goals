import { lazy } from 'react';

const DYNAMIC_IMPORT_ERROR_PATTERNS = [
    /ChunkLoadError/i,
    /Failed to fetch dynamically imported module/i,
    /Importing a module script failed/i,
    /error loading dynamically imported module/i,
    /Loading chunk [\w-]+ failed/i,
];

const RELOAD_KEY_PREFIX = 'lazy-retry:';

export const pageReloader = {
    reload() {
        window.location.reload();
    },
};

function getErrorText(error) {
    if (!error) {
        return '';
    }

    if (typeof error === 'string') {
        return error;
    }

    return [error.name, error.message, error.toString?.()]
        .filter(Boolean)
        .join(' ');
}

function getSessionStorage() {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        return window.sessionStorage;
    } catch (error) {
        return null;
    }
}

function getReloadStorageKey(key) {
    return `${RELOAD_KEY_PREFIX}${key}`;
}

export function isDynamicImportError(error) {
    const errorText = getErrorText(error);
    return DYNAMIC_IMPORT_ERROR_PATTERNS.some((pattern) => pattern.test(errorText));
}

export async function importWithRetry(importer, key) {
    try {
        const loadedModule = await importer();
        getSessionStorage()?.removeItem(getReloadStorageKey(key));
        return loadedModule;
    } catch (error) {
        if (typeof window === 'undefined' || !isDynamicImportError(error)) {
            throw error;
        }

        const sessionStorage = getSessionStorage();
        const reloadStorageKey = getReloadStorageKey(key);
        const hasRetried = sessionStorage?.getItem(reloadStorageKey) === 'true';

        if (!hasRetried) {
            sessionStorage?.setItem(reloadStorageKey, 'true');
            pageReloader.reload();
            return new Promise(() => {});
        }

        throw error;
    }
}

export function lazyWithRetry(importer, key) {
    return lazy(() => importWithRetry(importer, key));
}
