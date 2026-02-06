/**
 * useSessionDuration - Hook for calculating and formatting session duration
 * 
 * Calculates duration from multiple sources with priority:
 * 1. session_start/session_end times (wall clock)
 * 2. total_duration_seconds attribute (set on completion)
 * 3. Sum of activity instance durations
 */

import { useMemo } from 'react';

/**
 * Format seconds into H:MM or 0:MM format
 * @param {number} totalSeconds - Total seconds to format
 * @returns {string} Formatted duration string
 */
export function formatDuration(totalSeconds) {
    if (!totalSeconds || totalSeconds <= 0) return '-';

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}`;
    }
    return `0:${String(minutes).padStart(2, '0')}`;
}

/**
 * Format seconds into MM:SS format (for shorter durations)
 * @param {number} seconds - Seconds to format
 * @returns {string} Formatted duration string
 */
export function formatShortDuration(seconds) {
    if (seconds == null || seconds <= 0) return '--:--';

    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Calculate session duration from various sources
 * @param {Object} session - Session object with attributes
 * @returns {number|null} Duration in seconds, or null if not calculable
 */
export function calculateSessionDuration(session) {
    const sessionData = session?.attributes?.session_data;

    // Priority 1: Calculate from session_start and session_end
    if (sessionData?.session_start && sessionData?.session_end) {
        const start = new Date(sessionData.session_start);
        const end = new Date(sessionData.session_end);

        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            const diffSeconds = Math.floor((end - start) / 1000);
            if (diffSeconds > 0) {
                return diffSeconds;
            }
        }
    }

    // Priority 2: Use total_duration_seconds if available
    const totalDurationSeconds = session?.attributes?.total_duration_seconds;
    if (totalDurationSeconds != null && totalDurationSeconds > 0) {
        return totalDurationSeconds;
    }

    // Priority 3: Calculate from activity instances
    let totalSeconds = 0;
    if (sessionData?.sections) {
        for (const section of sessionData.sections) {
            if (section.exercises) {
                for (const exercise of section.exercises) {
                    if (exercise.instance_id && exercise.duration_seconds != null) {
                        totalSeconds += exercise.duration_seconds;
                    }
                }
            }
        }
    }

    return totalSeconds > 0 ? totalSeconds : null;
}

/**
 * Calculate section duration from activities
 * @param {Object} section - Section object with exercises
 * @returns {number} Total duration in seconds
 */
export function calculateSectionDuration(section) {
    let sectionSeconds = 0;
    if (section?.exercises) {
        for (const exercise of section.exercises) {
            if (exercise.instance_id && exercise.duration_seconds != null) {
                sectionSeconds += exercise.duration_seconds;
            }
        }
    }
    return sectionSeconds;
}

/**
 * Hook for computing session duration
 * @param {Object} session - Session object
 * @returns {Object} Duration info with formatted string and raw seconds
 */
export function useSessionDuration(session) {
    return useMemo(() => {
        const seconds = calculateSessionDuration(session);
        return {
            seconds,
            formatted: formatDuration(seconds),
            hasData: seconds !== null
        };
    }, [session]);
}

export default useSessionDuration;
