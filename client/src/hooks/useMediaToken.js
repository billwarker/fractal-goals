import { useQuery } from '@tanstack/react-query';

import { usesCookies } from '../platform';
import { storageApi } from '../utils/api/storageApi';
import { queryKeys } from './queryKeys';

const LIFETIME_MS = 60 * 60 * 1000;
// Replaced well before it lapses, so a long video can still seek.
const REFRESH_MS = LIFETIME_MS / 2;

const COOKIE = Object.freeze({ mediaToken: null, ready: true, refresh: () => Promise.resolve() });

function useNativeMediaToken() {
    const { data, refetch } = useQuery({
        queryKey: queryKeys.mediaToken(),
        queryFn: async () => (await storageApi.mediaToken()).data.media_token,
        staleTime: REFRESH_MS,
        gcTime: REFRESH_MS,
    });
    return { mediaToken: data ?? null, ready: Boolean(data), refresh: refetch };
}

/** `ready` once media can load: at once in a browser, with a token in a native app. Fixed for the page's life. */
export const useMediaToken = usesCookies ? () => COOKIE : useNativeMediaToken;
