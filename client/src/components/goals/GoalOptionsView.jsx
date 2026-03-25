import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { queryKeys } from '../../hooks/queryKeys';
import { fractalApi } from '../../utils/api';
import {
    findGoalNodeById,
    flattenGoalTree,
    getGoalNodeChildren,
    getGoalNodeId,
    getGoalNodeType,
} from '../../utils/goalNodeModel';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import styles from '../GoalDetailModal.module.css';
import GoalHierarchyList from './GoalHierarchyList';

const toId = (value) => (value == null ? null : String(value));

function getNodeLevelId(node) {
    return node?.attributes?.level_id ?? node?.level_id ?? null;
}

function buildAncestorChainIds(nodeId, parentById) {
    const lineage = [];
    let currentId = nodeId;

    while (currentId) {
        lineage.push(currentId);
        currentId = parentById.get(currentId) || null;
    }

    return lineage;
}

function GoalOptionsView({
    goal,
    goalId,
    rootId,
    goalColor,
    treeData,
    onGoalSelect,
    setViewState,
    setIsEditing,
    onDelete,
    onClose,
    displayMode,
}) {
    const queryClient = useQueryClient();
    const {
        goalLevels = [],
        getGoalColor,
        getGoalSecondaryColor,
        getGoalIcon,
    } = useGoalLevels();
    const [subView, setSubView] = useState('main');
    const [loading, setLoading] = useState(false);
    const [moveSearch, setMoveSearch] = useState('');
    const isFrozen = Boolean(goal?.frozen || goal?.attributes?.frozen);

    const invalidateGoalQueries = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.fractalTree(rootId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.goals(rootId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.goalsForSelection(rootId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.goalMetrics(goalId) }),
        ]);
    };

    const moveState = useMemo(() => {
        if (!treeData || !goalId) {
            return {
                currentParentId: null,
                canMove: false,
                hierarchyNodes: [],
                selectableParentIds: new Set(),
            };
        }

        const currentGoalNode = findGoalNodeById(treeData, goalId);
        const currentParentId = toId(goal?.attributes?.parent_id ?? goal?.parent_id ?? currentGoalNode?.parent_id);
        const currentParentNode = currentParentId ? findGoalNodeById(treeData, currentParentId) : null;
        if (!currentGoalNode || !currentParentNode) {
            return {
                currentParentId,
                canMove: false,
                hierarchyNodes: [],
                selectableParentIds: new Set(),
            };
        }

        const flattenedTree = flattenGoalTree(treeData, { includeRoot: true });
        const nodeById = new Map(flattenedTree.map((node) => [toId(node.id), node]));
        const parentById = new Map(flattenedTree.map((node) => [toId(node.id), toId(node.parent_id)]));
        const descendantIds = new Set(
            flattenGoalTree(currentGoalNode, { includeRoot: true }).map((node) => toId(node.id))
        );
        const currentParentLevelId = getNodeLevelId(currentParentNode);
        const currentParentType = getGoalNodeType(currentParentNode);

        const selectableParentIds = new Set(
            flattenedTree
                .filter((node) => {
                    const nodeId = toId(node.id);
                    if (!nodeId || descendantIds.has(nodeId) || nodeId === toId(goalId)) {
                        return false;
                    }

                    if (currentParentLevelId) {
                        return getNodeLevelId(node) === currentParentLevelId;
                    }

                    return getGoalNodeType(node) === currentParentType;
                })
                .map((node) => toId(node.id))
        );

        const matchingParentIds = !moveSearch.trim()
            ? selectableParentIds
            : new Set(
                [...selectableParentIds].filter((nodeId) => {
                    const node = nodeById.get(nodeId);
                    return node?.name?.toLowerCase().includes(moveSearch.trim().toLowerCase());
                })
            );

        const includedIds = new Set();
        matchingParentIds.forEach((nodeId) => {
            buildAncestorChainIds(nodeId, parentById).forEach((ancestorId) => {
                if (ancestorId) {
                    includedIds.add(ancestorId);
                }
            });
        });

        const hierarchyNodes = flattenedTree
            .filter((node) => includedIds.has(toId(node.id)))
            .map((node) => ({
                ...node,
                id: toId(node.id),
                parent_id: toId(node.parent_id),
                isLinked: toId(node.id) === currentParentId,
            }));

        const alternativeParentIds = [...selectableParentIds].filter((nodeId) => nodeId !== currentParentId);

        return {
            currentParentId,
            canMove: alternativeParentIds.length > 0,
            hierarchyNodes,
            selectableParentIds,
        };
    }, [goal, goalId, moveSearch, treeData]);

    const convertState = useMemo(() => {
        const currentGoalNode = treeData && goalId ? (findGoalNodeById(treeData, goalId) || goal) : goal;
        const parentId = toId(goal?.attributes?.parent_id ?? goal?.parent_id ?? currentGoalNode?.parent_id);
        const parentNode = treeData && parentId ? findGoalNodeById(treeData, parentId) : null;
        const childNodes = getGoalNodeChildren(currentGoalNode || {});
        const currentLevelId = goal?.attributes?.level_id || goal?.level_id || getNodeLevelId(currentGoalNode);
        const levelsById = new Map(goalLevels.map((level) => [level.id, level]));
        const rootLevelRank = treeData ? levelsById.get(getNodeLevelId(treeData))?.rank ?? null : null;
        const parentLevelRank = parentNode ? levelsById.get(getNodeLevelId(parentNode))?.rank ?? null : null;
        const maxChildRank = childNodes.reduce((maxRank, childNode) => {
            const nextRank = levelsById.get(getNodeLevelId(childNode))?.rank;
            if (nextRank == null) {
                return maxRank;
            }
            return Math.max(maxRank, nextRank);
        }, Number.NEGATIVE_INFINITY);

        const eligibleLevels = [...goalLevels]
            .filter((level) => level.id !== currentLevelId)
            .filter((level) => rootLevelRank == null || level.rank > rootLevelRank)
            .filter((level) => parentLevelRank == null || level.rank > parentLevelRank)
            .filter((level) => maxChildRank === Number.NEGATIVE_INFINITY || level.rank < maxChildRank)
            .sort((left, right) => left.rank - right.rank);

        return {
            currentLevelId,
            eligibleLevels,
        };
    }, [goal, goalId, goalLevels, treeData]);

    const handleCopy = async () => {
        setLoading(true);
        try {
            const response = await fractalApi.copyGoal(rootId, goalId);
            const newGoal = response.data;
            await invalidateGoalQueries();
            notify.success(`Copied goal: ${newGoal.name}`);
            if (onGoalSelect) {
                onGoalSelect(newGoal);
            }
            setViewState('goal');
            setIsEditing(true);
        } catch (error) {
            notify.error(`Failed to copy goal: ${formatError(error)}`);
        } finally {
            setLoading(false);
        }
    };

    const handleFreeze = async () => {
        setLoading(true);
        try {
            const nextFrozen = !isFrozen;
            await fractalApi.freezeGoal(rootId, goalId, nextFrozen);
            await invalidateGoalQueries();
            notify.success(nextFrozen ? 'Goal frozen' : 'Goal unfrozen');
            setViewState('goal');
        } catch (error) {
            notify.error(`Failed to ${isFrozen ? 'unfreeze' : 'freeze'} goal: ${formatError(error)}`);
        } finally {
            setLoading(false);
        }
    };

    const handleMove = async (newParentId) => {
        if (!newParentId || newParentId === moveState.currentParentId) {
            return;
        }

        setLoading(true);
        try {
            await fractalApi.moveGoal(rootId, goalId, newParentId);
            await invalidateGoalQueries();
            notify.success('Goal moved');
            setSubView('main');
            setViewState('goal');
        } catch (error) {
            notify.error(`Failed to move goal: ${formatError(error)}`);
        } finally {
            setLoading(false);
        }
    };

    const handleConvertLevel = async (levelId) => {
        setLoading(true);
        try {
            await fractalApi.convertGoalLevel(rootId, goalId, levelId);
            await invalidateGoalQueries();
            notify.success('Goal level converted');
            setSubView('main');
            setViewState('goal');
        } catch (error) {
            notify.error(`Failed to convert level: ${formatError(error)}`);
        } finally {
            setLoading(false);
        }
    };

    if (subView === 'move') {
        return (
            <GoalMoveSubView
                goalColor={goalColor}
                getGoalColor={getGoalColor}
                getGoalSecondaryColor={getGoalSecondaryColor}
                getGoalIcon={getGoalIcon}
                loading={loading}
                moveSearch={moveSearch}
                setMoveSearch={setMoveSearch}
                {...moveState}
                onBack={() => setSubView('main')}
                onSelect={handleMove}
            />
        );
    }

    if (subView === 'convert') {
        return (
            <GoalConvertSubView
                currentLevelId={convertState.currentLevelId}
                eligibleLevels={convertState.eligibleLevels}
                goalColor={goalColor}
                loading={loading}
                onBack={() => setSubView('main')}
                onSelect={handleConvertLevel}
            />
        );
    }

    const handleDelete = () => {
        if (!onDelete) {
            return;
        }

        if (displayMode === 'modal' && onClose) {
            onClose();
        }
        onDelete(goal);
    };

    const options = [
        {
            label: 'Copy Goal',
            description: 'Duplicate the current goal and open the copy in edit mode.',
            onClick: handleCopy,
            borderColor: goalColor,
            textColor: goalColor,
        },
        {
            label: isFrozen ? 'Unfreeze Goal' : 'Freeze Goal',
            description: isFrozen
                ? 'Resume progress and re-enable completion controls.'
                : 'Pause progress tracking and block completion until unfrozen.',
            onClick: handleFreeze,
            borderColor: isFrozen ? '#16a34a' : '#2563eb',
            textColor: isFrozen ? '#16a34a' : '#2563eb',
        },
        {
            label: 'Move Goal',
            description: moveState.canMove
                ? 'Choose a new parent from the same tier as the current parent.'
                : 'No alternate parent exists on the current parent tier.',
            onClick: () => setSubView('move'),
            disabled: !moveState.canMove,
        },
        {
            label: 'Convert Level',
            description: convertState.eligibleLevels.length > 0
                ? 'Change the goal level without allowing conversion into the root tier.'
                : 'No compatible level changes are available for this goal.',
            onClick: () => setSubView('convert'),
            disabled: convertState.eligibleLevels.length === 0,
        },
        {
            label: 'Delete Goal',
            description: 'Remove this goal and its descendants.',
            onClick: handleDelete,
            disabled: !onDelete,
            borderColor: '#d32f2f',
            textColor: '#d32f2f',
        },
    ];

    return (
        <div className={styles.optionsSubView}>
            <button
                type="button"
                onClick={() => setViewState('goal')}
                className={styles.optionsBackButton}
                style={{ color: goalColor }}
            >
                Back to Goal Details
            </button>
            {options.map((option) => (
                <button
                    key={option.label}
                    type="button"
                    onClick={option.onClick}
                    disabled={loading || option.disabled}
                    className={styles.optionButton}
                    style={{
                        borderColor: option.borderColor || 'var(--color-border)',
                        color: option.textColor || 'var(--color-text-primary)',
                        opacity: loading || option.disabled ? 0.6 : 1,
                    }}
                >
                    <span className={styles.optionButtonTitle}>{option.label}</span>
                    <span className={styles.optionButtonDescription}>{option.description}</span>
                </button>
            ))}
        </div>
    );
}

