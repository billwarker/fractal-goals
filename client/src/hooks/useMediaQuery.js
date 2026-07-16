import { useEffect, useState } from 'react';

function getMatches(query) {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    return window.matchMedia(query).matches;
}

export default function useMediaQuery(query) {
    const [matches, setMatches] = useState(() => getMatches(query));

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return undefined;
        }

        const mediaQueryList = window.matchMedia(query);
        const onChange = (event) => setMatches(event.matches);

        setMatches(mediaQueryList.matches);
        mediaQueryList.addEventListener('change', onChange);

        return () => mediaQueryList.removeEventListener('change', onChange);
    }, [query]);

    return matches;
}
