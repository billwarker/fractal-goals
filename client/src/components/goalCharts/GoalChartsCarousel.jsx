import React, { useMemo } from 'react';

import { useGoalCharts } from '../../hooks/useGoalCharts';
import Button from '../atoms/Button';
import AddGoalChartMenu from './AddGoalChartMenu';
import GoalChartControls, { chartKeyHandler } from './GoalChartControls';
import GoalChartView from './GoalChartView';
import { buildGoalChartItems } from './goalChartItems';
import useGoalChartCursor from './useGoalChartCursor';
import styles from './GoalCharts.module.css';

const NO_IDS = new Set();

/** Controls inside the chart (e.g. Retry) keep their own clicks. */
const fromInnerControl = (event) => Boolean(event.target.closest?.('button, a, input, select, textarea'));

/**
 * Goal details' charts, one at a time, always in the simplified (compact) form. `chartExpansion`
 * (Goals page only) makes the chart clickable: it then shows at full detail in place of the flow
 * tree, and while it's there its place here holds the way back (Collapse).
 */
export default function GoalChartsCarousel({ rootId, goal, goalId, chartExpansion = null, portalTarget = null }) {
    const { data, isLoading, isError } = useGoalCharts(rootId, goalId);
    const items = useMemo(() => buildGoalChartItems(data, goal), [data, goal]);
    const cursor = useGoalChartCursor(goalId, items);
    const isExpanded = Boolean(chartExpansion?.goalId) && String(chartExpansion.goalId) === String(goalId);
    const canExpand = Boolean(chartExpansion && cursor.item);
    const expand = () => chartExpansion.expand({ goalId, chartKey: cursor.item.key });

    if (isLoading || isError) return null;
    if (items.length === 0) {
        return (
            <section className={styles.carousel} aria-label="Analytics">
                <div className={styles.header}>
                    <span className={styles.heading}>Analytics</span>
                    <div className={styles.actions}>
                        <AddGoalChartMenu rootId={rootId} goalId={goalId} attachedIds={NO_IDS} portalTarget={portalTarget} />
                    </div>
                </div>
                <span className={styles.emptyText}>Track this goal with a saved analytics chart.</span>
            </section>
        );
    }
    return (
        <section className={styles.carousel} aria-label="Analytics" aria-roledescription="carousel" onKeyDown={chartKeyHandler(cursor)}>
            <GoalChartControls
                rootId={rootId}
                goalId={goalId}
                items={items}
                cursor={cursor}
                portalTarget={portalTarget}
            />
            <p className={styles.chartName} title={cursor.item?.name}>{cursor.item?.name}</p>
            {isExpanded ? (
                <div className={`${styles.compactFrame} ${styles.expandedPlaceholder}`} data-testid="goal-chart-placeholder">
                    <p className={styles.expandedNote}>Showing in place of the goal tree.</p>
                    <Button variant="secondary" size="sm" onClick={chartExpansion.collapse}>Collapse</Button>
                </div>
            ) : (
                <div
                    className={`${styles.compactFrame} ${canExpand ? styles.compactFrameExpandable : ''}`}
                    data-testid="goal-chart"
                    {...(canExpand ? {
                        role: 'button',
                        tabIndex: 0,
                        'aria-label': `Expand chart: ${cursor.item.name}`,
                        title: 'Expand chart',
                        onClick: (event) => { if (!fromInnerControl(event)) expand(); },
                        onKeyDown: (event) => {
                            if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                            event.preventDefault();
                            expand();
                        },
                    } : {})}
                >
                    <GoalChartView key={cursor.item?.key} rootId={rootId} goalId={goalId} item={cursor.item} density="compact" />
                </div>
            )}
        </section>
    );
}
