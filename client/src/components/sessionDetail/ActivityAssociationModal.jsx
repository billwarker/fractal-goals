import React, { useState, useMemo } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
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
        // Define explicit order
        const order = ['UltimateGoal', 'LongTermGoal', 'MidTermGoal', 'ShortTermGoal', 'ImmediateGoal', 'MicroGoal'];

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

    if (!isOpen) return null;

    const handleConfirm = () => {
        if (selectedGoalIds.size > 0) {
            onAssociate(Array.from(selectedGoalIds));
            onClose();
            // Reset state
            setSelectedGoalIds(new Set());
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
                            return (
                                <div
                                    key={goal.id}
                                    className={`${styles.goalItem} ${isSelected ? styles.selected : ''}`}
                                    onClick={() => toggleGoalSelection(goal.id)}
                                >
                                    <div className={`${styles.checkbox} ${isSelected ? styles.checked : ''}`}>
                                        {isSelected && '✓'}
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
                        disabled={selectedGoalIds.size === 0}
                    >
                        {selectedGoalIds.size > 0
                            ? `Associate ${selectedGoalIds.size} Goal${selectedGoalIds.size !== 1 ? 's' : ''}`
                            : 'Associate Goal'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ActivityAssociationModal;
