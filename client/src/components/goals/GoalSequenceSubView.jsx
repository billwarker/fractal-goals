import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { useGoalSequence, useSequenceTrackMutations } from '../../hooks/useGoalSequenceQueries';
import usePointerReorder from '../../hooks/usePointerReorder';
import { findGoalNodeById, getGoalNodeChildren, getGoalNodeId, normalizeGoalNode } from '../../utils/goalNodeModel';
import { isSMART } from '../../utils/smartHelpers';
import Badge from '../atoms/Badge';
import Button from '../atoms/Button';
import DeleteButton from '../atoms/DeleteButton';
import GoalIcon from '../atoms/GoalIcon';
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
            node: child,
        }));
}

/** A goal's level icon in its level (or completed) colours. */
function SequenceGoalIcon({ candidate }) {
    const { getGoalIcon, getGoalColor, getGoalSecondaryColor } = useGoalLevels();
    const node = candidate.node ? normalizeGoalNode(candidate.node) : null;
    const colorKey = candidate.completed ? 'Completed' : node;
    return (
        <GoalIcon
            shape={getGoalIcon(node)}
            color={getGoalColor(colorKey)}
            secondaryColor={getGoalSecondaryColor(colorKey)}
            isSmart={Boolean(node && (node.is_smart || isSMART(candidate.node)))}
            size={20}
        />
    );
}

