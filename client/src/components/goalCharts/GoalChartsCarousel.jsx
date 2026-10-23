import React, { useMemo } from 'react';

import { useGoalChartMutations, useGoalCharts } from '../../hooks/useGoalCharts';
import Button from '../atoms/Button';
import ExpandableChartFrame from '../common/ExpandableChartFrame';
import AddGoalChartMenu from './AddGoalChartMenu';
import GoalChartControls, { chartKeyHandler } from './GoalChartControls';
import GoalChartView from './GoalChartView';
import { buildGoalChartItems } from './goalChartItems';
import useGoalChartCursor from './useGoalChartCursor';
import styles from './GoalCharts.module.css';

const NO_IDS = new Set();

/**
 * Goal details' charts, one at a time, always in the simplified (compact) form. `chartExpansion`
 * (Goals page only) makes the chart clickable: it then shows at full detail in place of the flow
 * tree, and while it's there its place here holds the way back (Collapse).
 */
export default function GoalChartsCarousel({ rootId, goal, goalId, chartExpansion = null, portalTarget = null }) {
    const { data, isLoading, isError } = useGoalCharts(rootId, goalId);
    const items = useMemo(() => buildGoalChartItems(data, goal), [data, goal]);
    const cursor = useGoalChartCursor(goalId, items);
    const { detach, isSaving } = useGoalChartMutations(rootId, goalId);
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
            <div className={styles.nameRow}>
                <p className={styles.chartName} title={cursor.item?.name}>{cursor.item?.name}</p>
                {cursor.item?.kind === 'view' ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        className={styles.removeChart}
                        disabled={isSaving}
                        onClick={() => detach(cursor.item.dashboardId)}
                    >
                        Remove this chart
                    </Button>
                ) : null}
            </div>
            <ExpandableChartFrame
                className={styles.compactFrame}
                data-testid={isExpanded ? 'goal-chart-placeholder' : 'goal-chart'}
                onExpand={canExpand ? expand : null}
                label={`Expand chart: ${cursor.item?.name}`}
                isExpanded={isExpanded}
                expandedNote="Showing in place of the goal tree."
                onCollapse={chartExpansion?.collapse}
            >
                <GoalChartView key={cursor.item?.key} rootId={rootId} goalId={goalId} item={cursor.item} density="compact" />
            </ExpandableChartFrame>
        </section>
    );
}
