// The public marketing site (landing page at "/") is served on the apex
// domains; "my." and local dev keep the authenticated app at "/".
export const isPublicMarketingHost = (hostname = (typeof window === 'undefined' ? '' : window.location.hostname)) => {
    const normalized = String(hostname || '').toLowerCase();
    if (!normalized || normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '0.0.0.0') {
        return false;
    }
    if (normalized.startsWith('my.')) {
        return false;
    }
    return normalized === 'fractalgoals.com' || normalized === 'www.fractalgoals.com';
};
