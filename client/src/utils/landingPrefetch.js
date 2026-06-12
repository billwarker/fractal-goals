import { queryKeys } from '../hooks/queryKeys';
import { API_BASE, publicApi } from './api';
import { isPublicMarketingHost } from './marketingHost';

export const LANDING_EXAMPLES_STALE_TIME = 5 * 60 * 1000;

// index.html starts this fetch while the JS bundle is still downloading and
// stashes the promise on window (see the inline script there — keep the
// entry-path logic in sync). Consume it at most once: retries and refetches
// should hit the network, and a rejected preload falls back to the API call.
const PRELOAD_GLOBAL_KEY = '__fgLandingExamplesPreload';

const takeLandingExamplesPreload = () => {
    // Only trust the preload when the app calls the same same-origin /api the
    // inline script fetched from.
    if (typeof window === 'undefined' || API_BASE !== '/api') return null;
    const preload = window[PRELOAD_GLOBAL_KEY];
    if (!preload || typeof preload.then !== 'function') return null;
    delete window[PRELOAD_GLOBAL_KEY];
    return preload;
};

export const fetchLandingExamples = async () => {
    const preload = takeLandingExamplesPreload();
    if (preload) {
        try {
            return await preload;
        } catch {
            // Fall through to the regular API request.
        }
    }
    return (await publicApi.getLandingExamples()).data;
};

const isLandingEntryPath = (pathname) =>
    pathname === '/landing' || (pathname === '/' && isPublicMarketingHost());

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
