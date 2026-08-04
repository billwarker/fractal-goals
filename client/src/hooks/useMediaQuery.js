import { useCallback, useSyncExternalStore } from 'react';

function getMatches(query) {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    return window.matchMedia(query).matches;
}

export default function useMediaQuery(query) {
    const subscribe = useCallback((onStoreChange) => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return () => {};
        }
        const mediaQueryList = window.matchMedia(query);
        mediaQueryList.addEventListener('change', onStoreChange);
        return () => mediaQueryList.removeEventListener('change', onStoreChange);
    }, [query]);
    const getSnapshot = useCallback(() => getMatches(query), [query]);
    return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
