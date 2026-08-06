import React, { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { useActiveSessionActions, useActiveSessionData } from '../../contexts/ActiveSessionContext';
import { useSessionGoalsViewModel } from '../../hooks/useSessionGoalsViewModel';
import { useTargetMutations } from '../../hooks/useTargetQueries';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import HierarchySection from './HierarchySection';
import TargetsSection from './TargetsSection';
import styles from './SessionGoalHierarchyPanel.module.css';
import { logError } from '../../utils/logger';
import { fractalApi } from '../../utils/api';
import { queryKeys } from '../../hooks/queryKeys';
import { flattenGoals } from '../../utils/goalHelpers';
import GoalHierarchySelectionModal from '../goals/GoalHierarchySelectionModal';

const GoalDetailModal = lazyWithRetry(() => import('../ConnectedGoalDetailModal'), 'components/ConnectedGoalDetailModal');
const TargetAnalyticsModal = lazyWithRetry(() => import('../goalDetail/TargetAnalyticsModal'), 'components/goalDetail/TargetAnalyticsModal');

function SessionGoalHierarchyPanel({
    selectedActivity,
    onGoalClick,
    onGoalCreated,
    readOnly = false,
    targetModal = null,
    activityGoalScope = null,
    onGoalScopeToggle,
    className = '',
}) {
    const {
        rootId,
        sessionId,
        session,
        localSessionData,
        activityInstances,
        activities: activityDefinitions,
        activityGroups,
        targetAchievements,
        achievedTargetIds,
        sessionGoalsView,
    } = useActiveSessionData();
    const { createGoal, updateSession } = useActiveSessionActions();
    const queryClient = useQueryClient();
    const { getGoalColor, getGoalSecondaryColor, getLevelByName, getGoalIcon } = useGoalLevels();

    const [createSubGoalParent, setCreateSubGoalParent] = useState(null);
    const [activeTarget, setActiveTarget] = useState(null);
    const [scopeModalOpen, setScopeModalOpen] = useState(false);
    const { data: selectableGoalTree = null } = useQuery({
        queryKey: queryKeys.goalsTree(rootId),
        queryFn: async () => (await fractalApi.getGoals(rootId)).data || null,
        enabled: Boolean(rootId && scopeModalOpen && !readOnly),
    });
    const selectableGoals = useMemo(
        () => selectableGoalTree ? flattenGoals([selectableGoalTree]) : [],
        [selectableGoalTree]
    );
    const activeTargetGoalId = activeTarget?._goalId || null;
    const { deleteTarget } = useTargetMutations(rootId, activeTargetGoalId);

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
        manualGoalIds,
        evidenceGoalIds,
        completedEvidenceGoalIds,
    } = useSessionGoalsViewModel({
        session,
        sessionGoalsView,
        activityInstances,
        localSessionData,
        selectedActivity,
        targetAchievements,
        achievedTargetIds,
    });

    const displayHierarchy = sessionHierarchy;
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

    const getGoalConnectorEdgeState = useCallback((_parentGoal, childGoal) => {
        const childId = String(childGoal.id);
        if (selectedActivityGoalIds.has(childId) || selectedActivityAncestorIds.has(childId)) return 'selected';
        if (completedEvidenceGoalIds.has(childId)) return 'completed';
        if (evidenceGoalIds.has(childId)) return 'solid';
        return 'dashed';
    }, [completedEvidenceGoalIds, evidenceGoalIds, selectedActivityAncestorIds, selectedActivityGoalIds]);

    const handleApplyScope = useCallback(async (goalIds) => {
        await updateSession({ goal_ids: goalIds });
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.sessionGoalsView(rootId, sessionId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.session(rootId, sessionId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.sessions(rootId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.sessionsEvidenceGoalsRoot(rootId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.sessionsFlowtreeMetricsRoot(rootId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.goalAnalytics(rootId) }),
        ]);
    }, [queryClient, rootId, sessionId, updateSession]);

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
            logError('Failed to create sub goal', err);
            throw err;
        }
    }, [activeActivityDef, createGoal, onGoalCreated]);

    const handleTargetDelete = useCallback((target) => {
        if (!target?.id || !activeTargetGoalId) return;
        deleteTarget(target.id)
            .then(() => setActiveTarget(null))
            .catch(() => {
                // The mutation hook owns user-facing error notifications.
            });
    }, [activeTargetGoalId, deleteTarget]);

    const completedColor = getGoalColor('Completed');
    const completedSecondaryColor = getGoalSecondaryColor('Completed');
    const scopedActivityName = activeActivityDef?.name || null;
    return (
        <>
            <div className={`${styles.goalsPanel} ${className}`}>
                <div className={styles.sessionActivitiesList}>
                    <HierarchySection
                        type={selectedActivity ? 'activity' : 'session'}
                        flattenedHierarchy={displayHierarchy}
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
                        getGoalConnectorEdgeState={getGoalConnectorEdgeState}
                        connectorHighlightMode="lineage"
                        showGoalHighlightHalo
                        onGoalIconClick={onGoalScopeToggle ? (goal) => onGoalScopeToggle({
                            ...goal,
                            scopePresentation: {
                                icon: getGoalIcon(goal.type),
                                color: getGoalColor(goal.type),
                                secondaryColor: getGoalSecondaryColor(goal.type),
                            },
                        }) : undefined}
                        isGoalIconSelected={(goal) => String(goal.id) === String(activityGoalScope?.goal?.id)}
                        getGoalIconActionLabel={(goal, selected) => (
                            selected
                                ? `Clear activity scope for ${goal.name}`
                                : `Scope activities to ${goal.name}`
                        )}
                        onStartSubGoalCreation={readOnly ? undefined : handleStartSubGoalCreation}
                        scopedActivityName={scopedActivityName}
                        onAdjustScope={!readOnly && !selectedActivity ? () => setScopeModalOpen(true) : undefined}
                    />
                    {displayHierarchy.length === 0 && (
                        <div className={styles.emptyState}>
                            No goals associated with this session.
                            <br />
                            <small>
                                Select an activity to add goals.
                            </small>
                        </div>
                    )}
                    <TargetsSection
                        targets={targetCards}
                        activityDefinitions={activityDefinitions}
                        scopedActivityName={scopedActivityName}
                        onTargetClick={setActiveTarget}
                    />
                </div>
            </div>

            {activeTarget && (
                <React.Suspense fallback={<div>Loading Target...</div>}>
                    <TargetAnalyticsModal
                        mode="view"
                        rootId={rootId}
                        goalId={activeTargetGoalId}
                        target={activeTarget}
                        goalType={activeTarget._goalType}
                        goalColor={getGoalColor(activeTarget._goalType)}
                        activityDefinitions={activityDefinitions}
                        associatedActivities={activityDefinitions}
                        analyticsData={targetModal?.resolveAnalyticsData?.(activeTarget) || null}
                        readOnly={Boolean(targetModal?.readOnly)}
                        portalTarget={targetModal?.portalTarget || null}
                        overlayClassName={targetModal?.overlayClassName || ''}
                        targets={targetCards.filter((target) => target._goalId === activeTargetGoalId)}
                        setTargets={() => {}}
                        onDelete={targetModal?.readOnly ? undefined : handleTargetDelete}
                        onClose={() => setActiveTarget(null)}
                    />
                </React.Suspense>
            )}

            {!readOnly && createSubGoalParent && createPortal(
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
                        activityGroups={activityGroups}
                        initialActivities={activeActivityDef ? [activeActivityDef] : []}
                    />
                </React.Suspense>,
                document.body
            )}
            <GoalHierarchySelectionModal
                isOpen={scopeModalOpen}
                title="Adjust Session Goal Scope"
                goals={selectableGoals}
                selectedGoalIds={Array.from(manualGoalIds)}
                lockedGoalIds={sessionGoalsView?.automatic_goal_ids || []}
                lockedGoalLabel="Included by session activities"
                highlightSelectionAncestors
                connectorHighlightMode="lineage"
                onClose={() => setScopeModalOpen(false)}
                onConfirm={handleApplyScope}
            />
        </>
    );
}

export default SessionGoalHierarchyPanel;
