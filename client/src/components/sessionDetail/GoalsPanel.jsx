import React, { useState, useMemo, useEffect, useCallback } from 'react';
import GoalIcon from '../atoms/GoalIcon';
import { useTheme } from '../../contexts/ThemeContext';
import { fractalApi } from '../../utils/api';
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

    // ——————— Hierarchy Builder ———————

    const hierarchyChain = useMemo(() => {
        if (!goalTree) return [];
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
    }, [goalTree, parentGoals, session]);

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
            {/* ═══ HIERARCHY (always visible) ═══ */}
            {hierarchyChain.length > 0 && (
                <div className={styles.contextSection}>
                    <div className={styles.contextLabel}>Working Towards</div>
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

            {/* ═══ ACTIVITY CONTEXT (when activity focused) ═══ */}
            {isActivityFocused && (
                <div className={styles.contextSection}>
                    <div className={styles.contextLabel}>🎯 {activeActivityDef.name}</div>
                    {activityGoals.length > 0 ? (
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
                    ) : (
                        <div className={styles.noGoalsText}>
                            No goals associated with this activity yet.
                        </div>
                    )}
                </div>
            )}

            {/* ═══ SESSION GOALS (ST + IG, when no activity focused) ═══ */}
            {!isActivityFocused && (sessionGoals.shortTerm.length > 0 || sessionGoals.immediate.length > 0) && (
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

            {/* ═══ SESSION FOCUS (micro + nano) ═══ */}
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

                {/* Quick Add Micro Goal */}
                <div className={styles.quickAddContainer}>
                    <GoalIcon
                        shape={microChars.icon || 'circle'}
                        color={getGoalColor('MicroGoal')}
                        size={18}
                        opacity={0.5}
                    />
                    <input
                        type="text"
                        className={styles.quickAddInput}
                        placeholder="Add a micro-goal..."
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.target.value.trim()) {
                                handleCreateMicroGoal(e.target.value.trim());
                                e.target.value = '';
                            }
                        }}
                    />
                </div>
            </div>

            {/* ═══ Footer Tally ═══ */}
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
        </div>
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
