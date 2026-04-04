/**
 * GoalTreePicker — shared reusable goal tree selector.
 *
 * Features:
 *   - Optional "Hide completed" toggle
 *   - Optional lineage selection buttons ("Just this", "+ Parents", "+ Children")
 *     shown inline on the active/selected row
 *
 * Props:
 *   treeData          — root node from useFractalTree (already fetched by parent)
 *   selectedGoalIds   — controlled array of selected goal IDs
 *   onSelectionChange — (ids: string[], names: string[]) => void
 *   showHideCompleted — show the hide-completed toggle (default false)
 *   defaultHideCompleted — initial value for hide-completed (default false)
 *   allowLineageSelection — show Just this / + Parents / + Children buttons (default false)
 *   getGoalColor, getGoalIcon, getGoalSecondaryColor — from useGoalLevels()
 */

import React, { useState, useMemo } from 'react';
import GoalIcon from '../atoms/GoalIcon';
import styles from './GoalTreePicker.module.css';

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildAncestorMap(node, childToParent = {}) {
    if (!node) return childToParent;
    (node.children || []).forEach(child => {
        childToParent[child.id] = node;
        buildAncestorMap(child, childToParent);
    });
    return childToParent;
}

function buildNodeMap(node, map = {}) {
    if (!node) return map;
    map[node.id] = node;
    (node.children || []).forEach(child => buildNodeMap(child, map));
    return map;
}

function collectAncestors(nodeId, ancestorMap) {
    const result = [];
    let current = ancestorMap[nodeId];
    while (current) {
        result.push(current);
        current = ancestorMap[current.id];
    }
    return result; // from immediate parent up to root
}

function collectDescendants(node) {
    const result = [];
    (node.children || []).forEach(child => {
        result.push(child);
        result.push(...collectDescendants(child));
    });
    return result;
}

const MICRO_NANO_TYPES = new Set(['MicroGoal', 'NanoGoal']);

function filterTree(node, hideCompleted, hideMicroNano) {
    if (!node) return null;
    if (hideCompleted && node.completed) return null;
    const goalType = node.goal_type || node.type || '';
    if (hideMicroNano && MICRO_NANO_TYPES.has(goalType)) return null;
    const filteredChildren = (node.children || [])
        .map(child => filterTree(child, hideCompleted, hideMicroNano))
        .filter(Boolean);
    return { ...node, children: filteredChildren };
}

// ─── Recursive node ──────────────────────────────────────────────────────────

