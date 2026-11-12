import React, { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../utils/api';
import { getDemoHref } from '../../utils/marketingHost';
import LandingExampleOrderControls from './LandingExampleOrderControls';
import styles from '../../pages/Admin.module.css';

const formatTaken = (value) => new Date(value).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function SnapshotStatus({ snapshot }) {
    if (!snapshot) {
        return <p className={styles.demoSnapshotStatus}>Not published yet</p>;
    }
    const { counts = {} } = snapshot;
    return (
        <p className={styles.demoSnapshotStatus}>
            <span>
                Snapshot {formatTaken(snapshot.taken_at)} · {plural(counts.goals || 0, 'goal')} · {plural(counts.sessions || 0, 'session')}
            </span>
            {snapshot.source_changed && <span className={styles.demoSourceChanged}>Source changed since snapshot</span>}
            <a href={getDemoHref(snapshot.root_id)} target="_blank" rel="noreferrer">Open demo</a>
        </p>
    );
}

// One demo in the draft: its label, order, snapshot status and optional tour picks.
export default function DemoExampleRow({ example, index, total, name, onMove, onRemove, onChange }) {
    const [picksOpen, setPicksOpen] = useState(false);
    const picksId = useId();
    const optionsQuery = useQuery({
        queryKey: ['admin', 'landing-example-options', example.root_id],
        queryFn: async () => (await adminApi.getLandingExampleOptions(example.root_id)).data,
        enabled: picksOpen,
        staleTime: 60 * 1000,
    });
    const tour = example.tour || {};
    const setTour = (patch) => onChange(example.root_id, { tour: { ...tour, ...patch } });
    const options = optionsQuery.data;

    return (
        <div className={styles.landingExampleItem}>
            <LandingExampleOrderControls
                example={example}
                index={index}
                total={total}
                name={name}
                onMove={onMove}
                onRemove={onRemove}
                styles={styles}
            />
            <label>
                <span>Public label</span>
                <input value={example.label} onChange={(event) => onChange(example.root_id, { label: event.target.value })} />
            </label>
            <SnapshotStatus snapshot={example.snapshot} />
            <button
                type="button"
                className={styles.demoTourToggle}
                aria-expanded={picksOpen}
                aria-controls={picksId}
                onClick={() => setPicksOpen((open) => !open)}
            >
                {picksOpen ? '▾' : '▸'} Tour picks
                <span>{tour.session_id || tour.program_id ? 'Custom' : 'Auto'}</span>
            </button>
            {picksOpen && (
                <div className={styles.demoTourPicks} id={picksId}>
                    {optionsQuery.isError ? (
                        <p className={styles.status}>Couldn’t load this fractal’s sessions and programs.</p>
                    ) : (
                        <>
                            <label>
                                <span>Featured session</span>
                                <select
                                    value={tour.session_id || ''}
                                    disabled={optionsQuery.isLoading}
                                    onChange={(event) => setTour({ session_id: event.target.value || null })}
                                >
                                    <option value="">Auto (most recent)</option>
                                    {(options?.sessions || []).map((session) => (
                                        <option value={session.id} key={session.id}>
                                            {session.name}
                                            {session.session_start ? ` — ${new Date(session.session_start).toLocaleDateString()}` : ''}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                <span>Featured program</span>
                                <select
                                    value={tour.program_id || ''}
                                    disabled={optionsQuery.isLoading}
                                    onChange={(event) => setTour({ program_id: event.target.value || null })}
                                >
                                    <option value="">Auto (active program)</option>
                                    {(options?.programs || []).map((program) => (
                                        <option value={program.id} key={program.id}>{program.name}</option>
                                    ))}
                                </select>
                            </label>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
