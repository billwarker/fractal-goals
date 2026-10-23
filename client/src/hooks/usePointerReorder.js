import { useCallback, useRef, useState } from 'react';

/**
 * Drag-to-reorder for a vertical list, by pointer (mouse, pen or touch).
 *
 * Put `listRef` on the list, `getItemProps(index)` on each item and `getHandleProps(index)` on each
 * item's grip. A mouse can drag from anywhere on an item except its controls; touch drags from the
 * grip so the list still scrolls. Dropping calls `onMove(from, to)` when the position changed. While
 * dragging, `dragState` is `{ from, over }` so items can style the dragged row and the drop target.
 */
export default function usePointerReorder({ onMove, disabled = false }) {
    const listRef = useRef(null);
    const dragRef = useRef(null);
    const [dragState, setDragState] = useState(null);

    const indexAt = useCallback((clientY) => {
        const items = [...(listRef.current?.querySelectorAll('[data-reorder-item]') || [])];
        const index = items.findIndex((item) => {
            const rect = item.getBoundingClientRect();
            return clientY < rect.top + (rect.height / 2);
        });
        return index === -1 ? Math.max(items.length - 1, 0) : index;
    }, []);

    const finish = useCallback((commit) => {
        const drag = dragRef.current;
        dragRef.current = null;
        setDragState(null);
        if (commit && drag && drag.over !== drag.from) onMove(drag.from, drag.over);
    }, [onMove]);

    const start = useCallback((event, index) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        dragRef.current = { from: index, over: index };
        setDragState(dragRef.current);
    }, []);

    const track = useCallback((event) => {
        if (!dragRef.current) return;
        const over = indexAt(event.clientY);
        if (over === dragRef.current.over) return;
        dragRef.current = { ...dragRef.current, over };
        setDragState(dragRef.current);
    }, [indexAt]);

    const pointerHandlers = useCallback((index, canStart) => ({
        onPointerDown: (event) => {
            if (disabled || event.button > 0 || dragRef.current || !canStart(event)) return;
            start(event, index);
        },
        onPointerMove: track,
        onPointerUp: () => finish(true),
        onPointerCancel: () => finish(false),
    }), [disabled, finish, start, track]);

    const getHandleProps = useCallback((index) => ({
        'data-reorder-handle': true,
        style: { touchAction: 'none', cursor: disabled ? 'default' : 'grab' },
        ...pointerHandlers(index, () => true),
    }), [disabled, pointerHandlers]);

    const getItemProps = useCallback((index) => ({
        'data-reorder-item': true,
        ...pointerHandlers(index, (event) => (
            event.pointerType === 'mouse' && !event.target.closest('button, a, input, select, textarea, [data-reorder-handle]')
        )),
        'data-dragging': dragState?.from === index ? 'true' : undefined,
        // Shows where the dragged item will land: above this item when moving up, below when moving down.
        'data-drop': dragState && dragState.over === index && dragState.from !== index
            ? (dragState.from > index ? 'before' : 'after')
            : undefined,
    }), [dragState, pointerHandlers]);

    return { listRef, getHandleProps, getItemProps, dragState };
}
