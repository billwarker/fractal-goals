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
    highlightSelectionAncestors = false,
    connectorHighlightMode,
    showGoalHighlightHalo = false,
    showAncestorControls = true,
    confirmLabel,
    onClose,
    onConfirm,
    lockedGoalIds = [],
    lockedGoalLabel,
}) {
    const [draftGoalIds, setDraftGoalIds] = useState(selectedGoalIds);
    const [isConfirming, setIsConfirming] = useState(false);
    const [confirmError, setConfirmError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Opening creates a fresh draft transaction.
        setDraftGoalIds(selectedGoalIds);
        setConfirmError('');
    }, [isOpen, selectedGoalIds]);

    const handleConfirm = () => {
        setConfirmError('');
        try {
            const result = onConfirm?.(draftGoalIds);
            if (!result || typeof result.then !== 'function') {
                onClose?.();
                return;
            }
            setIsConfirming(true);
            result.then(() => onClose?.()).catch((error) => {
                setConfirmError(error?.response?.data?.error || error?.message || 'Could not update session scope.');
            }).finally(() => setIsConfirming(false));
        } catch (error) {
            setConfirmError(error?.response?.data?.error || error?.message || 'Could not update session scope.');
            setIsConfirming(false);
        }
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
                    highlightSelectionAncestors={highlightSelectionAncestors}
                    connectorHighlightMode={connectorHighlightMode}
                    showGoalHighlightHalo={showGoalHighlightHalo}
                    showAncestorControls={showAncestorControls}
                    lockedGoalIds={lockedGoalIds}
                    lockedGoalLabel={lockedGoalLabel}
                />
                {confirmError && <div role="alert" className={styles.error}>{confirmError}</div>}
            </ModalBody>
            <ModalFooter>
                <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setDraftGoalIds([])}
                    disabled={isConfirming}
                >
                    Clear
                </button>
                <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={isConfirming}>
                    Cancel
                </button>
                <button type="button" className={styles.primaryButton} onClick={handleConfirm} disabled={isConfirming}>
                    {isConfirming ? 'Applying…' : (confirmLabel || `Apply (${draftGoalIds.length})`)}
                </button>
            </ModalFooter>
        </Modal>
    );
}

export default GoalHierarchySelectionModal;
