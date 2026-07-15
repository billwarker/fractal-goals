import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';


const preloadScript = () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    return scripts.find((script) => script.includes('__fgLandingExamplesPreload'));
};


describe('inline landing snapshot preload', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        window.history.replaceState({}, '', '/');
        delete window.__fgLandingExamplesPreload;
        delete window.__fgLandingExamplesStaticAttempted;
        delete window.__fgLandingExamplesStaticUrl;
    });

    it('aborts a stalled static request after two seconds', async () => {
        vi.useFakeTimers();
        window.history.replaceState({}, '', '/landing-preview');
        const fetchMock = vi.fn((_url, options) => new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }));
        vi.stubGlobal('fetch', fetchMock);

        window.eval(preloadScript().replace('%VITE_LANDING_EXAMPLES_STATIC_URL%', 'https://storage.example/snapshot.json'));
        const preload = window.__fgLandingExamplesPreload;
        await vi.advanceTimersByTimeAsync(2000);

        await expect(preload).rejects.toMatchObject({ name: 'AbortError' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][1].credentials).toBe('omit');
        expect(window.__fgLandingExamplesStaticAttempted).toBe(true);
    });
});
