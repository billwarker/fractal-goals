import React, { useEffect, useMemo, useState } from 'react';

import Button from '../atoms/Button';
import ChevronIcon from '../atoms/ChevronIcon';
import IconButton from '../atoms/IconButton';
import ExpandedChartFrame from '../analytics/ExpandedChartFrame';
import { useGoalCharts } from '../../hooks/useGoalCharts';
import { chartKeyHandler } from './GoalChartControls';
import GoalChartView from './GoalChartView';
import { buildGoalChartItems } from './goalChartItems';
import useGoalChartCursor from './useGoalChartCursor';
import styles from './GoalCharts.module.css';

const NO_CHART_INFO = { canSetGoal: false, analyticsHref: null };

/**
 * A goal's chart at full detail, in place of the flow tree, filling its panel: the same frame and
 * goal-setting surface as Session Detail's expanded Progress chart. Its other controls stay in goal
 * details; on mobile, where the details step aside, it keeps a pager and "Back to goal".
 */
export default function ExpandedGoalChart({
    rootId, goal, goalId, goalName, initialKey = null, onClose, isMobile = false, isLeaving = false,
}) {
    const { data } = useGoalCharts(rootId, goalId);
    const items = useMemo(() => buildGoalChartItems(data, goal), [data, goal]);
    // With its last chart removed, the goal has nothing to show here: back to the tree.
    const hasNoCharts = Boolean(data) && items.length === 0;
    useEffect(() => {
        if (hasNoCharts) onClose();
    }, [hasNoCharts, onClose]);
    const cursor = useGoalChartCursor(goalId, items, initialKey);

    const [isAnnotating, setIsAnnotating] = useState(false);
    const [chartInfo, setChartInfo] = useState(NO_CHART_INFO);
    // Each chart starts fresh: it reports what it can offer once mounted.
    const itemKey = cursor.item?.key;
    const [shownKey, setShownKey] = useState(itemKey);
    if (shownKey !== itemKey) {
        setShownKey(itemKey);
        setIsAnnotating(false);
        setChartInfo(NO_CHART_INFO);
    }
    if (isAnnotating && !chartInfo.canSetGoal) setIsAnnotating(false);
    const goalSurface = useMemo(() => ({
        annotating: isAnnotating,
        onAnnotatingChange: setIsAnnotating,
        onChartInfo: setChartInfo,
    }), [isAnnotating]);

    return (
        <ExpandedChartFrame
            ariaLabel={`${goalName || 'Goal'} chart`}
            testId="expanded-goal-chart"
            title={cursor.item?.name}
            titleHint={cursor.item?.name}
            setGoal={chartInfo.canSetGoal ? { annotating: isAnnotating, onToggle: () => setIsAnnotating((current) => !current) } : null}
            analyticsHref={chartInfo.analyticsHref}
            actions={isMobile ? (
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
            onClose={onClose}
            isLeaving={isLeaving}
            onKeyDown={isAnnotating ? undefined : chartKeyHandler(cursor)}
        >
            <GoalChartView key={itemKey} rootId={rootId} goalId={goalId} item={cursor.item} density="expanded" goalSurface={goalSurface} />
        </ExpandedChartFrame>
    );
}
