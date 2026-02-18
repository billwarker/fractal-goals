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

export function calculateSectionDurationFromInstanceIds(section, activityInstances) {
    if (!section?.activity_ids || !Array.isArray(activityInstances)) {
        return 0;
    }

    let totalSeconds = 0;
    for (const instanceId of section.activity_ids) {
        const instance = activityInstances.find((inst) => inst.id === instanceId);
        if (instance?.duration_seconds != null) {
            totalSeconds += instance.duration_seconds;
        }
    }

    return totalSeconds;
}

export function calculateTotalCompletedDuration(sessionData, activityInstances) {
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
        totalSeconds += calculateSectionDurationFromInstanceIds(section, activityInstances);
    }

    return totalSeconds;
}
