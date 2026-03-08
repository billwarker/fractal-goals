import React, { useState } from 'react';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import Button from '../atoms/Button';
import Input from '../atoms/Input';
import { Text } from '../atoms/Typography';

const DeleteConfirmModal = ({ isOpen, onClose, onConfirm, title, message, requireMatchingText, confirmText = 'Delete' }) => {
    const [matchingText, setMatchingText] = useState('');
    const handleClose = () => {
        setMatchingText('');
        onClose();
    };
    const handleConfirm = () => {
        setMatchingText('');
        onConfirm();
    };

    const isConfirmDisabled = requireMatchingText && matchingText !== requireMatchingText;

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={title || "Confirm Delete"}
            size="sm"
            showCloseButton={true}
        >
            <ModalBody>
                <div style={{ marginBottom: '15px' }}>
                    <Text className="mb-4" style={{ color: 'var(--color-text-secondary)', marginBottom: '15px' }}>
                        {message ? message : "Are you sure you want to delete this item?"}
                    </Text>

                    {requireMatchingText && (
                        <div style={{ marginTop: '20px' }}>
                            <Text size="xs" weight="bold" style={{ color: 'var(--color-brand-danger)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
                                Type "{requireMatchingText}" to confirm
                            </Text>
                            <Input
                                type="text"
                                value={matchingText}
                                onChange={(e) => setMatchingText(e.target.value)}
                                placeholder={`Type "${requireMatchingText}"`}
                                autoFocus
                            />
                        </div>
                    )}

                    <div style={{
                        color: 'var(--color-brand-danger)',
                        fontSize: '12px',
                        marginTop: '15px',
                        background: 'rgba(255, 82, 82, 0.1)',
                        padding: '8px',
                        borderRadius: '4px',
                        textAlign: 'center',
                        border: '1px solid rgba(255, 82, 82, 0.2)'
                    }}>
                        ⚠️ This action cannot be undone.
                    </div>
                </div>
            </ModalBody>

            <ModalFooter>
                <Button variant="secondary" onClick={handleClose}>
                    Cancel
                </Button>
                <Button variant="danger" onClick={handleConfirm} disabled={isConfirmDisabled}>
                    {confirmText}
                </Button>
            </ModalFooter>
        </Modal>
    );
};

export default DeleteConfirmModal;
