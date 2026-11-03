import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import Badge from '../atoms/Badge';
import Button from '../atoms/Button';
import Modal from '../atoms/Modal';
import DeleteConfirmModal from '../modals/DeleteConfirmModal';
import { useAnalyticsViews } from '../../hooks/useDashboardQueries';
import { ChartIcon, VisualizationIcon } from './AnalyticsIcons';
import SavedAnalyticsPreview from './SavedAnalyticsPreview';
import { getVisualization, VISUALIZATION_CATEGORIES } from './visualizations/registry';
import styles from './AnalyticsViewsModal.module.css';

/** The delete warning: a view on goals names them, since deleting removes it from each. */
export function deleteViewMessage(view, goals = []) {
    const base = `Are you sure you want to delete "${view?.name}"?`;
    if (!goals.length) return base;
    const names = goals.map((goal) => goal.goal_name || goal.name);
    const listed = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ');
    return `${base} It's shown on ${goals.length} ${goals.length === 1 ? 'goal' : 'goals'} (${listed}), which will stop showing it.`;
}

const FILTERS = [
    { id: 'all', label: 'All', matches: () => true },
    { id: 'views', label: 'Views', matches: (item) => item.kind === 'view' },
    { id: 'dashboards', label: 'Dashboards', matches: (item) => item.kind !== 'view' },
    { id: 'goals', label: 'On goals', matches: (item) => (item.goals || []).length > 0 },
    { id: 'pinned', label: 'Pinned', matches: (item) => Boolean(item.pinned) },
];

/** "Activities · Metric Trends", or "Dashboard". */
export function chartLabel(item) {
    if (item.kind !== 'view') return 'Dashboard';
    const { category, id } = item.visualization || {};
    const categoryName = VISUALIZATION_CATEGORIES.find((entry) => entry.id === category)?.name;
    const chartName = getVisualization(category, id)?.name;
    return categoryName && chartName ? `${categoryName} · ${chartName}` : 'View';
}

