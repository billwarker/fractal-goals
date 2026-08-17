import React, { useEffect, useState } from 'react';

import { useTimezone } from '../../contexts/TimezoneContext';
import { formatForInput, validateTimerRange } from '../../utils/dateUtils';
import { formatClockDuration } from '../../utils/sessionTime';
import { PlayIcon } from '../atoms/AppIcons';
import Button from '../atoms/Button';
import {
    SessionItemTimerActions,
    SessionItemTimerControls,
    SessionItemTimerMeta,
} from '../sessionDetail/SessionItemCardPrimitives';
import useRelativeTimeAdjustment from '../sessionDetail/useRelativeTimeAdjustment';
import activityStyles from '../sessionDetail/SessionActivityItem.module.css';


const secondsBetween = (start, end) => {
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    return Number.isFinite(startMs) && Number.isFinite(endMs)
        ? Math.max(0, Math.floor((endMs - startMs) / 1000))
        : 0;
};

const elapsedSeconds = (run, now) => {
    if (!run?.time_start || run.status === 'completed') return run?.duration_seconds || 0;
    const end = run.status === 'paused' && run.last_paused_at ? run.last_paused_at : now;
    return Math.max(0, secondsBetween(run.time_start, end) - (run.total_paused_seconds || 0));
};


export default function CircuitRunTimerControls({
    run,
    disabled,
    pending,
    isSelected,
    onAction,
}) {
    const { timezone } = useTimezone();
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        if (run.status !== 'active') return undefined;
        const timer = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(timer);
    }, [run.status]);

    const actionsDisabled = disabled || pending;
    const localStartTime = formatForInput(run.time_start, timezone);
    const localStopTime = formatForInput(run.time_stop, timezone);
    const getTimerRangeError = (target, candidateIso) => validateTimerRange({
        target,
        candidateIso,
        startIso: run.time_start,
        stopIso: run.time_stop,
    });
    const relativeTimeAdjustment = useRelativeTimeAdjustment({
        timezone,
        validate: getTimerRangeError,
        onApply: (target, isoValue) => onAction({
            action: 'updateRunTiming',
            inlineError: true,
            value: { [target === 'start' ? 'time_start' : 'time_stop']: isoValue },
        }),
    });

    const invoke = (event, action) => {
        event.stopPropagation();
        onAction({ action });
    };

    return (
        <SessionItemTimerControls>
            <SessionItemTimerMeta>
                <div className={activityStyles.timerFieldContainer}>
                    <div className={activityStyles.timerLabelRow}>
                        <label className={activityStyles.timerLabel} htmlFor={`circuit-${run.id}-start`}>Start</label>
                        {isSelected && !actionsDisabled && !run.is_paused && !run.total_paused_seconds && run.time_start
                            && relativeTimeAdjustment.renderToggle('start')}
                    </div>
                    <input
                        id={`circuit-${run.id}-start`}
                        type="text"
                        className={activityStyles.timerInput}
                        placeholder="YYYY-MM-DD HH:MM:SS"
                        value={localStartTime}
                        readOnly
                        onClick={(event) => event.stopPropagation()}
                        title="Circuit timing is controlled by Start and Complete"
                    />
                    {relativeTimeAdjustment.renderPanel('start', localStartTime)}
                </div>
                <div className={activityStyles.timerFieldContainer}>
                    <div className={activityStyles.timerLabelRow}>
                        <label className={activityStyles.timerLabel} htmlFor={`circuit-${run.id}-stop`}>Stop</label>
                        {isSelected && !actionsDisabled && !run.is_paused && !run.total_paused_seconds && run.time_stop
                            && relativeTimeAdjustment.renderToggle('stop')}
                    </div>
                    <input
                        id={`circuit-${run.id}-stop`}
                        type="text"
                        className={`${activityStyles.timerInput} ${!run.time_start ? activityStyles.timerInputDisabled : ''}`}
                        placeholder="YYYY-MM-DD HH:MM:SS"
                        value={localStopTime}
                        readOnly
                        onClick={(event) => event.stopPropagation()}
                        title="Circuit timing is controlled by Start and Complete"
                    />
                    {relativeTimeAdjustment.renderPanel('stop', localStopTime)}
                </div>
                <div className={activityStyles.timerFieldContainer}>
                    <label className={activityStyles.timerLabel}>Duration</label>
                    {!run.time_start ? (
                        <input
                            type="text"
                            className={activityStyles.timerInput}
                            aria-label="Circuit duration"
                            placeholder="MM:SS"
                            value=""
                            readOnly
                            onClick={(event) => event.stopPropagation()}
                            title="Circuit duration begins when the circuit starts"
                        />
                    ) : (
                        <div className={`${activityStyles.durationDisplay} ${run.status === 'active' ? activityStyles.durationActive : activityStyles.durationInactive}`}>
                            {formatClockDuration(elapsedSeconds(run, now))}
                        </div>
                    )}
                </div>
            </SessionItemTimerMeta>
            <SessionItemTimerActions>
                {run.status === 'planned' && (
                    <Button
                        unstyled
                        type="button"
                        className={activityStyles.startButton}
                        onClick={(event) => invoke(event, 'startRun')}
                        disabled={actionsDisabled}
                        title="Start timer"
                    >
                        <PlayIcon size={13} /> <span>Start</span>
                    </Button>
                )}
                {run.status === 'active' && (
                    <Button
                        unstyled
                        type="button"
                        aria-label="Complete circuit"
                        className={activityStyles.completeButton}
                        onClick={(event) => invoke(event, 'completeRun')}
                        disabled={actionsDisabled}
                        title="Complete circuit"
                    >
                        ✓ Complete
                    </Button>
                )}
                {run.status === 'paused' && (
                    <div className={activityStyles.completedBadge} title="Resume the session to continue this circuit">
                        Paused
                    </div>
                )}
                {run.status === 'completed' && (
                    <div className={activityStyles.completedBadge} title={`Completed at ${localStopTime}`}>
                        Completed
                    </div>
                )}
                {run.status === 'planned' && (
                    <Button
                        unstyled
                        type="button"
                        aria-label="Complete circuit"
                        className={activityStyles.completeButton}
                        onClick={(event) => invoke(event, 'completeRun')}
                        disabled={actionsDisabled}
                        title="Instant complete (0s duration)"
                    >
                        ✓ Complete
                    </Button>
                )}
                {run.status === 'paused' && (
                    <Button
                        unstyled
                        type="button"
                        aria-label="Complete circuit"
                        className={activityStyles.completeButton}
                        onClick={(event) => invoke(event, 'completeRun')}
                        disabled={actionsDisabled}
                        title="Complete circuit"
                    >
                        ✓ Complete
                    </Button>
                )}
                {run.status !== 'planned' && (
                    <Button
                        unstyled
                        type="button"
                        className={activityStyles.resetButton}
                        onClick={(event) => invoke(event, 'resetRun')}
                        disabled={actionsDisabled}
                        title="Reset timer"
                    >
                        ↺ Reset
                    </Button>
                )}
            </SessionItemTimerActions>
        </SessionItemTimerControls>
    );
}
