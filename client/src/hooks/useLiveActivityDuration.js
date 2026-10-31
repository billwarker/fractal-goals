import { calculateSessionItemDuration, isInstanceTimerRunning } from '../utils/sessionTime';
import useSecondTicker from './useSecondTicker';

/**
 * The session's activity time: every activity and circuit item's recorded duration, plus the
 * elapsed time of any timer still running. It ticks on the shared clock (with the cards' own
 * timers) only while one runs and the session isn't paused; resets and edits show at once.
 */
export default function useLiveActivityDuration({ session, activityInstances, circuitRuns, sessionData }) {
    const sessionPaused = Boolean(session?.is_paused || session?.attributes?.is_paused);
    const running = (activityInstances || []).some(isInstanceTimerRunning)
        || (circuitRuns || []).some((run) => run?.status === 'active');
    const nowMs = useSecondTicker(running && !sessionPaused);

    return calculateSessionItemDuration(
        activityInstances,
        circuitRuns,
        sessionData,
        // A session pause is subtracted up to `nowMs`, so a paused total holds still without ticking.
        running ? { nowMs, session } : null,
    );
}
