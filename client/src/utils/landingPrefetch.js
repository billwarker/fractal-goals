import { queryKeys } from '../hooks/queryKeys';
import { API_BASE, publicApi } from './api';
import { isLandingPreviewPath, isPublicMarketingHost } from './marketingHost';

export const LANDING_EXAMPLES_STALE_TIME = 5 * 60 * 1000;
export const LANDING_EXAMPLES_STATIC_URL = import.meta.env.VITE_LANDING_EXAMPLES_STATIC_URL || '';

// index.html starts this fetch while the JS bundle is still downloading and
// stashes the promise on window (see the inline script there — keep the
// entry-path logic in sync). Consume it at most once: retries and refetches
// should hit the network, and a rejected preload falls back to the API call.
const PRELOAD_GLOBAL_KEY = '__fgLandingExamplesPreload';
const STATIC_URL_GLOBAL_KEY = '__fgLandingExamplesStaticUrl';
const STATIC_ATTEMPTED_GLOBAL_KEY = '__fgLandingExamplesStaticAttempted';

const isLandingSnapshot = (payload) => (
    payload !== null
    && typeof payload === 'object'
    && Array.isArray(payload.examples)
    && (
        payload.schema_version === undefined
        || payload.schema_version === null
        || Number.isInteger(payload.schema_version)
    )
    && (
        !Number.isInteger(payload.schema_version)
        || payload.schema_version < 12
        || (typeof payload.revision === 'string' && payload.revision.length > 0)
    )
    && payload.examples.every((example) => (
        example !== null
        && typeof example === 'object'
        && typeof example.root_id === 'string'
        && example.root_id.length > 0
        && (
            !Number.isInteger(payload.schema_version)
            || payload.schema_version < 12
            || (example.tree !== null && typeof example.tree === 'object')
        )
    ))
);

const getLandingExamplesStaticUrl = () => {
    // Local preview is for testing the local backend/draft publication. Never
    // let a production build argument silently redirect it to production GCS.
    if (typeof window !== 'undefined' && isLandingPreviewPath()) return '';
    if (typeof window !== 'undefined' && typeof window[STATIC_URL_GLOBAL_KEY] === 'string') {
        return window[STATIC_URL_GLOBAL_KEY];
    }
    return LANDING_EXAMPLES_STATIC_URL;
};

const takeLandingExamplesPreload = () => {
    // Only trust the inline preload when it fetched the same same-origin /api
    // data this app would request, or when it came from the configured static
    // public snapshot.
    if (typeof window === 'undefined' || (API_BASE !== '/api' && !getLandingExamplesStaticUrl())) return null;
    const preload = window[PRELOAD_GLOBAL_KEY];
    if (!preload || typeof preload.then !== 'function') return null;
    delete window[PRELOAD_GLOBAL_KEY];
    return preload;
};

const fetchStaticLandingExamples = async () => {
    const staticUrl = getLandingExamplesStaticUrl();
    if (!staticUrl || (typeof window !== 'undefined' && window[STATIC_ATTEMPTED_GLOBAL_KEY])) return null;
    if (typeof window !== 'undefined') window[STATIC_ATTEMPTED_GLOBAL_KEY] = true;
    try {
        const payload = (await publicApi.getStaticLandingExamples(staticUrl)).data;
        return isLandingSnapshot(payload) ? payload : null;
    } catch {
        return null;
    }
};

export const fetchLandingExamples = async () => {
    const preload = takeLandingExamplesPreload();
    if (preload) {
        try {
            const payload = await preload;
            if (isLandingSnapshot(payload)) return payload;
        } catch {
            // Fall through to the regular API request.
        }
    }
    const staticPayload = await fetchStaticLandingExamples();
    if (staticPayload) return staticPayload;
    return (await publicApi.getLandingExamples()).data;
};

const isLandingEntryPath = (pathname) =>
    isLandingPreviewPath(pathname) || (pathname === '/' && isPublicMarketingHost());

// Kick off the landing-examples request at JS boot (before React mounts the
// landing page) so the example explorer and feature showcase have data as
// early as possible. Landing's own useQuery dedupes against this prefetch.
export const maybePrefetchLandingExamples = (
    queryClient,
    pathname = (typeof window === 'undefined' ? '' : window.location.pathname),
) => {
    if (!isLandingEntryPath(pathname)) return false;
    queryClient.prefetchQuery({
        queryKey: queryKeys.landingExamples(),
        queryFn: fetchLandingExamples,
        staleTime: LANDING_EXAMPLES_STALE_TIME,
    });
    return true;
};
