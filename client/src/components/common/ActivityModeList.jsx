import React from 'react';
import PropTypes from 'prop-types';

import styles from './ActivityModeList.module.css';

function ActivityModeList({
    activityModes = [],
    isLoading = false,
    emptyMessage = 'No modes created yet.',
    selectedModeIds = [],
    onToggle = null,
    renderActions = null,
}) {
    const selectedIds = Array.isArray(selectedModeIds) ? selectedModeIds : [];

    if (isLoading) {
        return <div className={styles.emptyState}>Loading modes...</div>;
    }

    if (!activityModes.length) {
        return <div className={styles.emptyState}>{emptyMessage}</div>;
    }

    return (
        <div className={styles.list}>
            {activityModes.map((mode) => {
                const isSelected = selectedIds.includes(mode.id);
                const actionContent = typeof renderActions === 'function' ? renderActions(mode) : null;

                return (
                    <div key={mode.id} className={styles.modeRow}>
                        <div className={styles.modeIdentity}>
                            {onToggle ? (
                                <label className={styles.checkboxLabel}>
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => onToggle(mode.id)}
                                        className={styles.checkbox}
                                    />
                                    <span
                                        className={styles.swatch}
                                        style={{ backgroundColor: mode.color || 'var(--color-bg-muted)' }}
                                    />
                                    <span className={styles.checkboxText}>
                                        <span className={styles.modeName}>{mode.name}</span>
                                        {mode.description ? (
                                            <span className={styles.modeDescription}>{mode.description}</span>
                                        ) : null}
                                    </span>
                                </label>
                            ) : (
                                <>
                                    <span
                                        className={styles.swatch}
                                        style={{ backgroundColor: mode.color || 'var(--color-bg-muted)' }}
                                    />
                                    <div>
                                        <div className={styles.modeName}>{mode.name}</div>
                                        {mode.description ? (
                                            <div className={styles.modeDescription}>{mode.description}</div>
                                        ) : null}
                                    </div>
                                </>
                            )}
                        </div>

                        {actionContent ? (
                            <div className={styles.modeActions}>
                                {actionContent}
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}

ActivityModeList.propTypes = {
    activityModes: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        name: PropTypes.string,
        description: PropTypes.string,
        color: PropTypes.string,
    })),
    isLoading: PropTypes.bool,
    emptyMessage: PropTypes.string,
    selectedModeIds: PropTypes.arrayOf(PropTypes.string),
    onToggle: PropTypes.func,
    renderActions: PropTypes.func,
};

export default ActivityModeList;
