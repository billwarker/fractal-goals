import { useState } from 'react';

const INTERACTIVE = 'input, select, textarea, button, a, label';

/**
 * Whether a click inside a planned item scopes back to the whole item: a click on the
 * item's own surface, not on a set or round row or on one of its controls.
 */
export function isItemSurfaceClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    return Boolean(target && !target.closest('[data-scope-row]') && !target.closest(INTERACTIVE));
}

/**
 * Whether focus should scope the item now. A button focused by the pointer waits for its
 * click: scoping reveals the item's composer and tag picker, and doing that between
 * mousedown and mouseup would move the button out from under the click.
 */
export function shouldScopeOnFocus(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.matches('button')) return true;
    try {
        return target.matches(':focus-visible');
    } catch {
        return false;
    }
}

/**
 * Click-to-scope for planned set and round rows, like set selection on the session page:
 * clicking a row selects it, clicking its label again goes back to the whole item, and
 * clicking into one of its inputs keeps it selected. Selection clears when the item is
 * deselected. `scope` ({ selectedIndex, onSelect }) lets the caller own the selection.
 */
export default function usePlanRowSelection(active, rowCount, scope = null) {
    const [ownIndex, setOwnIndex] = useState(null);
    const [wasActive, setWasActive] = useState(active);
    if (wasActive !== active) {
        // Deselecting the item drops its set scope, so reselecting starts from the whole item.
        setWasActive(active);
        if (!active) setOwnIndex(null);
    }
    const rawIndex = scope ? scope.selectedIndex : ownIndex;
    const setIndex = scope ? scope.onSelect : setOwnIndex;

    const current = active && rawIndex != null && rawIndex < rowCount ? rawIndex : null;
    const rowProps = (index) => ({
        'data-scope-row': '',
        'data-selected': current === index ? 'true' : undefined,
        onClick: (event) => {
            const target = event.target instanceof Element ? event.target : null;
            // The row's label button toggles; its value inputs only ever select.
            const keepsSelection = target && !target.closest('[data-scope-toggle]') && target.closest(INTERACTIVE);
            setIndex(keepsSelection || current !== index ? index : null);
        },
    });
    return { selectedIndex: current, clearSelection: () => setIndex(null), rowProps };
}
