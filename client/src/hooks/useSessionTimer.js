import { useCallback } from 'react';
import {
    calculateSectionDurationFromInstanceIds,
    calculateTotalCompletedDuration,
    formatClockDuration
} from '../utils/sessionTime';

export const calculateSectionDuration = calculateSectionDurationFromInstanceIds;
export const formatDuration = formatClockDuration;

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
        formatDuration: formatClockDuration,
        calculateTotalCompletedDuration: () => calculateTotalCompletedDuration(sessionData, activityInstances),
        handleSessionStartChange,
        handleSessionEndChange,
        handleSectionDurationChange
    };
}
