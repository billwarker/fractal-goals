import React, { useEffect, useRef, useState } from 'react';

import { useGoalConditionPreview } from '../../../hooks/useGoalConditionQueries';
import { buildConditionPayload } from '../../../utils/goalConditions';
import { describeProgress } from '../../../utils/goalConditionText';
import Button from '../../atoms/Button';
import styles from './Annotation.module.css';

/**
 * A pinned chart point: the goal it would set, then "Create goal…" (the goal modal, seeded) or
 * "Update" a goal that already has a threshold on this activity, after a live preview of how far
 * along that goal would be.
 *
 * @param {{ rootId: string, pin: { target: any, left: number, top: number }, goals: Array<{ goal_id: string, goal_name: string }>,
 *   onCreate: () => void, onUpdate: (goalId: string, payload: any) => Promise<void>, onClose: () => void }} props
 */
export default function AnnotationPopover({ rootId, pin, goals, onCreate, onUpdate, onClose }) {
    const { target } = pin;
    const [goalId, setGoalId] = useState('');
    const [saving, setSaving] = useState(false);
    const ref = useRef(null);
    const payload = target.conditionDraft ? buildConditionPayload(target.conditionDraft) : null;
    const { progress, isPending } = useGoalConditionPreview(rootId, goalId || null, goalId ? payload : null);

    useEffect(() => {
        ref.current?.querySelector('button')?.focus();
        const close = (event) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', close);
        return () => window.removeEventListener('keydown', close);
    }, [onClose]);

    const update = async () => {
        setSaving(true);
        try {
            await onUpdate(goalId, payload);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div ref={ref} className={styles.popover} style={{ left: pin.left, top: pin.top }} role="dialog" aria-label="Set a goal from this point" data-chart-goal-menu>
            <strong className={styles.popoverTitle}>{target.summary}</strong>
            {(target.notes || []).map((note) => <span key={note} className={styles.muted}>{note}</span>)}
            <div className={styles.popoverActions}>
                <Button size="sm" onClick={onCreate}>Create goal…</Button>
                <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
            </div>
            {goals.length > 0 ? (
                <div className={styles.existing}>
                    <label className={styles.field}>
                        <span>Or update a goal on this activity</span>
                        <select value={goalId} onChange={(event) => setGoalId(event.target.value)}>
                            <option value="">Choose a goal…</option>
                            {goals.map((goal) => <option key={goal.goal_id} value={goal.goal_id}>{goal.goal_name}</option>)}
                        </select>
                    </label>
                    {goalId ? (
                        <>
                            <span className={styles.muted} role="status">
                                {isPending || !progress ? 'Checking progress…' : `With this threshold: ${describeProgress(progress, payload)}`}
                            </span>
                            <Button size="sm" variant="secondary" disabled={saving} onClick={update}>
                                {saving ? 'Updating…' : 'Update goal'}
                            </Button>
                        </>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
