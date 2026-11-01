import React from 'react';

import styles from './Annotation.module.css';

/**
 * The annotate-mode crosshair: guide lines through the snapped values inside the chart area, the
 * values in badges on each axis, and a readout of the goal the point would set.
 *
 * @param {{ hover: { target: any, offset: { left: number, top: number },
 *   area: { left: number, right: number, top: number, bottom: number }, pointer: { x: number, y: number } } | null }} props
 */
export default function AnnotationCrosshair({ hover }) {
    if (!hover) return null;
    const { target, offset, area, pointer } = hover;
    const { x, y } = target.guides || {};
    const left = (value) => offset.left + value;
    const top = (value) => offset.top + value;
    return (
        <div className={styles.overlay} aria-hidden="true">
            {x ? (
                <>
                    <span className={styles.vLine} style={{ left: left(x.pixel), top: top(area.top), height: area.bottom - area.top }} />
                    <span className={`${styles.axisValue} ${styles.xValue}`} style={{ left: left(x.pixel), top: top(area.bottom) }}>{x.label}</span>
                </>
            ) : null}
            {y ? (
                <>
                    <span className={styles.hLine} style={{ top: top(y.pixel), left: left(area.left), width: area.right - area.left }} />
                    <span className={`${styles.axisValue} ${styles.yValue}`} style={{ top: top(y.pixel), left: left(area.left) }}>{y.label}</span>
                </>
            ) : null}
            <div
                className={styles.readout}
                style={{ left: left(Math.min(pointer.x + 14, area.right - 220)), top: top(Math.max(area.top, pointer.y - 56)) }}
            >
                {target.unsupported ? <span className={styles.muted}>{target.unsupported}</span> : (
                    <>
                        <strong>{target.summary}</strong>
                        <span className={styles.muted}>Click to set a goal here</span>
                    </>
                )}
            </div>
        </div>
    );
}
