export const APP_BOOT_SHELL_ID = 'app-boot-shell';

export function dismissAppBootShell(documentRef = document) {
    documentRef.getElementById(APP_BOOT_SHELL_ID)?.remove();
    documentRef.documentElement.removeAttribute('data-boot-slow');
}

/**
 * The app's first paint is ready to replace the boot loader once the root holds something to
 * see: content that isn't still loading, or a loading state that has appeared (they look alike,
 * so the swap is seamless). A loading state still inside its anti-flash delay doesn't count.
 */
export function rootIsShowing(rootElement) {
    if (!rootElement?.firstElementChild) return false;
    if (rootElement.querySelector('[role="status"][aria-busy="true"]')) return true;
    return !rootElement.querySelector('[aria-busy="true"]');
}

// Once the app has rendered anything, it replaces the boot loader within this long even if
// something stays marked busy, so the loader can never outlive the app.
export const BOOT_HANDOFF_FALLBACK_MS = 1500;

/** Removes the boot loader when the app first shows something; returns a cancel function. */
export function handoffAppBootShell(rootElement, {
    documentRef = document,
    MutationObserverRef = window.MutationObserver,
    setTimeoutRef = window.setTimeout.bind(window),
    clearTimeoutRef = window.clearTimeout.bind(window),
} = {}) {
    if (!documentRef.getElementById(APP_BOOT_SHELL_ID)) return () => {};
    let fallbackTimer = null;
    let observer = null;
    const finish = () => {
        observer?.disconnect();
        if (fallbackTimer !== null) clearTimeoutRef(fallbackTimer);
        dismissAppBootShell(documentRef);
    };
    const check = () => {
        if (rootIsShowing(rootElement)) {
            finish();
            return;
        }
        if (fallbackTimer === null && rootElement.firstElementChild) {
            fallbackTimer = setTimeoutRef(finish, BOOT_HANDOFF_FALLBACK_MS);
        }
    };
    observer = new MutationObserverRef(check);
    observer.observe(rootElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-busy', 'role'] });
    check();
    return () => {
        observer.disconnect();
        if (fallbackTimer !== null) clearTimeoutRef(fallbackTimer);
    };
}
