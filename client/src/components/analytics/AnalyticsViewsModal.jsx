import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import CloseButton from '../atoms/CloseButton';
import ModalBackdrop from '../atoms/ModalBackdrop';
import DeleteConfirmModal from '../modals/DeleteConfirmModal';
import { useViewGoals } from '../../hooks/useGoalCharts';
import styles from './AnalyticsViewsModal.module.css';

/** The delete warning: a view on goals names them, since deleting removes it from each. */
export function deleteViewMessage(view, goals = []) {
    const base = `Are you sure you want to delete "${view?.name}"?`;
    if (!goals.length) return base;
    const names = goals.map((goal) => goal.goal_name);
    const listed = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ');
    return `${base} It's shown on ${goals.length} ${goals.length === 1 ? 'goal' : 'goals'} (${listed}), which will stop showing it.`;
}

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
    const { rootId } = useParams();
    const deletingView = viewToDelete?.kind === 'view' ? viewToDelete : null;
    const viewGoals = useViewGoals(rootId, deletingView?.id, { enabled: Boolean(deletingView) });
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
    const analyticsViewItems = filteredViews.filter((view) => (view.kind || 'dashboard') === 'view');
    const analyticsDashboardItems = filteredViews.filter((view) => (view.kind || 'dashboard') === 'dashboard');

    const renderRows = (items, noun) => (
        items.map((view) => {
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
                            {noun} · Updated {updatedDate}
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
    );

    return (
        <ModalBackdrop className={styles.overlay} onClose={onClose}>
            <div className={styles.sheet} onClick={(event) => event.stopPropagation()}>
                <div className={styles.header}>
                    <h3 className={styles.title}>Saved Analytics</h3>
                    <CloseButton
                        className={styles.closeButton}
                        onClick={onClose}
                        aria-label="Close analytics views"
                        size={16}
                    />
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
                        <>
                            {analyticsViewItems.length > 0 && (
                                <>
                                    <div className={styles.sectionLabel}>Analytics Views</div>
                                    {renderRows(analyticsViewItems, 'View')}
                                </>
                            )}
                            {analyticsDashboardItems.length > 0 && (
                                <>
                                    <div className={styles.sectionLabel}>Analytics Dashboards</div>
                                    {renderRows(analyticsDashboardItems, 'Dashboard')}
                                </>
                            )}
                        </>
                    ) : (
                        <div className={styles.emptyState}>
                            {views.length > 0 ? 'No saved analytics items match your search.' : 'No saved analytics yet.'}
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
                title={`Delete ${viewToDelete?.kind === 'dashboard' ? 'Analytics Dashboard' : 'Analytics View'}`}
                message={deleteViewMessage(viewToDelete, viewGoals.data?.goals)}
                modalLayer="top"
            />
        </ModalBackdrop>
    );
}

export default AnalyticsViewsModal;
