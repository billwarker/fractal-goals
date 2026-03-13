import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import { importWithRetry, isDynamicImportError, pageReloader } from '../lazyWithRetry';

describe('lazyWithRetry', () => {
    let reloadSpy;

    beforeEach(() => {
        sessionStorage.clear();
        reloadSpy = vi.spyOn(pageReloader, 'reload').mockImplementation(() => {});
    });

    afterEach(() => {
        reloadSpy.mockRestore();
    });

    it('recognizes common dynamic import failure messages', () => {
        expect(isDynamicImportError(new TypeError('Failed to fetch dynamically imported module: /assets/Sessions.js'))).toBe(true);
        expect(isDynamicImportError(new Error('ChunkLoadError: Loading chunk 123 failed.'))).toBe(true);
        expect(isDynamicImportError(new Error('Plain application error'))).toBe(false);
    });

    it('reloads once on the first dynamic import failure for a chunk', async () => {
        const failingImport = vi.fn(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/Sessions.js')));

        void importWithRetry(failingImport, 'pages/Sessions');
        await Promise.resolve();

        expect(reloadSpy).toHaveBeenCalledTimes(1);
        expect(sessionStorage.getItem('lazy-retry:pages/Sessions')).toBe('true');
    });

    it('throws after a reload has already been attempted for the same chunk', async () => {
        sessionStorage.setItem('lazy-retry:pages/Sessions', 'true');
        const failure = new TypeError('Failed to fetch dynamically imported module: /assets/Sessions.js');

        await expect(importWithRetry(() => Promise.reject(failure), 'pages/Sessions')).rejects.toBe(failure);
        expect(reloadSpy).not.toHaveBeenCalled();
    });

    it('clears the retry flag after a successful import', async () => {
        sessionStorage.setItem('lazy-retry:pages/Sessions', 'true');

        const loadedModule = await importWithRetry(() => Promise.resolve({ default: 'SessionsPage' }), 'pages/Sessions');

        expect(loadedModule).toEqual({ default: 'SessionsPage' });
        expect(sessionStorage.getItem('lazy-retry:pages/Sessions')).toBe(null);
    });
});
