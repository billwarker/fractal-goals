import React, { Suspense } from 'react';

import { lazyWithRetry } from '../../utils/lazyWithRetry';

const ExpandedGoalChart = lazyWithRetry(() => import('./ExpandedGoalChart'), 'components/goalCharts/ExpandedGoalChart');

/**
 * The flow tree's panel: the tree, or an expanded goal chart in its place. The chart sits on the
 * page grid in the same grid-aligned panel and fades in and out like the tree.
 */
export default function GoalTreeChartLayer({ chart, isLeaving = false, rootId, goal, isMobile, onClose, children }) {
    if (!chart) return children;
    return (
        <Suspense fallback={null}>
            <ExpandedGoalChart
                rootId={rootId}
                goal={goal}
                goalId={chart.goalId}
                goalName={goal?.name || goal?.attributes?.name}
                initialKey={chart.chartKey}
                onClose={onClose}
                isMobile={isMobile}
                isLeaving={isLeaving}
            />
        </Suspense>
    );
}
