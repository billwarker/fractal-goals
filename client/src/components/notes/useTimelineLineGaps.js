import { useLayoutEffect } from 'react';

// Space between a line's break and the node that sits in it.
const NODE_GAP = 3;

/** The box of an element's ::before, in viewport coordinates, or null when it has none. */
function beforeBox(element) {
    const style = getComputedStyle(element, '::before');
    if (!style || style.content === 'none' || style.display === 'none') return null;
    const host = element.getBoundingClientRect();
    const left = host.left + (parseFloat(style.left) || 0);
    const top = host.top + (parseFloat(style.top) || 0);
    const width = parseFloat(style.width) || 0;
    const height = parseFloat(style.height) || 0;
    return { left, top, right: left + width, bottom: top + height, width, height };
}

function nodeBox(element) {
    return element.dataset.timelineNode === 'before' ? beforeBox(element) : element.getBoundingClientRect();
}

/** A mask that keeps the line everywhere except the given [start, end] ranges (px from its top). */
export function lineMask(gaps) {
    if (!gaps.length) return null;
    const stops = ['#000 0'];
    gaps
        .sort((first, second) => first[0] - second[0])
        .forEach(([start, end]) => {
            const from = Math.max(0, Math.round(start));
            const to = Math.round(end);
            stops.push(`#000 ${from}px`, `transparent ${from}px`, `transparent ${to}px`, `#000 ${to}px`);
        });
    return `linear-gradient(to bottom, ${stops.join(', ')})`;
}

/**
 * Breaks the timeline's lines around the nodes that sit on them, so nodes need no page-coloured
 * backing to hide the line and stay see-through on any surface. A line is an element marked
 * `data-timeline-line` that draws itself as a vertical ::before reading `--line-mask`; a node is
 * an element marked `data-timeline-node` (`before` when the node is its ::before).
 */
export default function useTimelineLineGaps(containerRef, deps) {
    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return undefined;

        const measure = () => {
            // Nothing to measure until the timeline is laid out (hidden, or a DOM without layout).
            if (!container.getBoundingClientRect().height) return;
            const nodes = [...container.querySelectorAll('[data-timeline-node]')];
            container.querySelectorAll('[data-timeline-line]').forEach((line) => {
                const box = beforeBox(line);
                if (!box) return;
                const lineX = box.left + box.width / 2;
                const gaps = [];
                nodes.forEach((node) => {
                    if (!line.contains(node)) return;
                    const rect = nodeBox(node);
                    if (!rect || rect.width === 0 || lineX < rect.left || lineX > rect.right) return;
                    gaps.push([rect.top - box.top - NODE_GAP, rect.bottom - box.top + NODE_GAP]);
                });
                const mask = lineMask(gaps);
                if (mask) line.style.setProperty('--line-mask', mask);
                else line.style.removeProperty('--line-mask');
            });
        };

        let frame = null;
        const schedule = () => {
            if (frame !== null) return;
            frame = window.requestAnimationFrame(() => {
                frame = null;
                measure();
            });
        };

        measure();
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
        observer?.observe(container);
        document.fonts?.ready?.then(schedule);
        return () => {
            if (frame !== null) window.cancelAnimationFrame(frame);
            observer?.disconnect();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass what changes the layout
    }, deps);
}
