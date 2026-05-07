import React, { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { useActiveSessionActions, useActiveSessionData } from '../../contexts/ActiveSessionContext';
import { useSessionGoalsViewModel } from '../../hooks/useSessionGoalsViewModel';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import HierarchySection from './HierarchySection';
import TargetsSection from './TargetsSection';
import styles from './GoalsPanel.module.css';

const GoalDetailModal = lazyWithRetry(() => import('../GoalDetailModal'), 'components/GoalDetailModal');

/**
 * GoalsPanel - Displays goals relevant to the current session or focused activity.
 */
function GoalsPanel({
    selectedActivity,
    onGoalClick,
    onGoalCreated,
    onOpenGoals
}) {
    const {
        rootId,
        sessionId,
        session,
        activities: activityDefinitions,
        targetAchievements,
        achievedTargetIds,
        sessionGoalsView,
    } = useActiveSessionData();
    const { createGoal } = useActiveSessionActions();
    const { getGoalColor, getGoalSecondaryColor, getLevelByName, getGoalIcon } = useGoalLevels();

    const [viewModeOverrides, setViewModeOverrides] = useState({});
    const [createSubGoalParent, setCreateSubGoalParent] = useState(null);

    const activeActivityDef = useMemo(() => {
        if (!selectedActivity) return null;
        const selectedDefId = selectedActivity.activity_definition_id || selectedActivity.activity_id || null;
        if (!selectedDefId) return null;

        const found = activityDefinitions.find((definition) => definition.id === selectedDefId) || null;
        if (found) return found;

        return {
            id: selectedDefId,
            name: selectedActivity.name || selectedActivity.definition_name || 'Activity',
            associated_goal_ids: selectedActivity.associated_goal_ids || [],
        };
    }, [selectedActivity, activityDefinitions]);

    const viewModeKey = selectedActivity?.id || selectedActivity?.activity_definition_id || 'session';
    const viewMode = viewModeOverrides[viewModeKey] || (selectedActivity ? 'activity' : 'session');
    const setViewMode = useCallback((nextMode) => {
        setViewModeOverrides((previous) => ({ ...previous, [viewModeKey]: nextMode }));
    }, [viewModeKey]);

    const {
        sessionHierarchy,
        activityHierarchy,
        targetCards,
    } = useSessionGoalsViewModel({
        session,
        sessionGoalsView,
        selectedActivity: viewMode === 'activity' ? selectedActivity : null,
        targetAchievements,
        achievedTargetIds,
    });

    const handleStartSubGoalCreation = useCallback((node) => {
        setCreateSubGoalParent(node);
    }, []);

    const handleSubGoalCreated = useCallback(async (payload) => {
        try {
            const payloadWithAssociation = (
                viewMode === 'activity' && activeActivityDef
                    ? { ...payload, activity_definition_id: activeActivityDef.id }
                    : payload
            );
            const newGoalData = await createGoal(payloadWithAssociation);
            setCreateSubGoalParent(null);
            if (onGoalCreated) onGoalCreated(newGoalData?.name);
            return newGoalData;
        } catch (err) {
            console.error('Failed to create sub goal', err);
            throw err;
        }
    }, [viewMode, activeActivityDef, createGoal, onGoalCreated]);

    const completedColor = getGoalColor('Completed');
    const completedSecondaryColor = getGoalSecondaryColor('Completed');
    const isActivityFocused = Boolean(selectedActivity);

    return (
        <>
            <div className={styles.goalsPanel}>
                <div className={styles.viewToggleContainer}>
                    <button
                        className={`${styles.viewToggleButton} ${viewMode === 'activity' ? styles.activeToggleButton : ''}`}
                        onClick={() => setViewMode('activity')}
                    >
                        Activity
                    </button>
                    <button
                        className={`${styles.viewToggleButton} ${viewMode === 'session' ? styles.activeToggleButton : ''}`}
                        onClick={() => setViewMode('session')}
                    >
                        Session
                    </button>
                </div>

                {viewMode === 'activity' ? (
                    isActivityFocused ? (
                        <>
                            <HierarchySection
                                type="activity"
                                activityDefinition={activeActivityDef}
                                flattenedHierarchy={activityHierarchy}
                                onGoalClick={onGoalClick}
                                getScopedCharacteristics={getLevelByName}
                                getGoalColor={getGoalColor}
                                getGoalSecondaryColor={getGoalSecondaryColor}
                                getGoalIcon={getGoalIcon}
                                completedColor={completedColor}
                                completedSecondaryColor={completedSecondaryColor}
                                onStartSubGoalCreation={handleStartSubGoalCreation}
                                onOpenAssociate={() => onOpenGoals && onOpenGoals(selectedActivity, {
                                    type: 'associate',
                                    activityDefinition: activeActivityDef,
                                    initialSelectedGoalIds: sessionGoalsView?.activity_goal_ids_by_activity?.[activeActivityDef?.id] || []
                                })}
                            />

                            <TargetsSection
                                targets={targetCards}
                                activityDefinitions={activityDefinitions}
                            />
                        </>
                    ) : (
                        <div className={styles.emptyState}>
                            Select an activity to see its goal hierarchy.
                        </div>
                    )
                ) : (
                    <div className={styles.sessionActivitiesList}>
                        <HierarchySection
                            type="session"
                            flattenedHierarchy={sessionHierarchy}
                            onGoalClick={onGoalClick}
                            getScopedCharacteristics={getLevelByName}
                            getGoalColor={getGoalColor}
                            getGoalSecondaryColor={getGoalSecondaryColor}
                            getGoalIcon={getGoalIcon}
                            completedColor={completedColor}
                            completedSecondaryColor={completedSecondaryColor}
                        />
                        {sessionHierarchy.length === 0 && (
                            <div className={styles.emptyState}>
                                No goals associated with this session. <br />
                                <small>Select an activity to add goals.</small>
                            </div>
                        )}
                        <TargetsSection
                            targets={targetCards}
                            activityDefinitions={activityDefinitions}
                        />
                    </div>
                )}
            </div>

            {createSubGoalParent && createPortal(
                <React.Suspense fallback={<div>Loading Details...</div>}>
                    <GoalDetailModal
                        isOpen={Boolean(createSubGoalParent)}
                        onClose={() => setCreateSubGoalParent(null)}
                        goal={null}
                        mode="create"
                        parentGoal={createSubGoalParent}
                        onCreate={handleSubGoalCreated}
                        rootId={rootId}
                        activityDefinitions={activityDefinitions}
                        initialActivities={viewMode === 'activity' && activeActivityDef ? [activeActivityDef] : []}
                    />
                </React.Suspense>,
                document.body
            )}
        </>
    );
}

export default GoalsPanel;
