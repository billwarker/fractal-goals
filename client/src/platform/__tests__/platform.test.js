import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shell = (invoke = vi.fn(async () => undefined)) => ({
    platform: 'macos', build: 12, apiUrl: 'https://api.test/api', appUrl: 'https://my.test', deviceName: 'My Mac', invoke,
});
async function load(injected) {
    vi.resetModules();
    if (injected) globalThis.__FRACTAL_SHELL__ = injected;
    return import('../index');
}

beforeEach(() => vi.spyOn(window, 'open').mockReturnValue(null));
afterEach(() => {
    delete globalThis.__FRACTAL_SHELL__;
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

describe('in a browser', () => {
    it('uses cookies and the service worker, and sends no shell headers', async () => {
        const platform = await load();
        expect(platform).toMatchObject({ isNative: false, usesCookies: true, usesServiceWorker: true, clientHeaders: {} });
    });

    it('opens consent in a window opened during the click, and closes it when the address fails', async () => {
        const { openConsent } = await load();
        await expect(openConsent(async () => 'x')).rejects.toThrow('Allow the connection window');
        const popup = { location: { href: '' }, close: vi.fn(), opener: window };
        window.open.mockReturnValue(popup);
        await openConsent(async () => 'https://provider.test');
        expect(popup.location.href).toBe('https://provider.test');
        expect(popup.opener).toBeNull();
        await expect(openConsent(async () => { throw new Error('no'); })).rejects.toThrow('no');
        expect(popup.close).toHaveBeenCalled();
    });

    it('leaves links alone', async () => {
        const { installExternalLinks } = await load();
        const add = vi.spyOn(document, 'addEventListener');
        installExternalLinks();
        expect(add).not.toHaveBeenCalled();
    });
});

describe('in a shell', () => {
    it('talks to the server it was given and says which build it is', async () => {
        const platform = await load(shell());
        expect(platform).toMatchObject({
            isNative: true, usesCookies: false, usesServiceWorker: false, apiBase: 'https://api.test/api',
            clientHeaders: { 'X-Client-Platform': 'macos', 'X-Client-Build': '12' },
        });
    });

    it('never shows the landing page, though its own host is called localhost', async () => {
        await load(shell());
        const { getAppHref, isLandingPreviewPath } = await import('../../utils/marketingHost');
        expect(getAppHref('localhost')).toBe('https://my.fractalgoals.com/');
        expect(isLandingPreviewPath('/landing-preview', 'localhost')).toBe(false);
    });

    it('hands consent and outside links to the system browser', async () => {
        const invoke = vi.fn(async () => undefined);
        const { installExternalLinks, openConsent } = await load(shell(invoke));
        const getUrl = vi.fn();
        await openConsent(getUrl);
        expect(getUrl).not.toHaveBeenCalled();
        expect(invoke).toHaveBeenLastCalledWith('open_external', { url: 'https://my.test/?settings=storage' });

        const stop = installExternalLinks();
        document.body.onclick = (event) => event.stopPropagation(); // as a dialog does
        document.body.innerHTML = '<a id="out" href="https://other.test/a"><b>Out</b></a>'
            + '<a id="tab" href="/privacy" target="_blank">Privacy</a><a id="in" href="/goals">Goals</a>';
        const click = (selector) => {
            const event = new MouseEvent('click', { bubbles: true, cancelable: true });
            document.querySelector(selector).dispatchEvent(event);
            return event.defaultPrevented;
        };
        expect(click('#out b')).toBe(true);
        expect(invoke).toHaveBeenLastCalledWith('open_external', { url: 'https://other.test/a' });
        expect(click('#tab')).toBe(true);
        expect(invoke).toHaveBeenLastCalledWith('open_external', { url: 'https://my.test/privacy' });
        invoke.mockClear();
        document.querySelector('#in').addEventListener('click', (event) => event.preventDefault());
        click('#in');
        expect(invoke).not.toHaveBeenCalled();
        stop();
        document.body.onclick = null;
    });

    it('saves files through the system, and reports a cancel', async () => {
        const invoke = vi.fn(async () => false);
        const { saveFile } = await load(shell(invoke));
        await expect(saveFile({ name: 'a.json', content: '{}', type: 'application/json' })).resolves.toBe(false);
        expect(invoke).toHaveBeenCalledWith('save_file', { name: 'a.json', content: '{}' });
    });
});

describe('native session', () => {
    const answer = (n) => ({ data: { access_token: `access-${n}`, refresh_token: `refresh-${n}`, user: { id: 'u' } } });
    let secrets;
    let post;
    let session;

    beforeEach(async () => {
        secrets = new Map();
        await load(shell(vi.fn(async (command, { key, value }) => {
            if (command === 'secret_get') return secrets.get(key) ?? null;
            if (command === 'secret_set') secrets.set(key, value);
            else secrets.delete(key);
            return undefined;
        })));
        post = vi.fn();
        const { createNativeSession } = await import('../nativeSession');
        session = createNativeSession({ post, apiBase: '/api' });
    });

    it('signs in as this device and keeps only the refresh token', async () => {
        post.mockResolvedValue(answer(1));
        await expect(session.signIn({ username_or_email: 'me', password: 'pw', remember_me: true }))
            .resolves.toEqual({ data: { token: 'access-1', user: { id: 'u' } } });
        expect(post).toHaveBeenCalledWith('/api/auth/token', {
            username_or_email: 'me', password: 'pw', platform: 'macos', device_name: 'My Mac',
        });
        expect([...secrets.values()]).toEqual(['refresh-1']);
    });

    it('renews once however many requests need it', async () => {
        secrets.set('refresh-token', 'refresh-1');
        post.mockResolvedValue(answer(2));
        const results = await Promise.all([session.refresh(), session.refresh(), session.refresh()]);
        expect(post).toHaveBeenCalledTimes(1);
        expect(new Set(results.map(({ data }) => data.token))).toEqual(new Set(['access-2']));
        expect(secrets.get('refresh-token')).toBe('refresh-2');
    });

    it('stays signed in through a lost connection, and forgets a refused token', async () => {
        secrets.set('refresh-token', 'refresh-1');
        post.mockRejectedValueOnce(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }));
        await expect(session.refresh()).rejects.toThrow('Network Error');
        expect(secrets.get('refresh-token')).toBe('refresh-1');
        post.mockRejectedValueOnce(Object.assign(new Error('no'), { response: { status: 401 } }));
        await expect(session.refresh()).rejects.toThrow('no');
        expect(secrets.size).toBe(0);
        await expect(session.refresh()).rejects.toMatchObject({ response: { status: 401 } });
        expect(post).toHaveBeenCalledTimes(2);
    });

    it('signs out here even when the server cannot be reached', async () => {
        secrets.set('refresh-token', 'refresh-1');
        post.mockRejectedValue(new Error('offline'));
        await session.signOut();
        expect(secrets.size).toBe(0);
    });
});
