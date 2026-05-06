import React, { useEffect, useState } from 'react';

import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import GoalHierarchySelector from './GoalHierarchySelector';
import styles from './GoalHierarchySelectionModal.module.css';

function GoalHierarchySelectionModal({
    isOpen,
    title = 'Select Goals',
    goals = [],
    selectedGoalIds = [],
    selectionMode = 'multiple',
    searchPlaceholder = 'Search goals...',
    emptyState = 'No goals available.',
    confirmLabel,
    onClose,
    onConfirm,
}) {
    const [draftGoalIds, setDraftGoalIds] = useState(selectedGoalIds);

    useEffect(() => {
        if (!isOpen) return;
        setDraftGoalIds(selectedGoalIds);
    }, [isOpen, selectedGoalIds]);

    const handleConfirm = () => {
        onConfirm?.(draftGoalIds);
        onClose?.();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
            <ModalBody>
                <GoalHierarchySelector
                    goals={goals}
                    selectedGoalIds={draftGoalIds}
                    onSelectionChange={setDraftGoalIds}
                    selectionMode={selectionMode}
                    searchPlaceholder={searchPlaceholder}
                    emptyState={emptyState}
                />
            </ModalBody>
            <ModalFooter>
                <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setDraftGoalIds([])}
                >
                    Clear
                </button>
                <button type="button" className={styles.secondaryButton} onClick={onClose}>
                    Cancel
                </button>
                <button type="button" className={styles.primaryButton} onClick={handleConfirm}>
                    {confirmLabel || `Apply (${draftGoalIds.length})`}
                </button>
            </ModalFooter>
        </Modal>
    );
}

export default GoalHierarchySelectionModal;
