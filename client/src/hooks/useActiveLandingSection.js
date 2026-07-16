import { useEffect, useState } from 'react';

/**
 * Tracks which landing section currently spans the scroll midline, for the
 * persistent landing header.
 *
 * Horizontal mode (desktop snap sections): the -50%/-50% horizontal rootMargin
 * collapses the observation area to the container's center line, so exactly
 * one section intersects at a time.
 *
 * Vertical mode (mobile continuous scroll): sections are observed against the
 * visual viewport's vertical midline. The root is intentionally null because
 * the page may scroll through the window (production marketing host) or an
 * ancestor scroller (`.content-container` on the local /landing-preview
 * route); the viewport midline is correct for both.
 */
export default function useActiveLandingSection(containerRef, sectionIds, axis = 'horizontal') {
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

        const isVertical = axis === 'vertical';
        const observer = new window.IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setActiveId(entry.target.id);
                    }
                });
            },
            {
                root: isVertical ? null : (containerRef.current || null),
                rootMargin: isVertical ? '-50% 0px -50% 0px' : '0px -50% 0px -50%',
                threshold: 0,
            }
        );
        sections.forEach((section) => observer.observe(section));
        return () => observer.disconnect();
    }, [axis, containerRef, idsKey]);

    return activeId;
}
