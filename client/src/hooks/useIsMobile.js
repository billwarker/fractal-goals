import { useEffect, useState } from 'react';

export const MOBILE_MEDIA_QUERY = '(max-width: 768px)';

export function getIsMobileViewport() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

export default function useIsMobile() {
    const [isMobile, setIsMobile] = useState(getIsMobileViewport);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return undefined;
        }

        const mediaQueryList = window.matchMedia(MOBILE_MEDIA_QUERY);
        const onChange = (event) => setIsMobile(event.matches);

        setIsMobile(mediaQueryList.matches);
        mediaQueryList.addEventListener('change', onChange);

        return () => mediaQueryList.removeEventListener('change', onChange);
    }, []);

    return isMobile;
}
