import React from 'react';

import SavedViewChart from '../analytics/SavedViewChart';
import ConditionProgressChart from '../goalDetail/ConditionProgressChart';
import { useGoalConditionEvidence } from '../../hooks/useGoalConditionQueries';
import styles from './GoalCharts.module.css';

/** The threshold chart, from the goal's evidence in its active period. */
function GoalConditionChart({ rootId, goalId, density }) {
    const query = useGoalConditionEvidence(rootId, goalId, { since: 'active' });
    const payload = query.data;
    if (query.isLoading) return <div className={styles.status} role="status">Loading chart…</div>;
    if (query.error) {
        return (
            <div className={styles.status} role="alert">
                This chart couldn’t load. <button type="button" className={styles.retry} onClick={() => query.refetch()}>Retry</button>
            </div>
        );
    }
    if (!payload?.condition) return <div className={styles.status}>This goal has no threshold to chart.</div>;
    return (
        <ConditionProgressChart
            condition={payload.condition}
            instances={payload.instances || []}
            activity={payload.activity_definition || null}
            density={density}
        />
    );
}

/** One of a goal's charts: the default threshold chart or an attached saved view. */
export default function GoalChartView({ rootId, goalId, item, density }) {
    if (!item) return null;
    if (item.kind === 'default') return <GoalConditionChart rootId={rootId} goalId={goalId} density={density} />;
    return <SavedViewChart rootId={rootId} layout={item.layout} density={density} />;
}
