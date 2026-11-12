import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './Spotlight.module.css';

const FIND_INTERVAL_MS = 150;
const FIND_TIMEOUT_MS = 10000;
const PADDING = 6;

// Measures the visible part of `element` (pages lazy-load, then lay out and scroll).
function visibleRect(element) {
    const rect = element.getBoundingClientRect();
    const top = Math.max(rect.top, 0);
    const left = Math.max(rect.left, 0);
    const bottom = Math.min(rect.bottom, window.innerHeight);
    const right = Math.min(rect.right, window.innerWidth);
    if (bottom <= top || right <= left) return null;
    return { top: top - PADDING, left: left - PADDING, width: right - left + PADDING * 2, height: bottom - top + PADDING * 2 };
}

/**
 * Rings the element matching `selector` and dims the rest. It never blocks the page:
 * clicks pass through, so visitors can use what they're shown. Hidden from assistive tech;
 * the guide announces each step.
 */
export default function Spotlight({ selector, active }) {
    // Keyed by selector so a new step never flashes the previous step's ring.
    const [measured, setMeasured] = useState({ selector: null, rect: null });

    useEffect(() => {
        if (!active || !selector) return undefined;
        let element = null;
        let observer = null;
        let frame = null;
        const measure = () => {
            frame = null;
            setMeasured({ selector, rect: element && element.isConnected ? visibleRect(element) : null });
        };
        const schedule = () => {
            if (frame === null) frame = window.requestAnimationFrame(measure);
        };
        const startedAt = Date.now();
        const finder = window.setInterval(() => {
            element = document.querySelector(selector);
            if (!element && Date.now() - startedAt < FIND_TIMEOUT_MS) return;
            window.clearInterval(finder);
            if (!element) return;
            if (typeof ResizeObserver === 'function') {
                observer = new ResizeObserver(schedule);
                observer.observe(element);
            }
            schedule();
        }, FIND_INTERVAL_MS);
        window.addEventListener('resize', schedule);
        window.addEventListener('scroll', schedule, true);
        return () => {
            window.clearInterval(finder);
            observer?.disconnect();
            if (frame !== null) window.cancelAnimationFrame(frame);
            window.removeEventListener('resize', schedule);
            window.removeEventListener('scroll', schedule, true);
        };
    }, [active, selector]);

    const rect = measured.selector === selector ? measured.rect : null;
    if (!active || !rect) return null;
    return createPortal(
        <div
            className={styles.ring}
            style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
            aria-hidden="true"
            data-testid="demo-spotlight"
        />,
        document.body,
    );
}
