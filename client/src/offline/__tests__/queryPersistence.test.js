import { QueryClient, dehydrate } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { kv } = vi.hoisted(() => ({ kv: new Map() }));
vi.mock('../idbKeyValue', () => ({
    idbGet: async (key) => kv.get(key),
    idbSet: async (key, value) => {
        kv.set(key, value);
    },
    idbDelete: async (key) => {
        kv.delete(key);
    },
}));

import { CACHE_VERSION, restoreQueryCache, shouldPersistQuery, startQueryPersistence } from '../queryPersistence';

const sessionKey = ['session', 'root-1', 'session-1'];

describe('query persistence', () => {
    beforeEach(() => {
        kv.clear();
        vi.useRealTimers();
    });

    it('persists only the queries an open session needs', () => {
        const queryClient = new QueryClient();
        queryClient.setQueryData(sessionKey, { id: 'session-1' });
        queryClient.setQueryData(['analytics-summary', 'root-1'], { big: true });
        const persisted = dehydrate(queryClient, { shouldDehydrateQuery: shouldPersistQuery })
            .queries.map((query) => query.queryKey[0]);
        expect(persisted).toEqual(['session']);
    });

    it('persists the offline tag catalog and excludes cloud credentials', () => {
        const queryClient = new QueryClient();
        queryClient.setQueryData(['activity-tag-catalog', 'root-1'], { tags: [{ id: 'tag' }] });
        queryClient.setQueryData(['storageConnections', 'user-1'], { access_token: 'must-not-persist' });
        const persisted = dehydrate(queryClient, { shouldDehydrateQuery: shouldPersistQuery });
        expect(persisted.queries.map((query) => query.queryKey[0])).toEqual(['activity-tag-catalog']);
        expect(JSON.stringify(persisted)).not.toContain('must-not-persist');
    });

    it('round-trips session data for the same user', async () => {
        vi.useFakeTimers();
        const source = new QueryClient();
        const stop = startQueryPersistence(source, 'user-1');
        source.setQueryData(sessionKey, { id: 'session-1', name: 'Push day' });
        await vi.advanceTimersByTimeAsync(1100);
        stop();

        const target = new QueryClient();
        await expect(restoreQueryCache(target, 'user-1')).resolves.toBe(true);
        expect(target.getQueryData(sessionKey)).toEqual({ id: 'session-1', name: 'Push day' });
        await expect(restoreQueryCache(new QueryClient(), 'user-2')).resolves.toBe(false);
    });

    it('shows the restored copy but refetches it, keeping newer data as it is', async () => {
        const source = new QueryClient();
        source.setQueryData(sessionKey, { id: 'session-1', name: 'Before the save' });
        source.setQueryData(['session-notes', 'root-1', 'session-1'], []);
        kv.set('query-cache:user-1', { buster: CACHE_VERSION, timestamp: Date.now(), state: dehydrate(source) });

        const target = new QueryClient();
        target.setQueryData(['session-notes', 'root-1', 'session-1'], [{ id: 'newer' }], { updatedAt: Date.now() + 1000 });
        await expect(restoreQueryCache(target, 'user-1')).resolves.toBe(true);

        const cache = target.getQueryCache();
        expect(target.getQueryData(sessionKey)).toEqual({ id: 'session-1', name: 'Before the save' });
        expect(cache.find({ queryKey: sessionKey, exact: true }).state.isInvalidated).toBe(true);
        const notes = cache.find({ queryKey: ['session-notes', 'root-1', 'session-1'], exact: true });
        expect(notes.state.data).toEqual([{ id: 'newer' }]);
        expect(notes.state.isInvalidated).toBe(false);
    });

    it('writes the pending copy when the page is unloaded', async () => {
        vi.useFakeTimers();
        const source = new QueryClient();
        const stop = startQueryPersistence(source, 'user-1');
        source.setQueryData(sessionKey, { id: 'session-1', name: 'Saved just now' });
        window.dispatchEvent(new Event('pagehide'));
        await vi.advanceTimersByTimeAsync(0);
        expect(kv.get('query-cache:user-1').state.queries[0].state.data.name).toBe('Saved just now');
        stop();
    });

    it('discards a persisted copy older than two days', async () => {
        const source = new QueryClient();
        source.setQueryData(sessionKey, { id: 'session-1' });
        kv.set('query-cache:user-1', {
            buster: 'v1',
            timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000,
            state: dehydrate(source),
        });

        const target = new QueryClient();
        await expect(restoreQueryCache(target, 'user-1')).resolves.toBe(false);
        expect(target.getQueryData(sessionKey)).toBeUndefined();
        expect(kv.has('query-cache:user-1')).toBe(false);
    });
});
