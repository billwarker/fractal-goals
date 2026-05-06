import React, { useMemo, useState } from 'react';

import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import GoalHierarchyList from './GoalHierarchyList';
import styles from './GoalHierarchySelector.module.css';

function normalizeGoal(goal) {
    if (!goal) return null;
    const attributes = goal.attributes || {};
    return {
        ...goal,
        id: goal.id || attributes.id,
        name: goal.name || attributes.name || 'Untitled goal',
        type: goal.type || goal.goal_type || attributes.type || attributes.goal_type,
        parent_id: goal.parent_id || goal.parentId || attributes.parent_id || attributes.parentId || null,
        childrenIds: goal.childrenIds || goal.children_ids || attributes.childrenIds || attributes.children_ids || [],
        completed: Boolean(goal.completed || goal.status?.completed || attributes.completed || attributes.status?.completed),
        originalGoal: goal.originalGoal || goal,
    };
}

function buildChildIdsByParent(goals) {
    const goalIds = new Set(goals.map((goal) => goal.id));
    const map = new Map();

    goals.forEach((goal) => {
        if (!map.has(goal.id)) {
            map.set(goal.id, []);
        }
    });

    goals.forEach((goal) => {
        const parentId = goal.parent_id;
        if (parentId && goalIds.has(parentId)) {
            if (!map.has(parentId)) {
                map.set(parentId, []);
            }
            map.get(parentId).push(goal.id);
        }
    });

    goals.forEach((goal) => {
        const directChildren = map.get(goal.id) || [];
        const explicitChildren = (goal.childrenIds || []).filter((childId) => goalIds.has(childId));
        map.set(goal.id, Array.from(new Set([...directChildren, ...explicitChildren])));
    });

    return map;
}

function collectDescendantIds(goalId, childIdsByParent) {
    const result = [];
    const visited = new Set([goalId]);

    const visit = (currentId) => {
        (childIdsByParent.get(currentId) || []).forEach((childId) => {
            if (visited.has(childId)) {
                return;
            }
            visited.add(childId);
            result.push(childId);
            visit(childId);
        });
    };

    visit(goalId);
    return result;
}

function collectAncestorIds(goal, goalById) {
    const result = [];
    if (!goal) {
        return result;
    }
    const visited = new Set([goal.id]);
    let parentId = goal.parent_id;

    while (parentId && goalById.has(parentId) && !visited.has(parentId)) {
        visited.add(parentId);
        result.push(parentId);
        parentId = goalById.get(parentId)?.parent_id;
    }

    return result;
}

function findSelectedDescendant(goalId, goalById, childIdsByParent, selectedIdSet) {
    const visited = new Set([goalId]);

    const visit = (currentId) => {
        for (const childId of childIdsByParent.get(currentId) || []) {
            if (visited.has(childId)) {
                continue;
            }
            visited.add(childId);
            if (selectedIdSet.has(String(childId))) {
                return goalById.get(childId) || null;
            }
            const nestedMatch = visit(childId);
            if (nestedMatch) {
                return nestedMatch;
            }
        }
        return null;
    };

    return visit(goalId);
}

function findSelectedAncestor(goal, goalById, selectedIdSet) {
    const visited = new Set([goal.id]);
    let parentId = goal.parent_id;

    while (parentId && goalById.has(parentId) && !visited.has(parentId)) {
        visited.add(parentId);
        const parentGoal = goalById.get(parentId);
        if (selectedIdSet.has(String(parentId))) {
            return parentGoal;
        }
        parentId = parentGoal?.parent_id;
    }

    return null;
}

function filterGoalsForSearch(goals, query) {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
        return goals;
    }

    const goalById = new Map(goals.map((goal) => [goal.id, goal]));
    const includedIds = new Set();

    goals.forEach((goal) => {
        const typeLabel = (goal.type || '').replace(/([A-Z])/g, ' $1').trim();
        const matches = goal.name.toLowerCase().includes(trimmed)
            || typeLabel.toLowerCase().includes(trimmed);

        if (!matches) {
            return;
        }

        includedIds.add(goal.id);
        let parentId = goal.parent_id;
        const seen = new Set([goal.id]);
        while (parentId && goalById.has(parentId) && !seen.has(parentId)) {
            includedIds.add(parentId);
            seen.add(parentId);
            parentId = goalById.get(parentId)?.parent_id;
        }
    });

    return goals.filter((goal) => includedIds.has(goal.id));
}

