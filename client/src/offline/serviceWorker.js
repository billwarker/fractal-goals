// Registers the app-shell service worker (built by vite-plugin-pwa) so the
// app opens with no signal. Updates never apply on their own: a new worker
// waits until the user chooses to reload, which the UI only offers when no
// changes are waiting to sync.

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

const listeners = new Set();
let waitingWorker = null;
let reloading = false;
let registered = false;

const emit = () => listeners.forEach((listener) => listener());

export function isAppUpdateReady() {
    return Boolean(waitingWorker);
}

export function subscribeAppUpdate(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function applyAppUpdate() {
    if (!waitingWorker) return;
    reloading = true;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
}

export function registerAppServiceWorker() {
    if (registered || !import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    registered = true;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) window.location.reload();
    });

    const register = async () => {
        let registration;
        try {
            registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        } catch (error) {
            console.error('[sw] registration failed; the app will need a connection to open', error);
            return;
        }

        const markWaiting = () => {
            // The first install has no controller to replace: nothing to prompt for.
            if (registration.waiting && navigator.serviceWorker.controller) {
                waitingWorker = registration.waiting;
                emit();
            }
        };
        markWaiting();
        registration.addEventListener('updatefound', () => {
            const installing = registration.installing;
            installing?.addEventListener('statechange', () => {
                if (installing.state === 'installed') markWaiting();
            });
        });

        const checkForUpdate = () => {
            if (document.visibilityState === 'visible' && navigator.onLine !== false) {
                registration.update().catch(() => {});
            }
        };
        document.addEventListener('visibilitychange', checkForUpdate);
        window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    };

    // Feature flags usually resolve after `load` has fired; don't wait for an event that has passed.
    if (document.readyState === 'complete') void register();
    else window.addEventListener('load', () => void register(), { once: true });
}
