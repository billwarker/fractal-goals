import React from 'react';

import ActivityMiniCard from './ActivityMiniCard';
import styles from './ActivityAssociator.module.css';

/**
 * ReadOnlyActivitiesView — the Activities tab for the read-only GoalDetailModal
 * (e.g. the public landing page). Renders associated activities from the goal
 * snapshot using the same ActivityMiniCard chrome as the editable associator,
 * but without any add/remove/inherit controls or authenticated fetches.
 */
function renderMetricIndicators(activity) {
    const metrics = activity.metric_definitions || [];
    const hasSets = activity.has_sets;
    if (metrics.length === 0 && !hasSets) return null;

    return (
        <div className={styles.indicatorList}>
            {hasSets && (
                <span className={`${styles.indicator} ${styles.indicatorSets}`}>Sets</span>
            )}
            {metrics.map((metric) => (
                <span key={metric.id} className={`${styles.indicator} ${styles.indicatorMetric}`}>
                    {metric.name}{metric.unit ? ` (${metric.unit})` : ''}
                </span>
            ))}
        </div>
    );
}

function ReadOnlyActivitiesView({ activities = [] }) {
    const safeActivities = Array.isArray(activities) ? activities : [];

    if (safeActivities.length === 0) {
        return (
            <div className={styles.emptyState}>
                No activities are associated with this goal.
            </div>
        );
    }

    return (
        <div className={styles.associatedActivitiesList}>
            <div className={styles.activityGrid}>
                {safeActivities.map((activity) => (
                    <ActivityMiniCard
                        key={activity.id}
                        activity={activity}
                        isProtectedByGroup={false}
                        onRemove={() => {}}
                        renderMetricIndicators={renderMetricIndicators}
                        readOnly
                    />
                ))}
            </div>
        </div>
    );
}

export default ReadOnlyActivitiesView;