function GoalMoveSubView({
    goalColor,
    getGoalColor,
    getGoalSecondaryColor,
    getGoalIcon,
    loading,
    moveSearch,
    setMoveSearch,
    currentParentId,
    canMove,
    hierarchyNodes,
    selectableParentIds,
    onBack,
    onSelect,
}) {
    return (
        <div className={styles.optionsSubView}>
            <button
                type="button"
                onClick={onBack}
                className={styles.optionsBackButton}
                style={{ color: goalColor }}
            >
                Back to Options
            </button>

            <div className={styles.optionsSectionHeader}>Move Goal</div>
            <div className={styles.optionsSectionHint}>
                Select a new parent from the same tier as the current parent. Ancestors are shown for context.
            </div>

            <input
                type="text"
                placeholder="Search eligible parents..."
                value={moveSearch}
                onChange={(event) => setMoveSearch(event.target.value)}
                className={styles.optionsSearchInput}
            />

            {!canMove ? (
                <div className={styles.optionsEmptyState}>
                    This goal does not have another valid parent available on the current tier.
                </div>
            ) : hierarchyNodes.length === 0 ? (
                <div className={styles.optionsEmptyState}>
                    No parent goals match that search.
                </div>
            ) : (
                <div className={styles.optionsHierarchyPanel}>
                    <GoalHierarchyList
                        nodes={hierarchyNodes}
                        variant="session"
                        onGoalClick={(node) => onSelect(toId(getGoalNodeId(node)))}
                        isGoalSelectable={(node) => {
                            const nodeId = toId(getGoalNodeId(node));
                            return selectableParentIds.has(nodeId) && nodeId !== currentParentId;
                        }}
                        getGoalMetaLabel={(node) => {
                            const nodeId = toId(getGoalNodeId(node));
                            if (nodeId === currentParentId) {
                                return 'Current parent';
                            }
                            if (selectableParentIds.has(nodeId)) {
                                return 'Move here';
                            }
                            return null;
                        }}
                        getGoalColor={getGoalColor}
                        getGoalSecondaryColor={getGoalSecondaryColor}
                        getGoalIcon={getGoalIcon}
                        emptyState="No eligible parent goals found."
                    />
                </div>
            )}

            {loading && (
                <div className={styles.optionsEmptyState}>Saving move...</div>
            )}
        </div>
    );
}

