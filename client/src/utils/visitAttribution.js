/**
 * How a public-site visitor arrived: campaign labels in the link and the referring site.
 *
 * Nothing is stored on the device (Privacy Policy §2.3). It is read from the address once
 * per page load, and the landing page hands it on to the demo through the demo links
 * themselves (`withAttribution`), so a waitlist request made in the demo still knows the
 * campaign that brought the visitor to the landing page.
 */
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'];
const REF_PARAM = 'ref';

let captured = null;

const externalHost = (referrer, ownHost) => {
    if (!referrer) return null;
    try {
        const { host } = new URL(referrer);
        return host && host !== ownHost ? host : null;
    } catch {
        return null;
    }
};

/** Lowercase code the server accepts as a waitlist source (`[a-z0-9_.:-]`, at most 80). */
const toCode = (value) => String(value).toLowerCase().replace(/[^a-z0-9_.:-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

export function getVisitAttribution(
    location = typeof window === 'undefined' ? null : window.location,
    referrer = typeof document === 'undefined' ? '' : document.referrer,
) {
    if (captured) return captured;
    const params = new URLSearchParams(location?.search || '');
    const attribution = {};
    for (const key of UTM_KEYS) {
        const value = params.get(key);
        if (value) attribution[key] = value.slice(0, 200);
    }
    const refHost = params.get(REF_PARAM) || externalHost(referrer, location?.host);
    if (refHost) attribution.ref = refHost.slice(0, 255);
    captured = attribution;
    return captured;
}

/** The demo link, carrying this visit's attribution along. */
export function withAttribution(href, attribution = getVisitAttribution()) {
    const entries = Object.entries(attribution);
    if (entries.length === 0) return href;
    const [path, query = ''] = href.split('?');
    const params = new URLSearchParams(query);
    for (const [key, value] of entries) params.set(key, value);
    return `${path}?${params.toString()}`;
}

/** Where a waitlist request came from: a campaign, a referring site, or the page it was made on. */
export function waitlistSource(surface, attribution = getVisitAttribution()) {
    if (attribution.utm_source) return toCode(`utm:${attribution.utm_source}`) || surface;
    if (attribution.ref) return toCode(`ref:${attribution.ref}`) || surface;
    return surface;
}

/** Context for public telemetry; the server keeps only the referrer's host. */
export function attributionContext(attribution = getVisitAttribution()) {
    const context = {};
    for (const key of UTM_KEYS) if (attribution[key]) context[key] = attribution[key];
    if (attribution.ref) context.referrer = `https://${attribution.ref}/`;
    return context;
}

export const __attributionTestHooks = { reset: () => { captured = null; } };
