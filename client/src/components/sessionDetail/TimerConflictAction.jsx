import React, { useEffect, useRef, useState } from 'react';

import Button from '../atoms/Button';
import CloseIcon from '../atoms/CloseIcon';
import styles from './SessionActivityItem.module.css';

const CONFLICT_VISIBLE_MS = 10_000;
const CONFLICT_FADE_MS = 250;

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
    const [isSwitching, setIsSwitching] = useState(false);
    const [isFading, setIsFading] = useState(false);
    const onResolvedRef = useRef(onResolved);

    useEffect(() => {
        onResolvedRef.current = onResolved;
    }, [onResolved]);

    useEffect(() => {
        setIsFading(false);
        if (!conflict) return undefined;

        let dismissTimer;
        const fadeTimer = window.setTimeout(() => {
            setIsFading(true);
            dismissTimer = window.setTimeout(() => {
                onResolvedRef.current();
            }, CONFLICT_FADE_MS);
        }, CONFLICT_VISIBLE_MS);

        return () => {
            window.clearTimeout(fadeTimer);
            window.clearTimeout(dismissTimer);
        };
    }, [conflict]);

    if (!conflict) return null;
    const extras = conflict.extras || {};
    const activeName = conflict.activeWork?.activity_name;
    const dismiss = (event) => {
        event.stopPropagation();
        onResolvedRef.current();
    };
    const switchTimer = async (event) => {
        event.stopPropagation();
        if (isSwitching) return;
        setIsSwitching(true);
        try {
            await onUpdate('timer_action', 'start', { ...extras, switch: true });
            onResolvedRef.current();
        } catch {
            // The shared timer handler owns API error notification.
        } finally {
            setIsSwitching(false);
        }
    };
    return <div className={`${styles.timerConflict} ${isFading ? styles.timerConflictFading : ''}`} role="alert">
        <div className={styles.timerConflictMessage}>
            <span>{activeName ? `${activeName} is active. ` : 'Another activity or circuit member is active. '}</span>
            <Button
                type="button"
                unstyled
                className={styles.timerConflictAction}
                disabled={isSwitching}
                aria-busy={isSwitching}
                onClick={switchTimer}
            >
                Complete it and switch
            </Button>
        </div>
        <Button
            type="button"
            unstyled
            className={styles.timerConflictDismiss}
            aria-label="Dismiss timer conflict"
            onClick={dismiss}
        >
            <CloseIcon size={14} />
        </Button>
    </div>;
}
