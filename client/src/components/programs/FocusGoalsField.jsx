import React, { useMemo, useState } from 'react';
import Button from '../atoms/Button';
import GoalHierarchySelectionModal from '../goals/GoalHierarchySelectionModal';
import { normalizeGoal } from '../goals/goalHierarchySelectorUtils';
import styles from './FocusGoalsField.module.css';

/**
 * A goal-focus picker for program days. ``goals`` is already
 * limited to the goals this owner may focus on (see utils/programFocus.js).
 */
function FocusGoalsField({
    label,
    goals = [],
    selectedGoalIds = [],
    onChange,
    error = '',
    pickerTitle = 'Select goals',
    emptyMessage = 'No goals available to focus on.',
    hint = '',
    required = true,
}) {
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const selectedNames = useMemo(() => {
        const byId = new Map(goals.map((goal) => {
            const normalized = normalizeGoal(goal);
            return [normalized.id, normalized.name];
        }));
        return selectedGoalIds.map((goalId) => byId.get(goalId)).filter(Boolean);
    }, [goals, selectedGoalIds]);
    const inputId = `focus-goals-${label.replace(/\s+/g, '-').toLowerCase()}`;

    return (
        <div className={styles.field}>
            <span className={styles.label} id={inputId}>{label}{required ? ' *' : ''}</span>
            <div className={styles.summary} aria-labelledby={inputId}>
                <div className={styles.summaryText}>
                    <span className={styles.count}>
                        {selectedNames.length ? `${selectedNames.length} selected` : 'None selected'}
                    </span>
                    <span className={styles.names}>
                        {selectedNames.length
                            ? `${selectedNames.slice(0, 3).join(', ')}${selectedNames.length > 3 ? ` +${selectedNames.length - 3} more` : ''}`
                            : (goals.length ? 'Choose the goals this period serves' : emptyMessage)}
                    </span>
                </div>
                <Button variant="secondary" onClick={() => setIsPickerOpen(true)} disabled={goals.length === 0}>
                    {selectedNames.length ? 'Change' : 'Choose goals'}
                </Button>
            </div>
            {hint && <div className={styles.hint}>{hint}</div>}
            {error && <div className={styles.error} role="alert">{error}</div>}
            <GoalHierarchySelectionModal
                isOpen={isPickerOpen}
                onClose={() => setIsPickerOpen(false)}
                title={pickerTitle}
                goals={goals}
                selectedGoalIds={selectedGoalIds}
                selectionMode="multiple"
                searchPlaceholder="Search goals..."
                emptyState={emptyMessage}
                highlightSelectionAncestors
                connectorHighlightMode="lineage"
                showGoalHighlightHalo
                onConfirm={(goalIds) => {
                    onChange(goalIds);
                    setIsPickerOpen(false);
                }}
            />
        </div>
    );
}

export default FocusGoalsField;
