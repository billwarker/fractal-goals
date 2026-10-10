import React, { useRef, useState } from 'react';
import { getDatePart, formatLiteralDate } from '../../utils/dateUtils';
import { getProgramDayScheduledDates } from '../../utils/programViewModel';
import { formatError } from '../../utils/mutationNotify';
import Button from '../atoms/Button';
import Input from '../atoms/Input';
import styles from './ProgramDayScheduleActions.module.css';

export default function ProgramDayScheduleActions({ program, dayId, date, onMoveDay, onUnscheduleDay, moveDraft, onMoveDraftChange }) {
    const [localMode, setLocalMode] = useState(null);
    const [localTargetDate, setLocalTargetDate] = useState('');
    const draft = moveDraft?.dayId === dayId && moveDraft?.sourceDate === date ? moveDraft : null;
    const mode = draft ? 'move' : localMode;
    const targetDate = draft ? draft.targetDate : localTargetDate;
    const [saving, setPending] = useState(false);
    const pending = saving || Boolean(draft?.pending);
    const [error, setError] = useState('');
    const moveButton = useRef(null);
    const removeButton = useRef(null);
    const start = getDatePart(program.start_date);
    const end = getDatePart(program.end_date);
    const validTarget = targetDate && targetDate !== date && targetDate >= start && targetDate <= end;
    const displaced = (program.days || []).find((day) => getProgramDayScheduledDates(day, program).includes(targetDate));

    const cancel = () => {
        setLocalMode(null);
        onMoveDraftChange?.(null);
        setError('');
        // The opener renders again after closing the form.
        requestAnimationFrame(() => (mode === 'move' ? moveButton : removeButton).current?.focus());
    };
    const submit = async (event) => {
        event.preventDefault();
        if (pending || (mode === 'move' && !validTarget)) return;
        setPending(true);
        setError('');
        if (draft) onMoveDraftChange?.({ ...draft, pending: true });
        try {
            if (mode === 'move') await onMoveDay(dayId, date, targetDate);
            else await onUnscheduleDay(dayId, date);
            setLocalMode(null);
            onMoveDraftChange?.(null);
        } catch (failure) {
            setError(failure?.response?.data?.error || formatError(failure));
            if (draft) onMoveDraftChange?.({ ...draft, pending: false, error: failure?.response?.data?.error || formatError(failure) });
        } finally {
            setPending(false);
        }
    };
    if (!onMoveDay && !onUnscheduleDay) return null;
    return (
        <div className={styles.container}>
            {!mode ? (
                <div className={styles.actions}>
                    {onMoveDay ? <Button size="sm" variant="secondary" ref={moveButton} type="button" onClick={() => {
                        if (onMoveDraftChange) onMoveDraftChange({ programId: program.id, dayId, sourceDate: date, targetDate: '', error: '', pending: false });
                        else { setLocalTargetDate(''); setLocalMode('move'); }
                    }}>Move day</Button> : null}
                    {onUnscheduleDay ? <Button size="sm" variant="ghost" className={styles.removeAction} ref={removeButton} type="button" onClick={() => setLocalMode('remove')}>Remove from this date</Button> : null}
                </div>
            ) : (
                <form className={styles.form} onSubmit={submit} onKeyDown={(event) => {
                    if (event.key === 'Escape' && !pending) { event.stopPropagation(); cancel(); }
                }} aria-label={mode === 'move' ? 'Move program day' : 'Remove program day'} aria-busy={pending}>
                    {mode === 'move' ? (
                        <>
                            {onMoveDraftChange ? <p>Select a date on the calendar or enter it below.</p> : null}
                            <Input label="Move to date" fullWidth autoFocus type="date" min={start} max={end} value={targetDate}
                                required disabled={pending} onChange={(event) => {
                                    if (draft) onMoveDraftChange({ ...draft, targetDate: event.target.value, error: '' });
                                    else setLocalTargetDate(event.target.value);
                                    setError('');
                                }} />
                            <p>Moving replaces any program day scheduled on the destination date. Saved plans move with this day; logged sessions stay on their original dates.</p>
                            {validTarget && displaced ? <p>{displaced.name || 'Program day'} on {formatLiteralDate(targetDate)} will be removed from that date.</p> : null}
                        </>
                    ) : <p>Remove only this occurrence on {formatLiteralDate(date)}? Other scheduled dates, saved plans, and logged sessions are kept.</p>}
                    <p>Manual Complete/Rest statuses on affected dates will be cleared.</p>
                    {error || draft?.error ? <p role="alert" className={styles.error}>{error || draft.error}</p> : null}
                    <div className={styles.actions}>
                        <Button size="sm" variant={mode === 'remove' ? 'danger' : 'primary'} type="submit" disabled={pending || (mode === 'move' && !validTarget)}>
                            {pending ? 'Saving…' : mode === 'remove' ? 'Remove day' : displaced ? 'Move and replace' : 'Move'}
                        </Button>
                        <Button size="sm" variant="secondary" autoFocus={mode === 'remove'} type="button" disabled={pending} onClick={cancel}>Cancel</Button>
                    </div>
                </form>
            )}
        </div>
    );
}
