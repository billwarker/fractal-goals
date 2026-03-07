import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';

import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { useActiveSession } from '../../contexts/ActiveSessionContext';
import { useGoals } from '../../contexts/GoalsContext';
import { useGoalsForSelection } from '../../hooks/useGoalQueries';
import { queryKeys } from '../../hooks/queryKeys';
import { fractalApi } from '../../utils/api';
import notify from '../../utils/notify';
import { useSessionGoalsViewModel } from '../../hooks/useSessionGoalsViewModel';
import MicroGoalModal from '../MicroGoalModal';
import HierarchySection from './HierarchySection';
import TargetsSection from './TargetsSection';
import SessionFocusSection from './SessionFocusSection';
const GoalDetailModal = React.lazy(() => import('../GoalDetailModal'));

import styles from './GoalsPanel.module.css';

/**
 * GoalsPanel - Displays goals relevant to the current session scope.
 */
function GoalsPanel({
    selectedActivity,
    onGoalClick,
    onGoalCreated,
    createMicroTrigger = 0,
    goalCreationContext = null,
    onOpenGoals
}) {
    // Context
    const {
        rootId,
        sessionId,
        session,
        activities: activityDefinitions,
        targetAchievements,
        achievedTargetIds,
        createGoal,
        refreshSession,
        sessionGoalsView,
        loading,
        toggleGoalCompletion,
        microGoals,
    } = useActiveSession();
    const queryClient = useQueryClient();
    const sessionGoalsViewKey = queryKeys.sessionGoalsView(rootId, sessionId);
    const { getGoalColor, getGoalSecondaryColor, getLevelByName, getGoalIcon } = useGoalLevels();
    const { fetchFractalTree } = useGoals();

    const { goals: allShortTermGoals } = useGoalsForSelection(rootId);

    // Inline IG creator state
    const [showIGCreator, setShowIGCreator] = useState(false);
    const [igName, setIGName] = useState('');
    const [igParentId, setIGParentId] = useState('');
    const [igCreating, setIGCreating] = useState(false);

    // Micro Goal UX Redesign state
    const [showMicroTargetBuilder, setShowMicroTargetBuilder] = useState(false);
    const [targetBuilderGoal, setTargetBuilderGoal] = useState(null); // ImmediateGoal node
    const [viewMode, setViewMode] = useState('session');

    const goalLookup = useMemo(() => {
        if (!sessionGoalsView?.goal_tree) return new Map();
        const map = new Map();
        const walk = (node) => {
            map.set(node.id, {
                id: node.id,
                name: node.attributes?.name || node.name,
                type: node.attributes?.type || node.type,
                description: node.attributes?.description || node.description,
                targets: node.attributes?.targets || node.targets,
                is_smart: node.is_smart,
                completed: node.completed,
                attributes: node.attributes,
            });
            for (const child of (node.children || [])) { walk(child); }
        };
        walk(sessionGoalsView.goal_tree);
        return map;
    }, [sessionGoalsView]);

    const activeActivityDef = useMemo(() => {
        if (!selectedActivity) return null;
        const selectedDefId = selectedActivity.activity_definition_id || selectedActivity.activity_id || null;
        if (!selectedDefId) return null;

        const found = activityDefinitions.find(d => d.id === selectedDefId) || null;
        if (found) return found;

        // Fallback for stale/soft-deleted definitions still present in session instances.
        return {
            id: selectedDefId,
            name: selectedActivity.name || selectedActivity.definition_name || 'Activity',
            associated_goal_ids: selectedActivity.associated_goal_ids || [],
        };
    }, [selectedActivity, activityDefinitions]);

    useEffect(() => {
        if (selectedActivity) setViewMode('activity');
        else setViewMode('session');
    }, [selectedActivity]);

    const {
        sessionHierarchy,
        activityHierarchy,
        targetCards,
    } = useSessionGoalsViewModel({
        sessionGoalsView,
        session,
        selectedActivity: viewMode === 'activity' ? selectedActivity : null,
        targetAchievements,
        achievedTargetIds,
    });

    const handleCreateImmediateGoal = async () => {
        if (!igName.trim() || !igParentId) return;
        setIGCreating(true);
        try {
            const newGoal = await createGoal({
                name: igName.trim(),
                type: 'ImmediateGoal',
                parent_id: igParentId,
            });
            await fractalApi.addSessionGoal(rootId, sessionId, newGoal.id, 'immediate');
            queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
            if (viewMode === 'activity' && activeActivityDef) {
                try {
                    await fractalApi.associateGoalToActivity(rootId, newGoal.id, activeActivityDef.id);
                    queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
                }
                catch (linkErr) { console.error("Failed to link new IG to activity", linkErr); }
            }
            setIGName('');
            setIGParentId('');
            setShowIGCreator(false);
            refreshSession(); // Invalidate session to show new IG
            notify.success(`Goal created: ${newGoal.name}`);
            if (onGoalCreated) onGoalCreated(newGoal.name);
        } catch (err) {
            console.error("Failed to create Immediate Goal", err);
            notify.error("Failed to create immediate goal");
        } finally {
            setIGCreating(false);
        }
    };

    const handleCreateMicroGoalWithParent = useCallback(async (name, parentId) => {
        try {
            const newGoalData = await createGoal({
                name,
                type: 'MicroGoal',
                parent_id: parentId,
                session_id: sessionId
            });
            if (viewMode === 'activity' && activeActivityDef) {
                try {
                    await fractalApi.associateGoalToActivity(rootId, newGoalData.id, activeActivityDef.id);
                    queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
                }
                catch (linkErr) { console.error("Failed to link new Micro Goal to activity", linkErr); }
            }

            // Refetch is handled by createGoal invalidation in context
            notify.success(`Micro goal created: ${newGoalData.name}`);
            if (onGoalCreated) onGoalCreated(newGoalData.name);
        } catch (err) {
            console.error("Failed to create micro goal", err);
            notify.error("Failed to create micro goal");
        }
    }, [activeActivityDef, createGoal, onGoalCreated, queryClient, rootId, sessionGoalsViewKey, sessionId, viewMode]);

    const findParentGoalForActivity = useCallback((activityDef) => {
        if (!activityDef?.associated_goal_ids?.length) return null;
        const sessionIGIds = new Set((session?.immediate_goals || []).map(g => g.id));
        for (const goalId of activityDef.associated_goal_ids) {
            if (sessionIGIds.has(goalId)) return goalId;
        }
        for (const goalId of activityDef.associated_goal_ids) {
            const goal = goalLookup.get(goalId);
            if (goal && (goal.type === 'ImmediateGoal' || goal.type === 'ShortTermGoal')) return goalId;
        }
        return null;
    }, [session?.immediate_goals, goalLookup]);

    const handleCreateMicroGoalWithTarget = useCallback(async (name) => {
        if (!name.trim()) return;
        const parentId = findParentGoalForActivity(activeActivityDef);
        if (!parentId) {
            setShowIGCreator(true);
            setIGName(`Goal for ${activeActivityDef?.name || 'Activity'}`);
            return;
        }
        await handleCreateMicroGoalWithParent(name, parentId);
    }, [activeActivityDef, findParentGoalForActivity, handleCreateMicroGoalWithParent]);

    const lastTriggerHandled = React.useRef(0);
    useEffect(() => {
        if (createMicroTrigger > 0 && createMicroTrigger !== lastTriggerHandled.current && activeActivityDef) {
            lastTriggerHandled.current = createMicroTrigger;
            if (goalCreationContext?.suggestedType === 'ImmediateGoal') {
                setShowIGCreator(true);
                setIGName("Goal for " + activeActivityDef.name);
                if (goalCreationContext.activityDefinition?.associated_goal_ids) {
                    const linkedSTG = allShortTermGoals.find(stg =>
                        goalCreationContext.activityDefinition.associated_goal_ids.includes(stg.id)
                    );
                    if (linkedSTG) setIGParentId(linkedSTG.id);
                }
            } else if (goalCreationContext?.suggestedType !== 'associate') {
                handleCreateMicroGoalWithTarget("Micro goal for " + activeActivityDef.name);
            }
        }
    }, [createMicroTrigger, activeActivityDef, goalCreationContext, allShortTermGoals, handleCreateMicroGoalWithTarget]);

    const handleCreateNanoGoal = async (microGoalId, name) => {
        if (!name.trim()) return;
        try {
            const newGoal = await createGoal({
                name,
                type: 'NanoGoal',
                parent_id: microGoalId,
            });
            if (onGoalCreated) onGoalCreated(newGoal.name);
        } catch (err) {
            console.error("Failed to create nano goal", err);
            notify.error("Failed to create nano goal");
        }
    };

    const handleAddTargetForGoal = useCallback((goalNode) => {
        setTargetBuilderGoal(goalNode);
        setShowMicroTargetBuilder(true);
    }, []);

    const handleSaveMicroGoal = useCallback(async ({ goalName, target, description }) => {
        if (!targetBuilderGoal || !rootId) return;
        const parentId = targetBuilderGoal.id || targetBuilderGoal.attributes?.id;
        if (!parentId) return;
        try {
            // 1. Create the MicroGoal
            const enrichedTarget = { ...target };
            if (activeActivityDef && selectedActivity?.id) {
                enrichedTarget.activity_instance_id = selectedActivity.id;
            }

            const newGoal = await createGoal({
                name: goalName,
                type: 'MicroGoal',
                parent_id: parentId,
                session_id: sessionId,
                targets: [enrichedTarget],
                description: description || '',
            });
            // 2. Associate the new micro goal with the current activity (if activity-focused)
            if (activeActivityDef) {
                try {
                    const currentIds = activeActivityDef.associated_goal_ids || [];
                    await fractalApi.setActivityGoals(rootId, activeActivityDef.id, [...currentIds, newGoal.id]);
                    queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
                } catch (assocErr) {
                    console.warn('Could not associate micro goal with activity', assocErr);
                }
            }
            fetchFractalTree(rootId);
            refreshSession?.();
            notify.success(`Micro goal created: ${goalName}`);
            if (onGoalCreated) onGoalCreated(goalName);
        } catch (err) {
            console.error('Failed to create MicroGoal', err);
            throw err; // Let modal surface the error
        }
        setShowMicroTargetBuilder(false);
        setTargetBuilderGoal(null);
    }, [targetBuilderGoal, rootId, sessionId, createGoal, activeActivityDef, fetchFractalTree, onGoalCreated, queryClient, refreshSession, selectedActivity, sessionGoalsViewKey]);

    // --- Sub-goal Creation via GoalDetailModal ---
    const [createSubGoalParent, setCreateSubGoalParent] = useState(null); // goal node

    const handleStartSubGoalCreation = (node) => {
        setCreateSubGoalParent(node);
    };

    const handleSubGoalCreated = useCallback(async (payload) => {
        try {
            const newGoalData = await createGoal(payload);
            if (viewMode === 'activity' && activeActivityDef && newGoalData?.id) {
                try {
                    const currentGoalIds = activeActivityDef.associated_goal_ids || [];
                    await fractalApi.setActivityGoals(rootId, activeActivityDef.id, [...currentGoalIds, newGoalData.id]);
                    queryClient.invalidateQueries({ queryKey: sessionGoalsViewKey });
                } catch (assocErr) {
                    console.error('Failed to associate new sub-goal with activity', assocErr);
                }
            }
            fetchFractalTree(rootId);
            setCreateSubGoalParent(null);
            if (onGoalCreated) onGoalCreated(newGoalData?.name);
            return newGoalData;
        } catch (err) {
            console.error('Failed to create sub goal', err);
            throw err;
        }
    }, [viewMode, activeActivityDef, rootId, fetchFractalTree, onGoalCreated, createGoal, queryClient, sessionGoalsViewKey]);

    const completedColor = getGoalColor('Completed');
    const completedSecondaryColor = getGoalSecondaryColor('Completed');
    const microChars = getLevelByName('MicroGoal');
    const nanoChars = getLevelByName('NanoGoal');

    const isActivityFocused = !!selectedActivity;

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

                {viewMode === 'activity' && (
                    isActivityFocused ? (
                        <>
                            <HierarchySection
                                type="activity"
                                activityDefinition={activeActivityDef}
                                flattenedHierarchy={activityHierarchy}
                                viewMode={viewMode}
                                onGoalClick={onGoalClick}
                                getScopedCharacteristics={getLevelByName}
                                getGoalColor={getGoalColor}
                                getGoalSecondaryColor={getGoalSecondaryColor}
                                getGoalIcon={getGoalIcon}
                                completedColor={completedColor}
                                completedSecondaryColor={completedSecondaryColor}
                                achievedTargetIds={achievedTargetIds}
                                onStartSubGoalCreation={handleStartSubGoalCreation}
                                onOpenAssociate={() => onOpenGoals && onOpenGoals(selectedActivity, {
                                    type: 'associate',
                                    activityDefinition: activeActivityDef,
                                    initialSelectedGoalIds: sessionGoalsView?.activity_goal_ids_by_activity?.[activeActivityDef?.id] || []
                                })}
                                onAddTargetForGoal={handleAddTargetForGoal}
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
                )
                }

                {/* Session View: Unified Hierarchy */}
                {
                    viewMode === 'session' && (
                        <div className={styles.sessionActivitiesList}>
                            <SessionFocusSection
                                loading={loading}
                                microGoals={microGoals}
                                microChars={microChars}
                                nanoChars={nanoChars}
                                completedColor={completedColor}
                                completedSecondaryColor={completedSecondaryColor}
                                getGoalColor={getGoalColor}
                                getGoalSecondaryColor={getGoalSecondaryColor}
                                handleToggleCompletion={(goalNode, completed) => toggleGoalCompletion(goalNode.id, completed)}
                                onGoalClick={onGoalClick}
                                achievedTargetIds={achievedTargetIds}
                                handleCreateNanoGoal={handleCreateNanoGoal}
                                handleCreateMicroGoalWithTarget={handleCreateMicroGoalWithTarget}
                                showIGCreator={showIGCreator}
                                igName={igName}
                                setIGName={setIGName}
                                igParentId={igParentId}
                                setIGParentId={setIGParentId}
                                allShortTermGoals={allShortTermGoals}
                                handleCreateImmediateGoal={handleCreateImmediateGoal}
                                igCreating={igCreating}
                                setShowIGCreator={setShowIGCreator}
                            />
                            <HierarchySection
                                type="session"
                                flattenedHierarchy={sessionHierarchy}
                                viewMode="session"
                                onGoalClick={onGoalClick}
                                getScopedCharacteristics={getLevelByName}
                                getGoalColor={getGoalColor}
                                getGoalSecondaryColor={getGoalSecondaryColor}
                                getGoalIcon={getGoalIcon}
                                completedColor={completedColor}
                                completedSecondaryColor={completedSecondaryColor}
                                achievedTargetIds={achievedTargetIds}
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
                    )
                }
            </div>

            {/* MicroGoalModal — opened when clicking + on an ImmediateGoal in the hierarchy */}
            <MicroGoalModal
                isOpen={showMicroTargetBuilder}
                onClose={() => {
                    setShowMicroTargetBuilder(false);
                    setTargetBuilderGoal(null);
                }}
                onSave={handleSaveMicroGoal}
                activityDefinitions={activityDefinitions}
                preselectedActivityId={activeActivityDef?.id}
                parentGoalName={targetBuilderGoal?.name || targetBuilderGoal?.attributes?.name}
            />
            {/* GoalDetailModal — create mode, portalled to body to escape sidepanel stacking context */}
            {createSubGoalParent && createPortal(
                <React.Suspense fallback={<div>Loading Details...</div>}>
                    <GoalDetailModal
                        isOpen={!!createSubGoalParent}
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
