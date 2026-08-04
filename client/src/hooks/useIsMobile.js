import { useSyncExternalStore } from 'react';

export const MOBILE_MEDIA_QUERY = '(max-width: 768px)';

export function getIsMobileViewport() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

function subscribeToMobileViewport(onStoreChange) {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
    }
    const mediaQueryList = window.matchMedia(MOBILE_MEDIA_QUERY);
    mediaQueryList.addEventListener('change', onStoreChange);
    return () => mediaQueryList.removeEventListener('change', onStoreChange);
}

export default function useIsMobile() {
    return useSyncExternalStore(subscribeToMobileViewport, getIsMobileViewport, () => false);
}
