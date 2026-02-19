import React, { useState, useMemo, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import notify from '../../utils/notify';
import styles from './ActivityAssociationModal.module.css';
import GoalIcon from '../atoms/GoalIcon';

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
    const { getGoalColor, getGoalSecondaryColor, getScopedCharacteristics } = useTheme();
    const [searchTerm, setSearchTerm] = useState('');

    // Multi-select state - initialize with passed IDs
    const [selectedGoalIds, setSelectedGoalIds] = useState(() => new Set(initialSelectedGoalIds));
    const [initialGoalIds, setInitialGoalIds] = useState(() => new Set(initialSelectedGoalIds));

    useEffect(() => {
        if (isOpen) {
            setSelectedGoalIds(new Set(initialSelectedGoalIds));
            setInitialGoalIds(new Set(initialSelectedGoalIds));
        }
    }, [isOpen, initialSelectedGoalIds]);

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
            'ImmediateGoal': [],
            'MicroGoal': []
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

    const handleConfirm = () => {
        if (blockedGoalRemovals.length > 0) {
            const goalNames = blockedGoalRemovals.map(g => `"${g.name}"`).join(', ');
            notify.error(`Cannot remove goals with targets on this activity: ${goalNames}`);
            return;
        }

        if (hasSelectionChanged) {
            onAssociate(Array.from(selectedGoalIds));
            onClose();
            // Reset state
            setSelectedGoalIds(new Set());
            setInitialGoalIds(new Set());
            setSearchTerm('');
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
            case 'MicroGoal': return 'Micro Goals';
            default: return 'Other Goals';
        }
    };

    const selectedDescendantCache = useMemo(() => {
        const cache = new Map();
        const visiting = new Set();

        const hasSelectedDescendant = (goalId) => {
            if (!goalId) return false;
            if (cache.has(goalId)) return cache.get(goalId);
            if (visiting.has(goalId)) return false;
            visiting.add(goalId);

            const goal = goalById.get(goalId);
            if (!goal || !Array.isArray(goal.childrenIds) || goal.childrenIds.length === 0) {
                cache.set(goalId, false);
                visiting.delete(goalId);
                return false;
            }

            const result = goal.childrenIds.some((childId) => (
                selectedGoalIds.has(childId) || hasSelectedDescendant(childId)
            ));

            cache.set(goalId, result);
            visiting.delete(goalId);
            return result;
        };

        goals.forEach((goal) => {
            hasSelectedDescendant(goal.id);
        });
        return cache;
    }, [goals, goalById, selectedGoalIds]);

    if (!isOpen) return null;

    // Helper to render section with icon
    const renderSection = (type, typeGoals) => {
        if (!typeGoals || typeGoals.length === 0) return null;

        const characteristics = getScopedCharacteristics(type);
        const shape = characteristics?.icon || 'circle';
        const isCollapsed = collapsedSections.has(type);

        return (
            <div key={type} className={styles.goalGroup}>
                <div
                    className={styles.groupTitleRow}
                    onClick={() => toggleSection(type)}
                    style={{ cursor: 'pointer' }}
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
                            const isInherited = selectedDescendantCache.get(goal.id) || false;

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
                                    <div className={checkboxClass}>
                                        {isSelected && (
                                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                                <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        )}
                                        {!isSelected && isInherited && (
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'scaleX(-1)', opacity: 0.7 }}>
                                                <polyline points="15 10 20 15 15 20"></polyline>
                                                <path d="M4 4v7a4 4 0 0 0 4 4h12"></path>
                                            </svg>
                                        )}
                                    </div>
                                    <div className={styles.goalInfo}>
                                        <div className={styles.goalName}>{goal.name}</div>
                                        {goal.parentName && <div className={styles.goalParent}>via {goal.parentName}</div>}
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
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h3>Associate "{initialActivityName}"</h3>
                    <button className={styles.closeButton} onClick={onClose}>×</button>
                </div>

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
                    {renderSection('MicroGoal', groupedGoals['MicroGoal'])}
                    {renderSection('Other', groupedGoals['Other'])}

                    {filteredGoals.length === 0 && (
                        <div className={styles.emptyState}>No goals found.</div>
                    )}
                </div>

                <div className={styles.modalFooter}>
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
                </div>
                {blockedGoalRemovals.length > 0 && (
                    <div className={styles.blockedHint}>
                        Remove targets first for: {blockedGoalRemovals.map(g => g.name).join(', ')}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ActivityAssociationModal;
