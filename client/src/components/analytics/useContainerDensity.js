import { useEffect, useState } from 'react';

const COMPACT_WIDTH = 480;
const COMPACT_HEIGHT = 260;

/** 'compact' while the element is under 480px wide or 260px tall, else 'full'. */
export function densityForSize(width, height) {
    if (!width || !height) return 'full';
    return width < COMPACT_WIDTH || height < COMPACT_HEIGHT ? 'compact' : 'full';
}

export default function useContainerDensity(ref, fallback = 'full') {
    const [density, setDensity] = useState(fallback);
    useEffect(() => {
        const element = ref.current;
        if (!element || typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(([entry]) => {
            setDensity(densityForSize(entry.contentRect.width, entry.contentRect.height));
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [ref]);
    return density;
}
