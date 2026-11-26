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
    idbGetPrefix: async (prefix) => [...kv].filter(([key]) => key.startsWith(prefix)).map(([, value]) => value),
    idbDeletePrefix: async (prefix) => {
        [...kv.keys()].filter((key) => key.startsWith(prefix)).forEach((key) => kv.delete(key));
    },
}));

import {
    CACHE_VERSION, MAX_RECORDS, MAX_RECORD_CHARS, clearPersistedQueryCache, restoreQueryCache, selectRecords,
    shouldPersistQuery, startQueryPersistence,
} from '../queryPersistence';

const persistedNames = () => [...kv.values()].map((record) => record.query?.state.data?.name);
const persist = async (userId, entries) => {
    const source = new QueryClient();
    const stop = startQueryPersistence(source, userId);
    entries.forEach(([key, data]) => source.setQueryData(key, data));
    stop();
    await Promise.resolve();
};

const sessionKey = ['session', 'root-1', 'session-1'];

describe('query persistence', () => {
    beforeEach(() => {
        kv.clear();
        vi.useRealTimers();
    });

    it('persists what can be read offline, and no computed analytics', () => {
        const queryClient = new QueryClient();
        queryClient.setQueryData(sessionKey, { id: 'session-1' });
        queryClient.setQueryData(['analytics-summary', 'root-1'], { big: true });
        queryClient.setQueryData(['fractalTree', 'root-1'], { id: 'root-1' });
        const persisted = dehydrate(queryClient, { shouldDehydrateQuery: shouldPersistQuery })
            .queries.map((query) => query.queryKey[0]);
        expect(persisted).toEqual(['session', 'fractalTree']);
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
        expect(persistedNames()).toEqual(['Saved just now']);
        stop();
    });

    it('discards records older than a month', async () => {
        await persist('user-1', [[sessionKey, { id: 'session-1' }]]);
        const later = Date.now() + 31 * 24 * 60 * 60 * 1000;
        await expect(restoreQueryCache(new QueryClient(), 'user-1', { now: later })).resolves.toBe(false);
        expect(kv.size).toBe(0);
    });

    it('takes over the single copy older builds kept, and drops a stale one', async () => {
        const source = new QueryClient();
        source.setQueryData(sessionKey, { id: 'session-1', name: 'Older build' });
        kv.set('query-cache:user-1', { buster: CACHE_VERSION, timestamp: Date.now(), state: dehydrate(source) });
        kv.set('query-cache:user-2', { buster: 'v0', timestamp: Date.now(), state: dehydrate(source) });
        await restoreQueryCache(new QueryClient(), 'user-1');
        expect(kv.has('query-cache:user-1')).toBe(false);
        // It survives the next start too.
        const again = new QueryClient();
        await restoreQueryCache(again, 'user-1');
        expect(again.getQueryData(sessionKey)).toEqual({ id: 'session-1', name: 'Older build' });
        await expect(restoreQueryCache(new QueryClient(), 'user-2')).resolves.toBe(false);
    });

    it('a new build drops other screens but keeps sessions', async () => {
        await persist('user-1', [[sessionKey, { name: 'Session' }], [['fractalTree', 'root-1'], { name: 'Tree' }]]);
        kv.forEach((record) => {
            if (record.prefix === 'fractalTree') record.version = 'older build';
        });
        await restoreQueryCache(new QueryClient(), 'user-1');
        expect(persistedNames()).toEqual(['Session']);
    });

    it('writes nothing back after signing out', async () => {
        const source = new QueryClient();
        const stop = startQueryPersistence(source, 'user-1');
        source.setQueryData(sessionKey, { name: 'Private' });
        await clearPersistedQueryCache('user-1');
        stop();
        await Promise.resolve();
        expect(kv.size).toBe(0);
    });

    it('keeps what loaded before it started', async () => {
        const source = new QueryClient();
        source.setQueryData(['all-notes', 'root-1'], { name: 'First screen' });
        startQueryPersistence(source, 'user-1')();
        await Promise.resolve();
        expect(persistedNames()).toEqual(['First screen']);
    });

    it('writes each query at once, then at most once a second', async () => {
        vi.useFakeTimers();
        const source = new QueryClient();
        const stop = startQueryPersistence(source, 'user-1');
        source.setQueryData(sessionKey, { name: 'First' });
        await vi.advanceTimersByTimeAsync(0);
        expect(persistedNames()).toEqual(['First']);
        source.setQueryData(sessionKey, { name: 'Second' });
        source.setQueryData(['all-notes', 'root-1'], { name: 'Another' });
        await vi.advanceTimersByTimeAsync(500);
        expect(persistedNames()).toEqual(['First', 'Another']);
        await vi.advanceTimersByTimeAsync(500);
        expect(persistedNames()).toEqual(['Second', 'Another']);
        stop();
    });

    it('skips a single oversized read', async () => {
        await persist('user-1', [[['all-notes', 'root-1'], 'x'.repeat(MAX_RECORD_CHARS)], [sessionKey, { name: 'Small' }]]);
        expect(persistedNames()).toEqual(['Small']);
    });

    it('keeps sessions and the newest reads within the budget', () => {
        const record = (prefix, updatedAt, size = 1) => ({ prefix, updatedAt, size });
        const many = Array.from({ length: MAX_RECORDS }, (_, index) => record('all-notes', index + 10));
        const { kept, dropped } = selectRecords([...many, record('session', 1)]);
        expect(kept).toHaveLength(MAX_RECORDS);
        expect(kept[0].prefix).toBe('session');
        expect(dropped).toEqual([record('all-notes', 10)]);
        expect(selectRecords([record('programs', 2, 20_000_000), record('programs', 1, 20_000_000)]).dropped)
            .toEqual([record('programs', 1, 20_000_000)]);
    });
});
