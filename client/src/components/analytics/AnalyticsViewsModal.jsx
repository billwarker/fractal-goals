import React, { useMemo, useState } from 'react';

import CloseIcon from '../atoms/CloseIcon';
import DeleteConfirmModal from '../modals/DeleteConfirmModal';
import styles from './AnalyticsViewsModal.module.css';

const formatUpdatedDate = (value) => new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
});

function AnalyticsViewsModal({
    views = [],
    selectedViewId = '',
    onSelectView,
    onDeleteView,
    onClose,
}) {
    const [viewToDelete, setViewToDelete] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const filteredViews = useMemo(() => {
        if (!normalizedSearch) return views;
        return views.filter((view) => {
            const updatedDate = formatUpdatedDate(view.updated_at);
            return [
                view.name,
                updatedDate,
                `updated ${updatedDate}`,
            ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
        });
    }, [normalizedSearch, views]);

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
                    <label className={styles.searchWrap}>
                        <span className={styles.searchLabel}>Search views</span>
                        <input
                            type="search"
                            className={styles.searchInput}
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="Search analytics views"
                            autoFocus
                        />
                    </label>

                    <button
                        type="button"
                        className={`${styles.viewRow} ${!selectedViewId ? styles.selected : ''}`}
                        onClick={() => {
                            onSelectView?.('');
                            onClose?.();
                        }}
                    >
                        <div>
                            <div className={styles.viewName}>Empty Analytics View</div>
                            <div className={styles.viewMeta}>Starts with one empty analytics panel</div>
                        </div>
                    </button>

                    {filteredViews.length > 0 ? (
                        filteredViews.map((view) => {
                            const updatedDate = formatUpdatedDate(view.updated_at);
                            return (
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
                                            Updated {updatedDate}
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
                            );
                        })
                    ) : (
                        <div className={styles.emptyState}>
                            {views.length > 0 ? 'No analytics views match your search.' : 'No saved analytics views yet.'}
                        </div>
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