/** "Opened today", "Opened 3 days ago", else "Updated Mar 5, 2026". */
export function whenLabel(item, now = new Date()) {
    if (item.last_opened_at) {
        const days = Math.floor((now - new Date(item.last_opened_at)) / 86400000);
        if (days <= 0) return 'Opened today';
        if (days === 1) return 'Opened yesterday';
        if (days < 30) return `Opened ${days} days ago`;
    }
    const updated = new Date(item.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `Updated ${updated}`;
}

/**
 * Saved Analytics: search (names, chart types and the goals views show on), filter, and pick a
 * view or dashboard to preview with its goals and actions. Double-click or Enter opens one.
 */
function AnalyticsViewsModal({ views = [], selectedViewId = '', onSelectView, onDeleteView, onClose }) {
    const { rootId } = useParams();
    const { updateAnalyticsView, duplicateAnalyticsView, pinAnalyticsView, markAnalyticsViewOpened } = useAnalyticsViews(rootId);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterId, setFilterId] = useState('all');
    const [previewId, setPreviewId] = useState(selectedViewId || views[0]?.id || null);
    const [viewToDelete, setViewToDelete] = useState(null);

    const search = searchQuery.trim().toLowerCase();
    const filtered = useMemo(() => {
        const filter = FILTERS.find((entry) => entry.id === filterId) || FILTERS[0];
        return views.filter((item) => filter.matches(item) && (!search || [
            item.name, chartLabel(item), ...(item.goals || []).map((goal) => goal.name),
        ].some((value) => String(value || '').toLowerCase().includes(search))));
    }, [filterId, search, views]);
    const preview = filtered.find((item) => item.id === previewId) || filtered[0] || null;

    const open = (item) => {
        markAnalyticsViewOpened(item.id);
        onSelectView?.(item.id);
        onClose?.();
    };

    return (
        <>
            <Modal isOpen onClose={onClose} title="Saved Analytics" size="xl" className={styles.sheetWide} bodyClassName={styles.savedBody}>
                <div className={styles.headerActions}>
                    <Button size="sm" variant="secondary" onClick={() => { onSelectView?.(''); onClose?.(); }}>+ New view</Button>
                </div>

                <div className={styles.browse}>
                    <div className={styles.listPane}>
                        <label className={styles.searchWrap}>
                            <span className={styles.searchLabel}>Search views</span>
                            <input
                                type="search"
                                className={styles.searchInput}
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Name, chart or goal"
                                autoFocus
                            />
                        </label>
                        <div className="sessions-query-chip-group" role="group" aria-label="Show">
                            {FILTERS.map((filter) => (
                                <button
                                    key={filter.id}
                                    type="button"
                                    className={`sessions-query-chip ${filterId === filter.id ? 'active' : ''}`}
                                    aria-pressed={filterId === filter.id}
                                    onClick={() => setFilterId(filter.id)}
                                >
                                    {filter.label}
                                </button>
                            ))}
                        </div>

                        {filtered.length ? (
                            <ul className={styles.cardList} aria-label="Saved analytics">
                                {filtered.map((item) => {
                                    const goals = item.goals || [];
                                    const isPreview = preview?.id === item.id;
                                    return (
                                        <li key={item.id}>
                                            <button
                                                type="button"
                                                className={`${styles.viewRow} ${styles.card} ${isPreview ? styles.selected : ''}`}
                                                aria-current={selectedViewId === item.id ? 'true' : undefined}
                                                aria-pressed={isPreview}
                                                onClick={() => setPreviewId(item.id)}
                                                onDoubleClick={() => open(item)}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter') {
                                                        event.preventDefault();
                                                        open(item);
                                                    }
                                                }}
                                            >
                                                <span className={styles.cardIcon} aria-hidden="true">
                                                    {item.kind === 'view' && item.visualization
                                                        ? <VisualizationIcon type={`${item.visualization.category}:${item.visualization.id}`} size={18} />
                                                        : <ChartIcon size={18} />}
                                                </span>
                                                <span className={styles.cardBody}>
                                                    <span className={styles.viewName}>
                                                        {item.pinned ? <span aria-label="Pinned">★ </span> : null}
                                                        {item.name}
                                                    </span>
                                                    <span className={styles.viewMeta}>{chartLabel(item)} · {whenLabel(item)}</span>
                                                    {goals.length ? (
                                                        <span className={styles.cardGoals}>
                                                            {goals.slice(0, 2).map((goal) => <Badge key={goal.id} size="sm">{goal.name}</Badge>)}
                                                            {goals.length > 2 ? <Badge size="sm">+{goals.length - 2}</Badge> : null}
                                                        </span>
                                                    ) : null}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <div className={styles.emptyState}>
                                {views.length > 0 ? 'Nothing saved matches.' : 'No saved analytics yet. Build a chart and press Save.'}
                            </div>
                        )}
                    </div>

                    {preview ? (
                        <SavedAnalyticsPreview
                            key={preview.id}
                            rootId={rootId}
                            item={preview}
                            chartLabel={chartLabel(preview)}
                            onOpen={() => open(preview)}
                            onRename={(name) => updateAnalyticsView({ dashboardId: preview.id, name })}
                            onDuplicate={async () => {
                                const copy = await duplicateAnalyticsView(preview.id);
                                if (copy) {
                                    setSearchQuery('');
                                    setFilterId('all');
                                    setPreviewId(copy.id);
                                }
                            }}
                            onTogglePin={() => pinAnalyticsView(preview.id, !preview.pinned)}
                            onDelete={() => setViewToDelete(preview)}
                        />
                    ) : null}
                </div>
            </Modal>

            <DeleteConfirmModal
                isOpen={!!viewToDelete}
                onClose={() => setViewToDelete(null)}
                onConfirm={() => {
                    onDeleteView?.(viewToDelete.id);
                    setViewToDelete(null);
                }}
                title={`Delete ${viewToDelete?.kind === 'dashboard' ? 'Analytics Dashboard' : 'Analytics View'}`}
                message={deleteViewMessage(viewToDelete, viewToDelete?.goals || [])}
                modalLayer="top"
            />
        </>
    );
}

export default AnalyticsViewsModal;
