import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import GoalIcon from '../atoms/GoalIcon';
import { getTypeDisplayName } from '../../utils/goalHelpers';
import { isExecutionGoalType } from '../../utils/goalNodeModel';
import { formatLiteralDate } from '../../utils/dateUtils';
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
        treeNode.children.sort((a, b) => a.originalIndex - b.originalIndex);
        treeNode.children.forEach(sortChildren);
    };

    roots.sort((a, b) => a.originalIndex - b.originalIndex);
    roots.forEach(sortChildren);

    return roots;
}

function GoalHierarchyList({
    nodes = [],
    variant = 'session',
    onGoalClick,
    isGoalSelectable,
    getGoalMetaLabel,
    getGoalNameStyle,
    isGoalBranchHighlighted,
    getGoalBranchHighlightState,
    getGoalConnectorHighlightState,
    getGoalConnectorEdgeHighlightState,
    connectorHighlightMode = 'selected',
    showGoalHighlightHalo = false,
    getGoalLeftSlot,
    getScopedCharacteristics,
    getGoalColor,
    getGoalSecondaryColor,
    getGoalIcon,
    completedColor = 'var(--color-brand-success)',
    completedSecondaryColor = 'var(--color-brand-success)',
    onStartSubGoalCreation,
    onAddTargetForGoal,
    emptyState = 'No goals associated',
}) {
    const canAddChild = (goalType) => !isExecutionGoalType(goalType);

    const handleGoalClick = (node) => {
        if (!onGoalClick) {
            return;
        }
        if (isGoalSelectable && !isGoalSelectable(node.originalGoal || node)) {
            return;
        }
        onGoalClick(node.originalGoal || node);
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

    const treeRoots = useMemo(() => buildSessionHierarchyTree(nodes), [nodes]);
    const listRef = useRef(null);
    const iconRefs = useRef(new Map());
    const [connectorEdges, setConnectorEdges] = useState([]);

    const getNodeHighlightState = (node) => {
        const originalNode = node.originalGoal || node;
        return getGoalBranchHighlightState
            ? getGoalBranchHighlightState(originalNode)
            : (isGoalBranchHighlighted && isGoalBranchHighlighted(originalNode) ? 'active' : null);
    };

    const nodeIsHighlighted = (node) => Boolean(getNodeHighlightState(node));

    const nodeConnectorIsHighlighted = (node) => {
        if (!getGoalConnectorHighlightState) {
            return nodeIsHighlighted(node);
        }
        return Boolean(getGoalConnectorHighlightState(node.originalGoal || node));
    };

    const branchContainsHighlightedConnectorNode = (node) => {
        if (nodeConnectorIsHighlighted(node)) {
            return true;
        }
        return node.children.some(branchContainsHighlightedConnectorNode);
    };

    const nodeActivatesConnector = (node) => (
        connectorHighlightMode === 'lineage'
            ? branchContainsHighlightedConnectorNode(node)
            : nodeConnectorIsHighlighted(node)
    );

    const subtreeHasActiveConnector = (node) => {
        if (nodeActivatesConnector(node)) {
            return true;
        }
        return node.children.some(subtreeHasActiveConnector);
    };

    const getLastActiveIndex = (treeNodes) => {
        let lastActiveIndex = -1;
        treeNodes.forEach((node, index) => {
            if (subtreeHasActiveConnector(node)) {
                lastActiveIndex = index;
            }
        });
        return lastActiveIndex;
    };

    const flattenSessionTreeRows = (treeNodes, depth = 0, ancestorContinuations = []) => {
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
    };

    const sessionRows = useMemo(
        () => flattenSessionTreeRows(treeRoots),
        [
            connectorHighlightMode,
            getGoalBranchHighlightState,
            getGoalConnectorHighlightState,
            isGoalBranchHighlighted,
            treeRoots,
        ]
    );

    const rowById = useMemo(
        () => new Map(sessionRows.map((row) => [String(row.node.id), row])),
        [sessionRows]
    );

    const setIconRef = (nodeId) => (element) => {
        const key = String(nodeId);
        if (element) {
            iconRefs.current.set(key, element);
        } else {
            iconRefs.current.delete(key);
        }
    };

    useLayoutEffect(() => {
        const listElement = listRef.current;
        if (!listElement) {
            return undefined;
        }

        const measureConnectors = () => {
            const listRect = listElement.getBoundingClientRect();
            const nextEdges = [];

            sessionRows.forEach(({ node }) => {
                const parentElement = iconRefs.current.get(String(node.id));
                if (!parentElement) {
                    return;
                }

                const parentRect = parentElement.getBoundingClientRect();
                const from = {
                    x: parentRect.left - listRect.left + (parentRect.width / 2),
                    y: parentRect.top - listRect.top + (parentRect.height / 2),
                };

                node.children.forEach((child) => {
                    const childElement = iconRefs.current.get(String(child.id));
                    if (!childElement) {
                        return;
                    }

                    const childRect = childElement.getBoundingClientRect();
                    const to = {
                        x: childRect.left - listRect.left + (childRect.width / 2),
                        y: childRect.top - listRect.top + (childRect.height / 2),
                    };
                    const childRow = rowById.get(String(child.id));
                    const active = getGoalConnectorEdgeHighlightState
                        ? Boolean(getGoalConnectorEdgeHighlightState(node.originalGoal || node, child.originalGoal || child))
                        : (childRow
                            ? Boolean(childRow.currentTopActive || childRow.currentHorizontalActive)
                            : false);

                    nextEdges.push({
                        key: `${node.id}-${child.id}`,
                        parentId: node.id,
                        childId: child.id,
                        from,
                        to,
                        active,
                    });
                });
            });

            setConnectorEdges((currentEdges) => {
                if (currentEdges.length !== nextEdges.length) {
                    return nextEdges;
                }

                const hasChanged = nextEdges.some((edge, index) => {
                    const currentEdge = currentEdges[index];
                    return !currentEdge
                        || currentEdge.key !== edge.key
                        || currentEdge.active !== edge.active
                        || currentEdge.from.x !== edge.from.x
                        || currentEdge.from.y !== edge.from.y
                        || currentEdge.to.x !== edge.to.x
                        || currentEdge.to.y !== edge.to.y;
                });

                return hasChanged ? nextEdges : currentEdges;
            });
        };

        const frameIds = [];
        const timeoutIds = [];
        const scheduleMeasure = () => {
            measureConnectors();

            if (typeof requestAnimationFrame === 'function') {
                const firstFrameId = requestAnimationFrame(() => {
                    measureConnectors();
                    const secondFrameId = requestAnimationFrame(measureConnectors);
                    frameIds.push(secondFrameId);
                });
                frameIds.push(firstFrameId);
            }

            timeoutIds.push(window.setTimeout(measureConnectors, 80));
            timeoutIds.push(window.setTimeout(measureConnectors, 220));
        };

        scheduleMeasure();

        const resizeObserver = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(scheduleMeasure)
            : null;
        resizeObserver?.observe(listElement);
        iconRefs.current.forEach((element) => resizeObserver?.observe(element));
        const modalElement = listElement.closest('[role="dialog"]') || listElement.closest('[class*="modal"]');
        window.addEventListener('resize', scheduleMeasure);
        modalElement?.addEventListener('transitionend', scheduleMeasure);
        modalElement?.addEventListener('animationend', scheduleMeasure);

        return () => {
            frameIds.forEach((frameId) => cancelAnimationFrame(frameId));
            timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
            resizeObserver?.disconnect();
            window.removeEventListener('resize', scheduleMeasure);
            modalElement?.removeEventListener('transitionend', scheduleMeasure);
            modalElement?.removeEventListener('animationend', scheduleMeasure);
        };
    }, [getGoalConnectorEdgeHighlightState, rowById, sessionRows]);

    const renderConnectorEdges = () => (
        <svg className={styles.sessionConnectorSvg} aria-hidden="true">
            {connectorEdges.map(({ key, parentId, childId, from, to, active }) => {
                const midpointY = to.y;
                const path = `M ${from.x} ${from.y} V ${midpointY} H ${to.x}`;

                return (
                    <path
                        key={key}
                        d={path}
                        className={`${styles.sessionConnectorEdge} ${active ? styles.sessionConnectorEdgeActive : ''}`}
                        data-connector-active={active ? 'true' : 'false'}
                        data-parent-goal-id={parentId}
                        data-child-goal-id={childId}
                    />
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
        const metaLabel = getGoalMetaLabel ? getGoalMetaLabel(originalNode) : null;
        return (
            <div
                key={node.id}
                className={styles.sessionTreeRow}
                data-goal-id={node.id}
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
                        className={`${styles.sessionIconSlot} ${showGoalHighlightHalo && branchHighlightState ? styles.sessionIconSlotBranchActive : ''}`}
                    >
                        <GoalIcon
                            shape={getGoalIcon ? getGoalIcon(node.type) : getScopedCharacteristics(node.type)?.icon || 'circle'}
                            color={isCompleted ? completedColor : getGoalColor(node.type)}
                            secondaryColor={isCompleted ? completedSecondaryColor : getGoalSecondaryColor(node.type)}
                            isSmart={node.is_smart}
                            size={16}
                        />
                    </div>
                    <div className={styles.sessionNodeContent}>
                        <span
                            className={`${styles.sessionNodeName} ${node.isLinked ? styles.sessionNodeNameActive : ''} ${!isSelectable ? styles.sessionNodeNameDisabled : ''}`}
                            style={getGoalNameStyle ? getGoalNameStyle(originalNode) : undefined}
                            onClick={() => handleGoalClick(node)}
                        >
                            {node.name}
                        </span>
                        {metaLabel && (
                            typeof metaLabel === 'string' ? (
                                <span className={styles.sessionNodeMeta}>
                                    {metaLabel}
                                </span>
                            ) : metaLabel
                        )}
                        {onStartSubGoalCreation && canAddChild(node.type) && (
                            <button
                                className={styles.addSubGoalBtn}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    if (node.type === 'ImmediateGoal' && onAddTargetForGoal) {
                                        onAddTargetForGoal(node);
                                        return;
                                    }
                                    onStartSubGoalCreation(node);
                                }}
                                title={node.type === 'ImmediateGoal' ? 'Add Target' : 'Add Sub-goal'}
                            >
                                +
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div ref={listRef} className={`${styles.list} ${styles.sessionList}`}>
            {renderConnectorEdges()}
            {sessionRows.map(renderSessionTreeRow)}
        </div>
    );
}

export default GoalHierarchyList;
