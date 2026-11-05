import React from 'react';

import IconButton from '../../atoms/IconButton';
import styles from './Annotation.module.css';

// By axis end: the button that extends it, and the one pulling it back, whose arrow points inward.
const LABELS = {
    'y-high': { extend: ['Y↑', 'Extend vertical axis up'], shrink: ['Y↓', 'Pull top of vertical axis back down'] },
    'y-low': { extend: ['Y↓', 'Extend vertical axis down'], shrink: ['Y↑', 'Pull bottom of vertical axis back up'] },
    'x-high': { extend: ['X→', 'Extend horizontal axis right'], shrink: ['X←', 'Pull right of horizontal axis back left'] },
    'x-low': { extend: ['X←', 'Extend horizontal axis left'], shrink: ['X→', 'Pull left of horizontal axis back right'] },
};

// Below this the controls would hide the data, so they sit in a row above the plot, over the chart's title.
const MIN_PLOT_WIDTH = 360;
const MIN_PLOT_HEIGHT = 240;

/**
 * Set goal mode's controls for more room on the chart, in the plot's corners by the axis ends they
 * extend. An end that's been extended also offers a dashed button pulling it back, its arrow
 * pointing inward. `data-chart-goal-menu` keeps a click here from pinning a goal.
 *
 * @param {{ controls: { ends: any, offset: { left: number, top: number },
 *   area: { left: number, right: number, top: number, bottom: number }, shrinkable: any } | null,
 *   onExtend: (axis: 'x' | 'y', end: 'low' | 'high') => void, onShrink: (axis: 'x' | 'y', end: 'low' | 'high') => void,
 *   onPointerEnter: () => void }} props
 */
export default function AxisExtendButtons({ controls, onExtend, onShrink, onPointerEnter }) {
    if (!controls) return null;
    const { ends, shrinkable, offset, area } = controls;
    const control = (axis, end, kind, available, onClick, className) => {
        if (!available) return null;
        const [text, label] = LABELS[`${axis}-${end}`][kind];
        return (
            <IconButton
                className={className}
                size="sm"
                variant="secondary"
                aria-label={label}
                title={label}
                onClick={() => onClick(axis, end)}
            >
                {text}
            </IconButton>
        );
    };
    const extendButton = (axis, end) => control(axis, end, 'extend', ends[axis][end], onExtend, styles.extend);
    const shrinkButton = (axis, end) => control(axis, end, 'shrink', shrinkable[axis][end], onShrink, `${styles.extend} ${styles.extendBack}`);
    const available = (axis, end) => ends[axis][end] || shrinkable[axis][end];
    const left = offset.left + area.left;
    const right = offset.left + area.right;
    const top = offset.top + area.top;
    const bottom = offset.top + area.bottom;
    const corner = (style, children, className = '') => (
        <div
            className={`${styles.extendCorner} ${className}`.trim()}
            style={style}
            data-chart-goal-menu
            onPointerEnter={onPointerEnter}
            // Not a point on the chart: no crosshair under the controls.
            onPointerMove={(event) => event.stopPropagation()}
        >
            {children}
        </div>
    );
    if (area.right - area.left < MIN_PLOT_WIDTH || area.bottom - area.top < MIN_PLOT_HEIGHT) {
        return (
            <div className={styles.overlay} role="group" aria-label="Extend chart axes">
                {corner({ right: 0, top: 0 }, (
                    <>
                        {extendButton('y', 'high')}{shrinkButton('y', 'high')}
                        {extendButton('y', 'low')}{shrinkButton('y', 'low')}
                        {extendButton('x', 'low')}{shrinkButton('x', 'low')}
                        {shrinkButton('x', 'high')}{extendButton('x', 'high')}
                    </>
                ), styles.extendRow)}
            </div>
        );
    }
    return (
        <div className={styles.overlay} role="group" aria-label="Extend chart axes">
            {available('y', 'high') ? corner({ left, top }, <>{extendButton('y', 'high')}{shrinkButton('y', 'high')}</>) : null}
            {available('y', 'low') || available('x', 'low') ? corner({ left, top: bottom, transform: 'translateY(-100%)' }, (
                <>{extendButton('y', 'low')}{shrinkButton('y', 'low')}{extendButton('x', 'low')}{shrinkButton('x', 'low')}</>
            )) : null}
            {available('x', 'high') ? corner({ left: right, top: bottom, transform: 'translate(-100%, -100%)' }, (
                <>{shrinkButton('x', 'high')}{extendButton('x', 'high')}</>
            )) : null}
        </div>
    );
}

