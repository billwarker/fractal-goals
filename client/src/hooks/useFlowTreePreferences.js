import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '../contexts/AuthContext';
import { isDemoMode } from '../demo/demoMode';
import { authApi } from '../utils/api';
import {
    readLocalStorageValue,
    removeLocalStorageValue,
    writeLocalStorageValue,
} from '../utils/localPreferences';

const STORAGE_KEY = 'flowtree-view-settings';
const STORAGE_VERSION = 2;
const ACCOUNT_SAVE_DELAY_MS = 1000;
const DEFAULT_VIEW_SETTINGS = Object.freeze({
    fadeInactiveBranches: false,
    hideInactiveGoals: false,
    hideCompletedGoals: false,
    showMetricsOverlay: false,
});

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

// The account copy (user.preferences.flowtree_views[rootId]) carries the filters, not the
// tree/hierarchy toggle, which stays per device. A published demo opens on its owner's copy.
function toAccountView(viewSettings, scopedProgramId) {
    return {
        ...(scopedProgramId ? { scopedProgramId: String(scopedProgramId) } : {}),
        viewSettings: { ...DEFAULT_VIEW_SETTINGS, ...viewSettings },
    };
}

function sameAccountView(left, right) {
    const normalized = normalizeStoredPreferences(right);
    if (!normalized) return false;
    return JSON.stringify(left) === JSON.stringify(toAccountView(normalized.viewSettings, normalized.scopedProgramId));
}

/**
 * The account's copy of one fractal's view and a saver for it, for useFlowTreePreferences.
 * Synced so a published demo opens with these filters; the demo's guest has no account to save to.
 */
export function useAccountFlowTreeView(rootId) {
    const { user, setUser } = useAuth();
    const accountUserId = user && !user.isDemo ? user.id : null;
    const saveAccountView = useCallback((viewRootId, view) => {
        if (!accountUserId) return;
        authApi.updatePreferences({ preferences: { flowtree_views: { [viewRootId]: view } } })
            .then((response) => {
                if (response?.data?.id === accountUserId) setUser?.(response.data);
            })
            .catch(() => {
                // This device keeps the view; the account catches up on the next change.
            });
    }, [accountUserId, setUser]);
    return { accountView: user?.preferences?.flowtree_views?.[rootId] || null, saveAccountView };
}

/**
 * Goals page view preferences for one fractal. This device's copy wins; without one, the
 * account's copy (`accountView`) seeds it. `saveAccountView` receives filter changes.
 * The demo keeps no device copy: every visit opens on the published view, which a copy
 * left by an earlier visit (same guest id, same snapshot root ids) would otherwise override.
 */
export function useFlowTreePreferences({
    rootId,
    userId,
    defaultGoalsViewMode,
    accountView = null,
    saveAccountView = null,
}) {
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
    // Read when a fractal hydrates, so a saved copy coming back doesn't reset the view.
    const accountViewRef = useRef(accountView);
    useEffect(() => {
        accountViewRef.current = accountView;
    }, [accountView]);

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
            const keepsDeviceCopy = !isDemoMode();
            // Clears what demo visits wrote before they stopped keeping a copy.
            if (!keepsDeviceCopy) removeLocalStorageValue(storageKey);
            const normalized = normalizeStoredPreferences(
                (keepsDeviceCopy && (readLocalStorageValue(storageKey) || readLocalStorageValue(legacyStorageKey)))
                || accountViewRef.current
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
        if (!storageKey || !isHydrated || isDemoMode()) return;
        writeLocalStorageValue(storageKey, JSON.stringify({
            version: STORAGE_VERSION,
            goalsViewMode,
            scopedProgramId,
            viewSettings,
        }));
    }, [goalsViewMode, isHydrated, scopedProgramId, storageKey, viewSettings]);

    useEffect(() => {
        if (!rootId || !isHydrated || !saveAccountView) return undefined;
        const view = toAccountView(viewSettings, scopedProgramId);
        if (sameAccountView(view, accountViewRef.current)) return undefined;
        const timer = setTimeout(() => {
            accountViewRef.current = view;
            saveAccountView(rootId, view);
        }, ACCOUNT_SAVE_DELAY_MS);
        return () => clearTimeout(timer);
    }, [isHydrated, rootId, saveAccountView, scopedProgramId, viewSettings]);

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
