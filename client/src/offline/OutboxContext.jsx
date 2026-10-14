import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../contexts/AuthContext';
import { FEATURE_FLAGS, isFeatureEnabled, useFeatureFlags } from '../hooks/useFeatureFlags';
import AppUpdatePrompt from './AppUpdatePrompt';
import { checkConnectivity, isOnline, subscribeConnectivity } from './connectivity';
import { OP_STATE } from './opKinds';
import { registerAppServiceWorker, unregisterAppServiceWorker } from './serviceWorker';
import { saveUserSnapshot } from './userSnapshot';

export const OutboxContext = createContext(null);

export function OutboxProvider({ children }) {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const userId = user?.id || null;

    // The sync engine loads on demand, so no route's initial bundle carries it. Until it
    // arrives (milliseconds; the service worker precaches it) writes take the direct path.
    const [loaded, setLoaded] = useState({ userId: null, engine: null, outbox: null });
    useEffect(() => {
        if (!userId) return undefined;
        let cancelled = false;
        import('./engine').then((engine) => {
            if (!cancelled) setLoaded({ userId, engine, outbox: engine.createUserOutbox(userId) });
        });
        return () => {
            cancelled = true;
        };
    }, [userId]);
    const engine = loaded.engine;
    const outbox = loaded.userId === userId ? loaded.outbox : null;

    // Restoring the persisted cache is what lets an open session render with no signal.
    useEffect(() => {
        if (!userId || !engine) return undefined;
        void engine.restoreQueryCache(queryClient, userId);
        return engine.startQueryPersistence(queryClient, userId);
    }, [engine, queryClient, userId]);

    useEffect(() => {
        if (user) void saveUserSnapshot(user);
    }, [user]);

    // Kill switch: an admin flag removes the offline shell everywhere without a deploy.
    // Only a successful flag load decides, so failing to load flags offline never unregisters.
    const { flags, isSuccess: flagsLoaded } = useFeatureFlags({ enabled: Boolean(userId) });
    const serviceWorkerDisabled = isFeatureEnabled(flags, FEATURE_FLAGS.offlineServiceWorkerDisabled);
    useEffect(() => {
        if (!userId || !flagsLoaded || !import.meta.env.PROD) return;
        if (serviceWorkerDisabled) void unregisterAppServiceWorker();
        else registerAppServiceWorker();
    }, [flagsLoaded, serviceWorkerDisabled, userId]);

    useEffect(() => {
        if (!outbox || !engine) return undefined;
        const unregisterHandlers = engine.registerSessionOpHandlers(outbox, queryClient);
        const unsubscribe = subscribeConnectivity((online) => {
            if (online) void outbox.flush();
        });
        const handleRefreshed = () => outbox.resumeAfterAuth();
        const handleVisible = () => {
            if (document.visibilityState !== 'visible') return;
            checkConnectivity();
            void outbox.flush();
        };
        window.addEventListener('auth:token_refreshed', handleRefreshed);
        document.addEventListener('visibilitychange', handleVisible);
        void outbox.flush();
        return () => {
            unregisterHandlers();
            unsubscribe();
            window.removeEventListener('auth:token_refreshed', handleRefreshed);
            document.removeEventListener('visibilitychange', handleVisible);
        };
    }, [engine, outbox, queryClient]);

    return (
        <OutboxContext.Provider value={outbox}>
            {children}
            {outbox && <AppUpdatePrompt />}
        </OutboxContext.Provider>
    );
}

/** The signed-in user's outbox, or null when signed out (callers write directly). */
export function useOutbox() {
    return useContext(OutboxContext);
}

const EMPTY_SNAPSHOT = { ops: [], syncing: false, pausedForAuth: false, syncedAt: {} };
const noopSubscribe = () => () => {};

export function useOutboxStatus(scope = null) {
    const outbox = useOutbox();
    const snapshot = useSyncExternalStore(
        outbox ? outbox.subscribe : noopSubscribe,
        outbox ? outbox.getSnapshot : () => EMPTY_SNAPSHOT,
    );
    const online = useSyncExternalStore(subscribeConnectivity, isOnline);

    return useMemo(() => {
        const inScope = scope ? snapshot.ops.filter((op) => op.scope === scope) : snapshot.ops;
        return {
            enabled: Boolean(outbox),
            online,
            pendingCount: inScope.filter((op) => op.state === OP_STATE.PENDING).length,
            rejected: inScope.filter((op) => op.state === OP_STATE.REJECTED),
            syncing: snapshot.syncing,
            pausedForAuth: snapshot.pausedForAuth,
            // Without a scope, the most recent drain of any scope counts.
            lastSyncedAt: scope
                ? snapshot.syncedAt?.[scope] || null
                : Math.max(0, ...Object.values(snapshot.syncedAt || {})) || null,
        };
    }, [online, outbox, scope, snapshot]);
}

/**
 * Asks before an action that ends the session while changes still wait to sync.
 * Returns true when it is safe to continue (nothing pending, or the user agreed).
 */
export function useConfirmUnsyncedChanges() {
    const outbox = useOutbox();
    return useCallback((action = 'Sign out') => {
        const pending = outbox ? outbox.pendingOps().length : 0;
        if (pending === 0) return true;
        return window.confirm(
            `${pending} change${pending === 1 ? " hasn't" : "s haven't"} synced yet. `
            + `They stay on this device and sync the next time you sign in here. ${action} anyway?`,
        );
    }, [outbox]);
}

/**
 * Logout that warns when changes are still waiting to sync. Kept changes sync the next
 * time this user signs in here; on a shared device they can be discarded instead.
 */
export function useGuardedLogout() {
    const { logout } = useAuth();
    const outbox = useOutbox();
    const confirmUnsynced = useConfirmUnsyncedChanges();
    return useCallback(async () => {
        if (!confirmUnsynced()) return undefined;
        if (outbox && outbox.pendingOps().length > 0 && window.confirm(
            'Also discard those changes from this device? Choose Cancel to keep them for your next sign-in here.',
        )) {
            await outbox.clear();
        }
        return logout();
    }, [confirmUnsynced, logout, outbox]);
}
