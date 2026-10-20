import React, { useMemo } from 'react';

import { useGoalCharts } from '../../hooks/useGoalCharts';
import AddGoalChartMenu from './AddGoalChartMenu';
import GoalChartControls, { chartKeyHandler } from './GoalChartControls';
import GoalChartView from './GoalChartView';
import { buildGoalChartItems } from './goalChartItems';
import useGoalChartCursor from './useGoalChartCursor';
import styles from './GoalCharts.module.css';

const NO_IDS = new Set();

/**
 * Goal details' charts, one at a time, always in the simplified (compact) form. `chartExpansion`
 * (Goals page only) shows the chart at full detail in place of the flow tree; while it's there the
 * controls stay here, in the chart's place.
 */
export default function GoalChartsCarousel({ rootId, goal, goalId, chartExpansion = null, portalTarget = null }) {
    const { data, isLoading, isError } = useGoalCharts(rootId, goalId);
    const items = useMemo(() => buildGoalChartItems(data, goal), [data, goal]);
    const cursor = useGoalChartCursor(goalId, items);
    const isExpanded = Boolean(chartExpansion?.goalId) && String(chartExpansion.goalId) === String(goalId);

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
                onExpand={chartExpansion ? (chartKey) => chartExpansion.expand({ goalId, chartKey }) : null}
                onCollapse={isExpanded ? chartExpansion.collapse : null}
                portalTarget={portalTarget}
            />
            <p className={styles.chartName} title={cursor.item?.name}>{cursor.item?.name}</p>
            {isExpanded ? (
                <p className={styles.expandedNote}>Showing in place of the goal tree.</p>
            ) : (
                <div className={styles.compactFrame} data-testid="goal-chart">
                    <GoalChartView key={cursor.item?.key} rootId={rootId} goalId={goalId} item={cursor.item} density="compact" />
                </div>
            )}
        </section>
    );
}
