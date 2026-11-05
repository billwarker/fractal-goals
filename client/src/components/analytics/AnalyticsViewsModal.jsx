import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import Button from '../atoms/Button';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import DeleteConfirmModal from '../modals/DeleteConfirmModal';
import { useAnalyticsViews } from '../../hooks/useDashboardQueries';
import useIsMobile from '../../hooks/useIsMobile';
import { ChartIcon, VisualizationIcon } from './AnalyticsIcons';
import SavedAnalyticsPreview from './SavedAnalyticsPreview';
import { getVisualization, VISUALIZATION_CATEGORIES } from './visualizations/registry';
import styles from './SavedAnalyticsModal.module.css';

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

const shortDate = (value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** "Opened today", "Opened yesterday", "Opened 3 days ago", "Opened Mar 5, 2026", or "Never opened". */
export function openedLabel(item, now = new Date()) {
    if (!item.last_opened_at) return 'Never opened';
    const days = Math.floor((now - new Date(item.last_opened_at)) / 86400000);
    if (days <= 0) return 'Opened today';
    if (days === 1) return 'Opened yesterday';
    if (days < 30) return `Opened ${days} days ago`;
    return `Opened ${shortDate(item.last_opened_at)}`;
}

/** "Updated Mar 5, 2026 · Opened 3 days ago · 12 opens" (opens from before they were counted aren't shown). */
export function usageLabel(item, now = new Date()) {
    const count = Number(item.open_count) || 0;
    return [
        `Updated ${shortDate(item.updated_at)}`,
        openedLabel(item, now),
        count ? `${count} ${count === 1 ? 'open' : 'opens'}` : null,
    ].filter(Boolean).join(' · ');
}

/** "3 saved · 2 views · 1 dashboard" */
function countLabel(views) {
    const dashboards = views.filter((item) => item.kind !== 'view').length;
    const viewCount = views.length - dashboards;
    const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
    return `${views.length} saved · ${plural(viewCount, 'view')} · ${plural(dashboards, 'dashboard')}`;
}

/**
 * Saved Analytics: search (names, chart types and the goals views show on), filter, and pick a
 * view or dashboard to preview with its goals and actions. Each row's Open button, a double-click
 * or Enter opens one.
 * On a phone the list and the preview take turns: picking a row shows its preview, Back returns.
 */
function AnalyticsViewsModal({ views = [], selectedViewId = '', onSelectView, onDeleteView, onClose }) {
    const { rootId } = useParams();
    const isMobile = useIsMobile();
    const { updateAnalyticsView, duplicateAnalyticsView, pinAnalyticsView, markAnalyticsViewOpened } = useAnalyticsViews(rootId);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterId, setFilterId] = useState('all');
    const [previewId, setPreviewId] = useState(selectedViewId || views[0]?.id || null);
    const [showingPreview, setShowingPreview] = useState(false);
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
            <Modal isOpen onClose={onClose} title="Saved Analytics" size="xl" className={styles.sheet}>
                <ModalBody className={styles.body}>
                    <div className={`${styles.layout} ${showingPreview && preview ? styles.showingPreview : ''}`}>
                        <section className={styles.catalog} aria-label="Saved analytics catalog">
                            <div className={styles.summary}>
                                <div>
                                    <strong>{countLabel(views)}</strong>
                                    <span>Open one to keep working, or show a view on the goals it tracks.</span>
                                </div>
                                <Button size="sm" onClick={() => { onSelectView?.(''); onClose?.(); }}>New view</Button>
                            </div>

                            <div className={styles.filters}>
                                <input
                                    type="search"
                                    aria-label="Search saved analytics"
                                    placeholder="Search names, charts or goals"
                                    value={searchQuery}
                                    onChange={(event) => setSearchQuery(event.target.value)}
                                    autoFocus={!isMobile}
                                />
                                <div className={styles.segments} role="group" aria-label="Show">
                                    {FILTERS.map((filter) => (
                                        <button
                                            key={filter.id}
                                            type="button"
                                            className={filterId === filter.id ? styles.segmentActive : ''}
                                            aria-pressed={filterId === filter.id}
                                            onClick={() => setFilterId(filter.id)}
                                        >
                                            {filter.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {filtered.length ? (
                                <ul className={styles.list} aria-label="Saved analytics">
                                    {filtered.map((item) => {
                                        const isPreview = preview?.id === item.id;
                                        return (
                                            <li key={item.id} className={`${styles.row} ${isPreview ? styles.selected : ''}`}>
                                                <button
                                                    type="button"
                                                    className={styles.rowSelect}
                                                    aria-current={selectedViewId === item.id ? 'true' : undefined}
                                                    aria-pressed={isPreview}
                                                    onClick={() => { setPreviewId(item.id); setShowingPreview(true); }}
                                                    onDoubleClick={() => open(item)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter') {
                                                            event.preventDefault();
                                                            open(item);
                                                        }
                                                    }}
                                                >
                                                    <span className={styles.rowIcon} aria-hidden="true">
                                                        {item.kind === 'view' && item.visualization
                                                            ? <VisualizationIcon type={`${item.visualization.category}:${item.visualization.id}`} size={16} />
                                                            : <ChartIcon size={16} />}
                                                    </span>
                                                    <span className={styles.identity}>
                                                        <strong>{item.name}</strong>
                                                        <span className={styles.rowChart}>{chartLabel(item)}</span>
                                                        <span>{usageLabel(item)}</span>
                                                    </span>
                                                    {item.pinned ? <span className={styles.pinned} aria-label="Pinned">★</span> : null}
                                                </button>
                                                <Button size="sm" variant="secondary" className={styles.rowOpen} aria-label={`Open ${item.name}`} onClick={() => open(item)}>
                                                    Open
                                                </Button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : (
                                <p className={styles.empty}>
                                    {views.length > 0 ? 'Nothing saved matches.' : 'No saved analytics yet. Build a chart and press Save.'}
                                </p>
                            )}
                        </section>

                        {preview ? (
                            <SavedAnalyticsPreview
                                key={preview.id}
                                rootId={rootId}
                                item={preview}
                                chartLabel={chartLabel(preview)}
                                onBack={() => setShowingPreview(false)}
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
                </ModalBody>
            </Modal>

            <DeleteConfirmModal
                isOpen={!!viewToDelete}
                onClose={() => setViewToDelete(null)}
                onConfirm={() => {
                    onDeleteView?.(viewToDelete.id);
                    setViewToDelete(null);
                    setShowingPreview(false);
                }}
                title={`Delete ${viewToDelete?.kind === 'dashboard' ? 'Analytics Dashboard' : 'Analytics View'}`}
                message={deleteViewMessage(viewToDelete, viewToDelete?.goals || [])}
                modalLayer="top"
            />
        </>
    );
}

export default AnalyticsViewsModal;
