import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { getTypeDisplayName, getValidChildTypes } from '../../utils/goalHelpers';
import { orderSequencedSiblings } from '../../utils/goalSequenceOrder';
import { formatLiteralDate } from '../../utils/dateUtils';
import GoalIcon from '../atoms/GoalIcon';
import GoalHierarchyIconAction from './GoalHierarchyIconAction';
import useGoalHierarchyConnectors from './useGoalHierarchyConnectors';
import styles from './GoalHierarchyList.module.css';
function buildSessionHierarchyTree(nodes) {
    const nodeMap = new Map();
    const roots = [];

    nodes.forEach((node, index) => {
        if (!node?.id) {
            return;
        }

        nodeMap.set(node.id, {
            ...node,
            originalIndex: index,
            children: [],
        });
    });

    nodes.forEach((node) => {
        if (!node?.id) {
            return;
        }

        const current = nodeMap.get(node.id);
        const parent = node.parent_id ? nodeMap.get(node.parent_id) : null;

        if (parent) {
            parent.children.push(current);
        } else {
            roots.push(current);
        }
    });

    const sortChildren = (treeNode) => {
        treeNode.children = orderSequencedSiblings(treeNode.children.sort((a, b) => a.originalIndex - b.originalIndex));
        treeNode.children.forEach(sortChildren);
    };

    roots.sort((a, b) => a.originalIndex - b.originalIndex);
    roots.forEach(sortChildren);

    return roots;
}

