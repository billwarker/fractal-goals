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
import GoalIcon from '../atoms/GoalIcon';
import { useTheme } from '../../contexts/ThemeContext';
import SessionSectionGrid from './SessionSectionGrid';
import styles from './SessionCardExpanded.module.css';

const AccomplishmentsSection = memo(function AccomplishmentsSection({
    completedGoals,
    getGoalColor,
    getScopedCharacteristics
}) {
    if (completedGoals.length === 0) {
        return null;
    }

    const completionColor = getGoalColor('Completed');

    return (
        <div className={styles.goalsSection}>
            <div className={styles.goalsColumn}>
                <div className={styles.fieldLabel} style={{ fontSize: '10px', letterSpacing: '0.03em', marginBottom: '8px' }}>
                    Completed Goals
                </div>
                <div className={styles.goalsList} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {/* Completed Goals */}
                    {completedGoals.map(goal => {
                        const originalShape = getScopedCharacteristics(goal.type || goal.attributes?.type)?.icon || 'circle';
                        return (
                            <div
                                key={goal.id}
                                className={`${styles.goalTag} ${styles.goalTagCompleted}`}
                                style={{
                                    border: `1px solid ${completionColor}`,
                                    color: completionColor,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    paddingLeft: '6px'
                                }}
                            >
                                <GoalIcon shape={originalShape} color={completionColor} size={14} />
                                <span style={{ fontWeight: 500 }}>{goal.name}</span>
                            </div>
                        );
                    })}
                </div>
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
    const { getScopedCharacteristics } = useTheme();
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

    const achievedTargets = useMemo(() => {
        const allAchievables = [...shortTermGoals, ...immediateGoals];
        const allAchieved = getAchievedTargetsForSession(session, allAchievables);
        // Filter specifically for targets achieved in THIS session (relational check)
        return allAchieved.filter(achieved => {
            // Check if it's explicitly linked to this session
            if (achieved.target.completed_session_id === session.id) return true;

            // Or if it was calculated as achieved in this session by front-end logic 
            // and is currently marked as completed.
            return achieved.target.completed;
        });
    }, [session, shortTermGoals]);

    const completedGoals = useMemo(() => {
        // Goals are accomplishments if they are completed AND 
        // they triggered because of a target or activity in this session
        const sessionTargetGoalIds = new Set(achievedTargets.map(t => t.goalId));

        return allGoals.filter(goal => {
            const isCompleted = goal.completed || goal.attributes?.completed;
            if (!isCompleted) return false;

            // Relational check: Was this goal's target achieved in this session?
            if (sessionTargetGoalIds.has(goal.id)) return true;

            // Check children
            const childAchieved = goal.children?.some(child => sessionTargetGoalIds.has(child.id));
            if (childAchieved) return true;

            return false;
        });
    }, [allGoals, achievedTargets]);

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

            {/* Session Accomplishments Section */}
            <AccomplishmentsSection
                completedGoals={completedGoals}
                getGoalColor={getGoalColor}
                getScopedCharacteristics={getScopedCharacteristics}
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
