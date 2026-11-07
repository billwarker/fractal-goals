import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chart as ChartJS } from 'chart.js';

import SetGoalButton from './annotate/SetGoalButton';
import axisExtension from './axisExtension';
import pageGridSnap from './pageGridSnap';
import styles from './ExpandedChartFrame.module.css';

// Expanded charts snap to the page grid (see applyChartDensity's 'expanded').
ChartJS.register(pageGridSnap, axisExtension);

/**
 * One chart at full detail, in place of a page's main content and drawn on its background grid:
 * Session Detail's Progress chart and a goal's attached charts. Fades in after mounting and out
 * while leaving. Escape closes it, leaving annotate mode first. `setGoal` is the Set goal toggle
 * ({ annotating, onToggle }) for a chart that can set one.
 */
export default function ExpandedChartFrame({
    ariaLabel, testId, title, titleDetail = null, titleHint, subtitle = null, setGoal = null, analyticsHref = null,
    actions = null, onClose, isLeaving = false, chartVisible = true, className = '', onKeyDown, children,
}) {
    const rootRef = useRef(null);
    const [isShown, setIsShown] = useState(false);
    useEffect(() => {
        const frame = requestAnimationFrame(() => setIsShown(true));
        return () => cancelAnimationFrame(frame);
    }, []);

    const isAnnotating = Boolean(setGoal?.annotating);
    const isAnnotatingRef = useRef(isAnnotating);
    useEffect(() => {
        isAnnotatingRef.current = isAnnotating;
    }, [isAnnotating]);

    useEffect(() => {
        rootRef.current?.focus({ preventScroll: true });
        const closeOnEscape = (event) => {
            if (event.key !== 'Escape' || event.defaultPrevented || isAnnotatingRef.current) return;
            if (event.target.closest?.('[role="dialog"], [role="menu"]')) return;
            onClose();
        };
        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, [onClose]);

    return (
        <section
            ref={rootRef}
            className={`${styles.expanded} ${className}`.trim()}
            aria-label={ariaLabel}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            data-testid={testId}
            data-visible={isShown && !isLeaving}
        >
            <div className={styles.header}>
                <div className={styles.titles}>
                    <h2 className={styles.title} title={titleHint}>
                        {title}
                        {titleDetail ? <span className={styles.titleDetail}> · {titleDetail}</span> : null}
                    </h2>
                    {subtitle}
                </div>
                <div className={styles.actions}>
                    {setGoal ? <SetGoalButton annotating={setGoal.annotating} onToggle={setGoal.onToggle} /> : null}
                    {analyticsHref ? <Link className={styles.analyticsLink} to={analyticsHref}>Open in Analytics</Link> : null}
                    {actions}
                </div>
            </div>
            <div className={styles.chart} data-visible={chartVisible}>
                {children}
            </div>
        </section>
    );
}
