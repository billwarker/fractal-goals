import React, { useRef } from 'react';

import styles from './SheetHandle.module.css';

const DISMISS_SHARE = 0.25;
const FLICK_SPEED = 0.5; // px/ms
const FLICK_MIN_DISTANCE = 24;
const SLIDE_MS = 200;
const SLIDE_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';

/** A drag down closes the sheet once it's gone a quarter of the way, or at any flick. */
export function dragDismisses({ distance, speed, sheetHeight }) {
    return distance >= sheetHeight * DISMISS_SHARE || (speed >= FLICK_SPEED && distance >= FLICK_MIN_DISTANCE);
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

/**
 * The bar at the top of a mobile bottom sheet: drag it down to close the sheet. The sheet follows
 * the pointer and slides back if let go early. Keyboard and screen reader users close the sheet
 * with its own close button, so the bar stays out of the tab order.
 *
 * @param {{ onDismiss: () => void }} props
 */
export default function SheetHandle({ onDismiss }) {
    const drag = useRef(null);

    const onPointerDown = (event) => {
        if (event.button !== 0) return;
        const sheet = event.currentTarget.closest('.mobile-sheet-enter');
        if (!sheet) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        sheet.style.transition = 'none';
        drag.current = { sheet, startY: event.clientY, lastY: event.clientY, lastTime: event.timeStamp, speed: 0 };
    };

    const onPointerMove = (event) => {
        const state = drag.current;
        if (!state) return;
        const elapsed = event.timeStamp - state.lastTime;
        if (elapsed > 0) state.speed = (event.clientY - state.lastY) / elapsed;
        state.lastY = event.clientY;
        state.lastTime = event.timeStamp;
        state.sheet.style.transform = `translateY(${Math.max(0, event.clientY - state.startY)}px)`;
    };

    const slideTo = (sheet, transform, onDone) => {
        sheet.style.transition = `transform ${SLIDE_MS}ms ${SLIDE_EASING}`;
        sheet.style.transform = transform;
        window.setTimeout(() => {
            sheet.style.transition = '';
            onDone?.();
        }, SLIDE_MS);
    };

    const finish = (event, cancelled = false) => {
        const state = drag.current;
        if (!state) return;
        drag.current = null;
        const { sheet, startY, speed } = state;
        const distance = Math.max(0, event.clientY - startY);
        if (cancelled || !dragDismisses({ distance, speed, sheetHeight: sheet.offsetHeight })) {
            slideTo(sheet, '');
        } else if (reducedMotion()) {
            onDismiss();
        } else {
            slideTo(sheet, 'translateY(100%)', onDismiss);
        }
    };

    return (
        <div
            className={styles.handle}
            data-sheet-handle
            aria-hidden="true"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(event) => finish(event)}
            onPointerCancel={(event) => finish(event, true)}
            // Not a tap on the backdrop, when the pointer is let go over it.
            onClick={(event) => event.stopPropagation()}
        />
    );
}
