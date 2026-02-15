import React, { useState, useMemo, useEffect, useCallback } from 'react';
import GoalIcon from '../atoms/GoalIcon';
import { useTheme } from '../../contexts/ThemeContext';
import { fractalApi } from '../../utils/api';
import TargetManager from '../goalDetail/TargetManager';
import styles from './GoalsPanel.module.css';

/**
 * GoalsPanel - Displays goals relevant to the current session scope.
 *
 * Layout:
 *  - Activity focused: "Activity Goals" (all associated goals) + "Session Focus" (micro/nano)
 *  - No activity: "Working Towards" (hierarchy) + "Session Goals" (ST/IG) + "Session Focus" (micro/nano)
 *  - Micro goals show "Set targets →" affordance
 *  - Inline IG creator when no Immediate Goal exists for micro goal parenting
 */
function GoalsPanel({
    rootId,
    sessionId,
    parentGoals = [],
    session,
    selectedActivity,
    activityInstances = [],
    activityDefinitions = [],
    onGoalClick,
    onGoalCreated,
    targetAchievements,
    achievedTargetIds,
    createMicroTrigger = 0,
    goalCreationContext = null, // { suggestedType: 'ImmediateGoal' | 'MicroGoal', activityDefinition }
}) {
    const { getGoalColor, getGoalSecondaryColor, getScopedCharacteristics } = useTheme();
    const [microGoals, setMicroGoals] = useState([]);
    const [expandedGoals, setExpandedGoals] = useState({});
    const [loading, setLoading] = useState(false);
    const [goalTree, setGoalTree] = useState(null);



    // All available STGs from the fractal (for IG creator)
    const [allShortTermGoals, setAllShortTermGoals] = useState([]);

    // Inline IG creator state
    const [showIGCreator, setShowIGCreator] = useState(false);
    const [igName, setIGName] = useState('');
    const [igParentId, setIGParentId] = useState('');
    const [igCreating, setIGCreating] = useState(false);

    // Micro Goal UX Redesign state
    const [showMicroTargetBuilder, setShowMicroTargetBuilder] = useState(false);
    const [pendingMicroGoal, setPendingMicroGoal] = useState(null);
    const [microTargets, setMicroTargets] = useState([]);
    const [showParentSelector, setShowParentSelector] = useState(false);
    const [pendingMicroGoalName, setPendingMicroGoalName] = useState('');
    const [viewMode, setViewMode] = useState('session'); // 'activity' or 'session'

    // ——————— Data Fetching ———————

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

    // ——————— Flatten tree into a lookup map ———————

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
            for (const child of (node.children || [])) {
                walk(child);
            }
        };
        walk(goalTree);
        return map;
    }, [goalTree]);

    // ——————— Active activity + its associated goals ———————

    const activeActivityDef = useMemo(() => {
        if (!selectedActivity) return null;
        return activityDefinitions.find(d => d.id === selectedActivity.activity_definition_id) || null;
    }, [selectedActivity, activityDefinitions]);

    const activityGoals = useMemo(() => {
        if (!activeActivityDef || !activeActivityDef.associated_goal_ids) return [];
        return activeActivityDef.associated_goal_ids
            .map(id => goalLookup.get(id))
            .filter(Boolean);
    }, [activeActivityDef, goalLookup]);

    // Switch to activity view when a new activity is selected
    useEffect(() => {
        if (selectedActivity) {
            setViewMode('activity');
        } else {
            setViewMode('session');
        }
    }, [selectedActivity]);

    // ——————— Hierarchy Builder ———————

    const hierarchyChain = useMemo(() => {
        if (!goalTree) return [];

        // In session mode, or when no activity is focused, show standard session hierarchy
        if (viewMode === 'session' || !activeActivityDef) {
            const sessionGoalIds = new Set([
                ...parentGoals.map(g => g.id),
                ...(session?.immediate_goals || []).map(g => g.id),
            ]);
            const findPath = (node, path = []) => {
                const entry = {
                    id: node.id,
                    name: node.attributes?.name || node.name,
                    type: node.attributes?.type || node.type,
                    isLinked: sessionGoalIds.has(node.id),
                };
                const currentPath = [...path, entry];
                if (sessionGoalIds.has(node.id)) return currentPath;
                for (const child of (node.children || [])) {
                    const found = findPath(child, currentPath);
                    if (found) return found;
                }
                return null;
            };
            return findPath(goalTree) || [];
        }

        // Activity focused: show paths to goals associated with this activity
        // Filtering out completed goals as requested
        const targetGoalIds = new Set((activeActivityDef.associated_goal_ids || []));

        const findAllPathsToAssociatedIncomplete = (node, path = []) => {
            const nodeCompleted = node.completed || node.attributes?.completed;
            if (nodeCompleted) return []; // Stop at completed goals

            const entry = {
                id: node.id,
                name: node.attributes?.name || node.name,
                type: node.attributes?.type || node.type,
                isLinked: targetGoalIds.has(node.id),
            };

            const currentPath = [...path, entry];

            let paths = [];
            // If this node is a target, this path is a candidate
            if (targetGoalIds.has(node.id)) {
                paths.push(currentPath);
            }

            // Check children for deeper targets
            for (const child of (node.children || [])) {
                paths = [...paths, ...findAllPathsToAssociatedIncomplete(child, currentPath)];
            }
            return paths;
        };

        const allPaths = findAllPathsToAssociatedIncomplete(goalTree);

        // Flatten and unique nodes to show a single "working towards" tree section
        // Note: For simplicity in the current UI, we'll just take the longest path or a merged set
        // But the previous UI expected a single array 'hierarchyChain'.
        // Let's return the most relevant path (likely leaf-most)
        if (allPaths.length > 0) {
            // Sort by length to show the deepest connection
            return allPaths.sort((a, b) => b.length - a.length)[0];
        }

        return [];
    }, [goalTree, parentGoals, session, activeActivityDef, viewMode]);

    // ——————— Session Goals (ST + IG) ———————

    const sessionGoals = useMemo(() => {
        return {
            shortTerm: parentGoals,
            immediate: session?.immediate_goals || [],
        };
    }, [parentGoals, session]);

    // ——————— Handlers ———————

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

            // Link to the active activity if applicable
            if (activeActivityDef) {
                try {
                    await fractalApi.associateGoalToActivity(rootId, res.data.id, activeActivityDef.id);
                } catch (linkErr) {
                    console.error("Failed to link new IG to activity", linkErr);
                }
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

    const handleCreateMicroGoal = async (name) => {
        if (!name.trim()) return;
        const immediateGoals = session?.immediate_goals || [];
        if (immediateGoals.length === 0) {
            setShowIGCreator(true);
            return;
        }
        const parentId = immediateGoals[0].id;
        try {
            const res = await fractalApi.createGoal(rootId, {
                name,
                type: 'MicroGoal',
                parent_id: parentId,
                session_id: sessionId,
            });
            setMicroGoals(prev => [...prev, { ...res.data, children: [] }]);
            if (onGoalCreated) onGoalCreated();
        } catch (err) {
            console.error("Failed to create micro goal", err);
        }
    };

    const findParentGoalForActivity = useCallback((activityDef) => {
        if (!activityDef?.associated_goal_ids?.length) return null;

        const sessionIGIds = new Set((session?.immediate_goals || []).map(g => g.id));

        // 1. Prefer IG linked to both session and activity
        for (const goalId of activityDef.associated_goal_ids) {
            if (sessionIGIds.has(goalId)) return goalId;
        }

        // 2. Fallback to any associated STG/IG
        for (const goalId of activityDef.associated_goal_ids) {
            const goal = goalLookup.get(goalId);
            if (goal && (goal.type === 'ImmediateGoal' || goal.type === 'ShortTermGoal')) {
                return goalId;
            }
        }
        return null;
    }, [session?.immediate_goals, goalLookup]);

    const handleCreateMicroGoalWithTarget = async (name) => {
        if (!name.trim()) return;

        // Relax restriction: allow multiple micro goals per activity
        // but perhaps warn if creating exact duplicate name
        const existingActive = microGoals.find(m =>
            !m.completed && m.name === name &&
            (m.activity_definition_id === activeActivityDef.id)
        );

        if (existingActive) {
            console.warn("Active micro goal with same name already exists for this activity");
            // Still allow it if names differ or if user clicks again? 
            // For now, let's just make it a name-based check instead of a hard block
        }

        const parentId = findParentGoalForActivity(activeActivityDef);

        if (!parentId) {
            setShowParentSelector(true);
            setPendingMicroGoalName(name);
            return;
        }

        handleCreateMicroGoalWithParent(name, parentId);
    };

    const handleCreateMicroGoalWithParent = async (name, parentId) => {
        try {
            const res = await fractalApi.createGoal(rootId, {
                name,
                type: 'MicroGoal',
                parent_id: parentId,
                session_id: sessionId,
                // Explicitly link to activity definition for stronger association
                activity_definition_id: activeActivityDef?.id
            });

            // Ensure the association is created on the backend as well
            if (activeActivityDef) {
                try {
                    await fractalApi.associateGoalToActivity(rootId, res.data.id, activeActivityDef.id);
                } catch (linkErr) {
                    console.error("Failed to link new Micro Goal to activity", linkErr);
                }
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

    // ——————— Auto-creation Trigger ———————

    // Track the last trigger we handled to avoid multiple creations
    const lastTriggerHandled = React.useRef(0);

    // Effect to handle auto-creation trigger from activity button
    useEffect(() => {
        if (createMicroTrigger > 0 && createMicroTrigger !== lastTriggerHandled.current && activeActivityDef) {
            lastTriggerHandled.current = createMicroTrigger;

            // Check context for specific action
            if (goalCreationContext?.suggestedType === 'ImmediateGoal') {
                // Open inline IG creator
                setShowIGCreator(true);
                setIGName("Goal for " + activeActivityDef.name);

                // Try to find parent STG from context associations
                if (goalCreationContext.activityDefinition?.associated_goal_ids) {
                    const linkedSTG = allShortTermGoals.find(stg =>
                        goalCreationContext.activityDefinition.associated_goal_ids.includes(stg.id)
                    );
                    if (linkedSTG) {
                        setIGParentId(linkedSTG.id);
                    }
                }
            } else if (goalCreationContext?.suggestedType === 'associate') {
                // Just opening the panel is enough, maybe scroll to hierarchy?
                // For now, no specific action needed other than view switch which happens in parent
            } else {
                // Default to Micro Goal creation (existing behavior)
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

    // ——————— Theme ———————
    const microChars = getScopedCharacteristics('MicroGoal');
    const nanoChars = getScopedCharacteristics('NanoGoal');
    const stChars = getScopedCharacteristics('ShortTermGoal');
    const immChars = getScopedCharacteristics('ImmediateGoal');
    const completedColor = getGoalColor('CompletedGoal');
    const completedSecondaryColor = getGoalSecondaryColor('CompletedGoal');

    // ——————— Tally ———————
    const microTally = { done: microGoals.filter(g => g.completed).length, total: microGoals.length };
    const allNanoGoals = microGoals.flatMap(m => m.children || []);
    const nanoTally = { done: allNanoGoals.filter(g => g.completed).length, total: allNanoGoals.length };

    const isActivityFocused = !!activeActivityDef;

    // ——————— Render ———————
    return (
        <div className={styles.goalsPanel}>
            {/* ═══ VIEW TOGGLE / ACTIVITY HEADER ═══ */}
            {isActivityFocused ? (
                <div className={styles.viewToggleContainer}>
                    <button
                        className={`${styles.viewToggleButton} ${viewMode === 'activity' ? styles.activeToggleButton : ''}`}
                        onClick={() => setViewMode('activity')}
                    >
                        Activity: {activeActivityDef.name}
                    </button>
                    <button
                        className={`${styles.viewToggleButton} ${viewMode === 'session' ? styles.activeToggleButton : ''}`}
                        onClick={() => setViewMode('session')}
                    >
                        Session
                    </button>
                </div>
            ) : (
                <div className={styles.contextSection}>
                    <div className={styles.contextLabel}>Session Goals</div>
                </div>
            )}

            {/* ═══ HIERARCHY (always visible or filtered) ═══ */}
            {hierarchyChain.length > 0 && (
                <div className={styles.contextSection}>
                    <div className={styles.contextLabel}>
                        {viewMode === 'activity' ? 'Working Towards' : 'Goal Hierarchy'}
                    </div>
                    <div className={styles.hierarchyChain}>
                        {hierarchyChain.map((node, i) => (
                            <div
                                key={node.id}
                                className={styles.hierarchyNode}
                                style={{ paddingLeft: `${i * 14}px` }}
                            >
                                <GoalIcon
                                    shape={getScopedCharacteristics(node.type)?.icon || 'circle'}
                                    color={getGoalColor(node.type)}
                                    secondaryColor={getGoalSecondaryColor(node.type)}
                                    size={12}
                                />
                                <span
                                    className={`${styles.hierarchyNodeName} ${node.isLinked ? styles.hierarchyNodeLinked : ''}`}
                                    onClick={() => onGoalClick && onGoalClick(node)}
                                >
                                    {node.name}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ═══ ACTIVITY GOALS (Only in Activity View) ═══ */}
            {viewMode === 'activity' && isActivityFocused && activityGoals.length > 0 && (
                <div className={styles.contextSection}>
                    <div className={styles.subSectionHeader || styles.contextLabel}>Activity Goals</div>
                    <div className={styles.activityGoalsList}>
                        {activityGoals.map(goal => (
                            <div key={goal.id} className={styles.activityGoalRow}>
                                <GoalIcon
                                    shape={getScopedCharacteristics(goal.type)?.icon || 'circle'}
                                    color={goal.completed ? completedColor : getGoalColor(goal.type)}
                                    secondaryColor={goal.completed ? completedSecondaryColor : getGoalSecondaryColor(goal.type)}
                                    isSmart={goal.is_smart}
                                    size={16}
                                />
                                <div className={styles.activityGoalInfo}>
                                    <span className={styles.activityGoalType}>
                                        {formatGoalType(goal.type)}
                                    </span>
                                    <span
                                        className={styles.activityGoalName}
                                        onClick={() => onGoalClick && onGoalClick(goal)}
                                    >
                                        {goal.name}
                                    </span>
                                </div>
                                {(() => {
                                    const targets = parseTargets(goal);
                                    return targets.length > 0 ? (
                                        <span className={styles.targetBadge}>
                                            {targets.filter(t => achievedTargetIds?.has(t.id)).length}/{targets.length}
                                        </span>
                                    ) : null;
                                })()}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ═══ SESSION GOALS (ST + IG, shown in Session View OR when no activity focused) ═══ */}
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

            {/* ═══ SESSION FOCUS (micro + nano) - Only in Session View ═══ */}
            {viewMode === 'session' && (
                <div className={styles.focusSection}>
                    <div className={styles.sectionHeader}>Session Focus</div>

                    {loading && <div className={styles.loadingText}>Loading...</div>}

                    {microGoals.map(micro => {
                        const microTargets = parseTargets(micro);
                        return (
                            <div key={micro.id} className={styles.microGoalRow}>
                                <div className={styles.microGoalHeader}>
                                    <GoalIcon
                                        shape={microChars.icon || 'circle'}
                                        color={micro.completed ? completedColor : getGoalColor('MicroGoal')}
                                        secondaryColor={micro.completed ? completedSecondaryColor : getGoalSecondaryColor('MicroGoal')}
                                        isSmart={micro.is_smart}
                                        size={18}
                                    />
                                    <input
                                        type="checkbox"
                                        className={styles.microGoalCheckbox}
                                        checked={micro.completed || false}
                                        onChange={(e) => handleToggleCompletion(micro, e.target.checked)}
                                    />
                                    <span
                                        className={`${styles.microGoalName} ${micro.completed ? styles.completedText : ''}`}
                                        onClick={() => onGoalClick && onGoalClick(micro)}
                                    >
                                        {micro.name}
                                    </span>
                                </div>

                                {/* Target affordance: show current targets or invite to add */}
                                <div className={styles.microTargetArea}>
                                    {microTargets.length > 0 ? (
                                        <div className={styles.microTargetList}>
                                            {microTargets.map(t => {
                                                const isAchieved = achievedTargetIds?.has(t.id);
                                                return (
                                                    <span key={t.id} className={`${styles.microTargetChip} ${isAchieved ? styles.microTargetDone : ''}`}>
                                                        {isAchieved ? '✓' : '○'} {t.name || formatTargetDescription(t)}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <button
                                            className={styles.addTargetLink}
                                            onClick={() => onGoalClick && onGoalClick(micro)}
                                        >
                                            + Set target
                                        </button>
                                    )}
                                </div>

                                {/* Nano Goals */}
                                <div className={styles.nanoGoalsContainer}>
                                    {micro.children?.map(nano => (
                                        <div key={nano.id} className={styles.nanoGoalRow}>
                                            <GoalIcon
                                                shape={nanoChars.icon || 'star'}
                                                color={nano.completed ? completedColor : getGoalColor('NanoGoal')}
                                                secondaryColor={nano.completed ? completedSecondaryColor : getGoalSecondaryColor('NanoGoal')}
                                                isSmart={false}
                                                size={14}
                                            />
                                            <input
                                                type="checkbox"
                                                className={styles.nanoGoalCheckbox}
                                                checked={nano.completed || false}
                                                onChange={(e) => handleToggleCompletion(nano, e.target.checked)}
                                            />
                                            <span className={`${styles.nanoGoalName} ${nano.completed ? styles.completedText : ''}`}>
                                                {nano.name}
                                            </span>
                                        </div>
                                    ))}
                                    <input
                                        type="text"
                                        className={styles.nanoQuickAdd}
                                        placeholder="Add a cue / sub-step..."
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && e.target.value.trim()) {
                                                handleCreateNanoGoal(micro.id, e.target.value.trim());
                                                e.target.value = '';
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}

                    <div className={styles.microQuickAddContainer}>
                        <input
                            type="text"
                            className={styles.microQuickAdd}
                            placeholder="+ Add session focus..."
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && e.target.value.trim()) {
                                    handleCreateMicroGoalWithTarget(e.target.value.trim());
                                    e.target.value = '';
                                }
                            }}
                        />
                    </div>

                    {/* Inline IG Creator */}
                    {showIGCreator && (
                        <div className={styles.igCreator}>
                            <div className={styles.igCreatorHeader}>
                                <span>⚠️</span>
                                <span>No Immediate Goal linked. Create one to parent your Micro Goals:</span>
                            </div>
                            <input
                                type="text"
                                className={styles.igCreatorInput}
                                placeholder="Immediate Goal name..."
                                value={igName}
                                onChange={(e) => setIGName(e.target.value)}
                                autoFocus
                            />
                            <div className={styles.igCreatorField}>
                                <label className={styles.igCreatorLabel}>Parent (Short-Term Goal):</label>
                                <select
                                    className={styles.igCreatorSelect}
                                    value={igParentId}
                                    onChange={(e) => setIGParentId(e.target.value)}
                                >
                                    <option value="">Select a Short-Term Goal...</option>
                                    {allShortTermGoals.map(stg => (
                                        <option key={stg.id} value={stg.id}>{stg.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className={styles.igCreatorActions}>
                                <button
                                    className={styles.igCreatorSubmit}
                                    onClick={handleCreateImmediateGoal}
                                    disabled={igCreating || !igName.trim() || !igParentId}
                                >
                                    {igCreating ? 'Creating...' : 'Create & Continue'}
                                </button>
                                <button
                                    className={styles.igCreatorCancel}
                                    onClick={() => setShowIGCreator(false)}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ═══ Footer Tally ═══ */}
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
        </div >
    );
}

// ——————— GoalRow Sub-Component ———————

function GoalRow({
    goal, icon, color, secondaryColor, completedColor, completedSecondaryColor,
    isExpanded, onToggle, onGoalClick, targetAchievements, achievedTargetIds,
}) {
    const targets = parseTargets(goal);

    return (
        <div className={styles.goalRow}>
            <div className={styles.goalHeader} onClick={onToggle}>
                <GoalIcon
                    shape={icon || 'circle'}
                    color={goal.completed ? completedColor : color}
                    secondaryColor={goal.completed ? completedSecondaryColor : secondaryColor}
                    isSmart={goal.is_smart}
                    size={16}
                />
                <div className={styles.goalName}>
                    <span
                        className={styles.goalNameClickable}
                        onClick={(e) => { e.stopPropagation(); onGoalClick && onGoalClick(goal); }}
                    >
                        {goal.name || goal.attributes?.name}
                    </span>
                    {targets.length > 0 && (
                        <span className={styles.targetBadge}>
                            {targets.filter(t => achievedTargetIds?.has(t.id)).length}/{targets.length}
                        </span>
                    )}
                </div>
                <div className={styles.expandToggle}>{isExpanded ? '▼' : '▶'}</div>
            </div>

            {isExpanded && (
                <div className={styles.expandedContent}>
                    {targets.length > 0 ? (
                        <div className={styles.targetsList}>
                            {targets.map(target => {
                                const isAchieved = achievedTargetIds?.has(target.id);
                                return (
                                    <div key={target.id} className={`${styles.targetRow} ${isAchieved ? styles.targetAchieved : ''}`}>
                                        <span className={styles.targetIndicator}>{isAchieved ? '✓' : '○'}</span>
                                        <span className={styles.targetName}>{target.name || formatTargetDescription(target)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className={styles.noTargets}>
                            {goal.description || 'No targets set for this goal.'}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ——————— Helpers ———————

function parseTargets(goal) {
    let targets = [];
    const raw = goal.attributes?.targets || goal.targets;
    if (raw) {
        try { targets = typeof raw === 'string' ? JSON.parse(raw) : raw; }
        catch { targets = []; }
    }
    return Array.isArray(targets) ? targets : [];
}

function formatTargetDescription(target) {
    if (target.description) return target.description;
    const metrics = target.metrics || [];
    if (metrics.length === 0) return 'Target';
    return metrics.map(m => `${m.metric_name || 'Metric'} ≥ ${m.value}`).join(', ');
}

function formatGoalType(type) {
    if (!type) return '';
    return type.replace(/Goal$/, '').replace(/([A-Z])/g, ' $1').trim();
}

export default GoalsPanel;
