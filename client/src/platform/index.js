// The one place the app meets what it runs in: a browser, or a native shell around the same build.
// The shell injects `__FRACTAL_SHELL__` before any script runs. Everything else asks here, and the
// maintainability audit rejects these browser calls elsewhere.

/**
 * @typedef {object} NativeShell What a shell must provide.
 * @property {'macos'} platform
 * @property {number} build Compared with the server's minimum supported build.
 * @property {string} apiUrl The server's API, on another origin than the app's own.
 * @property {string} appUrl The web app, for pages the shell hands to the browser.
 * @property {string} deviceName Shown in Settings → Account.
 * @property {(command: string, args?: object) => Promise<any>} invoke Commands: `secret_get`, `secret_set`,
 *     `secret_delete` ({ key, value }), `open_external` ({ url }), `save_file` ({ name, content }),
 *     `queue_all`, `queue_put`, `queue_delete`, `queue_clear` ({ userId, opId, value }) for unsent changes,
 *     `authorize` ({ url, callbackScheme }) resolving to the final address, or null if closed,
 *     `set_timer` ({ session: { title, path, elapsedSeconds, running } | null }) for the menu bar,
 *     `allow_reminders` resolving to whether notifications are allowed, and
 *     `set_reminders` ({ reminders: [{ id, title, body, path, at: { year, month, day, hour, minute } }] }).
 * @property {(open: (link: string) => void) => () => void} [onOpenLink] Passes on each link, the launching one first.
 * @property {(choose: (id: string) => void) => () => void} [onMenu] Passes on menu choices the app handles:
 *     `settings`, `new-session`, `fractals`, `back`, `forward` and `page:<goals|programs|sessions|notes|analytics>`.
 */

/** @type {NativeShell | null} */
const shell = globalThis.__FRACTAL_SHELL__ ?? null;

export const isNative = shell !== null;
export const apiBase = shell?.apiUrl ?? (import.meta.env.VITE_API_URL || 'http://localhost:8001/api');
/** Sent with every request, so the server can tell an outdated build to update. */
export const clientHeaders = shell ? { 'X-Client-Platform': shell.platform, 'X-Client-Build': String(shell.build) } : {};
/** Browsers stay signed in with a cookie; native apps with a refresh token in the system's secret store. */
export const usesCookies = !isNative;
/** A native app carries its own files, so nothing needs caching to start offline. */
export const usesServiceWorker = !isNative;

export const getShell = () => shell;

/**
 * What only an app can do. A browser goes without: its page has its own shortcuts and session timer,
 * and it shows no reminders.
 */
export const capabilities = Object.freeze({
    menus: Boolean(shell?.onMenu),
    menuBarTimer: isNative,
    reminders: isNative,
});

/** Choices from the app's menus. Returns a stop function. */
export const onAppMenu = (choose) => (shell?.onMenu ? shell.onMenu(choose) : () => {});

/** The session shown in the menu bar, or null for none. */
export const showSessionTimer = (session) => (shell ? shell.invoke('set_timer', { session }) : Promise.resolve());

/** Resolves to false when the person declined notifications. */
export const allowReminders = () => (shell ? shell.invoke('allow_reminders') : Promise.resolve(false));

/** Replaces every reminder still to come. */
export const scheduleReminders = (reminders) => (shell ? shell.invoke('set_reminders', { reminders }) : Promise.resolve());

/** Hand a page to the system browser. */
export function openExternal(url) {
    if (shell) return shell.invoke('open_external', { url: new URL(url, shell.appUrl).href });
    window.open(url, '_blank', 'noopener');
    return Promise.resolve();
}

/**
 * Open a provider's consent page. Call synchronously from a click: browsers block later windows.
 * In a shell, resolves to what the provider answered; in a browser, its window reports by itself.
 * @param {() => Promise<string>} getUrl
 */
export async function openConsent(getUrl) {
    if (shell) {
        // A system sign-in window, which closes itself and hands back the address it ended on.
        const ended = await shell.invoke('authorize', { url: await getUrl(), callbackScheme: 'fractalgoals' });
        return ended ? Object.fromEntries(new URL(ended).searchParams) : { result: 'cancelled' };
    }
    const popup = window.open('about:blank', '_blank');
    if (!popup) throw new Error('Allow the connection window to open, then try again.');
    popup.opener = null;
    try {
        popup.location.href = await getUrl();
    } catch (failure) {
        popup.close();
        throw failure;
    }
    return null;
}

/** Returns false when the user cancelled. */
export async function saveFile({ name, content, type }) {
    if (shell) return (await shell.invoke('save_file', { name, content })) !== false;
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return true;
}

export const canCopyText = () => Boolean(globalThis.navigator?.clipboard?.writeText);

export async function copyText(text) {
    if (!canCopyText()) throw new Error('Copying is not available here.');
    await navigator.clipboard.writeText(text);
}

/**
 * The app path a link leads to, or null when it isn't one of ours. Shells pass on both
 * `https://my.fractalgoals.com/...` and `fractalgoals://...`.
 */
export function appPathFromLink(link) {
    let url;
    try {
        url = new URL(link);
    } catch {
        return null;
    }
    if (url.protocol === 'fractalgoals:') return `/${url.host}${url.pathname}${url.search}`.replace(/\/$/, '') || '/';
    const ours = shell ? new URL(shell.appUrl).host : window.location.host;
    if (url.protocol !== 'https:' || url.host !== ours || url.pathname.startsWith('/api/')) return null;
    return `${url.pathname}${url.search}${url.hash}`;
}

/** Opens links the system hands the app, the one that launched it included. Returns a stop function. */
export function installAppLinks(navigate) {
    if (!shell?.onOpenLink) return () => {};
    return shell.onOpenLink((link) => {
        const path = appPathFromLink(link);
        if (path) navigate(path);
    });
}

/** In a shell, links that would open a tab open the system browser. Returns a stop function. */
export function installExternalLinks() {
    if (!shell) return () => {};
    const handle = (event) => {
        const link = event.target?.closest?.('a[href]');
        if (!link || event.defaultPrevented) return;
        const url = new URL(link.getAttribute('href'), window.location.href);
        const leaves = url.origin !== window.location.origin;
        if (!leaves && link.target !== '_blank') return;
        event.preventDefault();
        void openExternal(leaves ? url.href : `${url.pathname}${url.search}${url.hash}`);
    };
    // On the way down: dialogs stop clicks on the way up.
    document.addEventListener('click', handle, true);
    return () => document.removeEventListener('click', handle, true);
}
