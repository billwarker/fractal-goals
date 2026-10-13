import React from 'react';

import Button from '../atoms/Button';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import SessionCompletionButton from '../common/SessionCompletionButton';
import { QuickSessionWorkspace } from '../sessionDetail';
import styles from './QuickSessionModal.module.css';

function QuickSessionModal({
    isOpen,
    templateName,
    onClose,
    onComplete,
    isSubmitting = false,
}) {
    const handleClose = () => {
        if (!isSubmitting) onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={templateName ? `Quick Session · ${templateName}` : 'Quick Session'}
            size="xl"
            showCloseButton={!isSubmitting}
            closeOnEsc={!isSubmitting}
            closeOnBackdrop={!isSubmitting}
            className={styles.modal}
        >
            <ModalBody className={styles.body}>
                <p className={styles.instructions}>
                    Enter the activity details, then complete the quick session to save it.
                </p>
                <QuickSessionWorkspace showCompletionAction={false} />
            </ModalBody>
            <ModalFooter className={styles.footer}>
                <Button
                    variant="secondary"
                    onClick={handleClose}
                    disabled={isSubmitting}
                >
                    Cancel
                </Button>
                <SessionCompletionButton
                    pendingLabel="✓ Complete Quick Session"
                    onClick={onComplete}
                    isLoading={isSubmitting}
                    className={styles.completeButton}
                />
            </ModalFooter>
        </Modal>
    );
}

export default QuickSessionModal;
