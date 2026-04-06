import React, { useState } from 'react';

import styles from './AnalyticsViewsModal.module.css';

function AnalyticsViewNameModal({
    initialName = '',
    onConfirm,
    onClose,
}) {
    const [name, setName] = useState(initialName);

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.namingSheet} onClick={(event) => event.stopPropagation()}>
                <div className={styles.header}>
                    <h3 className={styles.title}>Save Analytics View</h3>
                    <button type="button" className={styles.closeButton} onClick={onClose}>
                        ×
                    </button>
                </div>
                <form
                    className={styles.namingBody}
                    onSubmit={(event) => {
                        event.preventDefault();
                        onConfirm?.(name.trim());
                    }}
                >
                    <label className={styles.fieldLabel}>
                        View name
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
                            Save View
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default AnalyticsViewNameModal;
