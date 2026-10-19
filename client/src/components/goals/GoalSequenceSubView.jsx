import React, { useMemo, useState } from 'react';

import { useGoalSequence, useSequenceTrackMutations } from '../../hooks/useGoalSequenceQueries';
import { findGoalNodeById, getGoalNodeChildren, getGoalNodeId } from '../../utils/goalNodeModel';
import Button from '../atoms/Button';
import styles from '../GoalDetailModal.module.css';

const toId = (value) => (value == null ? null : String(value));
const read = (node, key) => node?.[key] ?? node?.attributes?.[key] ?? null;

/** Same-level live siblings of a goal (itself included), from the cached goal tree. */
export function sequenceCandidates(treeData, goal, goalId) {
    const parentId = toId(read(goal, 'parent_id'));
    const parent = treeData && parentId ? findGoalNodeById(treeData, parentId) : null;
    const levelId = read(goal, 'level_id');
    return getGoalNodeChildren(parent || {})
        .filter((child) => !read(child, 'deleted_at'))
        .filter((child) => toId(getGoalNodeId(child)) === toId(goalId) || read(child, 'level_id') === levelId)
        .map((child) => ({
            id: toId(getGoalNodeId(child)),
            name: child.name ?? child.attributes?.name,
            trackId: toId(read(child, 'sequence_track_id')),
            position: read(child, 'sequence_position'),
            completed: Boolean(read(child, 'completed')),
        }));
}

function stepStatus(step, activeId) {
    if (step.completed) return 'Done';
    if (step.id === activeId) return 'Active';
    return 'Waits';
}

/**
 * Options → Sequence: order a goal with its same-level siblings so each begins when the one before
 * completes. Later steps wait, paused, and resume as each step completes. Edits are drafted here
 * and applied together.
 */
