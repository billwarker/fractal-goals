import React from 'react';
import Modal from './atoms/Modal';
import ModalBody from './atoms/ModalBody';
import ModalFooter from './atoms/ModalFooter';
import Button from './atoms/Button';
import { Text } from './atoms/Typography';

/**
 * ConfirmationModal Component
 * Standardized using Atom components.
 */
function ConfirmationModal({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', cancelText = 'Cancel' }) {
    const handleConfirm = () => {
        onConfirm();
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            size="sm"
            showCloseButton={false}
        >
            <ModalBody>
                <Text style={{ color: 'var(--color-text-secondary)' }}>
                    {message}
                </Text>
            </ModalBody>

            <ModalFooter>
                <Button variant="secondary" onClick={onClose}>
                    {cancelText}
                </Button>
                <Button variant="danger" onClick={handleConfirm}>
                    {confirmText}
                </Button>
            </ModalFooter>
        </Modal>
    );
}

export default ConfirmationModal;
