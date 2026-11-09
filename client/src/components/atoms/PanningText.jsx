import { useLayoutEffect, useRef } from 'react';
import styles from './PanningText.module.css';

/**
 * Text that fits stays still; text that overflows pans to its end and back, pausing on hover or focus.
 * With `panOnHover`, overflowing text instead stays at its start and pans only while hovered or focused.
 */
export default function PanningText({ children, className = '', textClassName = '', title, restartKey, panOnHover = false, ...textProps }) {
    const viewportRef = useRef(null);
    const textRef = useRef(null);

    useLayoutEffect(() => {
        const viewport = viewportRef.current;
        const text = textRef.current;
        const measure = () => {
            const distance = Math.max(0, text.scrollWidth - viewport.clientWidth);
            viewport.dataset.overflow = String(distance > 0);
            viewport.tabIndex = distance > 0 ? 0 : -1;
            viewport.style.setProperty('--pan-distance', `${-distance}px`);
            // Reserve time to read both ends, with a gentle speed for longer text.
            viewport.style.setProperty('--pan-duration', `${Math.max(8, distance / 14)}s`);
        };

        measure();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
        observer?.observe(viewport);
        observer?.observe(text);
        window.addEventListener('resize', measure);

        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [restartKey]);

    return (
        <div
            ref={viewportRef}
            className={`${styles.viewport} ${panOnHover ? styles.panOnHover : ''} ${className}`.replace(/\s+/g, ' ').trim()}
            title={title}
        >
            <span key={restartKey} ref={textRef} className={`${styles.text} ${textClassName}`.trim()} {...textProps}>
                {children}
            </span>
        </div>
    );
}
