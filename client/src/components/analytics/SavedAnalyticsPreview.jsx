import React, { Suspense, lazy, useState } from 'react';
import { Link } from 'react-router-dom';

import Button from '../atoms/Button';
import GoalIcon from '../atoms/GoalIcon';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { goalDeepLink } from '../../utils/goalDeepLink';
import { MAX_CHARTS_PER_GOAL, viewAttachProblem } from '../../hooks/useGoalCharts';
import SavedViewChart from './SavedViewChart';
import styles from './SavedAnalyticsModal.module.css';

const AddViewToGoalsModal = lazy(() => import('./AddViewToGoalsModal'));

/**
 * The selected saved view or dashboard: a live compact preview (views only, one chart rendered at a
 * time), the goals it shows on, and its actions. Back (phones only) returns to the list.
 */
export default function SavedAnalyticsPreview({ rootId, item, chartLabel, onBack, onOpen, onRename, onDuplicate, onTogglePin, onDelete }) {
    const [renaming, setRenaming] = useState(false);
    const [name, setName] = useState(item.name);
    const [attaching, setAttaching] = useState(false);
    const [pending, setPending] = useState(false);
    const isView = item.kind === 'view';
    const attachProblem = isView ? viewAttachProblem(item) : 'Only single-chart views can show on goals';
    const goals = item.goals || [];
    const { getGoalIcon, getGoalColor, getGoalSecondaryColor } = useGoalLevels();

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
        <section className={styles.detail} aria-label={`${item.name} preview`}>
            <button type="button" className={styles.back} onClick={onBack}>← All saved</button>
            {renaming ? (
                <form className={styles.renameForm} onSubmit={submitRename}>
                    <input
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
                <div className={styles.detailHeader}>
                    <div>
                        <strong>{item.name}</strong>
                        <span>{chartLabel}{item.pinned ? ' · Pinned' : ''}</span>
                    </div>
                    <div className={styles.headerActions}>
                        <Button
                            size="sm"
                            variant="secondary"
                            disabled={Boolean(attachProblem) || pending}
                            title={attachProblem || `Choose the goals this view shows on (up to ${MAX_CHARTS_PER_GOAL} charts a goal)`}
                            onClick={() => setAttaching(true)}
                        >
                            Edit goal associations
                        </Button>
                        <Button size="sm" onClick={onOpen}>Open</Button>
                    </div>
                </div>
            )}

            <div className={styles.chart}>
                {isView ? <SavedViewChart rootId={rootId} layout={item.layout} density="compact" /> : (
                    <p className={styles.empty}>Dashboards open with all their panels, so there’s no preview.</p>
                )}
            </div>

            <div className={styles.goals}>
                <h4>{goals.length ? `On ${goals.length} ${goals.length === 1 ? 'goal' : 'goals'}` : 'Not on any goal'}</h4>
                {goals.length ? (
                    <ul>
                        {goals.map((goal) => (
                            <li key={goal.id}>
                                <Link to={goalDeepLink(rootId, goal.id)}>
                                    <GoalIcon
                                        shape={getGoalIcon(goal)}
                                        color={getGoalColor(goal)}
                                        secondaryColor={getGoalSecondaryColor(goal)}
                                        size={16}
                                    />
                                    {goal.name}
                                </Link>
                            </li>
                        ))}
                    </ul>
                ) : null}
            </div>

            <fieldset className={styles.actions} disabled={pending} aria-busy={pending}>
                <button type="button" onClick={() => { setName(item.name); setRenaming(true); }}>Rename</button>
                <button type="button" onClick={() => run(onDuplicate)}>Duplicate</button>
                <button type="button" aria-pressed={Boolean(item.pinned)} onClick={() => run(onTogglePin)}>
                    {item.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button type="button" className={styles.danger} onClick={onDelete}>Delete</button>
            </fieldset>

            {attaching ? (
                <Suspense fallback={null}>
                    <AddViewToGoalsModal rootId={rootId} view={item} isOpen onClose={() => setAttaching(false)} />
                </Suspense>
            ) : null}
        </section>
    );
}
