import React from 'react';

import TargetAnalyticsModal from '../goalDetail/TargetAnalyticsModal';
import styles from './LandingTargetManagerModal.module.css';

function instanceTimestamp(instance) {
    const value = instance?.session_date || instance?.time_start || instance?.created_at;
    const timestamp = value ? new Date(value).getTime() : 0;
    return Number.isFinite(timestamp) ? timestamp : 0;
}

export default function LandingTargetManagerModal({
    exampleId,
    goal,
    target,
    activityDefinitions = [],
    analyticsData,
    historicalInstances = [],
    portalTarget,
    onClose,
}) {
    if (!exampleId || !goal || !target) return null;

    const fallbackActivity = activityDefinitions.find(
        (activity) => String(activity.id) === String(target.activity_id)
    ) || null;
    const fallbackInstances = [...historicalInstances].sort(
        (left, right) => instanceTimestamp(left) - instanceTimestamp(right)
    );
    const scopedAnalyticsData = analyticsData || {
        target,
        activity_definition: fallbackActivity,
        instances: fallbackInstances,
        summary: {
            created_at: target.created_at || null,
            total_count: fallbackInstances.length,
            last_instance_at: fallbackInstances.at(-1)?.session_date || null,
            days_since_created: null,
            conditions: [],
            completed: Boolean(target.completed),
            completed_at: target.completed_at || null,
        },
    };

    return (
        <div data-example-id={exampleId}>
            <TargetAnalyticsModal
                rootId={exampleId}
                goalId={goal.id}
                target={target}
                goalColor={goal.level?.color || goal.attributes?.level?.color}
                goalType={goal.attributes?.type || goal.type}
                goalCompleted={Boolean(goal.attributes?.completed ?? goal.completed)}
                activityDefinitions={activityDefinitions}
                analyticsData={scopedAnalyticsData}
                readOnly
                portalTarget={portalTarget}
                overlayClassName={styles.scopedOverlay}
                onClose={onClose}
            />
        </div>
    );
}
