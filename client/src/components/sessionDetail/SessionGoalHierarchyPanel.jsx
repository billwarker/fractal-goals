import React, { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { useActiveSessionActions, useActiveSessionData } from '../../contexts/ActiveSessionContext';
import useGoalHierarchyHighlights from '../../hooks/useGoalHierarchyHighlights';
import useJustCreatedGoal from '../../hooks/useJustCreatedGoal';
import { useSessionGoalsViewModel } from '../../hooks/useSessionGoalsViewModel';
import { prefillConditionFromInstance } from '../../utils/goalConditions';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import HierarchySection from './HierarchySection';
import ConditionCardsSection from './ConditionCardsSection';
import styles from './SessionGoalHierarchyPanel.module.css';
import { logError } from '../../utils/logger';
import { fractalApi } from '../../utils/api';
import { queryKeys } from '../../hooks/queryKeys';
import { flattenGoals } from '../../utils/goalHelpers';
import { buildProgramRenderScopeGoalIds, getProgramMetricScopeGoalIds } from '../../utils/programScope';
import GoalHierarchySelectionModal from '../goals/GoalHierarchySelectionModal';

const GoalDetailModal = lazyWithRetry(() => import('../ConnectedGoalDetailModal'), 'components/ConnectedGoalDetailModal');
const ConditionEvidenceModal = lazyWithRetry(() => import('../goalDetail/ConditionEvidenceModal'), 'components/goalDetail/ConditionEvidenceModal');

function SessionGoalHierarchyPanel({
    selectedActivity,
    onGoalClick,
    onGoalCreated,
    readOnly = false,
    conditionSnapshots = null,
    // Where the evidence modal portals and which overlay class scopes it (embedded landing demos).
    conditionModalHost = null,
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
        conditionProgressByGoalId,
        sessionGoalsView,
    } = useActiveSessionData();
    const { createGoal, updateSession } = useActiveSessionActions();
    const queryClient = useQueryClient();
    const { getGoalColor, getGoalSecondaryColor, getLevelByName, getGoalIcon } = useGoalLevels();

    const [createSubGoalParent, setCreateSubGoalParent] = useState(null);
    const [evidenceCard, setEvidenceCard] = useState(null);
    const [justCreatedGoalId, markGoalCreated] = useJustCreatedGoal();
    // Published landing snapshots carry progress alongside each goal's evidence.
    const snapshotProgressByGoalId = useMemo(() => (
        conditionSnapshots
            ? Object.fromEntries(Object.entries(conditionSnapshots).map(([goalId, snapshot]) => [goalId, snapshot?.progress]))
            : null
    ), [conditionSnapshots]);
    const [scopeModalOpen, setScopeModalOpen] = useState(false);
    const programInfo = session?.program_info || null;
    const programId = programInfo?.program_id || null;
    const { data: selectableGoalTree = null } = useQuery({
        queryKey: queryKeys.goalsTree(rootId),
        queryFn: async () => (await fractalApi.getGoals(rootId)).data || null,
        enabled: Boolean(rootId && scopeModalOpen && !readOnly),
    });
    const { data: program = null } = useQuery({
        queryKey: queryKeys.program(rootId, programId),
        queryFn: async () => (await fractalApi.getProgram(rootId, programId)).data || null,
        enabled: Boolean(rootId && programId && scopeModalOpen && !readOnly),
        staleTime: 5 * 60 * 1000,
    });
    const selectableGoals = useMemo(
        () => selectableGoalTree ? flattenGoals([selectableGoalTree]) : [],
        [selectableGoalTree]
    );
    const programScopeGoalIds = useMemo(() => {
        if (!programId || !selectableGoalTree) return [];
        const scopeSource = program || localSessionData?.program_context || {};
        const metricScopeIds = getProgramMetricScopeGoalIds(scopeSource, selectableGoalTree);
        return Array.from(buildProgramRenderScopeGoalIds(selectableGoalTree, metricScopeIds));
    }, [localSessionData?.program_context, program, programId, selectableGoalTree]);

    const activeActivityDef = useMemo(() => {
        if (!selectedActivity) return null;
        const selectedDefId = selectedActivity.activity_definition_id || selectedActivity.activity_id || null;
        if (!selectedDefId) return null;

        const found = activityDefinitions.find((definition) => definition.id === selectedDefId) || null;
        if (found) return found;

        return {
            id: selectedDefId,
            name: selectedActivity.name || selectedActivity.definition_name || 'Activity',
            associated_goal_ids: [],
        };
    }, [selectedActivity, activityDefinitions]);

    const {
        sessionHierarchy,
        conditionCards,
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
        conditionProgressByGoalId: snapshotProgressByGoalId || conditionProgressByGoalId,
    });

    const displayHierarchy = sessionHierarchy;
    const hierarchyHighlights = useGoalHierarchyHighlights({
        selectedActivityGoalIds,
        selectedActivityAncestorIds,
        evidenceGoalIds,
        completedEvidenceGoalIds,
        activityGoalScope,
        onGoalScopeToggle,
        getGoalIcon,
        getGoalColor,
        getGoalSecondaryColor,
    });

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
            const newGoalId = newGoalData?.id ?? newGoalData?.attributes?.id;
            // Without a selected activity the new goal joins this session's goals, so the
            // session hierarchy keeps showing it; with one, working toward that activity does.
            if (newGoalId && !activeActivityDef) {
                await handleApplyScope([...manualGoalIds, String(newGoalId)]);
            }
            markGoalCreated(newGoalData);
            if (onGoalCreated) onGoalCreated(newGoalData?.name);
            return newGoalData;
        } catch (err) {
            logError('Failed to create sub goal', err);
            throw err;
        }
    }, [activeActivityDef, createGoal, handleApplyScope, manualGoalIds, markGoalCreated, onGoalCreated]);

    // A goal created while an activity is selected completes on that activity, seeded from the
    // selected instance's best set.
    const initialCompletion = useMemo(() => (
        activeActivityDef?.metric_definitions
            ? {
                completionCondition: 'activity_threshold',
                conditionDraft: prefillConditionFromInstance(selectedActivity, activeActivityDef),
            }
            : null
    ), [activeActivityDef, selectedActivity]);

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
                        {...hierarchyHighlights}
                        onStartSubGoalCreation={readOnly ? undefined : handleStartSubGoalCreation}
                        justCreatedGoalId={justCreatedGoalId}
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
                    <ConditionCardsSection
                        cards={conditionCards}
                        activityDefinitions={activityDefinitions}
                        scopedActivityName={scopedActivityName}
                        getGoalColor={getGoalColor}
                        onCardClick={setEvidenceCard}
                    />
                </div>
            </div>

            {evidenceCard && (
                <React.Suspense fallback={null}>
                    <ConditionEvidenceModal
                        isOpen
                        onClose={() => setEvidenceCard(null)}
                        rootId={rootId}
                        goalId={evidenceCard.goalId}
                        goalName={evidenceCard.goalName}
                        accentColor={getGoalColor(evidenceCard.goalType)}
                        snapshot={conditionSnapshots?.[evidenceCard.goalId] || null}
                        portalContainer={conditionModalHost?.portalContainer || null}
                        overlayClassName={conditionModalHost?.overlayClassName || ''}
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
                        initialCompletion={initialCompletion}
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
                initialHideCompletedGoals
                scopeGoalIds={programScopeGoalIds}
                scopeLabel={programId ? (programInfo?.program_name || program?.name || 'program') : ''}
                initialScopeEnabled={Boolean(programId)}
                highlightSelectionAncestors
                connectorHighlightMode="lineage"
                onClose={() => setScopeModalOpen(false)}
                onConfirm={handleApplyScope}
            />
        </>
    );
}

export default SessionGoalHierarchyPanel;
