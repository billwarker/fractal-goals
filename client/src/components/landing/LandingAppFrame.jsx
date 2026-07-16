import React, { useEffect, useRef, useState } from 'react';
import styles from './LandingAppFrame.module.css';

/**
 * "App window" preview frame for compact landing viewports: renders the real
 * desktop feature surfaces at their natural width, scaled down to fit the
 * phone column instead of reflowing (and breaking) at ~390px. The scaled copy
 * is inert; interaction happens in the full-screen takeover the optional
 * expand button opens.
 */
export default function LandingAppFrame({
    designWidth = 1024,
    label = 'my.fractalgoals.com',
    expandLabel = 'View full screen',
    onExpand,
    chromeless = false,
    className = '',
    children,
}) {
    const clipRef = useRef(null);
    const contentRef = useRef(null);
    const [scale, setScale] = useState(null);
    const [contentHeight, setContentHeight] = useState(0);

    useEffect(() => {
        const clip = clipRef.current;
        const content = contentRef.current;
        if (!clip || !content) return undefined;
        // `inert` (not just pointer-events) keeps the scaled duplicate's
        // controls out of the tab order and accessibility tree.
        content.setAttribute('inert', '');

        const measure = () => {
            const width = clip.clientWidth;
            setScale(width > 0 ? Math.min(1, width / designWidth) : 1);
            setContentHeight(content.offsetHeight);
        };
        measure();
        if (typeof window.ResizeObserver !== 'function') return undefined;
        // Transforms do not affect layout size, so observing the unscaled
        // content cannot feed back into this measurement.
        const observer = new window.ResizeObserver(measure);
        observer.observe(clip);
        observer.observe(content);
        return () => observer.disconnect();
    }, [designWidth]);

    return (
        <div className={`${styles.frame} ${chromeless ? styles.chromelessFrame : ''} ${className}`.trim()}>
            {!chromeless && (
                <div className={styles.chrome} aria-hidden="true">
                    <span className={styles.chromeDots}>
                        <span />
                        <span />
                        <span />
                    </span>
                    {label && <span className={styles.chromeLabel}>{label}</span>}
                </div>
            )}
            <div
                ref={clipRef}
                className={styles.stageClip}
                style={scale !== null && contentHeight > 0
                    ? { height: Math.ceil(contentHeight * scale) }
                    : undefined}
            >
                <div
                    ref={contentRef}
                    className={styles.stageContent}
                    style={{ width: designWidth, transform: scale !== null ? `scale(${scale})` : undefined }}
                    aria-hidden="true"
                >
                    {children}
                </div>
            </div>
            {onExpand && (
                <button type="button" className={styles.expandButton} onClick={onExpand}>
                    <span aria-hidden="true" className={styles.expandGlyph}>⛶</span>
                    {expandLabel}
                </button>
            )}
        </div>
    );
}
