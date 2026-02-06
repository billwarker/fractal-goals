/**
 * SessionCardExpanded - Full session card with all details
 * 
 * Displays session header, goals, targets achieved, and sections/exercises.
 * This is the main session card component for the Sessions page.
 * Optimized with React.memo for list rendering performance.
 */

import React, { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { formatDuration, calculateSessionDuration } from '../../hooks/useSessionDuration';
import { getAchievedTargetsForSession } from '../../utils/targetUtils';
import { formatDateInTimezone } from '../../utils/dateUtils';
import SessionSectionGrid from './SessionSectionGrid';
import styles from './SessionCardExpanded.module.css';

/**
 * Goals section - displays short-term and immediate goals
 */
const GoalsSection = memo(function GoalsSection({
    shortTermGoals,
    immediateGoals,
    getGoalColor
}) {
    if (shortTermGoals.length === 0 && immediateGoals.length === 0) {
        return null;
    }

    return (
        <div className={styles.goalsSection}>
            {/* Short-Term Goals Group */}
            {shortTermGoals.length > 0 && (
                <div className={styles.goalsColumn}>
                    <div className={styles.fieldLabel} style={{ fontSize: '10px', letterSpacing: '0.03em', marginBottom: '6px' }}>
                        Short-Term Goals
                    </div>
                    <div className={styles.goalsList}>
                        {shortTermGoals.map(goal => (
                            <div
                                key={goal.id}
                                className={styles.goalTag}
                                style={{
                                    border: `1px solid ${getGoalColor('ShortTermGoal')}`,
                                    color: getGoalColor('ShortTermGoal')
                                }}
                            >
                                {goal.name}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Immediate Goals Group */}
            {immediateGoals.length > 0 && (
                <div className={styles.goalsColumn}>
                    <div className={styles.fieldLabel} style={{ fontSize: '10px', letterSpacing: '0.03em', marginBottom: '6px' }}>
                        Immediate Goals
                    </div>
                    <div className={styles.goalsList}>
                        {immediateGoals.map(goal => (
                            <div
                                key={goal.id}
                                className={`${styles.goalTag} ${(goal.completed || goal.attributes?.completed) ? styles.goalTagCompleted : ''}`}
                                style={{
                                    border: `1px solid ${getGoalColor('ImmediateGoal')}`,
                                    color: getGoalColor('ImmediateGoal')
                                }}
                            >
                                {goal.name}
                                {(goal.completed || goal.attributes?.completed) && (
                                    <span className={styles.checkMark}>✓</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
});

/**
 * Achieved targets section
 */
const AchievedTargetsSection = memo(function AchievedTargetsSection({
    session,
    shortTermGoals
}) {
    const achievedTargets = useMemo(() =>
        getAchievedTargetsForSession(session, shortTermGoals),
        [session, shortTermGoals]
    );

    if (achievedTargets.length === 0) return null;

    return (
        <div className={styles.achievedSection}>
            <div className={styles.achievedHeader}>
                🎯 Targets Achieved ({achievedTargets.length}):
            </div>
            <div className={styles.goalsList}>
                {achievedTargets.map((achieved, idx) => (
                    <div key={idx} className={styles.achievedTag}>
                        <span>✓</span>
                        <span>{achieved.target.name || 'Target'}</span>
                        <span style={{ fontSize: '10px', opacity: 0.8 }}>({achieved.goalName})</span>
                    </div>
                ))}
            </div>
        </div>
    );
});

/**
 * Main SessionCardExpanded component
 */
const SessionCardExpanded = memo(function SessionCardExpanded({
    session,
    rootId,
    activities,
    isSelected,
    onSelect,
    getGoalColor,
    timezone,
    formatDate
}) {
    const sessionData = session.attributes?.session_data;
    const shortTermGoals = session.short_term_goals || [];
    const immediateGoals = session.immediate_goals || [];

    // Memoize duration calculation
    const duration = useMemo(() => {
        const seconds = calculateSessionDuration(session);
        return formatDuration(seconds);
    }, [session]);

    const handleClick = () => {
        onSelect?.(session.id);
    };

    return (
        <div
            id={`session-card-${session.id}`}
            onClick={handleClick}
            className={`${styles.sessionCard} ${isSelected ? styles.sessionCardSelected : ''}`}
        >
            {/* Top Level: High-level session info */}
            <div className={styles.cardTopLevel}>
                {/* Session Name (Link) */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Link
                            to={`/${rootId}/session/${session.id}`}
                            className={styles.cardHeaderTitle}
                        >
                            {session.name}
                        </Link>
                        {session.attributes?.completed && (
                            <span style={{ color: 'var(--color-brand-success)', fontSize: '16px' }}>✓</span>
                        )}
                    </div>
                    {session.attributes?.description && (
                        <div className={styles.cardDescription}>
                            {session.attributes.description}
                        </div>
                    )}
                </div>

                {/* Program */}
                <div>
                    <div className={styles.fieldLabel}>Program</div>
                    {session.program_info ? (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <Link
                                to={`/${rootId}/programs/${session.program_info.program_id}`}
                                className={styles.programLink}
                            >
                                {session.program_info.program_name}
                            </Link>
                            <span className={styles.programSubtext}>
                                {session.program_info.block_name} • {session.program_info.day_name}
                            </span>
                        </div>
                    ) : (
                        <span className={styles.fieldValueMuted}>-</span>
                    )}
                </div>

                {/* Session Start */}
                <div>
                    <div className={styles.fieldLabel}>Session Start</div>
                    {sessionData?.session_start ? (
                        <div className={styles.fieldValue}>{formatDate(sessionData.session_start)}</div>
                    ) : (
                        <div className={styles.fieldValueMuted}>-</div>
                    )}
                </div>

                {/* Session End */}
                <div>
                    <div className={styles.fieldLabel}>Session End</div>
                    {sessionData?.session_end ? (
                        <div className={styles.fieldValue}>{formatDate(sessionData.session_end)}</div>
                    ) : (
                        <div className={styles.fieldValueMuted}>-</div>
                    )}
                </div>

                {/* Last Modified */}
                <div>
                    <div className={styles.fieldLabel}>Last Modified</div>
                    <div className={styles.fieldValue}>{formatDate(session.attributes?.updated_at)}</div>
                </div>

                {/* Duration */}
                <div>
                    <div className={styles.fieldLabel}>Duration</div>
                    <div className={styles.fieldValue} style={{ fontWeight: 500 }}>{duration}</div>
                </div>

                {/* Template */}
                <div>
                    <div className={styles.fieldLabel}>Template</div>
                    {sessionData?.template_name ? (
                        <span className={styles.templateBadge}>
                            {sessionData.template_name}
                        </span>
                    ) : (
                        <span className={styles.fieldValueMuted}>None</span>
                    )}
                </div>
            </div>

            {/* Associated Goals Section */}
            <GoalsSection
                shortTermGoals={shortTermGoals}
                immediateGoals={immediateGoals}
                getGoalColor={getGoalColor}
            />

            {/* Achieved Targets Section */}
            <AchievedTargetsSection
                session={session}
                shortTermGoals={shortTermGoals}
            />

            {/* Bottom Level: Session data with horizontal sections */}
            <div className={styles.cardBottomLevel}>
                {sessionData?.sections && sessionData.sections.length > 0 ? (
                    <>
                        <SessionSectionGrid
                            sections={sessionData.sections}
                            activities={activities}
                        />

                        {/* Session Notes */}
                        {sessionData.notes && (
                            <div className={styles.sessionNotes}>
                                <div className={styles.sessionNotesHeader}>
                                    Session Notes:
                                </div>
                                <div className={styles.sessionNotesBody}>{sessionData.notes}</div>
                            </div>
                        )}
                    </>
                ) : (
                    <p className={styles.emptyState} style={{ padding: '20px', margin: 0 }}>
                        No session data available
                    </p>
                )}
            </div>
        </div>
    );
});

export default SessionCardExpanded;
