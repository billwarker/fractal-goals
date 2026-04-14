import React, { useMemo, useState } from 'react';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import notify from '../../utils/notify';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import GoalIcon from '../atoms/GoalIcon';

import styles from './ActivityAssociationModal.module.css';

/**
 * Modal for associating an activity with a goal.
 * Allows selecting from existing goals in the session/program hierarchy.
 */
const ActivityAssociationModal = ({
    isOpen,
    onClose,
    onAssociate,
    goals = [],
    initialActivityName = '',
    initialSelectedGoalIds = []
}) => {
    const { getGoalColor, getGoalSecondaryColor, getGoalIcon } = useGoalLevels();
    const [searchTerm, setSearchTerm] = useState('');

    // Multi-select state - initialize with passed IDs
    const [selectedGoalIds, setSelectedGoalIds] = useState(() => new Set(initialSelectedGoalIds));
    const initialGoalIds = useMemo(() => new Set(initialSelectedGoalIds), [initialSelectedGoalIds]);

    // Collapsible sections state - simplified to track collapsed state (default expanded)
    const [collapsedSections, setCollapsedSections] = useState(new Set());

    // Filter goals based on search term
    const filteredGoals = useMemo(() => {
        if (!searchTerm.trim()) return goals;
        const lowerTerm = searchTerm.toLowerCase();
        return goals.filter(g =>
            g.name.toLowerCase().includes(lowerTerm) ||
            (g.type && g.type.toLowerCase().includes(lowerTerm))
        );
    }, [goals, searchTerm]);

    // Group goals by type for better organization
    const groupedGoals = useMemo(() => {
        const groups = {
            'UltimateGoal': [],
            'LongTermGoal': [],
            'MidTermGoal': [],
            'ShortTermGoal': [],
            'ImmediateGoal': []
        };

        filteredGoals.forEach(g => {
            if (groups[g.type]) {
                groups[g.type].push(g);
            } else {
                // Fallback for other types
                if (!groups['Other']) groups['Other'] = [];
                groups['Other'].push(g);
            }
        });

        return groups;
    }, [filteredGoals]);

    const goalById = useMemo(() => {
        const map = new Map();
        goals.forEach((goal) => {
            map.set(goal.id, goal);
        });
        return map;
    }, [goals]);

    const hasSelectionChanged = useMemo(() => {
        if (selectedGoalIds.size !== initialGoalIds.size) return true;
        for (const goalId of selectedGoalIds) {
            if (!initialGoalIds.has(goalId)) return true;
        }
        return false;
    }, [selectedGoalIds, initialGoalIds]);

    const blockedGoalRemovals = useMemo(() => {
        const removedGoalIds = [];
        for (const goalId of initialGoalIds) {
            if (!selectedGoalIds.has(goalId)) removedGoalIds.push(goalId);
        }

        return goals.filter(goal =>
            removedGoalIds.includes(goal.id) && goal.hasTargetForActivity
        );
    }, [goals, initialGoalIds, selectedGoalIds]);

    const canConfirm = hasSelectionChanged && blockedGoalRemovals.length === 0;

    const handleConfirm = async () => {
        if (blockedGoalRemovals.length > 0) {
            const goalNames = blockedGoalRemovals.map(g => `"${g.name}"`).join(', ');
            notify.error(`Cannot remove goals with targets on this activity: ${goalNames}`);
            return;
        }

        if (hasSelectionChanged) {
            const saved = await onAssociate(Array.from(selectedGoalIds));
            if (saved === false) return;
            onClose();
        }
    };

    const toggleSection = (type) => {
        setCollapsedSections(prev => {
            const next = new Set(prev);
            if (next.has(type)) {
                next.delete(type);
            } else {
                next.add(type);
            }
            return next;
        });
    };

    const toggleGoalSelection = (goalId) => {
        setSelectedGoalIds(prev => {
            const next = new Set(prev);
            if (next.has(goalId)) {
                next.delete(goalId);
            } else {
                next.add(goalId);
            }
            return next;
        });
    };

    const getTypeLabel = (type) => {
        switch (type) {
            case 'UltimateGoal': return 'Ultimate Goals';
            case 'LongTermGoal': return 'Long Term Goals';
            case 'MidTermGoal': return 'Mid Term Goals';
            case 'ShortTermGoal': return 'Short Term Goals';
            case 'ImmediateGoal': return 'Immediate Goals';
            default: return 'Other Goals';
        }
    };

    const inheritanceByGoalId = useMemo(() => {
        const selectedDescendantCache = new Map();
        const visiting = new Set();

        const findSelectedDescendant = (goalId) => {
            if (!goalId) return null;
            if (selectedDescendantCache.has(goalId)) return selectedDescendantCache.get(goalId);
            if (visiting.has(goalId)) return null;
            visiting.add(goalId);

            const goal = goalById.get(goalId);
            if (!goal || !Array.isArray(goal.childrenIds) || goal.childrenIds.length === 0) {
                selectedDescendantCache.set(goalId, null);
                visiting.delete(goalId);
                return null;
            }

            let result = null;
            for (const childId of goal.childrenIds) {
                const childGoal = goalById.get(childId);
                if (selectedGoalIds.has(childId)) {
                    result = {
                        direction: 'child',
                        sourceGoalId: childId,
                        sourceGoalName: childGoal?.name || null,
                    };
                    break;
                }

                const descendantResult = findSelectedDescendant(childId);
                if (descendantResult) {
                    result = descendantResult;
                    break;
                }
            }

            selectedDescendantCache.set(goalId, result);
            visiting.delete(goalId);
            return result;
        };

        const findSelectedAncestor = (goalId) => {
            const seen = new Set([goalId]);
            let currentGoal = goalById.get(goalId);

            while (currentGoal?.parent_id && !seen.has(currentGoal.parent_id)) {
                const parentId = currentGoal.parent_id;
                seen.add(parentId);
                const parentGoal = goalById.get(parentId);
                if (selectedGoalIds.has(parentId)) {
                    return {
                        direction: 'parent',
                        sourceGoalId: parentId,
                        sourceGoalName: parentGoal?.name || null,
                    };
                }
                currentGoal = parentGoal;
            }

            return null;
        };

        const map = new Map();
        goals.forEach((goal) => {
            if (selectedGoalIds.has(goal.id)) {
                map.set(goal.id, null);
                return;
            }

            const inheritedFromChild = findSelectedDescendant(goal.id);
            if (inheritedFromChild) {
                map.set(goal.id, inheritedFromChild);
                return;
            }

            map.set(goal.id, findSelectedAncestor(goal.id));
        });
        return map;
    }, [goals, goalById, selectedGoalIds]);

    // Helper to render section with icon
    const renderSection = (type, typeGoals) => {
        if (!typeGoals || typeGoals.length === 0) return null;

        const shape = getGoalIcon ? getGoalIcon(type) : 'circle';
        const isCollapsed = collapsedSections.has(type);

        return (
            <div key={type} className={styles.goalGroup}>
                <div
                    className={styles.groupTitleRow}
                    onClick={() => toggleSection(type)}
                >
                    <div className={`${styles.chevron} ${isCollapsed ? styles.collapsed : ''}`}>▼</div>
                    <GoalIcon
                        shape={shape}
                        color={getGoalColor(type)}
                        secondaryColor={getGoalSecondaryColor(type)}
                        size={14}
                    />
                    <span className={styles.groupTitleText}>{getTypeLabel(type)}</span>
                    <span className={styles.groupCount}>({typeGoals.length})</span>
                </div>

                {!isCollapsed && (
                    <div className={styles.groupContent}>
                        {typeGoals.map(goal => {
                            const isSelected = selectedGoalIds.has(goal.id);
                            const inheritance = inheritanceByGoalId.get(goal.id) || null;
                            const isInherited = Boolean(inheritance);
                            const inheritanceLabel = inheritance
                                ? `Inherited via ${inheritance.direction} goal:${inheritance.sourceGoalName ? ` ${inheritance.sourceGoalName}` : ''}`
                                : null;

                            // Determine styles based on state
                            // Direct selection takes precedence over inheritance visually
                            let checkboxClass = styles.checkbox;
                            let rowClass = styles.goalItem; // No more selected styling on row

                            if (isSelected) {
                                checkboxClass += ` ${styles.checkboxDirect}`;
                            } else if (isInherited) {
                                checkboxClass += ` ${styles.checkboxInherited}`;
                            }

                            return (
                                <div
                                    key={goal.id}
                                    className={rowClass}
                                    onClick={() => toggleGoalSelection(goal.id)}
                                >
                                    <div className={checkboxClass} title={inheritanceLabel || undefined}>
                                        {isSelected && (
                                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                                <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        )}
                                        {!isSelected && isInherited && (
                                            inheritance.direction === 'child' ? (
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label={inheritanceLabel}>
                                                    <path d="M12 19V6" />
                                                    <polyline points="7 11 12 6 17 11" />
                                                </svg>
                                            ) : (
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label={inheritanceLabel}>
                                                    <path d="M12 5v13" />
                                                    <polyline points="7 14 12 19 17 14" />
                                                </svg>
                                            )
                                        )}
                                    </div>

                                    <div className={styles.goalInfo}>
                                        <div className={styles.goalName}>{goal.name}</div>
                                        {inheritanceLabel && <div className={styles.goalInheritance}>{inheritanceLabel}</div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Associate "${initialActivityName}"`}
            size="lg"
        >
            <ModalBody>
                <div className={styles.searchContainer}>
                    <input
                        type="text"
                        placeholder="Search goals..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className={styles.searchInput}
                        autoFocus
                    />
                </div>

                <div className={styles.goalsList}>
                    {/* Render in specific order */}
                    {renderSection('UltimateGoal', groupedGoals['UltimateGoal'])}
                    {renderSection('LongTermGoal', groupedGoals['LongTermGoal'])}
                    {renderSection('MidTermGoal', groupedGoals['MidTermGoal'])}
                    {renderSection('ShortTermGoal', groupedGoals['ShortTermGoal'])}
                    {renderSection('ImmediateGoal', groupedGoals['ImmediateGoal'])}
                    {renderSection('Other', groupedGoals['Other'])}

                    {filteredGoals.length === 0 && (
                        <div className={styles.emptyState}>No goals found.</div>
                    )}
                </div>
                {blockedGoalRemovals.length > 0 && (
                    <div className={styles.blockedHint}>
                        Remove targets first for: {blockedGoalRemovals.map(g => g.name).join(', ')}
                    </div>
                )}
            </ModalBody>

            <ModalFooter className={styles.modalFooter}>
                <button className={styles.cancelButton} onClick={onClose}>Cancel</button>
                <button
                    className={styles.confirmButton}
                    onClick={handleConfirm}
                    disabled={!canConfirm}
                >
                    {selectedGoalIds.size > 0
                        ? `Associate ${selectedGoalIds.size} Goal${selectedGoalIds.size !== 1 ? 's' : ''}`
                        : 'Save Associations'}
                </button>
            </ModalFooter>
        </Modal>
    );
};

export default ActivityAssociationModal;
