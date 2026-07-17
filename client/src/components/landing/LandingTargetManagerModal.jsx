import React from 'react';

import TargetAnalyticsModal from '../goalDetail/TargetAnalyticsModal';
import { resolveLandingTargetAnalyticsData } from './landingTargetAnalyticsData';
import styles from './LandingScopedModal.module.css';

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

    const scopedAnalyticsData = resolveLandingTargetAnalyticsData({
        target,
        activityDefinitions,
        analyticsData,
        historicalInstances,
    });

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
