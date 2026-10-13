import React, { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../contexts/AuthContext';
import { API_BASE, axios } from '../utils/api/core';
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

const OutboxContext = createContext(null);

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
            lastSyncedAt: scope ? snapshot.syncedAt?.[scope] || null : null,
        };
    }, [online, outbox, scope, snapshot]);
}

/** Logout that warns when changes are still waiting to sync from this device. */
export function useGuardedLogout() {
    const outbox = useOutbox();
    const { logout } = useAuth();
    return useCallback(() => {
        const pending = outbox ? outbox.pendingOps().length : 0;
        if (pending > 0) {
            const confirmed = window.confirm(
                `${pending} change${pending === 1 ? " hasn't" : "s haven't"} synced yet. `
                + 'They stay on this device and sync the next time you sign in here. Sign out anyway?',
            );
            if (!confirmed) return undefined;
        }
        return logout();
    }, [logout, outbox]);
}
