import React, { Suspense, lazy, useState } from 'react';
import { Link } from 'react-router-dom';

import Button from '../atoms/Button';
import { goalDeepLink } from '../../utils/goalDeepLink';
import { MAX_CHARTS_PER_GOAL, viewAttachProblem } from '../../hooks/useGoalCharts';
import SavedViewChart from './SavedViewChart';
import styles from './AnalyticsViewsModal.module.css';

const AddViewToGoalsModal = lazy(() => import('./AddViewToGoalsModal'));

/**
 * The selected saved view or dashboard: a live compact preview (views only, one chart rendered at a
 * time), the goals it shows on, and its actions.
 */
export default function SavedAnalyticsPreview({ rootId, item, chartLabel, onOpen, onRename, onDuplicate, onTogglePin, onDelete }) {
    const [renaming, setRenaming] = useState(false);
    const [name, setName] = useState(item.name);
    const [attaching, setAttaching] = useState(false);
    const [pending, setPending] = useState(false);
    const isView = item.kind === 'view';
    const attachProblem = isView ? viewAttachProblem(item) : 'Only single-chart views can show on goals';
    const goals = item.goals || [];

    // Mutation hooks report errors; keep the user's draft and absorb the rejected request here.
    const run = async (action) => {
        if (pending) return;
        setPending(true);
        try { await action(); } catch { /* The mutation hook shows the server error. */ }
        finally { setPending(false); }
    };
    const submitRename = (event) => {
        event.preventDefault();
        const next = name.trim();
        if (!next) return;
        return run(async () => {
            if (next !== item.name) await onRename(next);
            setRenaming(false);
        });
    };

    return (
        <section className={styles.preview} aria-label={`${item.name} preview`}>
            {renaming ? (
                <form className={styles.renameForm} onSubmit={submitRename}>
                    <input
                        className={styles.searchInput}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        aria-label="Name"
                        autoFocus
                        maxLength={255}
                    />
                    <Button size="sm" type="submit" disabled={pending || !name.trim()}>Save</Button>
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => { setRenaming(false); setName(item.name); }}>Cancel</Button>
                </form>
            ) : (
                <h4 className={styles.previewTitle}>{item.name}</h4>
            )}
            <p className={styles.viewMeta}>{chartLabel}</p>

            <div className={styles.previewChart}>
                {isView ? <SavedViewChart rootId={rootId} layout={item.layout} density="compact" /> : (
                    <p className={styles.viewMeta}>Dashboards open with all their panels; there’s no preview.</p>
                )}
            </div>

            <div className={styles.previewGoals}>
                <span className={styles.sectionLabel}>{goals.length ? `On ${goals.length} ${goals.length === 1 ? 'goal' : 'goals'}` : 'Not on any goal'}</span>
                {goals.length ? (
                    <ul>
                        {goals.map((goal) => <li key={goal.id}><Link to={goalDeepLink(rootId, goal.id)}>{goal.name}</Link></li>)}
                    </ul>
                ) : null}
            </div>

            <fieldset className={styles.previewActions} disabled={pending} aria-busy={pending}>
                <Button size="sm" onClick={onOpen}>Open</Button>
                <Button
                    size="sm"
                    variant="secondary"
                    disabled={Boolean(attachProblem)}
                    title={attachProblem || `Show this view on goals (up to ${MAX_CHARTS_PER_GOAL} charts a goal)`}
                    onClick={() => setAttaching(true)}
                >
                    Show on goals…
                </Button>
                <Button size="sm" variant="secondary" onClick={() => { setName(item.name); setRenaming(true); }}>Rename</Button>
                <Button size="sm" variant="secondary" onClick={() => run(onDuplicate)}>Duplicate</Button>
                <Button size="sm" variant="secondary" aria-pressed={Boolean(item.pinned)} onClick={() => run(onTogglePin)}>
                    {item.pinned ? 'Unpin' : 'Pin'}
                </Button>
                <Button size="sm" variant="danger" onClick={onDelete}>Delete</Button>
            </fieldset>

            {attaching ? (
                <Suspense fallback={null}>
                    <AddViewToGoalsModal rootId={rootId} view={item} isOpen onClose={() => setAttaching(false)} />
                </Suspense>
            ) : null}
        </section>
    );
}
