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

function durationById(rows) {
    return new Map((Array.isArray(rows) ? rows : []).map((row) => [
        row.id,
        Number(row.duration_seconds) || 0,
    ]));
}

export function calculateSectionDurationFromInstanceIds(section, activityInstances, circuitRuns = []) {
    if (!section) return 0;

    const activityDurations = durationById(activityInstances);
    const circuitDurations = durationById(circuitRuns);
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

export function calculateSessionItemDuration(activityInstances, circuitRuns = [], sessionData = null) {
    if (Array.isArray(sessionData?.sections)) {
        return sessionData.sections.reduce(
            (sum, section) => sum + calculateSectionDurationFromInstanceIds(
                section,
                activityInstances,
                circuitRuns,
            ),
            0,
        );
    }
    const activityTotal = (Array.isArray(activityInstances) ? activityInstances : [])
        .reduce((sum, instance) => sum + (Number(instance.duration_seconds) || 0), 0);
    const circuitTotal = (Array.isArray(circuitRuns) ? circuitRuns : [])
        .reduce((sum, run) => sum + (Number(run.duration_seconds) || 0), 0);
    return activityTotal + circuitTotal;
}

export function calculateTotalCompletedDuration(sessionData, activityInstances, circuitRuns = []) {
    if (!sessionData) return 0;

    if (sessionData.session_end && sessionData.session_start) {
        const start = new Date(sessionData.session_start);
        const end = new Date(sessionData.session_end);
        const diffSeconds = Math.floor((end - start) / 1000);
        return diffSeconds > 0 ? diffSeconds : 0;
    }

    if (!sessionData.sections) return 0;

    let totalSeconds = 0;
    for (const section of sessionData.sections) {
        totalSeconds += calculateSectionDurationFromInstanceIds(section, activityInstances, circuitRuns);
    }

    return totalSeconds;
}
