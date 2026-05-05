import React, { useState } from 'react';

import CloseIcon from '../atoms/CloseIcon';
import DeleteConfirmModal from '../modals/DeleteConfirmModal';
import styles from './AnalyticsViewsModal.module.css';

function AnalyticsViewsModal({
    views = [],
    selectedViewId = '',
    onSelectView,
    onDeleteView,
    onClose,
}) {
    const [viewToDelete, setViewToDelete] = useState(null);

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.sheet} onClick={(event) => event.stopPropagation()}>
                <div className={styles.header}>
                    <h3 className={styles.title}>Analytics Views</h3>
                    <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close analytics views">
                        <CloseIcon size={16} />
                    </button>
                </div>

                <div className={styles.body}>
                    <button
                        type="button"
                        className={`${styles.viewRow} ${!selectedViewId ? styles.selected : ''}`}
                        onClick={() => {
                            onSelectView?.('');
                            onClose?.();
                        }}
                    >
                        <div>
                            <div className={styles.viewName}>Empty View</div>
                            <div className={styles.viewMeta}>Starts with one empty analytics panel</div>
                        </div>
                    </button>

                    {views.length > 0 ? (
                        views.map((view) => (
                            <div
                                key={view.id}
                                className={`${styles.viewRow} ${selectedViewId === view.id ? styles.selected : ''}`}
                            >
                                <button
                                    type="button"
                                    className={styles.viewSelectButton}
                                    onClick={() => {
                                        onSelectView?.(view.id);
                                        onClose?.();
                                    }}
                                >
                                    <div className={styles.viewName}>{view.name}</div>
                                    <div className={styles.viewMeta}>
                                        Updated {new Date(view.updated_at).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                        })}
                                    </div>
                                </button>
                                <button
                                    type="button"
                                    className={styles.deleteButton}
                                    onClick={() => setViewToDelete(view)}
                                    title={`Delete ${view.name}`}
                                >
                                    Delete
                                </button>
                            </div>
                        ))
                    ) : (
                        <div className={styles.emptyState}>No saved analytics views yet.</div>
                    )}
                </div>
            </div>

            <DeleteConfirmModal
                isOpen={!!viewToDelete}
                onClose={() => setViewToDelete(null)}
                onConfirm={() => {
                    onDeleteView?.(viewToDelete.id);
                    setViewToDelete(null);
                }}
                title="Delete Analytics View"
                message={`Are you sure you want to delete "${viewToDelete?.name}"?`}
            />
        </div>
    );
}

export default AnalyticsViewsModal;
