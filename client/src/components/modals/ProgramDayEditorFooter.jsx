import React from 'react';
import ModalFooter from '../atoms/ModalFooter';
import Button from '../atoms/Button';
import styles from './ProgramDayModal.module.css';

export default function ProgramDayEditorFooter({ isEdit, onDelete, onClose, onSave, blockedReason, serverError }) {
    return (
        <ModalFooter className={styles.footer}>
            {isEdit ? <Button variant="danger" onClick={onDelete}>Delete Day</Button> : null}
            <div className={styles.rightActions}>
                {blockedReason ? (
                    <span id="program-day-save-blocked" className={styles.saveBlockedReason}>{blockedReason}</span>
                ) : serverError ? (
                    <span className={styles.saveBlockedReason} role="alert">{serverError}</span>
                ) : null}
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button variant="primary" onClick={onSave} disabled={Boolean(blockedReason)}
                    aria-describedby={blockedReason ? 'program-day-save-blocked' : undefined}>
                    {isEdit ? 'Save Changes' : 'Create Day'}
                </Button>
            </div>
        </ModalFooter>
    );
}
