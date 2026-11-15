import React, { useMemo } from 'react';

import { formatDateInTimezone } from '../../utils/dateUtils';
import { instanceActivityName, orderedSessionInstances } from '../../utils/quickSessionSummary';
import LoadingState from '../common/LoadingState';
import StepContainer from '../common/StepContainer';
import StepHeader from './StepHeader';
import styles from './RecentQuickSessions.module.css';

const DATE_FORMAT = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' };

/**
 * The user's recent quick sessions, one card per distinct selection of activities, dated by
 * its latest use. Picking a card replaces the quick session's activities with its own, each
 * showing what was recorded last time.
 */
function RecentQuickSessions({
    sessions = [],
    isLoading = false,
    error = null,
    onRetry,
    activityDefinitions = [],
    timezone,
    onRepeat,
    stepNumber = 1,
}) {
    const definitionById = useMemo(
        () => new Map((activityDefinitions || []).map((definition) => [definition.id, definition])),
        [activityDefinitions],
    );

    let body;
    if (isLoading) {
        body = <LoadingState variant="section" label="Loading recent quick sessions…" />;
    } else if (error) {
        body = <LoadingState variant="section" error={error} onRetry={onRetry} />;
    } else if (sessions.length === 0) {
        body = <p className={styles.empty}>Quick sessions you complete will appear here.</p>;
    } else {
        body = (
            // One row, newest first, scrolling sideways when the cards don't fit.
            <ul className={styles.list}>
                {sessions.map((session) => {
                    const names = orderedSessionInstances(session).map((instance) => (
                        instanceActivityName(instance, definitionById.get(instance.activity_definition_id))
                    ));
                    const date = formatDateInTimezone(session.session_start || session.created_at, timezone, DATE_FORMAT);
                    return (
                        <li key={session.id} className={styles.item}>
                            <button
                                type="button"
                                className={styles.card}
                                aria-label={`Log ${names.join(', ')} again (last ${date})`}
                                disabled={names.length === 0}
                                onClick={() => onRepeat(session)}
                            >
                                <span className={styles.date}>{date}</span>
                                {session.pending ? <span className={styles.pending}>Waiting to sync</span> : null}
                                <span className={styles.activities}>
                                    {names.map((name, index) => (
                                        // The same activity may be logged twice.
                                        <span key={`${name}-${index}`} className={styles.activity}>{name}</span>
                                    ))}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        );
    }

    return (
        <StepContainer className={styles.container}>
            <StepHeader
                stepNumber={stepNumber}
                title="Recent Quick Sessions"
                subtitle="Your latest quick session for each distinct set of activities. Pick one to log the same activities, with last time's values in each field."
            />
            {body}
        </StepContainer>
    );
}

export default RecentQuickSessions;
