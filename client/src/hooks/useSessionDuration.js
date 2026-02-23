/**
 * useSessionDuration - Hook for calculating and formatting session duration
 * 
 * Calculates duration from multiple sources with priority:
 * 1. session_start/session_end times (wall clock)
 * 2. total_duration_seconds attribute (set on completion)
 * 3. Sum of activity instance durations
 */

import { useMemo, useState, useEffect } from 'react';
import { formatHourMinuteDuration, formatClockDuration } from '../utils/sessionTime';

/**
 * Format seconds into H:MM or 0:MM format
 * @param {number} totalSeconds - Total seconds to format
 * @returns {string} Formatted duration string
 */
export function formatDuration(totalSeconds) {
    return formatHourMinuteDuration(totalSeconds, '-');
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
    const startTime = sessionData?.session_start || session?.session_start || session?.attributes?.session_start;
    const endTime = sessionData?.session_end || session?.session_end || session?.attributes?.session_end;

    // Priority 1: Calculate from session_start and session_end
    if (startTime && endTime) {
        const start = new Date(startTime);
        const end = new Date(endTime);

        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            const diffSeconds = Math.floor((end - start) / 1000);
            if (diffSeconds > 0) {
                return diffSeconds;
            }
        }
    }

    // Priority 2: Use total_duration_seconds if available
    const totalDurationSeconds = session?.attributes?.total_duration_seconds ?? session?.total_duration_seconds;
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

/**
 * Hook for live computing session duration
 * @param {Object} session - Session object
 * @returns {Object} Duration info with formatted string and raw seconds
 */
export function useLiveSessionDuration(session) {
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
        if (!session) return;

        // Safely extract data looking at standard locations and nested attributes
        const sessionData = session.attributes?.session_data;
        const isCompleted = session.completed || session.attributes?.completed || sessionData?.completed;
        const startTime = sessionData?.session_start || session.session_start || session.attributes?.session_start;

        // If session is completed, just use the static duration
        if (isCompleted) {
            setSeconds(calculateSessionDuration(session) || 0);
            return;
        }

        if (!startTime) {
            setSeconds(0);
            return;
        }

        const start = new Date(startTime).getTime();

        const updateClock = () => {
            const now = Date.now();
            const totalPaused = session.total_paused_seconds || session.attributes?.total_paused_seconds || 0;
            const isPaused = session.is_paused || session.attributes?.is_paused || false;
            const lastPausedAt = session.last_paused_at || session.attributes?.last_paused_at;
            let currentPausedStraggler = 0;

            if (isPaused && lastPausedAt) {
                const pausedTime = new Date(lastPausedAt).getTime();
                currentPausedStraggler = Math.floor((now - pausedTime) / 1000);
            }

            const diffSeconds = Math.floor((now - start) / 1000);
            const activeSeconds = Math.max(0, diffSeconds - totalPaused - currentPausedStraggler);
            setSeconds(activeSeconds);
        };

        updateClock(); // Initial update

        // Only tick if not paused and not completed
        const isPaused = session.is_paused || session.attributes?.is_paused || false;
        if (!isPaused) {
            const interval = setInterval(updateClock, 1000);
            return () => clearInterval(interval);
        }
    }, [
        session,
        session?.is_paused,
        session?.total_paused_seconds,
        session?.attributes?.is_paused,
        session?.attributes?.total_paused_seconds
    ]);

    return {
        seconds,
        formatted: formatClockDuration(seconds, '0:00'),
        hasData: seconds > 0
    };
}

export default useSessionDuration;
