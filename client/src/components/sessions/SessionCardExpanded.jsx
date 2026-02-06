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
 * Goals section - displays all associated goals
 */
const GoalsSection = memo(function GoalsSection({
    allGoals,
    getGoalColor
}) {
    if (allGoals.length === 0) {
        return null;
    }

    return (
        <div className={styles.goalsSection}>
            <div className={styles.goalsColumn}>
                <div className={styles.fieldLabel} style={{ fontSize: '10px', letterSpacing: '0.03em', marginBottom: '6px' }}>
                    Associated Goals
                </div>
                <div className={styles.goalsList}>
                    {allGoals.map(goal => {
                        const goalColor = getGoalColor(goal.type || 'ShortTermGoal');
                        return (
                            <div
                                key={goal.id}
                                className={`${styles.goalTag} ${(goal.completed || goal.attributes?.completed) ? styles.goalTagCompleted : ''}`}
                                style={{
                                    border: `1px solid ${goalColor}`,
                                    color: goalColor
                                }}
                            >
                                {goal.name}
                                {(goal.completed || goal.attributes?.completed) && (
                                    <span className={styles.checkMark}>✓</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
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

    // Calculate all associated goals (including from activities)
    const allGoals = useMemo(() => {
        const seenIds = new Set();
        const goals = [];

        // Helper to add goal if not already added
        const addGoal = (goal) => {
            if (goal && !seenIds.has(goal.id)) {
                seenIds.add(goal.id);
                goals.push(goal);
            }
        };

        // 1. Direct session goals (short-term and immediate)
        shortTermGoals.forEach(addGoal);
        immediateGoals.forEach(addGoal);

        // 2. Goals from activities in the session
        // Extract activity definition IDs from session sections
        const activityDefIds = new Set();
        if (sessionData?.sections) {
            sessionData.sections.forEach(section => {
                if (section.activity_ids) {
                    // activity_ids contains instance IDs, but for legacy sessions we may have activity_id in exercises
                    section.activity_ids.forEach(id => activityDefIds.add(id));
                }
                if (section.exercises) {
                    section.exercises.forEach(ex => {
                        if (ex.activity_id) activityDefIds.add(ex.activity_id);
                    });
                }
            });
        }

        // Find matching definitions and their associated goals
        // Note: activities prop contains activity definitions
        activityDefIds.forEach(defId => {
            const def = activities?.find(d => d.id === defId);
            if (def && def.associated_goal_ids) {
                def.associated_goal_ids.forEach(goalId => {
                    // Try to find the goal object
                    let goalObj = shortTermGoals.find(g => g.id === goalId);
                    if (!goalObj) goalObj = immediateGoals.find(g => g.id === goalId);
                    if (goalObj) {
                        addGoal(goalObj);
                    }
                });
            }
        });

        return goals;
    }, [shortTermGoals, immediateGoals, sessionData?.sections, activities]);

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
                allGoals={allGoals}
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
