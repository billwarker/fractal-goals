import React from 'react';
import ActivityFilterModal from '../common/ActivityFilterModal';
import GoalHierarchySelectionModal from '../goals/GoalHierarchySelectionModal';
import { getVisualizationStateUpdate } from './visualizations/state';

export default function AnalyticsChartSelectionModals({ activityOpen, goalOpen, onCloseActivity, onCloseGoal, activityGroups, context }) {
    const { profileActivities, profileGoals, selectedActivityDef, selectedGoalDef, selectedWindowState,
        activityInstanceCounts, updateSelectedWindow } = context;
    return <>
            {activityOpen && (
                <ActivityFilterModal
                    title="Filter by Activity"
                    activities={profileActivities}
                    activityGroups={activityGroups}
                    initialActivityIds={selectedActivityDef?.id ? [selectedActivityDef.id] : []}
                    initialGroupIds={[]}
                    selectionMode="single"
                    allowGroupSelection={false}
                    activityCounts={activityInstanceCounts}
                    confirmLabel="Select activity"
                    onClose={() => onCloseActivity()}
                    onConfirm={(activityIds) => {
                        const activity = activityIds.length > 0
                            ? profileActivities.find((item) => item.id === activityIds[0]) || null
                            : null;
                        updateSelectedWindow({
                            selectedActivity: activity,
                            ...getVisualizationStateUpdate(selectedWindowState || {}, {
                                selectedSplit: 'all',
                                metricX: null,
                                metricY: null,
                                metric: null,
                                metricY2: null,
                            }),
                        });
                    }}
                />
            )}

            <GoalHierarchySelectionModal
                isOpen={goalOpen}
                title="Filter by Goal"
                goals={profileGoals}
                selectedGoalIds={selectedGoalDef?.id ? [selectedGoalDef.id] : []}
                selectionMode="single"
                searchPlaceholder="Search goals"
                emptyState="No goals available."
                connectorHighlightMode="bulk"
                showGoalHighlightHalo
                confirmLabel="Select goal"
                onClose={() => onCloseGoal()}
                onConfirm={(goalIds) => {
                    const goal = goalIds.length > 0
                        ? profileGoals.find((item) => item.id === goalIds[0]) || null
                        : null;
                    updateSelectedWindow({ selectedGoal: goal });
                }}
            />
    </>;
}
