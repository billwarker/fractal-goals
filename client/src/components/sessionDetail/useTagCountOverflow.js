import { useLayoutEffect, useRef, useState } from 'react';

const SUMMARY_RELEASE_MARGIN_PX = 8;
const TAG_GAP_PX = 5;

/** Whether items of these widths, wrapping in order, fit in `maxRows` rows. One too wide fills its own row. */
export function tagsFitInRows(widths, gap, availableWidth, maxRows) {
    if (availableWidth <= 0) return true;
    let rows = 1;
    let used = 0;
    for (const width of widths) {
        if (used === 0) {
            used = width;
        } else if (used + gap + width <= availableWidth) {
            used += gap + width;
        } else {
            rows += 1;
            if (rows > maxRows) return false;
            used = width;
        }
    }
    return true;
}

/**
 * Tags show by name while they fit; beyond that they read "N tags". On one row they get their
 * container's width. With `maxRows` above one they wrap within the `[data-tag-width-boundary]`
 * around them, so what else shares the row (the name, a selected card's buttons) never decides it.
 */
export default function useTagCountOverflow(tags, hasTrigger = true, { maxRows = 1 } = {}) {
    const containerRef = useRef(null);
    const measureRef = useRef(null);
    const triggerRef = useRef(null);
    const [isSummaryVisible, setIsSummaryVisible] = useState(false);
    const signature = tags.map((tag) => `${tag.id || ''}:${tag.name}:${Boolean(tag.archived)}`).join('|');
    const countLabel = `${tags.length} ${tags.length === 1 ? 'tag' : 'tags'}`;

    useLayoutEffect(() => {
        const container = containerRef.current;
        const measureElement = measureRef.current;
        const trigger = triggerRef.current;
        if (!container || !measureElement) return undefined;
        const boundary = maxRows > 1 ? container.closest('[data-tag-width-boundary]') || container : container;

        const measure = () => {
            const availableWidth = boundary.clientWidth;
            if (availableWidth <= 0) return;
            const triggerWidth = hasTrigger && trigger ? trigger.getBoundingClientRect().width : 0;
            setIsSummaryVisible((current) => {
                const room = current ? availableWidth - SUMMARY_RELEASE_MARGIN_PX : availableWidth;
                let fits;
                if (maxRows > 1) {
                    const widths = [...measureElement.children].map((item) => item.getBoundingClientRect().width);
                    fits = tagsFitInRows(triggerWidth ? [triggerWidth, ...widths] : widths, TAG_GAP_PX, room, maxRows);
                } else {
                    const tagGap = signature && hasTrigger && trigger ? TAG_GAP_PX : 0;
                    fits = measureElement.scrollWidth + triggerWidth + tagGap <= room;
                }
                return current === !fits ? current : !fits;
            });
        };
        measure();
        if (typeof ResizeObserver === 'function') {
            const observer = new ResizeObserver(measure);
            observer.observe(boundary);
            return () => observer.disconnect();
        }
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [hasTrigger, maxRows, signature]);

    return { containerRef, measureRef, triggerRef, isSummaryVisible, countLabel };
}
