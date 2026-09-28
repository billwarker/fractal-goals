import { useLayoutEffect } from 'react';

import { pairAlignmentKeys } from '../utils/programDaysView';

const ALIGN_ATTRIBUTE = 'data-align-key';
const COLUMN_SELECTOR = '[data-align-column]';

function alignColumns(container) {
    const rows = container.querySelectorAll(`[${ALIGN_ATTRIBUTE}]`);
    rows.forEach((row) => { row.style.marginTop = ''; });
    const columns = [...container.querySelectorAll(COLUMN_SELECTOR)];
    if (columns.length !== 2) return;
    const [leftColumn, rightColumn] = columns.map((column) => column.getBoundingClientRect());
    // Stacked (narrow) layouts have nothing to line up.
    if (Math.abs(leftColumn.top - rightColumn.top) > 1 || leftColumn.left === rightColumn.left) return;

    const [left, right] = columns.map((column) => [...column.querySelectorAll(`[${ALIGN_ATTRIBUTE}]`)]);
    const pairs = pairAlignmentKeys(
        left.map((row) => row.getAttribute(ALIGN_ATTRIBUTE)),
        right.map((row) => row.getAttribute(ALIGN_ATTRIBUTE)),
    );
    // In document order: each adjustment moves everything after it, so measure as we go.
    pairs.forEach(([leftIndex, rightIndex]) => {
        const a = left[leftIndex];
        const b = right[rightIndex];
        const delta = a.getBoundingClientRect().top - b.getBoundingClientRect().top;
        if (Math.abs(delta) < 1) return;
        const lower = delta > 0 ? b : a;
        const current = parseFloat(lower.style.marginTop) || 0;
        lower.style.marginTop = `${current + Math.abs(delta)}px`;
    });
}

/**
 * Lines up matching rows (same `data-align-key`) of two side-by-side `data-align-column`
 * children of `containerRef`, by adding top spacing to whichever row sits higher. Re-runs
 * whenever either column changes size, e.g. when plans load or are edited.
 */
export default function useAlignedColumns(containerRef, deps = []) {
    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container || typeof ResizeObserver === 'undefined') return undefined;
        let frame = null;
        const schedule = () => {
            if (frame !== null) return;
            frame = window.requestAnimationFrame(() => {
                frame = null;
                alignColumns(container);
            });
        };
        const observer = new ResizeObserver(schedule);
        observer.observe(container);
        container.querySelectorAll(COLUMN_SELECTOR).forEach((column) => observer.observe(column));
        // Rows mount after their plans load; watch for them too.
        const mutations = new MutationObserver(schedule);
        mutations.observe(container, { childList: true, subtree: true });
        schedule();
        return () => {
            observer.disconnect();
            mutations.disconnect();
            if (frame !== null) window.cancelAnimationFrame(frame);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}
