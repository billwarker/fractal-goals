
import React from 'react';
import Modal from './atoms/Modal';
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
            <Text className="mb-6" style={{ marginBottom: '24px', color: '#ccc' }}>
                {message}
            </Text>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <Button
                    variant="secondary"
                    onClick={onClose}
                >
                    {cancelText}
                </Button>
                <Button
                    variant="danger"
                    onClick={handleConfirm}
                >
                    {confirmText}
                </Button>
            </div>
        </Modal>
    );
}

export default ConfirmationModal;
