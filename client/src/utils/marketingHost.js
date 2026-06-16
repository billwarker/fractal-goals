// The public marketing site (landing page at "/") is served on the apex
// domains; "my." and local dev keep the authenticated app at "/".
export const LANDING_PREVIEW_PATH = '/landing-preview';

export const isLocalDevHost = (hostname = (typeof window === 'undefined' ? '' : window.location.hostname)) => {
    const normalized = String(hostname || '').toLowerCase();
    return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '0.0.0.0' || normalized === '::1';
};

export const isPublicMarketingHost = (hostname = (typeof window === 'undefined' ? '' : window.location.hostname)) => {
    const normalized = String(hostname || '').toLowerCase();
    if (!normalized || isLocalDevHost(normalized)) {
        return false;
    }
    if (normalized.startsWith('my.')) {
        return false;
    }
    return normalized === 'fractalgoals.com' || normalized === 'www.fractalgoals.com';
};

export const isLandingPreviewPath = (
    pathname = (typeof window === 'undefined' ? '' : window.location.pathname),
    hostname = (typeof window === 'undefined' ? '' : window.location.hostname),
) => pathname === LANDING_PREVIEW_PATH && isLocalDevHost(hostname);

export const getLandingPageHref = (hostname = (typeof window === 'undefined' ? '' : window.location.hostname)) => {
    if (isLocalDevHost(hostname)) return LANDING_PREVIEW_PATH;
    return 'https://fractalgoals.com/';
};
