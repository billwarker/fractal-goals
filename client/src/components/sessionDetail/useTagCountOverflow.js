import { useLayoutEffect, useRef, useState } from 'react';

const SUMMARY_RELEASE_MARGIN_PX = 8;

export default function useTagCountOverflow(tags, hasTrigger = true) {
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

        const measure = () => {
            const availableWidth = container.clientWidth;
            if (availableWidth <= 0) return;
            const triggerWidth = hasTrigger && trigger ? trigger.getBoundingClientRect().width : 0;
            const tagGap = signature && hasTrigger && trigger ? 5 : 0;
            const requiredWidth = measureElement.scrollWidth + triggerWidth + tagGap;
            setIsSummaryVisible((current) => {
                const shouldSummarize = current
                    ? requiredWidth > availableWidth - SUMMARY_RELEASE_MARGIN_PX
                    : requiredWidth > availableWidth;
                return current === shouldSummarize ? current : shouldSummarize;
            });
        };
        measure();
        if (typeof ResizeObserver === 'function') {
            const observer = new ResizeObserver(measure);
            observer.observe(container);
            return () => observer.disconnect();
        }
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [hasTrigger, signature]);

    return { containerRef, measureRef, triggerRef, isSummaryVisible, countLabel };
}
