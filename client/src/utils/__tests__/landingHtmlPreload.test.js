import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';


// The shell boot script is external (the CSP forbids inline script) and reads the
// build-time snapshot URL from a meta tag Vite fills in.
const bootScript = () => fs.readFileSync(path.join(process.cwd(), 'public/boot/shell.js'), 'utf8');

function setStaticUrlMeta(content) {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'fg-landing-examples-static-url');
    meta.setAttribute('content', content);
    document.head.appendChild(meta);
}


describe('landing snapshot preload in the shell boot script', () => {
    afterEach(() => {
        document.head.querySelectorAll('meta[name="fg-landing-examples-static-url"]').forEach((meta) => meta.remove());
        vi.useRealTimers();
        vi.unstubAllGlobals();
        window.history.replaceState({}, '', '/');
        delete window.__fgLandingExamplesPreload;
        delete window.__fgLandingExamplesStaticAttempted;
        delete window.__fgLandingExamplesStaticUrl;
    });

    it('uses and bounds the local API preload even when the build contains a production GCS URL', async () => {
        vi.useFakeTimers();
        window.history.replaceState({}, '', '/landing-preview');
        const fetchMock = vi.fn((_url, options) => new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }));
        vi.stubGlobal('fetch', fetchMock);

        setStaticUrlMeta('https://storage.example/snapshot.json');
        window.eval(bootScript());
        const preload = window.__fgLandingExamplesPreload;
        await vi.advanceTimersByTimeAsync(2000);

        await expect(preload).rejects.toMatchObject({ name: 'AbortError' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith('/api/public/landing-examples', expect.objectContaining({
            credentials: 'same-origin',
        }));
        expect(window.__fgLandingExamplesStaticUrl).toBe('');
        expect(window.__fgLandingExamplesStaticAttempted).toBe(false);
    });

    it('keeps the build-time meta tag and external boot script in the app shell', () => {
        const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
        expect(html).toContain('<meta name="fg-landing-examples-static-url" content="%VITE_LANDING_EXAMPLES_STATIC_URL%" />');
        expect(html).toContain('<script src="/boot/shell.js"></script>');
        expect(html).not.toMatch(/<script>[\s\S]*?<\/script>/);
        expect(html).not.toMatch(/\son[a-z]+=/);
    });
});
