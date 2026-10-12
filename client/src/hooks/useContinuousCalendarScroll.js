import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
    canScrollWithin,
    getContinuousWindow,
    getWeekRowMonth,
} from '../utils/programCalendarContinuous';

// A row counts as "in view" once this much of it is below the scroller's top edge.
const TITLE_ROW_THRESHOLD = 24;
const MAX_READY_FRAMES = 30;
// Trailing delay before a scrolled viewport range is reported for data loading.
const VISIBLE_RANGE_SETTLE_MS = 120;

function prefersReducedMotion() {
    return typeof window !== 'undefined'
        && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

/** Run `callback(el)` once FullCalendar has rendered the element `find` looks for. */
function whenRendered(find, callback) {
    let frames = 0;
    let handle = null;
    const attempt = () => {
        const el = find();
        if (el) {
            callback(el);
            return;
        }
        frames += 1;
        if (frames < MAX_READY_FRAMES) handle = requestAnimationFrame(attempt);
    };
    attempt();
    return () => { if (handle !== null) cancelAnimationFrame(handle); };
}

const rowDates = (row) => [...(row?.querySelectorAll('.fc-daygrid-day[data-date]') || [])]
    .map((cell) => cell.getAttribute('data-date'));

/**
 * Month tracking, scrolling, and visible-range reporting for the program calendar.
 *
 * Month mode reads the visible month from FullCalendar (via `setVisibleMonth`);
 * continuous mode shows a year-long window centred on `initialDateStr`, follows the
 * week row at the top of the scroller for its title, and reports the rows on
 * screen for data loading. Navigation beyond the window re-centres (remounts) it.
 */
export default function useContinuousCalendarScroll({
    continuous,
    initialDateStr,
    containerRef,
    onVisibleMonthChange,
    onVisibleRangeChange,
}) {
    // `YYYY-MM-01` of the month in view.
    const [visibleMonth, setVisibleMonth] = useState(() => `${initialDateStr.slice(0, 7)}-01`);
    const [windowAnchor, setWindowAnchor] = useState(() => initialDateStr);
    const pendingScrollRef = useRef(continuous ? { date: initialDateStr, smooth: false } : null);
    const continuousWindow = useMemo(
        () => (continuous ? getContinuousWindow(windowAnchor) : null),
        [continuous, windowAnchor],
    );
    const calendarKey = continuousWindow ? `continuous:${continuousWindow.start}:${continuousWindow.weeks}` : 'month';

    const getScroller = useCallback(() => {
        const dayGrid = containerRef.current?.querySelector('.fc-daygrid-body');
        return dayGrid?.closest('.fc-scroller')
            || containerRef.current?.querySelector('.fc-scrollgrid-section-body .fc-scroller')
            || null;
    }, [containerRef]);

    const onVisibleRangeChangeRef = useRef(onVisibleRangeChange);
    useLayoutEffect(() => {
        onVisibleRangeChangeRef.current = onVisibleRangeChange;
    }, [onVisibleRangeChange]);
    const reportedRangeRef = useRef('');
    const reportVisibleRange = useCallback((range) => {
        const key = range ? `${range.start}:${range.end}` : '';
        if (!range || key === reportedRangeRef.current) return;
        reportedRangeRef.current = key;
        onVisibleRangeChangeRef.current?.(range);
    }, []);

    const scrollToDate = useCallback((dateStr, { smooth = true } = {}) => {
        const row = containerRef.current
            ?.querySelector(`.fc-daygrid-day[data-date="${dateStr}"]`)
            ?.closest('tr');
        const scroller = row?.closest('.fc-scroller') || getScroller();
        if (!scroller || !row) return false;
        const top = scroller.scrollTop + row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        if (typeof scroller.scrollTo === 'function') {
            scroller.scrollTo({ top, behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' });
        } else {
            scroller.scrollTop = top;
        }
        return true;
    }, [containerRef, getScroller]);

    /** Scroll to a date, re-centring (and remounting) the window when it cannot reach it. */
    const navigateTo = (dateStr) => {
        if (canScrollWithin(dateStr, continuousWindow)) {
            scrollToDate(dateStr);
            return;
        }
        pendingScrollRef.current = { date: dateStr, smooth: false };
        setWindowAnchor(dateStr);
    };

    /** Re-centre on the initial date, e.g. when continuous mode is switched on. */
    const recenter = () => {
        pendingScrollRef.current = { date: initialDateStr, smooth: false };
        setWindowAnchor(initialDateStr);
    };

    /** After FullCalendar sets new dates, finish a scroll that was waiting for the grid. */
    const flushPendingScroll = () => {
        const pending = pendingScrollRef.current;
        if (!continuous || !pending) return;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (pendingScrollRef.current !== pending) return;
            if (scrollToDate(pending.date, { smooth: pending.smooth })) pendingScrollRef.current = null;
        }));
    };

    useEffect(() => {
        if (!continuous) return undefined;
        let scroller = null;
        let frame = null;
        let initialScrollFrame = null;
        let settleTimer = null;
        const syncTitle = () => {
            frame = null;
            if (!scroller) return;
            const bounds = scroller.getBoundingClientRect();
            const top = bounds.top + TITLE_ROW_THRESHOLD;
            const rows = [...scroller.querySelectorAll('.fc-daygrid-body tr')];
            const row = rows.find((candidate) => candidate.getBoundingClientRect().bottom > top);
            const month = getWeekRowMonth(rowDates(row));
            if (month) {
                setVisibleMonth((current) => (current === month ? current : month));
                onVisibleMonthChange?.(month);
            }
            const visibleRows = rows.filter((candidate) => {
                const rect = candidate.getBoundingClientRect();
                return rect.bottom > bounds.top && rect.top < bounds.bottom;
            });
            const firstDates = rowDates(visibleRows[0]).sort();
            const lastDates = rowDates(visibleRows[visibleRows.length - 1]).sort();
            if (firstDates.length && lastDates.length) {
                const range = { start: firstDates[0], end: lastDates[lastDates.length - 1] };
                if (settleTimer !== null) window.clearTimeout(settleTimer);
                settleTimer = window.setTimeout(() => {
                    settleTimer = null;
                    reportVisibleRange(range);
                }, reportedRangeRef.current ? VISIBLE_RANGE_SETTLE_MS : 0);
            }
        };
        const onScroll = () => {
            if (frame === null) frame = requestAnimationFrame(syncTitle);
        };
        const findReadyScroller = () => {
            const el = getScroller();
            const pendingDate = pendingScrollRef.current?.date;
            if (!el || (pendingDate && !containerRef.current?.querySelector(
                `.fc-daygrid-day[data-date="${pendingDate}"]`,
            ))) return null;
            return el;
        };
        const cancelReady = whenRendered(findReadyScroller, (el) => {
            scroller = el;
            const pending = pendingScrollRef.current;
            scroller.addEventListener('scroll', onScroll, { passive: true });
            if (pending) {
                // Anchor to the actual scroller containing the target row after
                // FullCalendar finishes laying out the complete week grid.
                initialScrollFrame = requestAnimationFrame(() => {
                    initialScrollFrame = requestAnimationFrame(() => {
                        initialScrollFrame = null;
                        if (scrollToDate(pending.date, { smooth: pending.smooth })) {
                            pendingScrollRef.current = null;
                        }
                        syncTitle();
                    });
                });
            } else {
                syncTitle();
            }
        });
        return () => {
            cancelReady();
            if (frame !== null) cancelAnimationFrame(frame);
            if (initialScrollFrame !== null) cancelAnimationFrame(initialScrollFrame);
            if (settleTimer !== null) window.clearTimeout(settleTimer);
            scroller?.removeEventListener('scroll', onScroll);
        };
    }, [calendarKey, containerRef, continuous, getScroller, onVisibleMonthChange, reportVisibleRange, scrollToDate]);

    return {
        visibleMonth,
        setVisibleMonth,
        continuousWindow,
        calendarKey,
        getScroller,
        navigateTo,
        recenter,
        flushPendingScroll,
        reportVisibleRange,
    };
}
