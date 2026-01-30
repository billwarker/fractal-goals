import React, { useState, useEffect } from 'react';
import Modal from '../atoms/Modal';
import Button from '../atoms/Button';
import Input from '../atoms/Input';
import { Text } from '../atoms/Typography';
import styles from './DeleteProgramModal.module.css';

const DeleteProgramModal = ({ isOpen, onClose, onConfirm, programName, sessionCount, requireMatchingText }) => {
    const [confirmText, setConfirmText] = useState('');

    useEffect(() => {
        if (isOpen) {
            setConfirmText('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const isConfirmDisabled = requireMatchingText && confirmText !== requireMatchingText;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Delete Program"
            size="sm"
        >
            <div className={styles.content}>
                <p className={styles.text}>
                    Are you sure you want to delete <strong>"{programName}"</strong>?
                </p>

                {sessionCount > 0 && (
                    <div className={styles.warningBox}>
                        <span className={styles.warningIcon}>⚠️</span>
                        <div>
                            <div className={styles.warningTitle}>Warning</div>
                            <div className={styles.warningText}>
                                <strong>{sessionCount}</strong> session{sessionCount !== 1 ? 's' : ''} will lose their association to this program.
                            </div>
                        </div>
                    </div>
                )}

                {requireMatchingText && (
                    <div className={styles.confirmationArea}>
                        <p className={styles.confirmationPrompt}>
                            Type <strong>{requireMatchingText}</strong> below to confirm.
                        </p>
                        <Input
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            placeholder={`Type "${requireMatchingText}"`}
                            autoFocus
                            fullWidth
                        />
                    </div>
                )}
            </div>

            <div className={styles.footer}>
                <Button variant="secondary" onClick={onClose}>
                    Cancel
                </Button>
                <Button
                    variant="danger"
                    onClick={onConfirm}
                    disabled={isConfirmDisabled}
                >
                    Delete Program
                </Button>
            </div>
        </Modal>
    );
};

export default DeleteProgramModal;