function GoalTreePickerNode({
    node,
    depth,
    selectedGoalIds,
    activeNodeId,
    allowLineageSelection,
    onNodeClick,
    onJustThis,
    onPlusParents,
    onPlusChildren,
    getGoalColor,
    getGoalIcon,
    getGoalSecondaryColor,
}) {
    const [expanded, setExpanded] = useState(true);
    const children = node.children || [];
    const isSelected = selectedGoalIds.includes(node.id);
    const isActive = node.id === activeNodeId;
    const goalType = node.goal_type || node.type || '';
    const color = getGoalColor ? getGoalColor(goalType) : 'var(--color-text-muted)';
    const icon = getGoalIcon ? getGoalIcon(goalType) : null;
    const sec = getGoalSecondaryColor ? getGoalSecondaryColor(goalType) : null;

    return (
        <div>
            <div
                className={[
                    styles.treeNodeRow,
                    isSelected ? styles.treeNodeSelected : '',
                    node.completed ? styles.treeNodeCompleted : '',
                ].filter(Boolean).join(' ')}
                style={{ paddingLeft: depth * 16 }}
                onClick={() => onNodeClick(node)}
            >
                {children.length > 0 ? (
                    <button
                        className={styles.treeExpander}
                        onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
                        aria-label={expanded ? 'Collapse' : 'Expand'}
                    >
                        {expanded ? '▾' : '▸'}
                    </button>
                ) : (
                    <span className={styles.treeExpanderPlaceholder} />
                )}
                {icon && (
                    <span className={styles.treeNodeIcon}>
                        <GoalIcon shape={icon} color={color} secondaryColor={sec} size={12} />
                    </span>
                )}
                <span className={styles.treeNodeName}>{node.name}</span>
                {node.completed && <span className={styles.completedBadge}>✓</span>}
            </div>

            {/* Lineage buttons — shown below the active row */}
            {isActive && allowLineageSelection && (
                <div className={styles.lineageButtons} style={{ paddingLeft: depth * 16 + 22 }}>
                    <button className={styles.lineageBtn} onClick={e => { e.stopPropagation(); onJustThis(node); }}>
                        Just this
                    </button>
                    <button className={styles.lineageBtn} onClick={e => { e.stopPropagation(); onPlusParents(node); }}>
                        + Parents
                    </button>
                    <button className={styles.lineageBtn} onClick={e => { e.stopPropagation(); onPlusChildren(node); }}>
                        + Children
                    </button>
                </div>
            )}

            {expanded && children.map(child => (
                <GoalTreePickerNode
                    key={child.id}
                    node={child}
                    depth={depth + 1}
                    selectedGoalIds={selectedGoalIds}
                    activeNodeId={activeNodeId}
                    allowLineageSelection={allowLineageSelection}
                    onNodeClick={onNodeClick}
                    onJustThis={onJustThis}
                    onPlusParents={onPlusParents}
                    onPlusChildren={onPlusChildren}
                    getGoalColor={getGoalColor}
                    getGoalIcon={getGoalIcon}
                    getGoalSecondaryColor={getGoalSecondaryColor}
                />
            ))}
        </div>
    );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function GoalTreePicker({
    treeData,
    selectedGoalIds = [],
    onSelectionChange,
    showHideCompleted = false,
    defaultHideCompleted = false,
    showHideMicroNano = false,
    defaultHideMicroNano = false,
    allowLineageSelection = false,
    getGoalColor,
    getGoalIcon,
    getGoalSecondaryColor,
}) {
    const [hideCompleted, setHideCompleted] = useState(defaultHideCompleted);
    const [hideMicroNano, setHideMicroNano] = useState(defaultHideMicroNano);
    const [activeNodeId, setActiveNodeId] = useState(null);

    // Pre-compute maps for fast ancestor/descendant lookups
    const ancestorMap = useMemo(() => treeData ? buildAncestorMap(treeData) : {}, [treeData]);
    const nodeMap = useMemo(() => treeData ? buildNodeMap(treeData) : {}, [treeData]);

    const filteredTree = useMemo(() => filterTree(treeData, hideCompleted, hideMicroNano), [treeData, hideCompleted, hideMicroNano]);

    const getNames = (ids) => ids.map(id => nodeMap[id]?.name).filter(Boolean);

    const handleNodeClick = (node) => {
        if (allowLineageSelection) {
            // Show lineage buttons on this node; toggle selection
            if (activeNodeId === node.id) {
                setActiveNodeId(null);
            } else {
                setActiveNodeId(node.id);
                // If not already selected, select just this one immediately
                if (!selectedGoalIds.includes(node.id)) {
                    const ids = [node.id];
                    onSelectionChange(ids, getNames(ids));
                }
            }
        } else {
            // Simple toggle
            const ids = selectedGoalIds.includes(node.id) ? [] : [node.id];
            onSelectionChange(ids, getNames(ids));
        }
    };

    const handleJustThis = (node) => {
        const ids = [node.id];
        onSelectionChange(ids, getNames(ids));
        setActiveNodeId(null);
    };

    const handlePlusParents = (node) => {
        const ancestors = collectAncestors(node.id, ancestorMap);
        const ids = [node.id, ...ancestors.map(a => a.id)];
        onSelectionChange(ids, getNames(ids));
        setActiveNodeId(null);
    };

    const handlePlusChildren = (node) => {
        const descendants = collectDescendants(node);
        const ids = [node.id, ...descendants.map(d => d.id)];
        onSelectionChange(ids, getNames(ids));
        setActiveNodeId(null);
    };

    return (
        <div className={styles.picker}>
            {(showHideCompleted || showHideMicroNano) && (
                <div className={styles.toggleRow}>
                    {showHideCompleted && (
                        <label className={styles.hideCompletedToggle}>
                            <input
                                type="checkbox"
                                checked={hideCompleted}
                                onChange={e => setHideCompleted(e.target.checked)}
                                className={styles.hideCompletedCheckbox}
                            />
                            <span>Hide completed</span>
                        </label>
                    )}
                    {showHideMicroNano && (
                        <label className={styles.hideCompletedToggle}>
                            <input
                                type="checkbox"
                                checked={hideMicroNano}
                                onChange={e => setHideMicroNano(e.target.checked)}
                                className={styles.hideCompletedCheckbox}
                            />
                            <span>Hide micro &amp; nano</span>
                        </label>
                    )}
                </div>
            )}

            <div className={styles.treeContainer}>
                {filteredTree ? (
                    <GoalTreePickerNode
                        node={filteredTree}
                        depth={0}
                        selectedGoalIds={selectedGoalIds}
                        activeNodeId={activeNodeId}
                        allowLineageSelection={allowLineageSelection}
                        onNodeClick={handleNodeClick}
                        onJustThis={handleJustThis}
                        onPlusParents={handlePlusParents}
                        onPlusChildren={handlePlusChildren}
                        getGoalColor={getGoalColor}
                        getGoalIcon={getGoalIcon}
                        getGoalSecondaryColor={getGoalSecondaryColor}
                    />
                ) : (
                    <span className={styles.empty}>No goals found.</span>
                )}
            </div>
        </div>
    );
}