function GoalHierarchyList({
    nodes = [],
    variant = 'session',
    density = 'default',
    onGoalClick,
    isGoalSelectable,
    getGoalMetaLabel,
    getGoalNameStyle,
    isGoalBranchHighlighted,
    getGoalBranchHighlightState,
    getGoalConnectorHighlightState,
    getGoalConnectorEdgeHighlightState,
    getGoalConnectorEdgeState,
    connectorHighlightMode = 'selected',
    showGoalHighlightHalo = false,
    onGoalIconClick,
    isGoalIconSelected,
    getGoalIconActionLabel,
    getGoalLeftSlot,
    getGoalRightSlot,
    getScopedCharacteristics,
    getGoalColor,
    getGoalSecondaryColor,
    getGoalIcon,
    completedColor = 'var(--color-brand-success)',
    completedSecondaryColor = 'var(--color-brand-success)',
    // Adding a child is offered on the scoped goal only (its icon is selected), and only while it
    // is open: completed and paused goals take no new children, nor does the lowest level.
    onStartSubGoalCreation,
    justCreatedGoalId = null,
    // Extra data-/aria- attributes for a goal's row, e.g. to make it a drag source.
    getGoalRowAttributes,
    emptyState = 'No goals associated',
}) {
    const canAddChild = (node) => getValidChildTypes(node.type).length > 0
        && !(node.status ? node.status.completed : node.completed)
        && !node.paused;
    const handleGoalClick = (node) => {
        if (!onGoalClick) {
            return;
        }
        if (isGoalSelectable && !isGoalSelectable(node.originalGoal || node)) {
            return;
        }
        onGoalClick(node.originalGoal || node);
    };
    const treeRoots = useMemo(() => buildSessionHierarchyTree(nodes), [nodes]);
    // Sequence steps in view by track and position, to name the step a paused goal waits on.
    const sequenceSteps = useMemo(() => {
        const steps = new Map();
        nodes.forEach((node) => {
            const trackId = node?.sequence_track_id;
            if (trackId && node.sequence_position != null) steps.set(`${trackId}:${node.sequence_position}`, node);
        });
        return steps;
    }, [nodes]);
    const pausedLabel = (node) => {
        if (!node.paused) return undefined;
        if (node.pause_reason !== 'sequence') return 'Paused';
        const previous = sequenceSteps.get(`${node.sequence_track_id}:${node.sequence_position - 1}`);
        return previous ? `Paused · waiting on ${previous.name}` : 'Paused · waiting on the step before';
    };
    const listRef = useRef(null);
    const iconRefs = useRef(new Map());

    useEffect(() => {
        if (!justCreatedGoalId) return;
        const row = listRef.current?.querySelector(`[data-goal-id="${CSS.escape(String(justCreatedGoalId))}"]`);
        row?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }, [justCreatedGoalId, nodes]);

    const getNodeHighlightState = useCallback((node) => {
        const originalNode = node.originalGoal || node;
        return getGoalBranchHighlightState
            ? getGoalBranchHighlightState(originalNode)
            : (isGoalBranchHighlighted && isGoalBranchHighlighted(originalNode) ? 'active' : null);
    }, [getGoalBranchHighlightState, isGoalBranchHighlighted]);

    const nodeIsHighlighted = useCallback(
        (node) => Boolean(getNodeHighlightState(node)),
        [getNodeHighlightState]
    );

    const sessionRows = useMemo(() => {
        function nodeConnectorIsHighlighted(node) {
            if (!getGoalConnectorHighlightState) {
                return nodeIsHighlighted(node);
            }
            return Boolean(getGoalConnectorHighlightState(node.originalGoal || node));
        }

        function branchContainsHighlightedConnectorNode(node) {
            return nodeConnectorIsHighlighted(node)
                || node.children.some(branchContainsHighlightedConnectorNode);
        }

        function nodeActivatesConnector(node) {
            return connectorHighlightMode === 'lineage'
                ? branchContainsHighlightedConnectorNode(node)
                : nodeConnectorIsHighlighted(node);
        }

        function subtreeHasActiveConnector(node) {
            return nodeActivatesConnector(node)
                || node.children.some(subtreeHasActiveConnector);
        }

        function getLastActiveIndex(treeNodes) {
            let lastActiveIndex = -1;
            treeNodes.forEach((node, index) => {
                if (subtreeHasActiveConnector(node)) {
                    lastActiveIndex = index;
                }
            });
            return lastActiveIndex;
        }

        function flattenSessionTreeRows(treeNodes, depth = 0, ancestorContinuations = []) {
            const lastActiveIndex = getLastActiveIndex(treeNodes);

            return treeNodes.flatMap((node, index) => {
                const isLastSibling = index === treeNodes.length - 1;
                const row = {
                    node,
                    depth,
                    parentId: node.parent_id || null,
                    isLastSibling,
                    ancestorContinuations,
                    currentTopActive: depth > 0 && index <= lastActiveIndex,
                    currentBottomActive: depth > 0 && index < lastActiveIndex,
                    currentHorizontalActive: depth > 0 && subtreeHasActiveConnector(node),
                    childBottomActive: node.children.length > 0 && node.children.some(subtreeHasActiveConnector),
                };
                const childRows = node.children.length > 0
                    ? flattenSessionTreeRows(node.children, depth + 1, [
                        ...ancestorContinuations,
                        {
                            continues: !isLastSibling,
                            active: index < lastActiveIndex,
                        },
                    ])
                    : [];

                return [row, ...childRows];
            });
        }

        return flattenSessionTreeRows(treeRoots);
    }, [connectorHighlightMode, getGoalConnectorHighlightState, nodeIsHighlighted, treeRoots]);

    const rowById = useMemo(
        () => new Map(sessionRows.map((row) => [String(row.node.id), row])),
        [sessionRows]
    );
    const connectorEdges = useGoalHierarchyConnectors({
        listRef,
        iconRefs,
        sessionRows,
        rowById,
        getGoalConnectorEdgeHighlightState,
        getGoalConnectorEdgeState,
    });

    const setIconRef = (nodeId) => (element) => {
        const key = String(nodeId);
        if (element) {
            iconRefs.current.set(key, element);
        } else {
            iconRefs.current.delete(key);
        }
    };

    const renderConnectorEdges = () => (
        <svg className={styles.sessionConnectorSvg} aria-hidden="true">
            {connectorEdges.map(({ key, parentId, childId, from, to, active, state }) => {
                const midpointY = to.y;
                const path = `M ${from.x} ${from.y} V ${midpointY} H ${to.x}`;

                return (
                    <React.Fragment key={key}>
                        <path
                            d={path}
                            className={`${styles.sessionConnectorEdge} ${styles[`sessionConnectorEdge_${state}`] || ''}`}
                            data-connector-active={active ? 'true' : 'false'}
                            data-connector-state={state}
                            data-parent-goal-id={parentId}
                            data-child-goal-id={childId}
                        />
                        {state === 'completed' && <path d={path} className={styles.sessionConnectorEdgeFlow} />}
                    </React.Fragment>
                );
            })}
        </svg>
    );

    const renderSessionTreeRow = (row) => {
        const {
            node,
            depth,
        } = row;
        const isCompleted = node.status
            ? Boolean(node.status.completed)
            : Boolean(node.completed);
        const originalNode = node.originalGoal || node;
        const isSelectable = isGoalSelectable ? isGoalSelectable(originalNode) : Boolean(onGoalClick);
        const branchHighlightState = getNodeHighlightState(node);
        const iconSelected = Boolean(isGoalIconSelected?.(originalNode));
        const showIconHalo = showGoalHighlightHalo && (
            isGoalIconSelected ? iconSelected : Boolean(branchHighlightState)
        );
        const metaLabel = getGoalMetaLabel ? getGoalMetaLabel(originalNode) : null;
        const justCreated = justCreatedGoalId != null && String(node.id) === String(justCreatedGoalId);
        const showAddChild = Boolean(onStartSubGoalCreation) && iconSelected && canAddChild(node);
        const goalIcon = (
            <GoalIcon
                shape={getGoalIcon ? getGoalIcon(node.type) : getScopedCharacteristics(node.type)?.icon || 'circle'}
                color={isCompleted ? completedColor : getGoalColor(node.type)}
                secondaryColor={isCompleted ? completedSecondaryColor : getGoalSecondaryColor(node.type)}
                isSmart={node.is_smart}
                size={16}
            />
        );
        return (
            <div
                key={node.id}
                className={`${styles.sessionTreeRow} ${justCreated ? styles.sessionTreeRowJustCreated : ''}`}
                data-goal-id={node.id}
                data-just-created={justCreated ? 'true' : undefined}
                {...(getGoalRowAttributes ? getGoalRowAttributes(originalNode) : null)}
            >
                {getGoalLeftSlot && (
                    <div className={styles.sessionLeftSlot}>
                        {getGoalLeftSlot(node)}
                    </div>
                )}
                <div
                    className={`${styles.sessionTreeNode} ${node.isLinked ? styles.sessionNodeActive : ''}`}
                >
                    <div
                        className={styles.sessionIndent}
                        style={{ width: `calc(${depth} * var(--tree-indent))` }}
                        aria-hidden="true"
                    />
                    <div
                        ref={setIconRef(node.id)}
                        className={`${styles.sessionIconSlot} ${showIconHalo ? styles.sessionIconSlotBranchActive : ''}`}
                    >
                        <GoalHierarchyIconAction
                            goal={originalNode}
                            selected={iconSelected}
                            onClick={onGoalIconClick}
                            getActionLabel={getGoalIconActionLabel}
                        >
                            {goalIcon}
                        </GoalHierarchyIconAction>
                    </div>
                    <div className={styles.sessionNodeContent} title={pausedLabel(node)}>
                        {node.sequence_position != null && node.sequence_track_id ? (
                            <span className={styles.sequenceStepNumber} aria-label={`Step ${node.sequence_position} in sequence`}>
                                {node.sequence_position}
                            </span>
                        ) : null}
                        <span
                            className={`${styles.sessionNodeName} ${node.isLinked ? styles.sessionNodeNameActive : ''} ${!isSelectable ? styles.sessionNodeNameDisabled : ''} ${node.paused ? styles.sessionNodeNamePaused : ''}`}
                            style={getGoalNameStyle ? getGoalNameStyle(originalNode) : undefined}
                            onClick={() => handleGoalClick(node)}
                        >
                            {node.name}
                        </span>
                        {node.paused ? <span className={styles.assistive}>{pausedLabel(node)}</span> : null}
                        {metaLabel && (
                            typeof metaLabel === 'string' ? (
                                <span className={styles.sessionNodeMeta}>
                                    {metaLabel}
                                </span>
                            ) : metaLabel
                        )}
                        {showAddChild && (
                            <button
                                type="button"
                                className={styles.addSubGoalBtn}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onStartSubGoalCreation(node);
                                }}
                                title="Add a child goal"
                                aria-label={`Add a child goal under ${node.name}`}
                            >
                                +
                            </button>
                        )}
                    </div>
                    {getGoalRightSlot ? (
                        <div className={styles.sessionRightSlot}>{getGoalRightSlot(originalNode)}</div>
                    ) : null}
                </div>
            </div>
        );
    };

    if (nodes.length === 0) {
        return <div className={styles.emptyState}>{emptyState}</div>;
    }

    if (variant === 'program') {
        return (
            <div className={`${styles.list} ${styles.programList}`}>
                {nodes.map((node, index) => {
                    const isCompleted = Boolean(node.completed);
                    const lineageColors = (node.lineage || []).map((entry) => (
                        entry.completed ? completedColor : getGoalColor(entry.type)
                    ));
                    const deadlineOptions = { month: 'short', day: 'numeric' };

                    return (
                        <div key={node.id || `program-node-${index}`} className={styles.programNodeWrapper}>
                            <div className={styles.programLineageStripes}>
                                {lineageColors.map((stripeColor, stripeIndex) => (
                                    <div
                                        key={`${node.id}-stripe-${stripeIndex}`}
                                        className={styles.programConnectingStripe}
                                        style={{
                                            backgroundColor: stripeColor,
                                            left: `${stripeIndex * 4}px`,
                                            zIndex: 10 + stripeIndex,
                                        }}
                                    />
                                ))}
                            </div>

                            <div
                                className={`${styles.programCard} ${isCompleted ? styles.programCardCompleted : ''}`}
                                onClick={() => handleGoalClick(node)}
                            >
                                <div
                                    className={styles.programCardContent}
                                    style={{ paddingLeft: `${lineageColors.length * 4 + 12}px` }}
                                >
                                    <div
                                        className={styles.programGoalType}
                                        style={{ color: isCompleted ? completedColor : getGoalColor(node.type) }}
                                    >
                                        {getTypeDisplayName(node.type)}
                                    </div>
                                    <div
                                        className={`${styles.programGoalName} ${isCompleted ? styles.programGoalNameCompleted : ''}`}
                                        style={{ color: isCompleted ? completedColor : 'var(--color-text-primary)' }}
                                    >
                                        {node.name}
                                    </div>
                                    {(node.deadline || (isCompleted && node.completed_at)) && (
                                        <div className={styles.programGoalDeadline}>
                                            {isCompleted
                                                ? `Completed: ${formatLiteralDate(node.completed_at, deadlineOptions)}`
                                                : `Deadline: ${formatLiteralDate(node.deadline, deadlineOptions)}`}
                                        </div>
                                    )}
                                </div>
                                {isCompleted && <div className={styles.programCheckIcon}>✓</div>}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    const sessionListClassName = [
        styles.list,
        styles.sessionList,
        density === 'comfortable' ? styles.sessionListComfortable : '',
    ].filter(Boolean).join(' ');

    return (
        <div ref={listRef} className={sessionListClassName}>
            {renderConnectorEdges()}
            {sessionRows.map(renderSessionTreeRow)}
        </div>
    );
}

export default GoalHierarchyList;
