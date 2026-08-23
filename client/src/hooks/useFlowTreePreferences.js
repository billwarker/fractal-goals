import { useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'flowtree-view-settings';
const STORAGE_VERSION = 2;
const DEFAULT_VIEW_SETTINGS = Object.freeze({
    fadeInactiveBranches: false,
    hideInactiveGoals: false,
    hideCompletedGoals: false,
    showMetricsOverlay: false,
});

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

function normalizeStoredPreferences(rawValue) {
    if (!rawValue) return null;
    const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
    const storedViewSettings = parsed?.viewSettings || parsed;
    const viewSettings = {};
    Object.keys(DEFAULT_VIEW_SETTINGS).forEach((key) => {
        if (typeof storedViewSettings?.[key] === 'boolean') viewSettings[key] = storedViewSettings[key];
    });

    return {
        goalsViewMode: ['tree', 'hierarchy'].includes(parsed?.goalsViewMode) ? parsed.goalsViewMode : null,
        scopedProgramId: parsed?.scopedProgramId == null ? null : String(parsed.scopedProgramId),
        viewSettings,
    };
}

export function useFlowTreePreferences({ rootId, userId, defaultGoalsViewMode }) {
    const [goalsViewMode, setGoalsViewMode] = useState(defaultGoalsViewMode);
    const [viewSettings, setViewSettings] = useState(DEFAULT_VIEW_SETTINGS);
    const [scopedProgramId, setScopedProgramId] = useState(null);
    const [isHydrated, setIsHydrated] = useState(false);
    const shouldPreservePreferencesRef = useRef(false);
    const storageKey = useMemo(
        () => rootId ? `${STORAGE_KEY}:${userId || 'anonymous'}:${rootId}` : null,
        [rootId, userId]
    );
    const legacyStorageKey = useMemo(() => rootId ? `${STORAGE_KEY}:${rootId}` : null, [rootId]);

    useEffect(() => {
        shouldPreservePreferencesRef.current = false;
        setIsHydrated(false);
        setGoalsViewMode(defaultGoalsViewMode);
        setViewSettings(DEFAULT_VIEW_SETTINGS);
        setScopedProgramId(null);
        if (!storageKey) {
            setIsHydrated(true);
            return;
        }

        try {
            const normalized = normalizeStoredPreferences(
                readLocalStorageValue(storageKey) || readLocalStorageValue(legacyStorageKey)
            );
            if (normalized) {
                shouldPreservePreferencesRef.current = Boolean(
                    normalized.goalsViewMode
                    || normalized.scopedProgramId
                    || Object.keys(normalized.viewSettings).length
                );
                setViewSettings((current) => ({ ...current, ...normalized.viewSettings }));
                if (normalized.goalsViewMode) setGoalsViewMode(normalized.goalsViewMode);
                setScopedProgramId(normalized.scopedProgramId);
            }
        } catch {
            // Ignore stale or malformed preference data.
        } finally {
            setIsHydrated(true);
        }
    }, [defaultGoalsViewMode, legacyStorageKey, storageKey]);

    useEffect(() => {
        if (!storageKey || !isHydrated) return;
        writeLocalStorageValue(storageKey, JSON.stringify({
            version: STORAGE_VERSION,
            goalsViewMode,
            scopedProgramId,
            viewSettings,
        }));
    }, [goalsViewMode, isHydrated, scopedProgramId, storageKey, viewSettings]);

    return {
        goalsViewMode,
        scopedProgramId,
        setGoalsViewMode,
        setScopedProgramId,
        setViewSettings,
        shouldPreservePreferencesRef,
        viewSettings,
    };
}
