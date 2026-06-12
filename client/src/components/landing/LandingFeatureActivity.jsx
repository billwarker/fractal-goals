import React, { useCallback, useMemo, useState } from 'react';
import ActivityPreviewCard from './ActivityPreviewCard';
import GoalHierarchyList from '../goals/GoalHierarchyList';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { buildActivityLineage } from './landingFeatureModel';
import styles from './LandingFeaturesSection.module.css';

// Shows admin-featured activities plus the goal lineage each one feeds, making
// activity -> goal inheritance visible: linked goals highlight as targets and
// their ancestors glow up to the ultimate goal.
export default function LandingFeatureActivity({ example, activities, onGoalSelect }) {
    const { getGoalColor, getGoalSecondaryColor, getGoalIcon } = useGoalLevels();
    const [selectedActivityId, setSelectedActivityId] = useState(activities[0]?.id || null);

    // Derive the effective selection so example switches (new activity list)
    // fall back to the first activity without a state-reset effect.
    const selectedActivity = activities.find((activity) => activity.id === selectedActivityId)
        || activities[0]
        || null;

    const lineage = useMemo(
        () => buildActivityLineage(example.tree, selectedActivity),
        [example.tree, selectedActivity]
    );

    const getGoalBranchHighlightState = useCallback((goal) => {
        const goalId = String(goal.id);
        if (lineage.targetIds.has(goalId)) return 'target';
        if (lineage.ancestorIds.has(goalId)) return 'ancestor';
        return null;
    }, [lineage]);

    const getGoalConnectorHighlightState = useCallback(
        (goal) => Boolean(getGoalBranchHighlightState(goal)),
        [getGoalBranchHighlightState]
    );

    if (!selectedActivity) {
        return <div className={styles.emptyState}>Publish an example with activities to preview goal inheritance.</div>;
    }

    return (
        <div className={styles.activityStage}>
            {activities.length > 1 && (
                <div className={styles.activityChips} role="tablist" aria-label="Example activities">
                    {activities.map((activity) => (
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activity.id === selectedActivity.id}
                            className={activity.id === selectedActivity.id ? styles.activityChipActive : ''}
                            onClick={() => setSelectedActivityId(activity.id)}
                            key={activity.id}
                        >
                            {activity.name}
                        </button>
                    ))}
                </div>
            )}
            <div className={styles.activitySplitView}>
                <ActivityPreviewCard activity={selectedActivity} />
                <div className={styles.lineagePanel}>
                    <h4 className={styles.lineageTitle}>Goals this activity feeds</h4>
                    <GoalHierarchyList
                        nodes={lineage.nodes}
                        variant="session"
                        connectorHighlightMode="lineage"
                        getGoalBranchHighlightState={getGoalBranchHighlightState}
                        getGoalConnectorHighlightState={getGoalConnectorHighlightState}
                        showGoalHighlightHalo
                        getGoalColor={getGoalColor}
                        getGoalSecondaryColor={getGoalSecondaryColor}
                        getGoalIcon={getGoalIcon}
                        onGoalClick={onGoalSelect}
                        emptyState="This activity has no goal links yet."
                    />
                </div>
            </div>
        </div>
    );
}
