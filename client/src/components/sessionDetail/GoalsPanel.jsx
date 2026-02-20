import React, { useState, useMemo, useEffect, useCallback } from 'react';
import GoalIcon from '../atoms/GoalIcon';
import { useTheme } from '../../contexts/ThemeContext'
import { useGoalLevels } from '../../contexts/GoalLevelsContext';;
import { fractalApi } from '../../utils/api';
import {
    buildFlattenedGoalTree,
} from '../../utils/goalUtils';
import GoalRow from './GoalRow';
import HierarchySection from './HierarchySection';
import TargetsSection from './TargetsSection';
import SessionFocusSection from './SessionFocusSection';
import { useGoals } from '../../contexts/GoalsContext';
import styles from './GoalsPanel.module.css';

import { useActiveSession } from '../../contexts/ActiveSessionContext';

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
        localSessionData,
        activityInstances,
        activities: activityDefinitions,
        targetAchievements,
        achievedTargetIds,
        updateGoal,
        createGoal,
        refreshSession,
        microGoals,
    } = useActiveSession();
    const { getGoalColor, getGoalSecondaryColor, getLevelByName, getGoalIcon } = useGoalLevels();;
    const { useFractalTreeQuery, fetchFractalTree } = useGoals();
    const [expandedGoals, setExpandedGoals] = useState({});

    // Shared query cache for goal tree - ensures sync with SessionDetail
    const { data: goalTree, isLoading: treeLoading } = useFractalTreeQuery(rootId);

    const [allShortTermGoals, setAllShortTermGoals] = useState([]);

    // Inline IG creator state
    const [showIGCreator, setShowIGCreator] = useState(false);
    const [igName, setIGName] = useState('');
    const [igParentId, setIGParentId] = useState('');
    const [igCreating, setIGCreating] = useState(false);

    // Micro Goal UX Redesign state
    const [showMicroTargetBuilder, setShowMicroTargetBuilder] = useState(false);
    const [pendingMicroGoal, setPendingMicroGoal] = useState(null);
    const [showParentSelector, setShowParentSelector] = useState(false);
    const [pendingMicroGoalName, setPendingMicroGoalName] = useState('');
    const [viewMode, setViewMode] = useState('session');
    const [resolvedActivityGoalIds, setResolvedActivityGoalIds] = useState([]);

    // microGoals now comes from context (TanStack Query)

    useEffect(() => {
        if (!rootId) return;
        const fetchSelectionGoals = async () => {
            try {
                const res = await fractalApi.getGoalsForSelection(rootId);
                setAllShortTermGoals(res.data || []);
            } catch (err) {
                console.error("Failed to fetch selection goals", err);
            }
        };
        fetchSelectionGoals();
    }, [rootId]);

    const goalLookup = useMemo(() => {
        if (!goalTree) return new Map();
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
        walk(goalTree);
        return map;
    }, [goalTree]);

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

    useEffect(() => {
        const selectedDefId = selectedActivity?.activity_definition_id || selectedActivity?.activity_id;
        const localIds = activeActivityDef?.associated_goal_ids || [];
        setResolvedActivityGoalIds(localIds);

        if (!selectedDefId || localIds.length > 0) return;

        let cancelled = false;
        const loadActivityGoals = async () => {
            try {
                const res = await fractalApi.getActivityGoals(rootId, selectedDefId);
                const ids = (res.data || []).map(g => g.id).filter(Boolean);
                if (!cancelled) setResolvedActivityGoalIds(ids);
            } catch (err) {
                if (!cancelled) setResolvedActivityGoalIds([]);
                console.error('Failed to load activity goals for selected activity', err);
            }
        };
        loadActivityGoals();

        return () => {
            cancelled = true;
        };
    }, [rootId, selectedActivity, activeActivityDef]);

    const flattenedHierarchy = useMemo(() => {
        if (!goalTree) return [];
        const targetGoalIds = new Set(
            viewMode === 'activity' && activeActivityDef
                ? activeActivityDef.associated_goal_ids || []
                : (session?.immediate_goals || []).map(g => g.id)
        );
        return buildFlattenedGoalTree(goalTree, targetGoalIds, viewMode === 'activity');
    }, [goalTree, session, activeActivityDef, viewMode]);

    const toggleExpand = (goalId) => {
        setExpandedGoals(prev => ({ ...prev, [goalId]: !prev[goalId] }));
    };

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
            if (viewMode === 'activity' && activeActivityDef) {
                try { await fractalApi.associateGoalToActivity(rootId, newGoal.id, activeActivityDef.id); }
                catch (linkErr) { console.error("Failed to link new IG to activity", linkErr); }
            }
            setIGName('');
            setIGParentId('');
            setShowIGCreator(false);
            refreshSession(); // Invalidate session to show new IG
            if (onGoalCreated) onGoalCreated(newGoal.name);
        } catch (err) {
            console.error("Failed to create Immediate Goal", err);
        } finally {
            setIGCreating(false);
        }
    };

    const handleCreateMicroGoalWithParent = async (name, parentId) => {
        try {
            const newGoalData = await createGoal({
                name,
                type: 'MicroGoal',
                parent_id: parentId,
                attributes: { session_id: sessionId }, // New format: session_id in attributes
                activity_definition_id: viewMode === 'activity' ? activeActivityDef?.id : null
            });
            if (viewMode === 'activity' && activeActivityDef) {
                try { await fractalApi.associateGoalToActivity(rootId, newGoalData.id, activeActivityDef.id); }
                catch (linkErr) { console.error("Failed to link new Micro Goal to activity", linkErr); }
            }

            // Refetch is handled by createGoal invalidation in context
            setPendingMicroGoal(newGoalData);
            setShowMicroTargetBuilder(true);
            if (onGoalCreated) onGoalCreated(newGoalData.name);
        } catch (err) {
            console.error("Failed to create micro goal", err);
        }
    };

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

    const handleCreateMicroGoalWithTarget = async (name) => {
        if (!name.trim()) return;
        const parentId = findParentGoalForActivity(activeActivityDef);
        if (!parentId) {
            setShowParentSelector(true);
            setPendingMicroGoalName(name);
            return;
        }
        handleCreateMicroGoalWithParent(name, parentId);
    };

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
    }, [createMicroTrigger, activeActivityDef, goalCreationContext, allShortTermGoals]);

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
        }
    };

    // --- Sub-goal Creation Logic ---
    const [creatingSubGoal, setCreatingSubGoal] = useState(null); // { parentId: string, type: string }
    const [subGoalName, setSubGoalName] = useState('');

    const handleStartSubGoalCreation = (node) => {
        setCreatingSubGoal({ parentId: node.id, type: node.type });
        setSubGoalName('');
    };

    const handleCancelSubGoalCreation = () => {
        setCreatingSubGoal(null);
        setSubGoalName('');
    };

    const handleConfirmSubGoalCreation = useCallback(async () => {
        if (!creatingSubGoal || !subGoalName.trim()) return;

        const { parentId, type: parentType } = creatingSubGoal;
        const typeMap = {
            'UltimateGoal': 'LongTermGoal',
            'LongTermGoal': 'MidTermGoal',
            'MidTermGoal': 'ShortTermGoal',
            'ShortTermGoal': 'ImmediateGoal',
            'ImmediateGoal': 'MicroGoal',
            'MicroGoal': 'NanoGoal'
        };
        const childType = typeMap[parentType];
        if (!childType) return;

        try {
            const payload = {
                name: subGoalName.trim(),
                type: childType,
                parent_id: parentId,
            };
            if (childType === 'ImmediateGoal' || childType === 'MicroGoal') {
                payload.session_id = sessionId;
            }

            const newGoal = await createGoal(payload);

            if (viewMode === 'activity' && activeActivityDef) {
                try {
                    const currentGoalIds = activeActivityDef.associated_goal_ids || [];
                    const newIds = [...currentGoalIds, newGoal.id];
                    await fractalApi.setActivityGoals(rootId, activeActivityDef.id, newIds);
                } catch (assocErr) {
                    console.error("Failed to associate new sub-goal with activity", assocErr);
                }
            }

            fetchFractalTree(rootId);

            handleCancelSubGoalCreation();
            if (onGoalCreated) onGoalCreated(newGoal.name);

        } catch (err) {
            console.error("Failed to create sub-goal", err);
        }
    }, [creatingSubGoal, subGoalName, sessionId, createGoal, viewMode, activeActivityDef, rootId, fetchFractalTree, onGoalCreated]);

    // --- Session Activities Derivation ---
    const sessionActivities = useMemo(() => {
        if (!localSessionData?.sections || !activityDefinitions.length || !activityInstances.length) return [];

        const sectionInstanceIds = new Set(
            localSessionData.sections.flatMap((section) => section.activity_ids || [])
        );

        const uniqueDefinitionIds = new Set(
            activityInstances
                .filter((instance) => sectionInstanceIds.has(instance.id))
                .map((instance) => instance.activity_definition_id)
                .filter(Boolean)
        );

        return Array.from(uniqueDefinitionIds)
            .map((id) => activityDefinitions.find((def) => def.id === id))
            .filter(Boolean);
    }, [localSessionData, activityDefinitions, activityInstances]);

    // Unified hierarchy builder
    const getHierarchy = useCallback((goalIds, mode = 'activity', specificActivityId = null, allowedSessionActivityDefIds = null) => {
        if (!goalTree) return [];
        const targetGoalIds = new Set(goalIds || []);

        // 1. Get base hierarchy
        let hierarchy = buildFlattenedGoalTree(goalTree, targetGoalIds, true);

        // 2. Filter MicroGoals
        // If mode is 'session', take ALL session microgoals
        // If mode is 'activity', take only linked microgoals
        const relevantMicroGoals = mode === 'session'
            ? microGoals.filter((microGoal) => {
                if (!allowedSessionActivityDefIds) return false;
                return allowedSessionActivityDefIds.has(microGoal.activity_definition_id);
            })
            : microGoals.filter(m => m.activity_definition_id === specificActivityId);

        if (relevantMicroGoals.length === 0) return hierarchy;

        // 3. Inject MicroGoals
        const microGoalsByParent = {};
        relevantMicroGoals.forEach(m => {
            if (!microGoalsByParent[m.parent_id]) microGoalsByParent[m.parent_id] = [];
            microGoalsByParent[m.parent_id].push(m);
        });

        const newHierarchy = [];
        hierarchy.forEach(node => {
            newHierarchy.push(node);
            if (microGoalsByParent[node.id]) {
                const micros = microGoalsByParent[node.id];
                micros.forEach(micro => {
                    const microDepth = (node.depth || 0) + 1;
                    newHierarchy.push({
                        ...micro,
                        depth: microDepth,
                        isLinked: true,
                        type: 'MicroGoal'
                    });
                    if (micro.children && micro.children.length > 0) {
                        micro.children.forEach(nano => {
                            newHierarchy.push({
                                ...nano,
                                depth: microDepth + 1,
                                isLinked: true,
                                type: 'NanoGoal'
                            });
                        });
                    }
                });
            }
        });

        return newHierarchy;
    }, [goalTree, microGoals]);

    const sessionHierarchy = useMemo(() => {
        if (viewMode !== 'session') return [];
        const allIds = new Set();
        const sessionActivityDefIds = new Set();
        sessionActivities.forEach(def => {
            sessionActivityDefIds.add(def.id);
            def.associated_goal_ids?.forEach(id => allIds.add(id));
        });
        return getHierarchy(Array.from(allIds), 'session', null, sessionActivityDefIds);
    }, [viewMode, sessionActivities, getHierarchy]);

    const activeActivityHierarchy = useMemo(() => {
        if (!activeActivityDef) return [];
        return getHierarchy(resolvedActivityGoalIds, 'activity', activeActivityDef.id);
    }, [activeActivityDef, resolvedActivityGoalIds, getHierarchy]);

    const microChars = getLevelByName('MicroGoal');
    const nanoChars = getLevelByName('NanoGoal');
    const stChars = getLevelByName('ShortTermGoal');
    const immChars = getLevelByName('ImmediateGoal');
    const completedColor = getGoalColor('Completed');
    const completedSecondaryColor = getGoalSecondaryColor('Completed');
    const microTally = { done: microGoals.filter(g => g.completed).length, total: microGoals.length };
    const allNanoGoals = microGoals.flatMap(m => m.children || []);
    const nanoTally = { done: allNanoGoals.filter(g => g.completed).length, total: allNanoGoals.length };

    const isActivityFocused = !!selectedActivity;
    const sessionActivityIds = useMemo(() => new Set(sessionActivities.map(a => a.id)), [sessionActivities]);

    return (
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
                            flattenedHierarchy={activeActivityHierarchy}
                            viewMode={viewMode}
                            onGoalClick={onGoalClick}
                            getLevelByName={getLevelByName}
                            getGoalColor={getGoalColor}
                            getGoalSecondaryColor={getGoalSecondaryColor}
                            getGoalIcon={getGoalIcon}
                            completedColor={completedColor}
                            completedSecondaryColor={completedSecondaryColor}
                            achievedTargetIds={achievedTargetIds}
                            creatingSubGoal={creatingSubGoal}
                            subGoalName={subGoalName}
                            setSubGoalName={setSubGoalName}
                            onStartSubGoalCreation={handleStartSubGoalCreation}
                            onConfirmSubGoalCreation={handleConfirmSubGoalCreation}
                            onCancelSubGoalCreation={handleCancelSubGoalCreation}
                            onOpenAssociate={() => onOpenGoals && onOpenGoals(selectedActivity, {
                                type: 'associate',
                                activityDefinition: activeActivityDef,
                                initialSelectedGoalIds: resolvedActivityGoalIds
                            })}
                        />

                        <TargetsSection
                            rootId={rootId}
                            sessionId={sessionId}
                            hierarchy={activeActivityHierarchy}
                            activeActivityId={activeActivityDef?.id}
                            allowedActivityIds={new Set([activeActivityDef?.id])}
                            activityDefinitions={activityDefinitions}
                            targetAchievements={targetAchievements}
                            achievedTargetIds={achievedTargetIds}
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
                        <HierarchySection
                            type="session"
                            flattenedHierarchy={sessionHierarchy}
                            viewMode="session"
                            onGoalClick={onGoalClick}
                            getLevelByName={getLevelByName}
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
                            rootId={rootId}
                            sessionId={sessionId}
                            hierarchy={sessionHierarchy}
                            activeActivityId={null}
                            allowedActivityIds={sessionActivityIds}
                            activityDefinitions={activityDefinitions}
                            targetAchievements={targetAchievements}
                            achievedTargetIds={achievedTargetIds}
                        />
                    </div>
                )
            }
        </div>
    );
}

export default GoalsPanel;
