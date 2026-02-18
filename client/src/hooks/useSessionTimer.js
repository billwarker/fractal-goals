import { useCallback } from 'react';

/**
 * Calculate total duration in seconds for a section based on activity instances
 */
export function calculateSectionDuration(section, activityInstances) {
    if (!section || !section.activity_ids || !activityInstances) return 0;

    let totalSeconds = 0;
    for (const instanceId of section.activity_ids) {
        const instance = activityInstances.find(inst => inst.id === instanceId);
        if (instance && instance.duration_seconds != null) {
            totalSeconds += instance.duration_seconds;
        }
    }
    return totalSeconds;
}

/**
 * Calculate total completed duration
 * - If session_end is set: use session_end - session_start
 * - If session_end is NULL: sum all section durations
 */
export function calculateTotalCompletedDuration(sessionData, activityInstances) {
    if (!sessionData) return 0;

    // Priority 1: If session_end is set, use session_end - session_start
    if (sessionData.session_end && sessionData.session_start) {
        const start = new Date(sessionData.session_start);
        const end = new Date(sessionData.session_end);
        const diffSeconds = Math.floor((end - start) / 1000);
        return diffSeconds > 0 ? diffSeconds : 0;
    }

    // Priority 2: Sum all section durations from activity instances
    if (!sessionData.sections) return 0;

    let totalSeconds = 0;
    for (const section of sessionData.sections) {
        totalSeconds += calculateSectionDuration(section, activityInstances);
    }

    return totalSeconds;
}

/**
 * Format duration in seconds to HH:MM:SS or MM:SS format
 */
export function formatDuration(seconds) {
    if (seconds == null || seconds === 0) return '--:--';

    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Hook to manage session timing logic
 */
export function useSessionTimer(sessionData, setSessionData, activityInstances) {

    const handleSessionStartChange = useCallback((value) => {
        if (!sessionData) return;

        const updatedData = { ...sessionData };
        updatedData.session_start = value;

        // Recalculate session_end based on new start time + duration
        if (value) {
            const totalSeconds = calculateTotalCompletedDuration(sessionData, activityInstances);
            const startDate = new Date(value);
            const endDate = new Date(startDate.getTime() + totalSeconds * 1000);
            updatedData.session_end = endDate.toISOString();
        }

        setSessionData(updatedData);
    }, [sessionData, activityInstances, setSessionData]);

    const handleSessionEndChange = useCallback((value) => {
        if (!sessionData) return;

        const updatedData = { ...sessionData };
        updatedData.session_end = value;
        setSessionData(updatedData);
    }, [sessionData, setSessionData]);

    const handleSectionDurationChange = useCallback((sectionIndex, value) => {
        if (!sessionData) return;

        const updatedData = { ...sessionData };
        if (updatedData.sections && updatedData.sections[sectionIndex]) {
            updatedData.sections[sectionIndex].actual_duration_minutes = parseInt(value) || 0;
            setSessionData(updatedData);
        }
    }, [sessionData, setSessionData]);

    return {
        formatDuration,
        calculateTotalCompletedDuration: () => calculateTotalCompletedDuration(sessionData, activityInstances),
        handleSessionStartChange,
        handleSessionEndChange,
        handleSectionDurationChange
    };
}
