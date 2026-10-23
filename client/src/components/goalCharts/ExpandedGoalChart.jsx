import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chart as ChartJS } from 'chart.js';

import Button from '../atoms/Button';
import ChevronIcon from '../atoms/ChevronIcon';
import IconButton from '../atoms/IconButton';
import pageGridSnap from '../analytics/pageGridSnap';
import { useGoalCharts } from '../../hooks/useGoalCharts';
import { chartKeyHandler } from './GoalChartControls';
import GoalChartView from './GoalChartView';
import { buildGoalChartItems } from './goalChartItems';
import useGoalChartCursor from './useGoalChartCursor';
import styles from './GoalCharts.module.css';

// Expanded charts snap to the page grid (see applyChartDensity's 'expanded').
ChartJS.register(pageGridSnap);

/**
 * A goal's chart at full detail, in place of the flow tree, filling its panel and drawn on the
 * page's background grid (no gridlines of its own). Its controls stay in goal details; on
 * mobile, where the details step aside, it keeps a pager and "Back to goal". Escape closes it.
 */
export default function ExpandedGoalChart({
    rootId, goal, goalId, goalName, initialKey = null, onClose, isMobile = false, isLeaving = false,
}) {
    const rootRef = useRef(null);
    // Fades in after mounting (and out while leaving), like the flow tree.
    const [isShown, setIsShown] = useState(false);
    useEffect(() => {
        const frame = requestAnimationFrame(() => setIsShown(true));
        return () => cancelAnimationFrame(frame);
    }, []);
    const { data } = useGoalCharts(rootId, goalId);
    const items = useMemo(() => buildGoalChartItems(data, goal), [data, goal]);
    // With its last chart removed, the goal has nothing to show here: back to the tree.
    const hasNoCharts = Boolean(data) && items.length === 0;
    useEffect(() => {
        if (hasNoCharts) onClose();
    }, [hasNoCharts, onClose]);
    const cursor = useGoalChartCursor(goalId, items, initialKey);

    useEffect(() => {
        rootRef.current?.focus({ preventScroll: true });
        const closeOnEscape = (event) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return;
            if (event.target.closest?.('[role="dialog"], [role="menu"]')) return;
            onClose();
        };
        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, [onClose]);

    return (
        <section
            ref={rootRef}
            className={styles.expanded}
            aria-label={`${goalName || 'Goal'} chart`}
            tabIndex={-1}
            onKeyDown={chartKeyHandler(cursor)}
            data-testid="expanded-goal-chart"
            data-visible={isShown && !isLeaving}
        >
            <div className={styles.expandedHeader}>
                <div className={styles.expandedTitles}>
                    <h2 className={styles.expandedChartName} title={cursor.item?.name}>{cursor.item?.name}</h2>
                </div>
                {isMobile ? (
                    <div className={styles.pager}>
                        {items.length > 1 ? (
                            <>
                                <IconButton size="sm" aria-label="Previous chart" onClick={cursor.previous}>
                                    <ChevronIcon direction="left" size={14} />
                                </IconButton>
                                <span className={styles.count}>{cursor.index + 1} of {items.length}</span>
                                <IconButton size="sm" aria-label="Next chart" onClick={cursor.next}>
                                    <ChevronIcon direction="right" size={14} />
                                </IconButton>
                            </>
                        ) : null}
                        <Button variant="ghost" size="sm" onClick={onClose}>Back to goal</Button>
                    </div>
                ) : null}
            </div>
            <div className={styles.expandedChart}>
                <GoalChartView key={cursor.item?.key} rootId={rootId} goalId={goalId} item={cursor.item} density="expanded" />
            </div>
        </section>
    );
}