function GoalHierarchySelector({
    goals = [],
    selectedGoalIds = [],
    onSelectionChange,
    selectionMode = 'multiple',
    searchable = true,
    searchPlaceholder = 'Search goals...',
    emptyState = 'No goals available.',
    showSelectionInheritanceMeta = false,
    highlightSelectionAncestors = false,
    connectorHighlightMode = highlightSelectionAncestors ? 'lineage' : 'selected',
    showGoalHighlightHalo = false,
    showAncestorControls = true,
}) {
    const {
        getGoalColor,
        getGoalSecondaryColor,
        getGoalIcon,
        getScopedCharacteristics,
    } = useGoalLevels();
    const [searchTerm, setSearchTerm] = useState('');
    const [hideCompletedGoals, setHideCompletedGoals] = useState(false);
    const [bulkConnectorGoalIds, setBulkConnectorGoalIds] = useState(() => new Set());

    const normalizedGoals = useMemo(
        () => goals.map(normalizeGoal).filter((goal) => goal?.id),
        [goals]
    );
    const selectedIdSet = useMemo(
        () => new Set(selectedGoalIds.map((goalId) => String(goalId))),
        [selectedGoalIds]
    );
    const childIdsByParent = useMemo(
        () => buildChildIdsByParent(normalizedGoals),
        [normalizedGoals]
    );
    const goalById = useMemo(
        () => new Map(normalizedGoals.map((goal) => [goal.id, goal])),
        [normalizedGoals]
    );
    const visibleGoals = useMemo(
        () => {
            const filteredGoals = hideCompletedGoals
                ? normalizedGoals.filter((goal) => !goal.completed)
                : normalizedGoals;

            return filterGoalsForSearch(filteredGoals, searchTerm);
        },
        [hideCompletedGoals, normalizedGoals, searchTerm]
    );
    const selectedAncestorIdSet = useMemo(() => {
        if (!highlightSelectionAncestors) {
            return new Set();
        }

        const ancestorIds = new Set();
        selectedIdSet.forEach((goalId) => {
            const goal = goalById.get(goalId);
            collectAncestorIds(goal, goalById).forEach((ancestorId) => {
                ancestorIds.add(String(ancestorId));
            });
        });
        return ancestorIds;
    }, [goalById, highlightSelectionAncestors, selectedIdSet]);

    const isSingleSelect = selectionMode === 'single';

    const emitSelection = (nextIds) => {
        onSelectionChange?.(Array.from(new Set(nextIds)).filter(Boolean));
    };

    const toggleGoal = (goalId) => {
        setBulkConnectorGoalIds((current) => {
            const next = new Set(current);
            next.delete(goalId);
            return next;
        });

        if (isSingleSelect) {
            emitSelection(selectedIdSet.has(goalId) ? [] : [goalId]);
            return;
        }

        const next = new Set(selectedIdSet);
        if (next.has(goalId)) {
            next.delete(goalId);
        } else {
            next.add(goalId);
        }
        emitSelection(Array.from(next));
    };

    const toggleRelatedGoals = (sourceId, relatedIds) => {
        if (!relatedIds.length) {
            return;
        }

        const allSelected = relatedIds.every((relatedId) => selectedIdSet.has(String(relatedId)));
        const next = new Set(selectedIdSet);
        relatedIds.forEach((relatedId) => {
            if (allSelected) {
                next.delete(relatedId);
            } else {
                next.add(relatedId);
            }
        });
        setBulkConnectorGoalIds((current) => {
            const nextConnectorIds = new Set(current);
            [sourceId, ...relatedIds].forEach((relatedId) => {
                const normalizedId = String(relatedId);
                if (allSelected) {
                    nextConnectorIds.delete(normalizedId);
                } else {
                    nextConnectorIds.add(normalizedId);
                }
            });
            return nextConnectorIds;
        });
        emitSelection(Array.from(next));
    };

    const getGoalLeftSlot = (goal) => {
        const goalId = String(goal.id);
        const isSelected = selectedIdSet.has(goalId);
        const descendantIds = collectDescendantIds(goalId, childIdsByParent);
        const ancestorIds = collectAncestorIds(goal, goalById);
        const hasDescendants = descendantIds.length > 0;
        const hasAncestors = ancestorIds.length > 0;
        const areDescendantsSelected = hasDescendants
            && descendantIds.every((descendantId) => selectedIdSet.has(String(descendantId)));
        const areAncestorsSelected = hasAncestors
            && ancestorIds.every((ancestorId) => selectedIdSet.has(String(ancestorId)));

        return (
            <div className={styles.controlRow} onClick={(event) => event.stopPropagation()}>
                <label className={styles.controlLabel} title="Select this goal">
                    <input
                        type={isSingleSelect ? 'radio' : 'checkbox'}
                        name={isSingleSelect ? 'goal-hierarchy-single-select' : undefined}
                        checked={isSelected}
                        onChange={() => toggleGoal(goalId)}
                        aria-label={`Select ${goal.name}`}
                    />
                    <span aria-hidden="true">{isSelected ? '✓' : ''}</span>
                </label>
                {!isSingleSelect && (
                    <>
                        {showAncestorControls && (
                            <label
                                className={`${styles.arrowControlLabel} ${!hasAncestors ? styles.arrowControlDisabled : ''}`}
                                title={hasAncestors ? 'Select all ancestors' : 'No ancestors to select'}
                            >
                                <input
                                    type="checkbox"
                                    checked={areAncestorsSelected}
                                    disabled={!hasAncestors}
                                    onChange={() => toggleRelatedGoals(goalId, ancestorIds)}
                                    aria-label={`Select all ancestors of ${goal.name}`}
                                />
                                <span aria-hidden="true">↑</span>
                            </label>
                        )}
                        <label
                            className={`${styles.arrowControlLabel} ${!hasDescendants ? styles.arrowControlDisabled : ''}`}
                            title={hasDescendants ? 'Select all descendants' : 'No descendants to select'}
                        >
                            <input
                                type="checkbox"
                            checked={areDescendantsSelected}
                            disabled={!hasDescendants}
                            onChange={() => toggleRelatedGoals(goalId, descendantIds)}
                            aria-label={`Select all descendants of ${goal.name}`}
                        />
                            <span aria-hidden="true">↓</span>
                        </label>
                    </>
                )}
            </div>
        );
    };

    const getGoalBranchHighlightState = (goal) => {
        if (selectedIdSet.has(String(goal.id))) {
            return 'target';
        }

        if (highlightSelectionAncestors && selectedAncestorIdSet.has(String(goal.id))) {
            return 'ancestor';
        }

        return null;
    };

    const getGoalConnectorHighlightState = (goal) => {
        if (connectorHighlightMode === 'bulk') {
            return bulkConnectorGoalIds.has(String(goal.id));
        }
        return Boolean(getGoalBranchHighlightState(goal));
    };

    const getGoalConnectorEdgeHighlightState = (parentGoal, childGoal) => {
        const parentId = String(parentGoal.id);
        const childId = String(childGoal.id);

        if (connectorHighlightMode === 'bulk') {
            return bulkConnectorGoalIds.has(parentId) && bulkConnectorGoalIds.has(childId);
        }

        if (connectorHighlightMode === 'lineage') {
            return selectedIdSet.has(childId) || selectedAncestorIdSet.has(childId);
        }

        return selectedIdSet.has(parentId) && selectedIdSet.has(childId);
    };

    const getGoalMetaLabel = (goal) => {
        if (!showSelectionInheritanceMeta || selectedIdSet.has(String(goal.id))) {
            return null;
        }

        const selectedDescendant = findSelectedDescendant(goal.id, goalById, childIdsByParent, selectedIdSet);
        if (selectedDescendant) {
            return `Inherited via child goal: ${selectedDescendant.name}`;
        }

        const selectedAncestor = findSelectedAncestor(goal, goalById, selectedIdSet);
        if (selectedAncestor) {
            return `Inherited via parent goal: ${selectedAncestor.name}`;
        }

        return null;
    };

    return (
        <div className={`${styles.selector} ${isSingleSelect ? styles.singleSelect : styles.multiSelect} ${!isSingleSelect && !showAncestorControls ? styles.noAncestorControls : ''}`}>
            {searchable && (
                <div className={styles.searchRow}>
                    <input
                        type="text"
                        value={searchTerm}
                        placeholder={searchPlaceholder}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        className={styles.searchInput}
                        autoFocus
                    />
                </div>
            )}

            <div className={styles.optionsRow}>
                <label className={styles.hideCompletedControl}>
                    <input
                        type="checkbox"
                        checked={hideCompletedGoals}
                        onChange={(event) => setHideCompletedGoals(event.target.checked)}
                    />
                    <span aria-hidden="true">{hideCompletedGoals ? '✓' : ''}</span>
                    <span>Hide completed goals</span>
                </label>
            </div>

            <div className={styles.treeFrame}>
                <GoalHierarchyList
                    nodes={visibleGoals}
                    variant="session"
                    onGoalClick={(goal) => toggleGoal(String(goal.id))}
                    getGoalLeftSlot={getGoalLeftSlot}
                    getGoalMetaLabel={getGoalMetaLabel}
                    getGoalBranchHighlightState={getGoalBranchHighlightState}
                    getGoalConnectorHighlightState={getGoalConnectorHighlightState}
                    getGoalConnectorEdgeHighlightState={getGoalConnectorEdgeHighlightState}
                    connectorHighlightMode={connectorHighlightMode}
                    showGoalHighlightHalo={showGoalHighlightHalo}
                    getGoalColor={getGoalColor}
                    getGoalSecondaryColor={getGoalSecondaryColor}
                    getGoalIcon={getGoalIcon}
                    getScopedCharacteristics={getScopedCharacteristics || (() => null)}
                    emptyState={searchTerm.trim() ? 'No goals match this search.' : emptyState}
                />
            </div>
        </div>
    );
}

export default GoalHierarchySelector;
