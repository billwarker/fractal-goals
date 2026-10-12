import { useEffect, useState } from 'react';

import { getIsMobileViewport } from './useIsMobile';

const readStoredBoolean = (key, fallback) => {
    try {
        const stored = window.localStorage.getItem(key);
        return stored == null ? fallback : stored === 'true';
    } catch {
        return fallback;
    }
};

const readInitialOpen = (key, defaultOpen) => (
    getIsMobileViewport() ? false : readStoredBoolean(key, defaultOpen)
);

/**
 * Open state for a page's desktop side pane, remembered per storage key.
 * Mobile viewports start closed and close the pane when the layout becomes
 * mobile (or `resetKey` changes there); changing the key reloads its preference.
 */
export default function usePersistedPaneOpen(storageKey, { defaultOpen = true, isMobile = false, resetKey } = {}) {
    const [open, setOpen] = useState(() => readInitialOpen(storageKey, defaultOpen));

    useEffect(() => {
        setOpen(readInitialOpen(storageKey, defaultOpen));
    }, [defaultOpen, storageKey]);

    useEffect(() => {
        if (isMobile) setOpen(false);
    }, [isMobile, resetKey]);

    useEffect(() => {
        try {
            window.localStorage.setItem(storageKey, String(open));
        } catch {
            // Storage can be unavailable (private mode, blocked site data); the pane still works.
        }
    }, [open, storageKey]);

    return [open, setOpen];
}
