export function formatClockDuration(totalSeconds, emptyValue = '--:--') {
    if (totalSeconds == null || totalSeconds <= 0 || Number.isNaN(totalSeconds)) {
        return emptyValue;
    }

    const seconds = Math.floor(totalSeconds);
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatHourMinuteDuration(totalSeconds, emptyValue = '-') {
    if (totalSeconds == null || totalSeconds <= 0 || Number.isNaN(totalSeconds)) {
        return emptyValue;
    }

    const seconds = Math.floor(totalSeconds);
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}:${String(mins).padStart(2, '0')}`;
}

const secondsBetween = (start, end) => {
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    return Number.isFinite(startMs) && Number.isFinite(endMs)
        ? Math.max(0, Math.floor((endMs - startMs) / 1000))
        : 0;
};

export function isInstanceTimerRunning(instance) {
    return Boolean(instance?.time_start && !instance.time_stop && !instance.completed);
}

/**
 * An instance's active seconds: its recorded duration, or while its timer runs, the time since it
 * started minus its own pauses and the session's current pause.
 */
export function liveInstanceSeconds(instance, session = null, nowMs = Date.now()) {
    if (!isInstanceTimerRunning(instance)) return Number(instance?.duration_seconds) || 0;
    const startMs = new Date(instance.time_start).getTime();
    if (!Number.isFinite(startMs)) return Number(instance.duration_seconds) || 0;
    const sessionPaused = session?.is_paused || session?.attributes?.is_paused || false;
    const lastPausedAt = session?.last_paused_at || session?.attributes?.last_paused_at;
    const pausedMs = sessionPaused && lastPausedAt ? new Date(lastPausedAt).getTime() : NaN;
    const currentPause = Number.isFinite(pausedMs) && pausedMs > startMs ? Math.floor((nowMs - pausedMs) / 1000) : 0;
    const elapsed = Math.floor((nowMs - startMs) / 1000);
    return Math.max(0, elapsed - (instance.total_paused_seconds || 0) - currentPause);
}

/** A circuit run's active seconds; the run's own clock stops at its pause and at completion. */
export function liveCircuitSeconds(run, nowMs = Date.now()) {
    if (!run?.time_start || run.status === 'completed') return Number(run?.duration_seconds) || 0;
    const end = run.status === 'paused' && run.last_paused_at ? run.last_paused_at : nowMs;
    return Math.max(0, secondsBetween(run.time_start, end) - (run.total_paused_seconds || 0));
}

function durationById(rows, secondsFor) {
    return new Map((Array.isArray(rows) ? rows : []).map((row) => [row.id, secondsFor(row)]));
}

const recordedSeconds = (row) => Number(row.duration_seconds) || 0;

/**
 * Sum a section's activity and circuit durations. With `live` ({ nowMs, session }), running
 * timers count their elapsed time so far instead of their (not yet recorded) duration.
 */
export function calculateSectionDurationFromInstanceIds(section, activityInstances, circuitRuns = [], live = null) {
    if (!section) return 0;

    const activityDurations = durationById(activityInstances, live
        ? (instance) => liveInstanceSeconds(instance, live.session, live.nowMs)
        : recordedSeconds);
    const circuitDurations = durationById(circuitRuns, live
        ? (run) => liveCircuitSeconds(run, live.nowMs)
        : recordedSeconds);
    const items = Array.isArray(section.items)
        ? section.items
        : (section.activity_ids || []).map((id) => ({ type: 'activity', activity_instance_id: id }));

    return items.reduce((total, item) => {
        if (item?.type === 'circuit') {
            return total + (circuitDurations.get(item.circuit_run_id) || 0);
        }
        if (item?.type === 'activity') {
            return total + (activityDurations.get(item.activity_instance_id) || 0);
        }
        return total;
    }, 0);
}

export function calculateSessionItemDuration(activityInstances, circuitRuns = [], sessionData = null, live = null) {
    if (Array.isArray(sessionData?.sections)) {
        return sessionData.sections.reduce(
            (sum, section) => sum + calculateSectionDurationFromInstanceIds(
                section,
                activityInstances,
                circuitRuns,
                live,
            ),
            0,
        );
    }
    const activityTotal = (Array.isArray(activityInstances) ? activityInstances : [])
        .reduce((sum, instance) => sum + (live ? liveInstanceSeconds(instance, live.session, live.nowMs) : recordedSeconds(instance)), 0);
    const circuitTotal = (Array.isArray(circuitRuns) ? circuitRuns : [])
        .reduce((sum, run) => sum + (live ? liveCircuitSeconds(run, live.nowMs) : recordedSeconds(run)), 0);
    return activityTotal + circuitTotal;
}

export function calculateTotalCompletedDuration(sessionData, activityInstances, circuitRuns = []) {
    if (!sessionData) return 0;

    if (sessionData.session_end && sessionData.session_start) {
        const start = new Date(sessionData.session_start);
        const end = new Date(sessionData.session_end);
        const diffSeconds = Math.floor((end.getTime() - start.getTime()) / 1000);
        return diffSeconds > 0 ? diffSeconds : 0;
    }

    if (!sessionData.sections) return 0;

    let totalSeconds = 0;
    for (const section of sessionData.sections) {
        totalSeconds += calculateSectionDurationFromInstanceIds(section, activityInstances, circuitRuns);
    }

    return totalSeconds;
}
