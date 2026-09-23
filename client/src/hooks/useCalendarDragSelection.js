import { useCallback, useRef, useState } from 'react';

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

function datesBetween(selectableDates, first, second) {
    const [start, end] = [first, second].sort();
    return selectableDates.filter((date) => date >= start && date <= end);
}

/**
 * Pointer-driven multi-day selection for calendar cells. A press-and-drag
 * selects every selectable date between the start and end cells (live preview,
 * including over event ribbons); a press without moving toggles one date.
 * Cells are located by coordinates, so gestures work across events and rows.
 */
export default function useCalendarDragSelection({
    enabled, containerRef, selectableDates, onToggleDate, onSelectRange,
}) {
    const [previewDates, setPreviewDates] = useState(() => new Set());
    const gestureRef = useRef(null);

    const reset = useCallback(() => {
        gestureRef.current = null;
        setPreviewDates(new Set());
    }, []);

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
        const date = selectableCellDateAt(containerRef.current, event.clientX, event.clientY);
        if (!date || date === gesture.current) return;
        gesture.current = date;
        gesture.moved = gesture.moved || date !== gesture.start;
        setPreviewDates(new Set(datesBetween(selectableDates, gesture.start, date)));
    }, [containerRef, selectableDates]);

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
