import React, { useCallback, useMemo, useState } from 'react';

import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import GoalHierarchyList from './GoalHierarchyList';
import styles from './GoalHierarchySelector.module.css';
import {
    buildChildIdsByParent, collectAncestorIds, collectDescendantIds,
    filterGoalsForSearch, findSelectedAncestor, findSelectedDescendant, normalizeGoal,
} from './goalHierarchySelectorUtils';

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
    compactLayout = false,
    lockedGoalIds = [],
    lockedGoalLabel = 'Included by session activities',
    lockedGoalMarker = null,
    selectionDisabled = false,
    initialHideCompletedGoals = false,
    lockHideCompletedGoals = false,
    showHideCompletedControl = true,
}) {
    const {
        getGoalColor,
        getGoalSecondaryColor,
        getGoalIcon,
        getScopedCharacteristics,
    } = useGoalLevels();
    const [searchTerm, setSearchTerm] = useState('');
    const [hideCompletedGoals, setHideCompletedGoals] = useState(initialHideCompletedGoals);
    const [bulkConnectorGoalIds, setBulkConnectorGoalIds] = useState(() => new Set());

    const normalizedGoals = useMemo(
        () => goals.map(normalizeGoal).filter((goal) => goal?.id),
        [goals]
    );
    const selectedIdSet = useMemo(
        () => new Set(selectedGoalIds.map((goalId) => String(goalId))),
        [selectedGoalIds]
    );
    const lockedIdSet = useMemo(
        () => new Set(lockedGoalIds.map((goalId) => String(goalId))),
        [lockedGoalIds]
    );
    const effectiveSelectedIdSet = useMemo(
        () => new Set([...selectedIdSet, ...lockedIdSet]),
        [lockedIdSet, selectedIdSet]
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
        effectiveSelectedIdSet.forEach((goalId) => {
            const goal = goalById.get(goalId);
            collectAncestorIds(goal, goalById).forEach((ancestorId) => {
                ancestorIds.add(String(ancestorId));
            });
        });
        return ancestorIds;
    }, [goalById, highlightSelectionAncestors, effectiveSelectedIdSet]);

    const isSingleSelect = selectionMode === 'single';

    const emitSelection = useCallback((nextIds) => {
        onSelectionChange?.(Array.from(new Set(nextIds)).filter(Boolean));
    }, [onSelectionChange]);

    const toggleGoal = useCallback((goalId) => {
        if (selectionDisabled || lockedIdSet.has(goalId)) return;
        const isCurrentlySelected = selectedIdSet.has(goalId);

        if (isCurrentlySelected) {
            setBulkConnectorGoalIds((current) => {
                const next = new Set(current);
                next.delete(goalId);
                return next;
            });
        }

        if (isSingleSelect) {
            emitSelection(isCurrentlySelected ? [] : [goalId]);
            return;
        }

        const next = new Set(selectedIdSet);
        if (isCurrentlySelected) {
            next.delete(goalId);
        } else {
            next.add(goalId);
        }
        emitSelection(Array.from(next));
    }, [emitSelection, isSingleSelect, lockedIdSet, selectedIdSet, selectionDisabled]);

    const toggleRelatedGoals = useCallback((sourceId, relatedIds) => {
        if (selectionDisabled || !relatedIds.length) {
            return;
        }

        const editableRelatedIds = relatedIds.filter((relatedId) => !lockedIdSet.has(String(relatedId)));
        if (!editableRelatedIds.length) return;
        const allSelected = editableRelatedIds.every((relatedId) => selectedIdSet.has(String(relatedId)));
        const next = new Set(selectedIdSet);
        editableRelatedIds.forEach((relatedId) => {
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
    }, [emitSelection, lockedIdSet, selectedIdSet, selectionDisabled]);

    const getGoalLeftSlot = useCallback((goal) => {
        const goalId = String(goal.id);
        const isLocked = lockedIdSet.has(goalId);
        const isSelected = effectiveSelectedIdSet.has(goalId);
        const descendantIds = collectDescendantIds(goalId, childIdsByParent);
        const ancestorIds = collectAncestorIds(goal, goalById);
        const hasDescendants = descendantIds.length > 0;
        const hasAncestors = ancestorIds.length > 0;
        const areDescendantsSelected = hasDescendants
            && descendantIds.every((descendantId) => effectiveSelectedIdSet.has(String(descendantId)));
        const areAncestorsSelected = hasAncestors
            && ancestorIds.every((ancestorId) => effectiveSelectedIdSet.has(String(ancestorId)));

        return (
            <div className={styles.controlRow} onClick={(event) => event.stopPropagation()}>
                <label className={styles.controlLabel} title="Select this goal">
                    <input
                        type={isSingleSelect ? 'radio' : 'checkbox'}
                        name={isSingleSelect ? 'goal-hierarchy-single-select' : undefined}
                        checked={isSelected}
                        disabled={selectionDisabled || isLocked}
                        onChange={() => toggleGoal(goalId)}
                        aria-label={isLocked ? `${goal.name}, ${lockedGoalLabel}` : `Select ${goal.name}`}
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
                                    disabled={selectionDisabled || !hasAncestors}
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
                            disabled={selectionDisabled || !hasDescendants}
                            onChange={() => toggleRelatedGoals(goalId, descendantIds)}
                            aria-label={`Select all descendants of ${goal.name}`}
                        />
                            <span aria-hidden="true">↓</span>
                        </label>
                    </>
                )}
            </div>
        );
    }, [
        childIdsByParent,
        effectiveSelectedIdSet,
        goalById,
        isSingleSelect,
        lockedGoalLabel,
        lockedIdSet,
        selectionDisabled,
        showAncestorControls,
        toggleGoal,
        toggleRelatedGoals,
    ]);

    const getGoalBranchHighlightState = useCallback((goal) => {
        if (effectiveSelectedIdSet.has(String(goal.id))) {
            return 'target';
        }

        if (highlightSelectionAncestors && selectedAncestorIdSet.has(String(goal.id))) {
            return 'ancestor';
        }

        return null;
    }, [effectiveSelectedIdSet, highlightSelectionAncestors, selectedAncestorIdSet]);

    const getGoalConnectorHighlightState = useCallback((goal) => {
        if (connectorHighlightMode === 'bulk') {
            return bulkConnectorGoalIds.has(String(goal.id));
        }
        return Boolean(getGoalBranchHighlightState(goal));
    }, [bulkConnectorGoalIds, connectorHighlightMode, getGoalBranchHighlightState]);

    const getGoalConnectorEdgeHighlightState = useCallback((parentGoal, childGoal) => {
        const parentId = String(parentGoal.id);
        const childId = String(childGoal.id);

        if (connectorHighlightMode === 'bulk') {
            return bulkConnectorGoalIds.has(parentId) && bulkConnectorGoalIds.has(childId);
        }

        if (connectorHighlightMode === 'lineage') {
            return effectiveSelectedIdSet.has(childId) || selectedAncestorIdSet.has(childId);
        }

        return effectiveSelectedIdSet.has(parentId) && effectiveSelectedIdSet.has(childId);
    }, [bulkConnectorGoalIds, connectorHighlightMode, effectiveSelectedIdSet, selectedAncestorIdSet]);

    const getGoalMetaLabel = useCallback((goal) => {
        if (lockedIdSet.has(String(goal.id))) {
            if (lockedGoalMarker) {
                return (
                    <span
                        className={styles.lockedGoalMarker}
                        aria-label={lockedGoalLabel}
                        title={lockedGoalLabel}
                    >
                        {lockedGoalMarker}
                    </span>
                );
            }
            return lockedGoalLabel;
        }
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
    }, [
        childIdsByParent,
        goalById,
        lockedGoalLabel,
        lockedGoalMarker,
        lockedIdSet,
        selectedIdSet,
        showSelectionInheritanceMeta,
    ]);

    return (
        <div
            className={`${styles.selector} ${isSingleSelect ? styles.singleSelect : styles.multiSelect} ${!isSingleSelect && !showAncestorControls ? styles.noAncestorControls : ''} ${compactLayout ? styles.compactLayout : ''}`}
            aria-disabled={selectionDisabled ? 'true' : undefined}
        >
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

            {showHideCompletedControl && (
                <div className={styles.optionsRow}>
                    <label className={styles.hideCompletedControl}>
                        <input
                            type="checkbox"
                            checked={hideCompletedGoals}
                            disabled={lockHideCompletedGoals}
                            onChange={(event) => setHideCompletedGoals(event.target.checked)}
                            aria-label={lockHideCompletedGoals ? 'Completed goals are hidden' : 'Hide completed goals'}
                        />
                        <span aria-hidden="true">{hideCompletedGoals ? '✓' : ''}</span>
                        <span>Hide completed goals</span>
                    </label>
                </div>
            )}

            <div className={styles.treeFrame}>
                <GoalHierarchyList
                    nodes={visibleGoals}
                    variant="session"
                    onGoalClick={(goal) => toggleGoal(String(goal.id))}
                    isGoalSelectable={(goal) => !selectionDisabled && !lockedIdSet.has(String(goal.id))}
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
                    completedColor={getGoalColor('Completed')}
                    completedSecondaryColor={getGoalSecondaryColor('Completed')}
                    getScopedCharacteristics={getScopedCharacteristics || (() => null)}
                    emptyState={searchTerm.trim() ? 'No goals match this search.' : emptyState}
                />
            </div>
        </div>
    );
}

export default GoalHierarchySelector;
