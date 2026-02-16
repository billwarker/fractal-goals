import React, { useState, useMemo, useEffect, useCallback } from 'react';
import GoalIcon from '../atoms/GoalIcon';
import { useTheme } from '../../contexts/ThemeContext';
import { fractalApi } from '../../utils/api';
import {
    buildFlattenedGoalTree,
} from '../../utils/goalUtils';
import GoalRow from './GoalRow';
import HierarchySection from './HierarchySection';
import SessionFocusSection from './SessionFocusSection';
import styles from './GoalsPanel.module.css';

/**
 * GoalsPanel - Displays goals relevant to the current session scope.
 */
function GoalsPanel({
    rootId,
    sessionId,
    parentGoals = [],
    session,
    selectedActivity,
    activityDefinitions = [],
    onGoalClick,
    onGoalCreated,
    targetAchievements,
    achievedTargetIds,
    createMicroTrigger = 0,
    goalCreationContext = null,
    onOpenGoals
}) {
    const { getGoalColor, getGoalSecondaryColor, getScopedCharacteristics } = useTheme();
    const [microGoals, setMicroGoals] = useState([]);
    const [expandedGoals, setExpandedGoals] = useState({});
    const [loading, setLoading] = useState(false);
    const [goalTree, setGoalTree] = useState(null);
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

    const fetchMicroGoals = useCallback(async () => {
        if (!rootId || !sessionId) return;
        setLoading(true);
        try {
            const res = await fractalApi.getSessionMicroGoals(rootId, sessionId);
            setMicroGoals(res.data || []);
        } catch (err) {
            console.error("Failed to fetch session micro goals", err);
        } finally {
            setLoading(false);
        }
    }, [rootId, sessionId]);

    useEffect(() => { fetchMicroGoals(); }, [fetchMicroGoals]);

    useEffect(() => {
        if (!rootId) return;
        const fetchTree = async () => {
            try {
                const res = await fractalApi.getGoal(rootId, rootId);
                setGoalTree(res.data);
            } catch (err) {
                console.error("Failed to fetch goal tree", err);
            }
        };
        fetchTree();
    }, [rootId]);

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
        return activityDefinitions.find(d => d.id === selectedActivity.activity_definition_id) || null;
    }, [selectedActivity, activityDefinitions]);

    useEffect(() => {
        if (selectedActivity) setViewMode('activity');
        else setViewMode('session');
    }, [selectedActivity]);

    const flattenedHierarchy = useMemo(() => {
        if (!goalTree) return [];
        const targetGoalIds = new Set(
            viewMode === 'activity' && activeActivityDef
                ? activeActivityDef.associated_goal_ids || []
                : [
                    ...parentGoals.map(g => g.id),
                    ...(session?.immediate_goals || []).map(g => g.id),
                ]
        );
        return buildFlattenedGoalTree(goalTree, targetGoalIds, viewMode === 'activity');
    }, [goalTree, parentGoals, session, activeActivityDef, viewMode]);

    const sessionGoals = useMemo(() => ({
        shortTerm: parentGoals,
        immediate: session?.immediate_goals || [],
    }), [parentGoals, session]);

    const toggleExpand = (goalId) => {
        setExpandedGoals(prev => ({ ...prev, [goalId]: !prev[goalId] }));
    };

    const handleToggleCompletion = async (goal, completed) => {
        try {
            await fractalApi.toggleGoalCompletion(rootId, goal.id, completed);
            if (goal.type === 'MicroGoal') {
                setMicroGoals(prev => prev.map(g => g.id === goal.id ? { ...g, completed } : g));
            } else if (goal.type === 'NanoGoal') {
                setMicroGoals(prev => prev.map(m => ({
                    ...m,
                    children: m.children?.map(n => n.id === goal.id ? { ...n, completed } : n)
                })));
            }
            if (onGoalCreated) onGoalCreated();
        } catch (err) {
            console.error("Failed to toggle goal completion", err);
        }
    };

    const handleCreateImmediateGoal = async () => {
        if (!igName.trim() || !igParentId) return;
        setIGCreating(true);
        try {
            const res = await fractalApi.createGoal(rootId, {
                name: igName.trim(),
                type: 'ImmediateGoal',
                parent_id: igParentId,
            });
            await fractalApi.addSessionGoal(rootId, sessionId, res.data.id, 'immediate');
            if (activeActivityDef) {
                try { await fractalApi.associateGoalToActivity(rootId, res.data.id, activeActivityDef.id); }
                catch (linkErr) { console.error("Failed to link new IG to activity", linkErr); }
            }
            setIGName('');
            setIGParentId('');
            setShowIGCreator(false);
            if (onGoalCreated) onGoalCreated();
        } catch (err) {
            console.error("Failed to create Immediate Goal", err);
        } finally {
            setIGCreating(false);
        }
    };

    const handleCreateMicroGoalWithParent = async (name, parentId) => {
        try {
            const res = await fractalApi.createGoal(rootId, {
                name,
                type: 'MicroGoal',
                parent_id: parentId,
                session_id: sessionId,
                activity_definition_id: activeActivityDef?.id
            });
            if (activeActivityDef) {
                try { await fractalApi.associateGoalToActivity(rootId, res.data.id, activeActivityDef.id); }
                catch (linkErr) { console.error("Failed to link new Micro Goal to activity", linkErr); }
            }
            const newMicro = { ...res.data, children: [] };
            setMicroGoals(prev => [...prev, newMicro]);
            setPendingMicroGoal(newMicro);
            setShowMicroTargetBuilder(true);
            if (onGoalCreated) onGoalCreated();
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
            const res = await fractalApi.createGoal(rootId, {
                name,
                type: 'NanoGoal',
                parent_id: microGoalId,
            });
            setMicroGoals(prev => prev.map(m =>
                m.id === microGoalId ? { ...m, children: [...(m.children || []), res.data] } : m
            ));
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

    const handleConfirmSubGoalCreation = async () => {
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

        setLoading(true);
        try {
            const payload = {
                name: subGoalName.trim(),
                type: childType,
                parent_id: parentId,
            };
            if (childType === 'ImmediateGoal' || childType === 'MicroGoal') {
                payload.session_id = sessionId;
            }

            const res = await fractalApi.createGoal(rootId, payload);
            const newGoal = res.data;

            if (activeActivityDef) {
                try {
                    await fractalApi.associateGoalToActivity(rootId, newGoal.id, activeActivityDef.id);
                } catch (assocErr) {
                    console.error("Failed to associate new sub-goal with activity", assocErr);
                }
            }

            const treeRes = await fractalApi.getGoal(rootId, rootId);
            setGoalTree(treeRes.data);

            if (childType === 'MicroGoal' || childType === 'NanoGoal') {
                fetchMicroGoals();
            }

            handleCancelSubGoalCreation();
            if (onGoalCreated) onGoalCreated();

        } catch (err) {
            console.error("Failed to create sub-goal", err);
        } finally {
            setLoading(false);
        }
    };

    const microChars = getScopedCharacteristics('MicroGoal');
    const nanoChars = getScopedCharacteristics('NanoGoal');
    const stChars = getScopedCharacteristics('ShortTermGoal');
    const immChars = getScopedCharacteristics('ImmediateGoal');
    const completedColor = getGoalColor('CompletedGoal');
    const completedSecondaryColor = getGoalSecondaryColor('CompletedGoal');
    const microTally = { done: microGoals.filter(g => g.completed).length, total: microGoals.length };
    const allNanoGoals = microGoals.flatMap(m => m.children || []);
    const nanoTally = { done: allNanoGoals.filter(g => g.completed).length, total: allNanoGoals.length };

    const isActivityFocused = !!activeActivityDef;

    return (
        <div className={styles.goalsPanel}>
            {isActivityFocused ? (
                <>
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
                        <HierarchySection
                            type="activity"
                            activityDefinition={activeActivityDef}
                            flattenedHierarchy={flattenedHierarchy}
                            viewMode={viewMode}
                            onGoalClick={onGoalClick}
                            getScopedCharacteristics={getScopedCharacteristics}
                            getGoalColor={getGoalColor}
                            getGoalSecondaryColor={getGoalSecondaryColor}
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
                                initialSelectedGoalIds: activeActivityDef.associated_goal_ids || []
                            })}
                        />
                    )}
                </>
            ) : (
                <HierarchySection
                    type="session"
                    flattenedHierarchy={flattenedHierarchy}
                    viewMode={viewMode}
                    onGoalClick={onGoalClick}
                    getScopedCharacteristics={getScopedCharacteristics}
                    getGoalColor={getGoalColor}
                    getGoalSecondaryColor={getGoalSecondaryColor}
                    completedColor={completedColor}
                    completedSecondaryColor={completedSecondaryColor}
                    achievedTargetIds={achievedTargetIds}
                    creatingSubGoal={creatingSubGoal}
                    subGoalName={subGoalName}
                    setSubGoalName={setSubGoalName}
                    onStartSubGoalCreation={handleStartSubGoalCreation}
                    onConfirmSubGoalCreation={handleConfirmSubGoalCreation}
                    onCancelSubGoalCreation={handleCancelSubGoalCreation}
                />
            )}

            {(viewMode === 'session' || !isActivityFocused) && (sessionGoals.shortTerm.length > 0 || sessionGoals.immediate.length > 0) && (
                <div className={styles.sessionGoalsSection}>
                    {sessionGoals.shortTerm.map(goal => (
                        <GoalRow
                            key={goal.id}
                            goal={goal}
                            icon={stChars.icon}
                            color={getGoalColor('ShortTermGoal')}
                            secondaryColor={getGoalSecondaryColor('ShortTermGoal')}
                            completedColor={completedColor}
                            completedSecondaryColor={completedSecondaryColor}
                            isExpanded={expandedGoals[goal.id]}
                            onToggle={() => toggleExpand(goal.id)}
                            onGoalClick={onGoalClick}
                            targetAchievements={targetAchievements}
                            achievedTargetIds={achievedTargetIds}
                        />
                    ))}
                    {sessionGoals.immediate.map(goal => (
                        <GoalRow
                            key={goal.id}
                            goal={goal}
                            icon={immChars.icon}
                            color={getGoalColor('ImmediateGoal')}
                            secondaryColor={getGoalSecondaryColor('ImmediateGoal')}
                            completedColor={completedColor}
                            completedSecondaryColor={completedSecondaryColor}
                            isExpanded={expandedGoals[goal.id]}
                            onToggle={() => toggleExpand(goal.id)}
                            onGoalClick={onGoalClick}
                            targetAchievements={targetAchievements}
                            achievedTargetIds={achievedTargetIds}
                        />
                    ))}
                </div>
            )}

            {viewMode === 'session' && (
                <SessionFocusSection
                    loading={loading}
                    microGoals={microGoals}
                    microChars={microChars}
                    nanoChars={nanoChars}
                    completedColor={completedColor}
                    completedSecondaryColor={completedSecondaryColor}
                    getGoalColor={getGoalColor}
                    getGoalSecondaryColor={getGoalSecondaryColor}
                    handleToggleCompletion={handleToggleCompletion}
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
            )}

            {viewMode === 'session' && (
                <div className={styles.footer}>
                    <div className={styles.tallyItem}>
                        <GoalIcon shape={microChars.icon || 'circle'} color={getGoalColor('MicroGoal')} size={14} />
                        <span>{microTally.done}/{microTally.total}</span>
                    </div>
                    <div className={styles.tallySeparator}>|</div>
                    <div className={styles.tallyItem}>
                        <GoalIcon shape={nanoChars.icon || 'star'} color={getGoalColor('NanoGoal')} size={14} />
                        <span>{nanoTally.done}/{nanoTally.total}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

export default GoalsPanel;
