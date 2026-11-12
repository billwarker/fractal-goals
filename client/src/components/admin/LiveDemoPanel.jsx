import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../utils/api';
import { formatError } from '../../utils/mutationNotify';
import { getLandingPageHref } from '../../utils/marketingHost';
import notify from '../../utils/notify';
import LoadingState from '../common/LoadingState';
import DemoExampleRow from './DemoExampleRow';
import { LandingPublicationSummary } from './LandingPublicationStatus';
import styles from '../../pages/Admin.module.css';

export const ADMIN_LANDING_EXAMPLES_KEY = ['admin', 'landing-examples'];

const toDraft = (examples = []) => examples.map((example, index) => ({
    root_id: example.root_id,
    label: example.label,
    sort_order: index,
    tour: { session_id: example.tour?.session_id || null, program_id: example.tour?.program_id || null },
}));

// The live demo: which admin fractals visitors explore. Publishing copies each one as it
// is now into the demo account (services/demo_snapshot_service.py); later edits to the
// source don't reach visitors until the next publish.
export default function LiveDemoPanel() {
    const queryClient = useQueryClient();
    const [confirming, setConfirming] = useState(false);
    const settingsQuery = useQuery({
        queryKey: ADMIN_LANDING_EXAMPLES_KEY,
        queryFn: async () => (await adminApi.getLandingExamples()).data,
    });
    const settings = settingsQuery.data;
    // Edits apply to the settings they started from; fresh settings (a save or publish) reset them.
    const [edits, setEdits] = useState({ base: null, examples: [] });
    const draft = edits.base === settings ? edits.examples : toDraft(settings?.examples);
    const setDraft = (change) => setEdits((current) => {
        const examples = current.base === settings ? current.examples : toDraft(settings?.examples);
        return { base: settings, examples: change(examples) };
    });

    const eligible = settings?.eligible_fractals || [];
    const snapshotFor = (rootId) => (settings?.examples || []).find((example) => example.root_id === rootId)?.snapshot || null;
    const selected = new Set(draft.map((example) => example.root_id));
    const missingLabel = draft.some((example) => !example.label.trim());

    const saveMutation = useMutation({
        mutationFn: () => adminApi.updateLandingExamples({ examples: toDraft(draft) }),
        onSuccess: (response) => {
            queryClient.setQueryData(ADMIN_LANDING_EXAMPLES_KEY, response.data);
            notify.success('Demo draft saved');
        },
        onError: (error) => notify.error(`Failed to save the demo draft: ${formatError(error)}`),
    });
    const publishMutation = useMutation({
        mutationFn: () => adminApi.publishLandingExamples({ examples: toDraft(draft) }),
        onSuccess: (response) => {
            setConfirming(false);
            queryClient.setQueryData(ADMIN_LANDING_EXAMPLES_KEY, response.data);
            notify.success(response.data.published_example_count
                ? `Published ${response.data.published_example_count} demo snapshot${response.data.published_example_count === 1 ? '' : 's'}`
                : 'The live demo is now empty');
        },
        onError: (error) => {
            setConfirming(false);
            notify.error(`Failed to publish the demo: ${formatError(error)}`);
        },
    });

    const update = (rootId, patch) => setDraft((current) => current.map((example) => (
        example.root_id === rootId ? { ...example, ...patch } : example
    )));
    const add = (fractal) => setDraft((current) => toDraft([
        ...current, { root_id: fractal.root_id, label: fractal.name },
    ]));
    const remove = (rootId) => setDraft((current) => toDraft(current.filter((example) => example.root_id !== rootId)));
    const move = (rootId, direction) => setDraft((current) => {
        const next = [...current];
        const index = next.findIndex((example) => example.root_id === rootId);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= next.length) return current;
        [next[index], next[target]] = [next[target], next[index]];
        return toDraft(next);
    });

    if (settingsQuery.isLoading) return <LoadingState label="Loading the live demo…" />;
    if (settingsQuery.isError) return <div className={styles.status}>Failed to load the live demo settings.</div>;

    const publishing = publishMutation.isPending;
    return (
        <section className={styles.section}>
            <div className={styles.landingExamplesHeader}>
                <div>
                    <h2>Live demo</h2>
                    <p>
                        Choose the fractals visitors explore from the landing page. Publishing copies each one as it is now;
                        visitors browse the copy read-only, and later edits don’t reach them until you publish again.
                    </p>
                    <a className={styles.landingExamplesPageLink} href={getLandingPageHref()} target="_blank" rel="noreferrer">
                        View landing page
                    </a>
                </div>
                <LandingPublicationSummary
                    publishedAt={settings?.published_at}
                    publishedCount={settings?.published_example_count}
                    delivery={settings?.delivery}
                />
            </div>
            <div className={styles.landingExamplesGrid}>
                <div className={styles.landingExamplesPanel}>
                    <div className={styles.landingExamplesPanelHeader}>
                        <h3>Demos</h3>
                        <span>{draft.length} selected</span>
                    </div>
                    {draft.length === 0 ? (
                        <div className={styles.status}>No demos yet. Add a fractal from the list.</div>
                    ) : (
                        <div className={styles.landingExampleList}>
                            {draft.map((example, index) => (
                                <DemoExampleRow
                                    key={example.root_id}
                                    example={{ ...example, snapshot: snapshotFor(example.root_id) }}
                                    index={index}
                                    total={draft.length}
                                    name={eligible.find((item) => item.root_id === example.root_id)?.name || 'Missing fractal'}
                                    onMove={move}
                                    onRemove={remove}
                                    onChange={update}
                                />
                            ))}
                        </div>
                    )}
                    <div className={styles.landingExamplesFooter}>
                        <p className={styles.landingPublicDataNotice} role="status" aria-live="polite">
                            {missingLabel
                                ? 'Every demo needs a public label.'
                                : confirming
                                    ? (draft.length === 0
                                        ? 'Removes every demo from the landing page.'
                                        : `Copies ${draft.length} fractal${draft.length === 1 ? '' : 's'} as ${draft.length === 1 ? 'it is' : 'they are'} now and replaces the current demo. Anyone can open what you publish.`)
                                    : 'Anyone can open a published demo. Check each fractal’s notes before publishing.'}
                        </p>
                        {confirming ? (
                            <>
                                <button type="button" onClick={() => setConfirming(false)} disabled={publishing}>Cancel</button>
                                <button type="button" onClick={() => publishMutation.mutate()} disabled={publishing}>
                                    {publishing ? 'Publishing…' : 'Publish now'}
                                </button>
                            </>
                        ) : (
                            <>
                                <button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || missingLabel}>
                                    {saveMutation.isPending ? 'Saving…' : 'Save draft'}
                                </button>
                                <button type="button" onClick={() => setConfirming(true)} disabled={missingLabel}>
                                    Publish demos
                                </button>
                            </>
                        )}
                    </div>
                </div>
                <div className={styles.landingExamplesPanel}>
                    <div className={styles.landingExamplesPanelHeader}>
                        <h3>Your fractals</h3>
                        <span>{eligible.length} available</span>
                    </div>
                    <div className={styles.landingExampleList}>
                        {eligible.map((fractal) => (
                            <div className={styles.landingFractalOption} key={fractal.root_id}>
                                <div>
                                    <strong>{fractal.name}</strong>
                                    {fractal.owner && <span>{fractal.owner}</span>}
                                </div>
                                <button type="button" onClick={() => add(fractal)} disabled={selected.has(fractal.root_id)}>
                                    {selected.has(fractal.root_id) ? 'Added' : 'Add'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
