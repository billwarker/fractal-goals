import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const IGNORED_TARGETS = 'button, a, input, select, textarea, .fc-button, .fc-more-link, [data-program-block-label]';

function selectableCellDateAt(container, x, y) {
    const cells = container?.querySelectorAll('[data-program-selectable-date]') || [];
    for (const cell of cells) {
        const rect = cell.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            return cell.dataset.programSelectableDate;
        }
    }
    return null;
}

// Dragging within this many pixels of a scroll container's edge scrolls it.
const AUTO_SCROLL_EDGE = 48;
const AUTO_SCROLL_MAX_STEP = 24;

function autoScrollStep(rect, y) {
    if (y < rect.top + AUTO_SCROLL_EDGE) {
        return -Math.min(AUTO_SCROLL_MAX_STEP, Math.ceil((rect.top + AUTO_SCROLL_EDGE - y) / 3));
    }
    if (y > rect.bottom - AUTO_SCROLL_EDGE) {
        return Math.min(AUTO_SCROLL_MAX_STEP, Math.ceil((y - (rect.bottom - AUTO_SCROLL_EDGE)) / 3));
    }
    return 0;
}

function datesBetween(selectableDates, first, second) {
    const [start, end] = [first, second].sort();
    return selectableDates.filter((date) => date >= start && date <= end);
}

/**
 * Pointer-driven multi-day selection for calendar cells. A press-and-drag
 * selects every selectable date between the start and end cells (live preview,
 * including over event ribbons); a press without moving toggles one date.
 * Cells are located by coordinates, so gestures work across events and rows.
 * With `getScrollContainer`, dragging near its top or bottom edge auto-scrolls
 * it and keeps extending the selection under the pointer.
 */
export default function useCalendarDragSelection({
    enabled, containerRef, selectableDates, onToggleDate, onSelectRange, getScrollContainer = null,
}) {
    const [previewDates, setPreviewDates] = useState(() => new Set());
    const gestureRef = useRef(null);
    const autoScrollRef = useRef({ frame: null, x: 0, y: 0 });
    const selectableDatesRef = useRef(selectableDates);
    const getScrollContainerRef = useRef(getScrollContainer);
    useLayoutEffect(() => {
        selectableDatesRef.current = selectableDates;
        getScrollContainerRef.current = getScrollContainer;
    });

    const stopAutoScroll = useCallback(() => {
        if (autoScrollRef.current.frame !== null) cancelAnimationFrame(autoScrollRef.current.frame);
        autoScrollRef.current.frame = null;
    }, []);

    const extendGestureTo = useCallback((x, y) => {
        const gesture = gestureRef.current;
        if (!gesture) return;
        const date = selectableCellDateAt(containerRef.current, x, y);
        if (!date || date === gesture.current) return;
        gesture.current = date;
        gesture.moved = gesture.moved || date !== gesture.start;
        setPreviewDates(new Set(datesBetween(selectableDatesRef.current, gesture.start, date)));
    }, [containerRef]);

    const startAutoScroll = useCallback(() => {
        if (autoScrollRef.current.frame !== null) return;
        const tick = () => {
            const scroller = getScrollContainerRef.current?.();
            const { x, y } = autoScrollRef.current;
            autoScrollRef.current.frame = null;
            if (!scroller || !gestureRef.current) return;
            const rect = scroller.getBoundingClientRect();
            const step = autoScrollStep(rect, y);
            if (!step) return;
            scroller.scrollTop += step;
            // Hit-test just inside the edge so the row scrolling into view joins the range.
            extendGestureTo(x, Math.min(Math.max(y, rect.top + 1), rect.bottom - 1));
            autoScrollRef.current.frame = requestAnimationFrame(tick);
        };
        autoScrollRef.current.frame = requestAnimationFrame(tick);
    }, [extendGestureTo]);

    const reset = useCallback(() => {
        stopAutoScroll();
        gestureRef.current = null;
        setPreviewDates(new Set());
    }, [stopAutoScroll]);

    useEffect(() => stopAutoScroll, [stopAutoScroll]);

    const onPointerDown = useCallback((event) => {
        if (!enabled || event.button !== 0 || event.target?.closest?.(IGNORED_TARGETS)) return;
        const date = selectableCellDateAt(containerRef.current, event.clientX, event.clientY);
        if (!date) return;
        event.preventDefault();
        containerRef.current?.setPointerCapture?.(event.pointerId);
        gestureRef.current = { start: date, current: date, moved: false, pointerId: event.pointerId };
        setPreviewDates(new Set([date]));
    }, [containerRef, enabled]);

    const onPointerMove = useCallback((event) => {
        const gesture = gestureRef.current;
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        autoScrollRef.current.x = event.clientX;
        autoScrollRef.current.y = event.clientY;
        extendGestureTo(event.clientX, event.clientY);
        if (getScrollContainerRef.current) startAutoScroll();
    }, [extendGestureTo, startAutoScroll]);

    const onPointerUp = useCallback((event) => {
        const gesture = gestureRef.current;
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        containerRef.current?.releasePointerCapture?.(event.pointerId);
        reset();
        if (gesture.moved) {
            const dates = datesBetween(selectableDates, gesture.start, gesture.current);
            onSelectRange?.(dates, event);
        } else {
            onToggleDate?.(gesture.start, event);
        }
    }, [containerRef, onSelectRange, onToggleDate, reset, selectableDates]);

    return {
        previewDates,
        handlers: enabled ? {
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel: reset,
        } : {},
    };
}
