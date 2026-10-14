import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { unregisterAppServiceWorker } from '../serviceWorker';

describe('service worker kill switch', () => {
    let unregister;
    let reload;

    beforeEach(() => {
        unregister = vi.fn(async () => true);
        reload = vi.fn();
        sessionStorage.clear();
        Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            value: { getRegistrations: async () => [{ unregister }] },
        });
        vi.stubGlobal('caches', {
            keys: async () => ['workbox-precache-v2', 'app-assets', 'unrelated'],
            delete: vi.fn(async () => true),
        });
        Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('removes the worker and its caches, reloading only once', async () => {
        await unregisterAppServiceWorker();
        await unregisterAppServiceWorker();

        expect(unregister).toHaveBeenCalledTimes(2);
        expect(caches.delete.mock.calls.map(([key]) => key)).toEqual(['workbox-precache-v2', 'app-assets', 'workbox-precache-v2', 'app-assets']);
        expect(reload).toHaveBeenCalledTimes(1);
    });
});
