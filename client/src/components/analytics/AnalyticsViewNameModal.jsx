import React, { useState } from 'react';

import CloseButton from '../atoms/CloseButton';
import ModalBackdrop from '../atoms/ModalBackdrop';
import styles from './AnalyticsViewsModal.module.css';

function AnalyticsViewNameModal({
    initialName = '',
    kind = 'view',
    onConfirm,
    onClose,
}) {
    const [name, setName] = useState(initialName);
    const label = kind === 'dashboard' ? 'Analytics Dashboard' : 'Analytics View';

    return (
        <ModalBackdrop className={styles.overlay} onClose={onClose}>
            <div className={styles.namingSheet} onClick={(event) => event.stopPropagation()}>
                <div className={styles.header}>
                    <h3 className={styles.title}>Save {label}</h3>
                    <CloseButton
                        className={styles.closeButton}
                        onClick={onClose}
                        aria-label={`Close save ${label.toLowerCase()}`}
                        size={16}
                    />
                </div>
                <form
                    className={styles.namingBody}
                    onSubmit={(event) => {
                        event.preventDefault();
                        onConfirm?.(name.trim());
                    }}
                >
                    <label className={styles.fieldLabel}>
                        {kind === 'dashboard' ? 'Dashboard name' : 'View name'}
                        <input
                            type="text"
                            className={styles.nameInput}
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Enter a name"
                            autoFocus
                        />
                    </label>
                    <div className={styles.namingActions}>
                        <button type="button" className={styles.secondaryButton} onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className={styles.primaryButton} disabled={!name.trim()}>
                            Save {kind === 'dashboard' ? 'Dashboard' : 'View'}
                        </button>
                    </div>
                </form>
            </div>
        </ModalBackdrop>
    );
}

export default AnalyticsViewNameModal;
