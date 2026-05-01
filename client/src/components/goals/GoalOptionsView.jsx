import React, { useEffect, useMemo, useState } from 'react';

import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { useEligibleMoveParents } from '../../hooks/useEligibleMoveParents';
import { useGoalOptionsMutations } from '../../hooks/useGoalOptionsMutations';
import {
    findGoalNodeById,
    flattenGoalTree,
    getGoalNodeChildren,
    getGoalNodeId,
    getGoalNodeType,
} from '../../utils/goalNodeModel';
import notify from '../../utils/notify';
import GoalHierarchyList from './GoalHierarchyList';
import GoalIcon from '../atoms/GoalIcon';
import { getTypeDisplayName } from '../../utils/goalHelpers';
import styles from '../GoalDetailModal.module.css';

const toId = (value) => (value == null ? null : String(value));

function getNodeLevelId(node) {
    return node?.attributes?.level_id ?? node?.level_id ?? null;
}

// Converts a level's display name (e.g. "Long Term Goal") to the canonical type
// string used by GoalLevelsContext (e.g. "LongTermGoal").
const toCanonicalType = (levelName) => levelName?.replace(/\s+/g, '') ?? null;

// ImmediateGoal cannot be the source of a level conversion.
const NON_CONVERTIBLE_TYPES = new Set(['ImmediateGoal']);


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
    const {
        goalLevels = [],
        getGoalColor,
        getGoalSecondaryColor,
        getGoalIcon,
    } = useGoalLevels();
    const [subView, setSubView] = useState('main');
    const isPaused = Boolean(
        goal?.paused
        || goal?.attributes?.paused
        || goal?.frozen
        || goal?.attributes?.frozen
    );
    const {
        isLoading: loading,
        copyGoal,
        pauseGoal,
        moveGoal,
        convertGoalLevel,
    } = useGoalOptionsMutations(rootId, goalId);

    const convertState = useMemo(() => {
        const currentGoalNode = treeData && goalId ? (findGoalNodeById(treeData, goalId) || goal) : goal;
        const parentId = toId(goal?.attributes?.parent_id ?? goal?.parent_id ?? currentGoalNode?.parent_id);
        const parentNode = treeData && parentId ? findGoalNodeById(treeData, parentId) : null;
        const childNodes = getGoalNodeChildren(currentGoalNode || {});
        const currentLevelId = goal?.attributes?.level_id || goal?.level_id || getNodeLevelId(currentGoalNode);
        const levelsById = new Map(goalLevels.map((level) => [level.id, level]));
        const currentLevel = levelsById.get(currentLevelId);
        const currentCanonicalType = toCanonicalType(currentLevel?.name);

        // ImmediateGoal cannot be converted (leaf boundary)
        // but ImmediateGoal IS a valid conversion target for higher-ranked macro goals.
        const isConvertible = currentCanonicalType ? !NON_CONVERTIBLE_TYPES.has(currentCanonicalType) : true;

        const parentLevelRank = parentNode ? levelsById.get(getNodeLevelId(parentNode))?.rank ?? null : null;

        // Root rank: level_id lookup first, fall back to matching by goal type name.
        const rootLevelByLevelId = treeData ? levelsById.get(getNodeLevelId(treeData)) : null;
        const rootLevelByType = treeData ? goalLevels.find(
            (l) => toCanonicalType(l.name) === getGoalNodeType(treeData)
        ) : null;
        const rootLevelRank = (rootLevelByLevelId ?? rootLevelByType)?.rank ?? null;

        const maxChildRank = childNodes.reduce((maxRank, childNode) => {
            const nextRank = levelsById.get(getNodeLevelId(childNode))?.rank
                ?? goalLevels.find((l) => toCanonicalType(l.name) === getGoalNodeType(childNode))?.rank;
            if (nextRank == null) {
                return maxRank;
            }
            return Math.max(maxRank, nextRank);
        }, Number.NEGATIVE_INFINITY);

        const eligibleLevels = isConvertible ? [...goalLevels]
            .filter((level) => level.id !== currentLevelId)
            // Must be strictly below root tier (cannot be same rank as fractal root)
            .filter((level) => rootLevelRank == null || level.rank > rootLevelRank)
            // Must be strictly below parent rank
            .filter((level) => parentLevelRank == null || level.rank > parentLevelRank)
            // Must be strictly above all children ranks (cannot equal a child's rank)
            .filter((level) => maxChildRank === Number.NEGATIVE_INFINITY || level.rank < maxChildRank)
            .sort((left, right) => left.rank - right.rank) : [];

        return {
            currentLevelId,
            isConvertible,
            eligibleLevels,
        };
    }, [goal, goalId, goalLevels, treeData]);

    const handleCopy = async () => {
        try {
            const newGoal = await copyGoal();
            notify.success(`Copied goal: ${newGoal.name}`);
            if (onGoalSelect) {
                onGoalSelect(newGoal);
            }
            setViewState('goal');
            setIsEditing(true);
        } catch {
            // Mutation helpers surface errors via their own notification layer.
        }
    };

    const handlePause = async () => {
        try {
            const nextPaused = !isPaused;
            await pauseGoal(nextPaused);
            setViewState('goal');
        } catch {
            // Mutation helpers surface errors via their own notification layer.
        }
    };

    const handleMove = async (newParentId) => {
        if (!newParentId) {
            return;
        }

        try {
            await moveGoal(newParentId);
            setSubView('main');
            setViewState('goal');
        } catch {
            // Mutation helpers surface errors via their own notification layer.
        }
    };

    const handleConvertLevel = async (levelId) => {
        try {
            await convertGoalLevel(levelId);
            setSubView('main');
            setViewState('goal');
        } catch {
            // Mutation helpers surface errors via their own notification layer.
        }
    };

    if (subView === 'move') {
        return (
            <GoalMoveSubView
                rootId={rootId}
                goalId={goalId}
                treeData={treeData}
                getGoalColor={getGoalColor}
                getGoalSecondaryColor={getGoalSecondaryColor}
                getGoalIcon={getGoalIcon}
                loading={loading}
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
                loading={loading}
                getGoalColor={getGoalColor}
                getGoalSecondaryColor={getGoalSecondaryColor}
                getGoalIcon={getGoalIcon}
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
            label: isPaused ? 'Resume Goal' : 'Pause Goal',
            description: isPaused
                ? 'Resume progress and re-enable completion controls.'
                : 'Pause progress tracking and block completion until resumed.',
            onClick: handlePause,
            borderColor: isPaused ? '#16a34a' : '#2563eb',
            textColor: isPaused ? '#16a34a' : '#2563eb',
        },
        {
            label: 'Move Goal',
            description: 'Choose any eligible parent from the hierarchy.',
            onClick: () => setSubView('move'),
        },
        convertState.isConvertible ? {
            label: 'Convert Level',
            description: convertState.eligibleLevels.length > 0
                ? 'Change the goal level without allowing conversion into the root tier.'
                : 'No compatible level changes are available for this goal.',
            onClick: () => setSubView('convert'),
            disabled: convertState.eligibleLevels.length === 0,
        } : null,
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
            {options.filter(Boolean).map((option) => (
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
    rootId,
    goalId,
    treeData,
    getGoalColor,
    getGoalSecondaryColor,
    getGoalIcon,
    loading,
    onBack,
    onSelect,
}) {
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [selectedId, setSelectedId] = useState(null);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search.trim() || null);
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    const { data, isLoading } = useEligibleMoveParents(rootId, goalId, debouncedSearch, true);
    const eligible = data?.data?.eligible_parents ?? [];
    const eligibleIds = useMemo(() => new Set(eligible.map((e) => e.id)), [eligible]);
    const currentParentId = useMemo(() => eligible.find((e) => e.is_current_parent)?.id, [eligible]);

    // Build a flat map of all tree nodes for ancestor lookups.
    const allNodeMap = useMemo(() => {
        if (!treeData) return new Map();
        const map = new Map();
        flattenGoalTree(treeData).forEach((node) => {
            map.set(getGoalNodeId(node), {
                id: getGoalNodeId(node),
                name: node.name,
                parent_id: node.parent_id,
                type: getGoalNodeType(node),
            });
        });
        return map;
    }, [treeData]);

    // Only show eligible nodes + their ancestors (for indentation context).
    // Excludes the goal itself, its descendants, and any branches with no eligible targets.
    const nodes = useMemo(() => {
        if (debouncedSearch) {
            // When searching, flat list of matching eligible nodes only
            return eligible.map((e) => ({ ...e, type: toCanonicalType(e.level_name), parent_id: null }));
        }
        if (allNodeMap.size === 0) {
            return eligible.map((e) => ({ ...e, type: toCanonicalType(e.level_name) }));
        }
        // Walk up from each eligible node to collect required ancestor IDs
        const requiredIds = new Set(eligibleIds);
        eligibleIds.forEach((id) => {
            let current = allNodeMap.get(id);
            while (current?.parent_id) {
                requiredIds.add(current.parent_id);
                current = allNodeMap.get(current.parent_id);
            }
        });
        return [...allNodeMap.values()].filter((n) => requiredIds.has(n.id));
    }, [eligible, eligibleIds, allNodeMap, debouncedSearch]);

    return (
        <div className={styles.optionsSubView}>
            <button
                type="button"
                onClick={onBack}
                className={styles.optionsBackButton}
            >
                ← Back
            </button>

            <div className={styles.optionsSectionHeader}>Move Goal</div>
            <div className={styles.optionsSectionHint}>
                Choose any eligible parent from the hierarchy.
            </div>

            <input
                type="text"
                placeholder="Search eligible parents..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={styles.optionsSearchInput}
            />

            {isLoading ? (
                <div className={styles.optionsEmptyState}>Loading eligible parents...</div>
            ) : eligible.length === 0 && !isLoading ? (
                <div className={styles.optionsEmptyState}>No eligible parents found.</div>
            ) : (
                <GoalHierarchyList
                    nodes={nodes}
                    variant="session"
                    getGoalColor={getGoalColor}
                    getGoalSecondaryColor={getGoalSecondaryColor}
                    getGoalIcon={getGoalIcon}
                    isGoalSelectable={(node) => eligibleIds.has(node.id) && node.id !== currentParentId && !loading}
                    getGoalNameStyle={(node) => {
                        if (node.id === currentParentId || node.id === selectedId) {
                            return { textDecoration: 'underline' };
                        }
                        return undefined;
                    }}
                    onGoalClick={(node) => {
                        if (eligibleIds.has(node.id) && node.id !== currentParentId && !loading) {
                            setSelectedId(node.id);
                        }
                    }}
                />
            )}

            {selectedId && (
                <button
                    type="button"
                    onClick={() => onSelect(selectedId)}
                    disabled={loading}
                    className={styles.btnAction}
                    style={{
                        marginTop: 8,
                        background: 'var(--color-brand-primary, #6366f1)',
                        color: 'white',
                        border: 'none',
                        fontWeight: 'bold',
                        opacity: loading ? 0.6 : 1,
                    }}
                >
                    {loading ? 'Moving...' : 'Confirm Move'}
                </button>
            )}
        </div>
    );
}

function GoalConvertSubView({
    currentLevelId,
    eligibleLevels,
    loading,
    getGoalColor,
    getGoalSecondaryColor,
    getGoalIcon,
    onBack,
    onSelect,
}) {
    const [pendingLevelId, setPendingLevelId] = useState(null);

    const pendingLevel = pendingLevelId
        ? eligibleLevels.find((l) => l.id === pendingLevelId)
        : null;

    if (pendingLevel) {
        const canonicalType = toCanonicalType(pendingLevel.name);
        const color = getGoalColor(canonicalType);
        const secondaryColor = getGoalSecondaryColor(canonicalType);
        const icon = getGoalIcon(canonicalType);
        return (
            <div className={styles.optionsSubView}>
                <button
                    type="button"
                    onClick={() => setPendingLevelId(null)}
                    className={styles.optionsBackButton}
                >
                    ← Back
                </button>
                <div className={styles.optionsSectionHeader}>Confirm Conversion</div>
                <div className={styles.optionsSectionHint}>
                    This will change the goal&apos;s level. Any children will remain at their current levels.
                </div>
                <div className={styles.levelPickerGrid} style={{ marginTop: 8 }}>
                    <button
                        type="button"
                        disabled
                        className={styles.levelPickerOption}
                        style={{ borderColor: color, color, opacity: 1, cursor: 'default' }}
                    >
                        <GoalIcon shape={icon} color={color} secondaryColor={secondaryColor} size={20} />
                        {getTypeDisplayName(canonicalType)}
                    </button>
                </div>
                <button
                    type="button"
                    onClick={() => onSelect(pendingLevelId)}
                    disabled={loading}
                    className={styles.btnAction}
                    style={{
                        marginTop: 12,
                        background: color,
                        color: 'white',
                        border: 'none',
                        fontWeight: 'bold',
                        opacity: loading ? 0.6 : 1,
                    }}
                >
                    {loading ? 'Converting...' : 'Confirm Convert'}
                </button>
            </div>
        );
    }

    return (
        <div className={styles.optionsSubView}>
            <button
                type="button"
                onClick={onBack}
                className={styles.optionsBackButton}
            >
                ← Back
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
                <div className={styles.levelPickerGrid}>
                    {eligibleLevels.map((level) => {
                        const isCurrent = level.id === currentLevelId;
                        const canonicalType = toCanonicalType(level.name);
                        const color = getGoalColor(canonicalType);
                        const secondaryColor = getGoalSecondaryColor(canonicalType);
                        const icon = getGoalIcon(canonicalType);
                        return (
                            <button
                                key={level.id}
                                type="button"
                                onClick={() => setPendingLevelId(level.id)}
                                disabled={loading || isCurrent}
                                className={styles.levelPickerOption}
                                style={{
                                    borderColor: color,
                                    color: color,
                                    opacity: loading || isCurrent ? 0.5 : 1,
                                    cursor: isCurrent ? 'default' : 'pointer',
                                }}
                            >
                                <GoalIcon shape={icon} color={color} secondaryColor={secondaryColor} size={20} />
                                {getTypeDisplayName(canonicalType)}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default GoalOptionsView;
