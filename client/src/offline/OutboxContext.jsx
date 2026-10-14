import React, { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../contexts/AuthContext';
import { API_BASE, axios } from '../utils/api/core';
import { trackEvent } from '../utils/telemetry';
import { checkConnectivity, isOnline, subscribeConnectivity } from './connectivity';
import { createIndexedDbStore } from './indexedDbStore';
import { OP_STATE, createOutbox } from './outbox';
import { restoreQueryCache, startQueryPersistence } from './queryPersistence';
import AppUpdatePrompt from './AppUpdatePrompt';
import { registerAppServiceWorker } from './serviceWorker';
import { registerSessionOpHandlers } from './sessionOpHandlers';
import { saveUserSnapshot } from './userSnapshot';

// Dead connections should be noticed quickly; the op stays queued, so a short
// timeout costs nothing but a retry.
const OUTBOX_REQUEST_TIMEOUT_MS = 8000;

export const OutboxContext = createContext(null);

export function sendOutboxOp(op) {
    return axios.request({
        method: op.method,
        url: `${API_BASE}${op.url}`,
        data: op.body ?? undefined,
        headers: { 'Idempotency-Key': op.idempotencyKey },
        timeout: OUTBOX_REQUEST_TIMEOUT_MS,
    });
}

function createUserOutbox(userId) {
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`fractal-outbox:${userId}`);
    return createOutbox({
        store: createIndexedDbStore(userId),
        send: sendOutboxOp,
        isOnline,
        channel,
        onEvent: (type, props) => trackEvent(
            type === 'drained' ? 'offline_sync_drained' : 'offline_op_rejected',
            { props },
        ),
    });
}

export function OutboxProvider({ children }) {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const userId = user?.id || null;

    const outbox = useMemo(() => (userId ? createUserOutbox(userId) : null), [userId]);

    // Restoring the persisted cache is what lets an open session render with no signal.
    useEffect(() => {
        if (!userId) return undefined;
        void restoreQueryCache(queryClient, userId);
        return startQueryPersistence(queryClient, userId);
    }, [queryClient, userId]);

    useEffect(() => {
        if (user) void saveUserSnapshot(user);
    }, [user]);

    useEffect(() => {
        if (userId && import.meta.env.PROD) registerAppServiceWorker();
    }, [userId]);

    useEffect(() => {
        if (!outbox) return undefined;
        const unregisterHandlers = registerSessionOpHandlers(outbox, queryClient);
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
    }, [outbox, queryClient]);

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

/** Logout that warns when changes are still waiting to sync from this device. */
export function useGuardedLogout() {
    const { logout } = useAuth();
    const confirmUnsynced = useConfirmUnsyncedChanges();
    return useCallback(() => (confirmUnsynced() ? logout() : undefined), [confirmUnsynced, logout]);
}
