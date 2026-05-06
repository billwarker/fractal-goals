import React from 'react';
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

    const treeRoots = buildSessionHierarchyTree(nodes);

    const getNodeHighlightState = (node) => {
        const originalNode = node.originalGoal || node;
        return getGoalBranchHighlightState
            ? getGoalBranchHighlightState(originalNode)
            : (isGoalBranchHighlighted && isGoalBranchHighlighted(originalNode) ? 'active' : null);
    };

    const branchContainsHighlightedNode = (node) => {
        if (getNodeHighlightState(node)) {
            return true;
        }
        return node.children.some(branchContainsHighlightedNode);
    };

    const renderSessionTreeNodes = (treeNodes, depth = 0) => {
        const activeChildIndexes = treeNodes
            .map((node, index) => (branchContainsHighlightedNode(node) ? index : null))
            .filter((index) => index !== null);
        const lastActiveChildIndex = activeChildIndexes.length > 0
            ? Math.max(...activeChildIndexes)
            : -1;

        return (
        <ul className={depth > 0 ? styles.sessionTreeChildren : styles.sessionTreeRoot}>
            {treeNodes.map((node, index) => {
                const isCompleted = node.status
                    ? Boolean(node.status.completed)
                    : Boolean(node.completed);
                const isNestedNode = depth > 0;
                const originalNode = node.originalGoal || node;
                const isSelectable = isGoalSelectable ? isGoalSelectable(originalNode) : Boolean(onGoalClick);
                const branchHighlightState = getNodeHighlightState(node);
                const branchHasHighlightedNode = branchContainsHighlightedNode(node);
                const shouldHighlightVerticalConnector = isNestedNode && index <= lastActiveChildIndex;
                const shouldStopHighlightedVerticalConnector = shouldHighlightVerticalConnector && index === lastActiveChildIndex;
                const shouldHighlightHorizontalConnector = isNestedNode && branchHasHighlightedNode;
                const metaLabel = getGoalMetaLabel ? getGoalMetaLabel(originalNode) : null;
                // Each level of nesting adds --tree-indent (28px). The left slot must escape
                // all accumulated indentation plus the 28px padding-left on the wrapper div.
                const leftSlotOffset = `calc(-1 * ${depth} * var(--tree-indent, 28px) - 28px)`;

                return (
                    <li
                        key={node.id}
                        className={`${styles.sessionTreeItem} ${isNestedNode ? styles.sessionTreeItemNested : ''} ${node.children.length > 0 ? styles.sessionTreeItemHasChildren : ''} ${shouldHighlightVerticalConnector ? styles.sessionTreeItemBranchConnectorActive : ''} ${shouldStopHighlightedVerticalConnector ? styles.sessionTreeItemBranchConnectorEnd : ''}`}
                    >
                        <div
                            className={`${styles.sessionTreeNode} ${node.isLinked ? styles.sessionNodeActive : ''} ${isNestedNode ? styles.sessionTreeNodeNested : ''} ${shouldHighlightHorizontalConnector ? styles.sessionTreeNodeBranchConnectorActive : ''}`}
                        >
                            {getGoalLeftSlot && (
                                <div className={styles.sessionLeftSlot} style={{ left: leftSlotOffset }}>
                                    {getGoalLeftSlot(node.originalGoal || node)}
                                </div>
                            )}
                            <div className={styles.sessionIconSlot}>
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

                        {node.children.length > 0 ? renderSessionTreeNodes(node.children, depth + 1) : null}
                    </li>
                );
            })}
        </ul>
        );
    };

    return <div className={`${styles.list} ${styles.sessionList}`}>{renderSessionTreeNodes(treeRoots)}</div>;
}

export default GoalHierarchyList;
