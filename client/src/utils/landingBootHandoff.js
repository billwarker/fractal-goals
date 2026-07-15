export const LANDING_BOOT_SHELL_ID = 'landing-boot-shell';
export const LANDING_READY_SURFACE_SELECTOR = '[data-landing-ready-surface]';
export const LANDING_CSS_READY_PROPERTY = '--landing-css-ready';

export function dismissLandingBootShell(documentRef = document) {
    documentRef.getElementById(LANDING_BOOT_SHELL_ID)?.remove();
}

export function handoffLandingBootShell({
    documentRef = document,
    getComputedStyleRef = window.getComputedStyle.bind(window),
    requestAnimationFrameRef = window.requestAnimationFrame.bind(window),
    cancelAnimationFrameRef = window.cancelAnimationFrame.bind(window),
} = {}) {
    const shell = documentRef.getElementById(LANDING_BOOT_SHELL_ID);
    if (!shell) return () => {};

    let frameId = null;
    const checkReady = () => {
        const surface = documentRef.querySelector(LANDING_READY_SURFACE_SELECTOR);
        const cssReady = surface
            && getComputedStyleRef(surface).getPropertyValue(LANDING_CSS_READY_PROPERTY).trim() === '1';
        if (cssReady) {
            dismissLandingBootShell(documentRef);
            documentRef.documentElement.setAttribute('data-landing-react-ready', 'true');
            frameId = null;
            return;
        }
        frameId = requestAnimationFrameRef(checkReady);
    };

    frameId = requestAnimationFrameRef(checkReady);
    return () => {
        if (frameId !== null) cancelAnimationFrameRef(frameId);
    };
}
