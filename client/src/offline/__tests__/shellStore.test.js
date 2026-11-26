import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('the queue in a native shell', () => {
    let files;
    let createShellStore;

    beforeEach(async () => {
        vi.resetModules();
        files = new Map();
        globalThis.__FRACTAL_SHELL__ = {
            platform: 'macos', build: 1, apiUrl: 'https://a.test/api', appUrl: 'https://a.test', deviceName: 'Mac',
            invoke: async (command, { userId, opId, value }) => {
                const queue = files.get(userId) ?? files.set(userId, new Map()).get(userId);
                if (command === 'queue_all') return [...queue.values()];
                if (command === 'queue_put') queue.set(opId, value);
                if (command === 'queue_delete') queue.delete(opId);
                if (command === 'queue_clear') queue.clear();
                return null;
            },
        };
        ({ createShellStore } = await import('../shellStore'));
    });

    afterEach(() => delete globalThis.__FRACTAL_SHELL__);

    it('keeps each account apart, through a restart', async () => {
        const store = createShellStore('me');
        await store.put({ opId: 'a', seq: 1, body: { name: 'Café' } });
        await store.put({ opId: 'a', seq: 1, body: { name: 'Renamed' } });
        await store.put({ opId: 'b', seq: 2 });
        await store.delete('b');
        expect(await createShellStore('me').getAll()).toEqual([{ opId: 'a', seq: 1, body: { name: 'Renamed' } }]);
        expect(await createShellStore('someone-else').getAll()).toEqual([]);
        await store.clear();
        expect(await store.getAll()).toEqual([]);
        expect(store.isVolatile()).toBe(false);
    });

    it('saves in the order asked, though the shell answers out of order', async () => {
        const plain = globalThis.__FRACTAL_SHELL__.invoke;
        globalThis.__FRACTAL_SHELL__.invoke = async (command, args) => {
            // The first save is the slowest.
            if (args.value?.includes('first')) await new Promise((resolve) => setTimeout(resolve, 20));
            return plain(command, args);
        };
        const store = createShellStore('me');
        await Promise.all([
            store.put({ opId: 'a', note: 'first' }),
            store.put({ opId: 'a', note: 'second' }),
        ]);
        expect(await store.getAll()).toEqual([{ opId: 'a', note: 'second' }]);
    });

    it('says when a change could not be saved, and carries on', async () => {
        globalThis.__FRACTAL_SHELL__.invoke = async () => { throw new Error('disk full'); };
        const store = createShellStore('me');
        await expect(store.put({ opId: 'a' })).rejects.toThrow('disk full');
        globalThis.__FRACTAL_SHELL__.invoke = async () => [];
        await expect(store.getAll()).resolves.toEqual([]);
    });
});