export default function GoalSequenceSubView({ rootId, goal, goalId, treeData, onBack, onDone }) {
    const candidates = useMemo(() => sequenceCandidates(treeData, goal, goalId), [goal, goalId, treeData]);
    const byId = useMemo(() => new Map(candidates.map((candidate) => [candidate.id, candidate])), [candidates]);
    const trackId = toId(read(goal, 'sequence_track_id'));
    const sequenceQuery = useGoalSequence(rootId, goalId, { enabled: Boolean(trackId) });
    const savedIds = useMemo(() => (trackId
        ? (sequenceQuery.data?.steps || []).map((step) => toId(step.id))
        : [toId(goalId)]), [goalId, sequenceQuery.data?.steps, trackId]);
    const [draft, setDraft] = useState(null);
    const steps = (draft ?? savedIds).map((id) => byId.get(id) || { id, name: 'Goal', completed: false });
    const otherTracks = useMemo(() => {
        const tracks = new Map();
        candidates.forEach((candidate) => {
            if (!candidate.trackId || candidate.trackId === trackId) return;
            tracks.set(candidate.trackId, [...(tracks.get(candidate.trackId) || []), candidate]);
        });
        return [...tracks.entries()].map(([id, members]) => ({
            id, members: [...members].sort((a, b) => (a.position || 0) - (b.position || 0)),
        }));
    }, [candidates, trackId]);
    const addable = candidates.filter((candidate) => !candidate.trackId && !steps.some((step) => step.id === candidate.id));
    const { isSaving, createTrack, setSteps, dissolveTrack } = useSequenceTrackMutations(rootId);
    const activeId = steps.find((step) => !step.completed)?.id;
    const changed = draft !== null && draft.join() !== savedIds.join();
    const parentId = read(goal, 'parent_id');

    const update = (next) => setDraft(next.map((step) => step.id));
    const move = (index, offset) => {
        const next = [...steps];
        [next[index], next[index + offset]] = [next[index + offset], next[index]];
        update(next);
    };
    const finish = async (request) => {
        try {
            await request();
            onDone();
        } catch {
            // useSequenceTrackMutations reports the failure.
        }
    };

    if (trackId && sequenceQuery.isLoading) {
        return <div className={styles.optionsSubView}><div className={styles.optionsEmptyState}>Loading sequence…</div></div>;
    }

    return (
        <div className={styles.optionsSubView}>
            <button type="button" onClick={onBack} className={styles.optionsBackButton}>← Back</button>
            <div className={styles.optionsSectionHeader}>Sequence</div>
            <div className={styles.optionsSectionHint}>
                Each goal begins when the one before it completes. Later goals wait, paused, until then.
            </div>

            <ol className={styles.sequenceSteps} aria-label="Sequence order">
                {steps.map((step, index) => (
                    <li key={step.id} className={styles.sequenceStep} data-current={step.id === toId(goalId) ? 'true' : undefined}>
                        <span className={styles.sequenceStepNumber}>{index + 1}</span>
                        <span className={styles.sequenceStepName}>{step.name}</span>
                        <span className={styles.sequenceStepStatus}>{stepStatus(step, activeId)}</span>
                        <span className={styles.sequenceStepActions}>
                            <button type="button" aria-label={`Move ${step.name} earlier`} disabled={index === 0 || isSaving} onClick={() => move(index, -1)}>↑</button>
                            <button type="button" aria-label={`Move ${step.name} later`} disabled={index === steps.length - 1 || isSaving} onClick={() => move(index, 1)}>↓</button>
                            <button
                                type="button"
                                aria-label={`Remove ${step.name} from the sequence`}
                                disabled={isSaving || (!trackId && step.id === toId(goalId))}
                                onClick={() => update(steps.filter((candidate) => candidate.id !== step.id))}
                            >
                                ×
                            </button>
                        </span>
                    </li>
                ))}
            </ol>

            {addable.length > 0 ? (
                <div className={styles.sequenceAdd}>
                    <div className={styles.optionsSectionHint}>Add a sibling at the same level:</div>
                    {addable.map((candidate) => (
                        <Button
                            unstyled
                            key={candidate.id}
                            className={styles.sequenceAddButton}
                            disabled={isSaving}
                            onClick={() => update([...steps, candidate])}
                        >
                            + {candidate.name}
                        </Button>
                    ))}
                </div>
            ) : null}
            {!trackId && addable.length === 0 && otherTracks.length === 0 ? (
                <div className={styles.optionsEmptyState}>No sibling goals at this level to sequence with.</div>
            ) : null}

            {!trackId && otherTracks.map((track) => (
                <Button
                    unstyled
                    key={track.id}
                    className={styles.optionButton}
                    disabled={isSaving}
                    onClick={() => finish(() => setSteps(track.id, [...track.members.map((member) => member.id), toId(goalId)]))}
                >
                    <span className={styles.optionButtonTitle}>Join sequence</span>
                    <span className={styles.optionButtonDescription}>
                        {[...track.members.map((member) => member.name), goal?.name].join(' → ')}
                    </span>
                </Button>
            ))}

            <div className={styles.sequenceActions}>
                {trackId ? (
                    <>
                        <Button
                            unstyled
                            className={styles.btnAction}
                            disabled={!changed || isSaving}
                            onClick={() => finish(() => setSteps(trackId, steps.map((step) => step.id)))}
                        >
                            {steps.length < 2 ? 'Save (ends the sequence)' : 'Save order'}
                        </Button>
                        <Button unstyled className={styles.btnAction} disabled={isSaving} onClick={() => finish(() => dissolveTrack(trackId))}>
                            Stop sequencing
                        </Button>
                    </>
                ) : (
                    <Button
                        unstyled
                        className={styles.btnAction}
                        disabled={steps.length < 2 || isSaving || !parentId}
                        onClick={() => finish(() => createTrack(parentId, steps.map((step) => step.id)))}
                    >
                        Create sequence
                    </Button>
                )}
            </div>
        </div>
    );
}
