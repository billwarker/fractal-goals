import React, { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { useActiveSessionActions, useActiveSessionData } from '../../contexts/ActiveSessionContext';
import { useSessionGoalsViewModel } from '../../hooks/useSessionGoalsViewModel';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import HierarchySection from './HierarchySection';
import TargetsSection from './TargetsSection';
import styles from './SessionGoalHierarchyPanel.module.css';

const GoalDetailModal = lazyWithRetry(() => import('../GoalDetailModal'), 'components/GoalDetailModal');

function SessionGoalHierarchyPanel({
    selectedActivity,
    onGoalClick,
    onGoalCreated,
    onOpenGoals,
    className = '',
}) {
    const {
        rootId,
        session,
        localSessionData,
        activityInstances,
        activities: activityDefinitions,
        targetAchievements,
        achievedTargetIds,
        sessionGoalsView,
    } = useActiveSessionData();
    const { createGoal } = useActiveSessionActions();
    const { getGoalColor, getGoalSecondaryColor, getLevelByName, getGoalIcon } = useGoalLevels();

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

    const {
        sessionHierarchy,
        targetCards,
        selectedActivityGoalIds,
        selectedActivityAncestorIds,
    } = useSessionGoalsViewModel({
        session,
        sessionGoalsView,
        activityInstances,
        activityDefinitions,
        localSessionData,
        selectedActivity,
        targetAchievements,
        achievedTargetIds,
    });

    const hasActivityHighlight = selectedActivityGoalIds.size > 0;

    const getGoalBranchHighlightState = useCallback((goal) => {
        const goalId = String(goal.id);
        if (selectedActivityGoalIds.has(goalId)) {
            return 'target';
        }
        if (selectedActivityAncestorIds.has(goalId)) {
            return 'ancestor';
        }
        return null;
    }, [selectedActivityAncestorIds, selectedActivityGoalIds]);

    const getGoalConnectorHighlightState = useCallback((goal) => {
        if (!hasActivityHighlight) return false;
        return Boolean(getGoalBranchHighlightState(goal));
    }, [getGoalBranchHighlightState, hasActivityHighlight]);

    const getGoalConnectorEdgeHighlightState = useCallback((parentGoal, childGoal) => {
        if (!hasActivityHighlight) return false;
        const childId = String(childGoal.id);
        return selectedActivityGoalIds.has(childId) || selectedActivityAncestorIds.has(childId);
    }, [hasActivityHighlight, selectedActivityAncestorIds, selectedActivityGoalIds]);

    const handleStartSubGoalCreation = useCallback((node) => {
        setCreateSubGoalParent(node);
    }, []);

    const handleSubGoalCreated = useCallback(async (payload) => {
        try {
            const payloadWithAssociation = (
                activeActivityDef
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
    }, [activeActivityDef, createGoal, onGoalCreated]);

    const completedColor = getGoalColor('Completed');
    const completedSecondaryColor = getGoalSecondaryColor('Completed');
    const scopedActivityName = activeActivityDef?.name || null;
    return (
        <>
            <div className={`${styles.goalsPanel} ${className}`}>
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
                        getGoalBranchHighlightState={getGoalBranchHighlightState}
                        getGoalConnectorHighlightState={getGoalConnectorHighlightState}
                        getGoalConnectorEdgeHighlightState={getGoalConnectorEdgeHighlightState}
                        connectorHighlightMode="lineage"
                        onStartSubGoalCreation={handleStartSubGoalCreation}
                        scopedActivityName={scopedActivityName}
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
                        scopedActivityName={scopedActivityName}
                    />
                </div>
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
                        initialActivities={activeActivityDef ? [activeActivityDef] : []}
                    />
                </React.Suspense>,
                document.body
            )}
        </>
    );
}

export default SessionGoalHierarchyPanel;
