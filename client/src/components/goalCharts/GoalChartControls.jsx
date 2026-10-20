import React from 'react';

import Button from '../atoms/Button';
import ChevronIcon from '../atoms/ChevronIcon';
import IconButton from '../atoms/IconButton';
import { useGoalChartMutations } from '../../hooks/useGoalCharts';
import AddGoalChartMenu from './AddGoalChartMenu';
import styles from './GoalCharts.module.css';

/**
 * The "Analytics" header over a goal's chart: "n of m" with cycling, and the chart actions. The
 * chart's own name goes on its own line under it (see GoalChartsCarousel).
 */
export default function GoalChartControls({
    rootId, goalId, items, cursor, onExpand = null, onCollapse = null, portalTarget = null,
}) {
    const { detach, isSaving } = useGoalChartMutations(rootId, goalId);
    const { item, index } = cursor;
    const attachedIds = new Set(items.filter((entry) => entry.kind === 'view').map((entry) => entry.dashboardId));

    return (
        <div className={styles.header}>
            <span className={styles.heading}>Analytics</span>
            {items.length > 1 ? (
                <div className={styles.pager}>
                    <IconButton size="sm" aria-label="Previous chart" onClick={cursor.previous}>
                        <ChevronIcon direction="left" size={14} />
                    </IconButton>
                    <span className={styles.count}>{index + 1} of {items.length}</span>
                    <IconButton size="sm" aria-label="Next chart" onClick={cursor.next}>
                        <ChevronIcon direction="right" size={14} />
                    </IconButton>
                </div>
            ) : null}
            <div className={styles.actions}>
                <AddGoalChartMenu
                    rootId={rootId}
                    goalId={goalId}
                    attachedIds={attachedIds}
                    onAdded={cursor.select}
                    portalTarget={portalTarget}
                />
                {onCollapse ? <Button variant="ghost" size="sm" onClick={onCollapse}>Collapse</Button> : null}
                {!onCollapse && onExpand && item ? (
                    <Button variant="ghost" size="sm" onClick={() => onExpand(item.key)}>Expand</Button>
                ) : null}
                {item?.kind === 'view' ? (
                    <Button variant="ghost" size="sm" disabled={isSaving} onClick={() => detach(item.dashboardId)} aria-label="Remove from goal">
                        Remove
                    </Button>
                ) : null}
            </div>
            <span className={styles.srOnly} aria-live="polite">{item ? `Chart ${index + 1} of ${items.length}: ${item.name}` : ''}</span>
        </div>
    );
}

/** Arrow keys cycle charts while focus is inside the chart area (not in a menu or field). */
export function chartKeyHandler(cursor) {
    return (event) => {
        if (event.target.closest?.('[role="menu"], input, textarea, select, [role="tablist"]')) return;
        if (event.key === 'ArrowRight') { event.preventDefault(); cursor.next(); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); cursor.previous(); }
    };
}
