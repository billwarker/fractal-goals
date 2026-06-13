import { useEffect, useState } from 'react';

/**
 * Tracks which full-viewport landing section currently spans the scroll
 * container's horizontal center, for the persistent landing header.
 *
 * The horizontal -50%/-50% rootMargin collapses the observation area to the
 * container's center line, so exactly one section intersects at a time.
 */
export default function useActiveLandingSection(containerRef, sectionIds) {
    const [activeId, setActiveId] = useState(sectionIds[0] || null);
    const idsKey = sectionIds.join('|');

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.IntersectionObserver === 'undefined') {
            return undefined;
        }
        const sections = idsKey
            .split('|')
            .map((id) => document.getElementById(id))
            .filter(Boolean);
        if (sections.length === 0) return undefined;

        const observer = new window.IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setActiveId(entry.target.id);
                    }
                });
            },
            {
                root: containerRef.current || null,
                rootMargin: '0px -50% 0px -50%',
                threshold: 0,
            }
        );
        sections.forEach((section) => observer.observe(section));
        return () => observer.disconnect();
    }, [containerRef, idsKey]);

    return activeId;
}