function OutOfScopeTag({ programName }) {
    return (
        <Badge size="sm" style={{ marginLeft: 8, verticalAlign: 'middle' }} title={`Not in ${programName}`}>
            Outside program
        </Badge>
    );
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
export default function GoalSequenceSubView({ rootId, goal, goalId, treeData, onBack, onDone, onSequencingChange, programScope, registerFooterAction }) {
    const candidates = useMemo(() => sequenceCandidates(treeData, goal, goalId), [goal, goalId, treeData]);
    const byId = useMemo(() => new Map(candidates.map((candidate) => [candidate.id, candidate])), [candidates]);
    const trackId = toId(read(goal, 'sequence_track_id'));
    const sequenceQuery = useGoalSequence(rootId, goalId, { enabled: Boolean(trackId) });
    const savedIds = useMemo(() => (trackId
        ? (sequenceQuery.data?.steps || []).map((step) => toId(step.id))
        : [toId(goalId)]), [goalId, sequenceQuery.data?.steps, trackId]);
    const [draft, setDraft] = useState(null);
    useEffect(() => () => onSequencingChange?.(null), [onSequencingChange]);
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
    const unsequenced = candidates.filter((candidate) => !candidate.trackId && !steps.some((step) => step.id === candidate.id));
    // When the page is scoped to a program, siblings outside it are still sequenceable but hidden from its tree.
    const isOutOfScope = (candidate) => Boolean(programScope?.goalIds) && !programScope.goalIds.has(candidate.id);
    const outOfScopeCount = candidates.filter((candidate) => candidate.id !== toId(goalId) && isOutOfScope(candidate)).length;
    const { isSaving, createTrack, setSteps, dissolveTrack } = useSequenceTrackMutations(rootId);
    const activeId = steps.find((step) => !step.completed)?.id;
    // Lets the host preview the drafted order (and show this goal's siblings) until it's saved.
    const draftKey = steps.map((step) => step.id).join('|');
    useEffect(() => {
        onSequencingChange?.({ goalId: toId(goalId), trackId, stepIds: draftKey ? draftKey.split('|') : [] });
    }, [draftKey, goalId, onSequencingChange, trackId]);
    const changed = draft !== null && draft.join() !== savedIds.join();
    const parentId = read(goal, 'parent_id');

    const update = (next) => setDraft(next.map((step) => step.id));
    // A completed sibling keeps its number ahead of the work still to do, so it joins before the first open step.
    const add = (candidate) => {
        const firstOpen = candidate.completed ? steps.findIndex((step) => !step.completed) : -1;
        update(firstOpen === -1 ? [...steps, candidate] : [...steps.slice(0, firstOpen), candidate, ...steps.slice(firstOpen)]);
    };
    const reorder = (from, to) => {
        const next = [...steps];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        update(next);
    };
    const move = (index, offset) => reorder(index, index + offset);
    const { listRef, getHandleProps, getItemProps } = usePointerReorder({ onMove: reorder, disabled: isSaving || steps.length < 2 });
    const finish = async (request) => {
        try {
            await request();
            onDone();
        } catch {
            // useSequenceTrackMutations reports the failure.
        }
    };

    // Create (or save) lives in the modal footer; Break entire sequence stays in the content.
    const primary = trackId
        ? {
            label: steps.length < 2 ? 'Save (ends the sequence)' : 'Save sequence',
            disabled: !changed || isSaving,
            run: () => finish(() => setSteps(trackId, steps.map((step) => step.id))),
        }
        : {
            label: 'Create sequence',
            disabled: steps.length < 2 || isSaving || !parentId,
            run: () => finish(() => createTrack(parentId, steps.map((step) => step.id))),
        };
    const primaryRunRef = useRef(primary.run);
    useEffect(() => {
        primaryRunRef.current = primary.run;
    });
    const isLoadingTrack = Boolean(trackId) && sequenceQuery.isLoading;
    useEffect(() => {
        if (!registerFooterAction) return undefined;
        registerFooterAction({
            label: primary.label,
            disabled: primary.disabled || isLoadingTrack,
            onClick: () => primaryRunRef.current(),
        });
        return undefined;
    }, [isLoadingTrack, primary.disabled, primary.label, registerFooterAction]);
    useEffect(() => () => registerFooterAction?.(null), [registerFooterAction]);

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

            <ol ref={listRef} className={styles.sequenceSteps} aria-label="Sequence order">
                {steps.map((step, index) => (
                    <li
                        key={step.id}
                        className={styles.sequenceStep}
                        data-current={step.id === toId(goalId) ? 'true' : undefined}
                        data-completed={step.completed ? 'true' : undefined}
                        {...getItemProps(index)}
                    >
                        <span className={styles.sequenceDragHandle} aria-hidden="true" title="Drag to reorder" {...getHandleProps(index)}>
                            ⠿
                        </span>
                        <span className={styles.sequenceStepNumber}>{index + 1}</span>
                        <SequenceGoalIcon candidate={step} />
                        <span className={styles.sequenceStepName}>
                            {step.name}
                            {isOutOfScope(step) ? <OutOfScopeTag programName={programScope.name} /> : null}
                        </span>
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

            {unsequenced.length > 0 ? (
                <div className={styles.sequenceAdd}>
                    <div className={styles.optionsSectionHint}>Add a sibling at the same level:</div>
                    {outOfScopeCount > 0 ? (
                        <div className={styles.sequenceScopeNote} role="note">
                            {outOfScopeCount} {outOfScopeCount === 1 ? 'sibling is' : 'siblings are'} outside {programScope.name},
                            so the tree doesn't show {outOfScopeCount === 1 ? 'it' : 'them'}.
                        </div>
                    ) : null}
                    {unsequenced.map((candidate) => (
                        <Button
                            unstyled
                            key={candidate.id}
                            className={styles.sequenceAddCard}
                            data-completed={candidate.completed ? 'true' : undefined}
                            disabled={isSaving}
                            aria-label={`Add ${candidate.name}${candidate.completed ? ' (completed)' : ''}`}
                            onClick={() => add(candidate)}
                        >
                            <SequenceGoalIcon candidate={candidate} />
                            <span className={styles.sequenceStepName}>
                                {candidate.name}
                                {isOutOfScope(candidate) ? <OutOfScopeTag programName={programScope.name} /> : null}
                            </span>
                            <span className={styles.sequenceStepStatus}>{candidate.completed ? '+ Add (done)' : '+ Add'}</span>
                        </Button>
                    ))}
                </div>
            ) : null}
            {!trackId && unsequenced.length === 0 && otherTracks.length === 0 ? (
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

            {trackId ? (
                <div className={styles.sequenceActions}>
                    <DeleteButton disabled={isSaving} onClick={() => finish(() => dissolveTrack(trackId))}>
                        Break entire sequence
                    </DeleteButton>
                </div>
            ) : null}
            {!registerFooterAction ? (
                <div className={styles.sequenceActions}>
                    <Button unstyled className={styles.btnAction} disabled={primary.disabled} onClick={primary.run}>
                        {primary.label}
                    </Button>
                </div>
            ) : null}
        </div>
    );
}
