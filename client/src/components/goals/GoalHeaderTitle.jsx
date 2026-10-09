import { useLayoutEffect, useRef } from 'react';
import styles from './GoalHeader.module.css';

/** One copy of the full name stays accessible while its visual pans within the header. */
export default function GoalHeaderTitle({ name }) {
    const viewportRef = useRef(null);
    const textRef = useRef(null);

    useLayoutEffect(() => {
        const viewport = viewportRef.current;
        const text = textRef.current;
        const measure = () => {
            const distance = Math.max(0, text.scrollWidth - viewport.clientWidth);
            viewport.dataset.overflow = String(distance > 0);
            viewport.tabIndex = distance > 0 ? 0 : -1;
            viewport.style.setProperty('--goal-title-pan-distance', `${-distance}px`);
            // Reserve time to read both ends, with a gentle speed for longer names.
            viewport.style.setProperty('--goal-title-pan-duration', `${Math.max(8, distance / 14)}s`);
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
    }, [name]);

    return (
        <div ref={viewportRef} className={styles.title} title={name}>
            <span key={name} ref={textRef} className={styles.titleText}>{name}</span>
        </div>
    );
}
