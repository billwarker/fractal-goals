import React from 'react';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import Button from '../atoms/Button';

const AlertModal = ({ isOpen, onClose, title, message }) => {
    if (!isOpen) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title || "Alert"}
            size="sm"
        >
            <ModalBody>
                <div style={{ color: 'var(--color-text-secondary)', lineHeight: '1.5', fontSize: '15px' }}>
                    {message}
                </div>
            </ModalBody>
            <ModalFooter>
                <Button variant="primary" onClick={onClose}>
                    OK
                </Button>
            </ModalFooter>
        </Modal>
    );
};

export default AlertModal;
