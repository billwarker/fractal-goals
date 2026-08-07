import React from 'react';

import Button from '../atoms/Button';
import styles from './SessionActivityItem.module.css';


export async function startTimerWithConflict(event, options) {
    const { autoCompletedRef, hasTargetDurationInput, parsedTargetDuration, onUpdate, setError, setConflict } = options;
    event.stopPropagation();
    autoCompletedRef.current = false;
    if (hasTargetDurationInput && !parsedTargetDuration) return setError('Use MM:SS, seconds 00-59');
    const extras = parsedTargetDuration ? { target_duration_seconds: parsedTargetDuration } : {};
    try {
        await onUpdate('timer_action', 'start', extras);
        setConflict(null);
    } catch (error) {
        if (error?.response?.data?.code === 'active_work_exists') {
            setConflict({
                extras,
                activeWork: error.response.data.active_work || null,
            });
        }
    }
}


export default function TimerConflictAction({ conflict, onUpdate, onResolved }) {
    if (!conflict) return null;
    const extras = conflict.extras || {};
    const activeName = conflict.activeWork?.activity_name;
    const switchTimer = async (event) => {
        event.stopPropagation();
        try {
            await onUpdate('timer_action', 'start', { ...extras, switch: true });
            onResolved();
        } catch {
            // The shared timer handler owns API error notification.
        }
    };
    return <div className={styles.timerConflict} role="alert">
        <span>{activeName ? `${activeName} is active.` : 'Another activity or circuit member is active.'}</span>
        <Button type="button" variant="secondary" size="sm" onClick={switchTimer}>Stop it and switch</Button>
    </div>;
}