function GoalConvertSubView({
    currentLevelId,
    eligibleLevels,
    goalColor,
    loading,
    onBack,
    onSelect,
}) {
    return (
        <div className={styles.optionsSubView}>
            <button
                type="button"
                onClick={onBack}
                className={styles.optionsBackButton}
                style={{ color: goalColor }}
            >
                Back to Options
            </button>

            <div className={styles.optionsSectionHeader}>Convert Level</div>
            <div className={styles.optionsSectionHint}>
                Compatible levels only. The fractal root tier is excluded.
            </div>

            {eligibleLevels.length === 0 ? (
                <div className={styles.optionsEmptyState}>
                    No compatible level conversions are available right now.
                </div>
            ) : (
                <div className={styles.optionsStack}>
                    {eligibleLevels.map((level) => {
                        const isCurrent = level.id === currentLevelId;
                        return (
                            <button
                                key={level.id}
                                type="button"
                                onClick={() => onSelect(level.id)}
                                disabled={loading || isCurrent}
                                className={styles.optionButton}
                                style={{
                                    borderColor: level.color || 'var(--color-border)',
                                    color: level.color || 'var(--color-text-primary)',
                                    opacity: loading || isCurrent ? 0.6 : 1,
                                }}
                            >
                                <span className={styles.optionButtonTitle}>{level.name}</span>
                                <span className={styles.optionButtonDescription}>
                                    Rank {level.rank}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default GoalOptionsView;
