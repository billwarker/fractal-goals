import React, { useMemo, useState } from 'react';

import notify from '../../utils/notify';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import GoalHierarchySelector from '../goals/GoalHierarchySelector';

import styles from './ActivityAssociationModal.module.css';

/**
 * Modal for associating an activity with goals from the goal hierarchy.
 */
const ActivityAssociationModal = ({
    isOpen,
    onClose,
    onAssociate,
    goals = [],
    initialActivityName = '',
    initialSelectedGoalIds = [],
}) => {
    const [selectedGoalIds, setSelectedGoalIds] = useState(initialSelectedGoalIds);
    const initialGoalIds = useMemo(() => new Set(initialSelectedGoalIds), [initialSelectedGoalIds]);
    const selectedGoalIdSet = useMemo(() => new Set(selectedGoalIds), [selectedGoalIds]);

    const hasSelectionChanged = useMemo(() => {
        if (selectedGoalIdSet.size !== initialGoalIds.size) return true;
        for (const goalId of selectedGoalIdSet) {
            if (!initialGoalIds.has(goalId)) return true;
        }
        return false;
    }, [initialGoalIds, selectedGoalIdSet]);

    const blockedGoalRemovals = useMemo(() => {
        const removedGoalIds = [];
        for (const goalId of initialGoalIds) {
            if (!selectedGoalIdSet.has(goalId)) removedGoalIds.push(goalId);
        }

        return goals.filter((goal) => (
            removedGoalIds.includes(goal.id) && goal.hasTargetForActivity
        ));
    }, [goals, initialGoalIds, selectedGoalIdSet]);

    const canConfirm = hasSelectionChanged && blockedGoalRemovals.length === 0;

    const handleConfirm = async () => {
        if (blockedGoalRemovals.length > 0) {
            const goalNames = blockedGoalRemovals.map((goal) => `"${goal.name}"`).join(', ');
            notify.error(`Cannot remove goals with targets on this activity: ${goalNames}`);
            return;
        }

        if (!hasSelectionChanged) {
            return;
        }

        const saved = await onAssociate(selectedGoalIds);
        if (saved === false) return;
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Associate "${initialActivityName}"`}
            size="lg"
        >
            <ModalBody>
                <GoalHierarchySelector
                    goals={goals}
                    selectedGoalIds={selectedGoalIds}
                    onSelectionChange={setSelectedGoalIds}
                    selectionMode="multiple"
                    searchPlaceholder="Search goals..."
                    emptyState="No goals available."
                    highlightSelectionAncestors
                    showAncestorControls={false}
                />
                {blockedGoalRemovals.length > 0 && (
                    <div className={styles.blockedHint}>
                        Remove targets first for: {blockedGoalRemovals.map((goal) => goal.name).join(', ')}
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
                    {selectedGoalIds.length > 0
                        ? `Associate ${selectedGoalIds.length} Goal${selectedGoalIds.length !== 1 ? 's' : ''}`
                        : 'Save Associations'}
                </button>
            </ModalFooter>
        </Modal>
    );
};

export default ActivityAssociationModal;
