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
import { isSMART } from '../../utils/smartHelpers';
import GoalIcon from '../atoms/GoalIcon';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import SessionSectionGrid from './SessionSectionGrid';
import styles from './SessionCardExpanded.module.css';

const GOAL_LEVEL_ORDER = {
    UltimateGoal: 0,
    LongTermGoal: 1,
    MidTermGoal: 2,
    ShortTermGoal: 3,
    ImmediateGoal: 4,
    MicroGoal: 5,
    NanoGoal: 6,
};

function getGoalId(goal) {
    return goal?.id ?? goal?.attributes?.id ?? null;
}

function getGoalType(goal) {
    return goal?.type ?? goal?.attributes?.type ?? null;
}

function getGoalName(goal) {
    return goal?.name ?? goal?.attributes?.name ?? '';
}

function getGoalCompletedAt(goal) {
    return goal?.completed_at ?? goal?.attributes?.completed_at ?? null;
}

function getGoalChildren(goal) {
    return Array.isArray(goal?.children) ? goal.children : [];
}

function collectUniqueGoals(goals) {
    const seenIds = new Set();
    const collected = [];

    const visit = (goal) => {
        if (!goal) return;

        const goalId = getGoalId(goal);
        if (goalId && seenIds.has(goalId)) return;
        if (goalId) seenIds.add(goalId);
        collected.push(goal);

        getGoalChildren(goal).forEach(visit);
    };

    goals.forEach(visit);
    return collected;
}

function isTimestampWithinSession(timestamp, sessionStart, sessionEnd) {
    if (!timestamp || !sessionStart || !sessionEnd) return false;

    const targetTime = new Date(timestamp).getTime();
    const startTime = new Date(sessionStart).getTime();
    const endTime = new Date(sessionEnd).getTime();

    if ([targetTime, startTime, endTime].some(Number.isNaN)) return false;
    return targetTime >= startTime && targetTime <= endTime;
}

const AccomplishmentsSection = memo(function AccomplishmentsSection({
    completedGoals,
    nanoGoalsCompleted,
    getGoalColor,
    getGoalSecondaryColor,
    getGoalIcon
}) {
    const hasCompletedGoals = completedGoals.length > 0;
    const hasNanoGoals = nanoGoalsCompleted > 0;

    if (!hasCompletedGoals && !hasNanoGoals) {
        return null;
    }

    return (
        <div className={styles.accomplishmentsSection}>
            <div className={styles.accomplishmentsLabel}>Completed in Session</div>
            <div className={styles.accomplishmentsList}>
                {completedGoals.map((goal) => {
                    const goalType = getGoalType(goal);
                    const goalColor = getGoalColor(goal);
                    const goalSecondaryColor = getGoalSecondaryColor(goal);

                    return (
                        <div
                            key={getGoalId(goal) || `${goalType}-${getGoalName(goal)}`}
                            className={styles.accomplishmentChip}
                            style={{ '--accomplishment-color': goalColor }}
                        >
                            <GoalIcon
                                shape={getGoalIcon(goal)}
                                color={goalColor}
                                secondaryColor={goalSecondaryColor}
                                isSmart={isSMART(goal)}
                                size={16}
                            />
                            <span className={styles.accomplishmentText}>{getGoalName(goal)}</span>
                        </div>
                    );
                })}
                {hasNanoGoals && (
                    <div
                        className={styles.accomplishmentChip}
                        style={{ '--accomplishment-color': getGoalColor('NanoGoal') }}
                    >
                        <GoalIcon
                            shape={getGoalIcon('NanoGoal')}
                            color={getGoalColor('NanoGoal')}
                            secondaryColor={getGoalSecondaryColor('NanoGoal')}
                            size={16}
                        />
                        <span className={styles.accomplishmentText}>
                            {nanoGoalsCompleted} Nano Goal{nanoGoalsCompleted === 1 ? '' : 's'} Completed
                        </span>
                    </div>
                )}
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
    sessionActivityInstances = [],
    isSelected,
    onSelect,
    getGoalColor,
    formatDate
}) {
    const { getGoalIcon, getGoalSecondaryColor } = useGoalLevels();
    const sessionData = session.attributes?.session_data;
    const sessionStart = sessionData?.session_start || session?.session_start || session?.attributes?.session_start;
    const sessionEnd = sessionData?.session_end || session?.session_end || session?.attributes?.session_end || session?.attributes?.updated_at || session?.updated_at;
    const shortTermGoals = session.short_term_goals || [];
    const immediateGoals = session.immediate_goals || [];
    const microGoals = session.micro_goals || [];

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
        microGoals.forEach(addGoal);

        // 2. Goals from activity definitions currently used in this session
        const activityDefIds = new Set(
            sessionActivityInstances
                .map((instance) => instance.activity_definition_id)
                .filter(Boolean)
        );

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

        return collectUniqueGoals(goals);
    }, [shortTermGoals, immediateGoals, microGoals, sessionActivityInstances, activities]);

    const achievedTargets = useMemo(() => {
        const allAchievables = [...shortTermGoals, ...immediateGoals, ...microGoals];
        const allAchieved = getAchievedTargetsForSession(session, allAchievables);
        // Filter specifically for targets achieved in THIS session (relational check)
        return allAchieved.filter(achieved => {
            // Check if it's explicitly linked to this session
            if (achieved.target.completed_session_id === session.id) return true;

            // Or if it was calculated as achieved in this session by front-end logic 
            // and is currently marked as completed.
            return achieved.target.completed;
        });
    }, [session, shortTermGoals, immediateGoals, microGoals]);

    const { completedGoals, nanoGoalsCompleted } = useMemo(() => {
        const sessionTargetGoalIds = new Set(achievedTargets.map((target) => String(target.goalId)));

        const directlyCompletedGoalIds = new Set(
            allGoals
                .filter((goal) => {
                    const goalId = getGoalId(goal);
                    const isCompleted = goal.completed || goal.attributes?.completed;
                    if (!goalId || !isCompleted) return false;

                    const completedSessionId = goal.completed_session_id || goal.attributes?.completed_session_id;
                    const isExplicitlyLinked = completedSessionId != null && String(completedSessionId) === String(session.id);

                    return isExplicitlyLinked
                        || sessionTargetGoalIds.has(String(goalId))
                        || isTimestampWithinSession(getGoalCompletedAt(goal), sessionStart, sessionEnd);
                })
                .map((goal) => String(getGoalId(goal)))
        );

        const hasCompletedDescendant = (goal) => (
            getGoalChildren(goal).some((child) => {
                const childId = getGoalId(child);
                return (childId && directlyCompletedGoalIds.has(String(childId))) || hasCompletedDescendant(child);
            })
        );

        const completed = allGoals
            .filter((goal) => {
                const goalId = getGoalId(goal);
                const isCompleted = goal.completed || goal.attributes?.completed;
                if (!goalId || !isCompleted) return false;

                return directlyCompletedGoalIds.has(String(goalId)) || hasCompletedDescendant(goal);
            })
            .sort((goalA, goalB) => {
                const levelA = GOAL_LEVEL_ORDER[getGoalType(goalA)] ?? Number.MAX_SAFE_INTEGER;
                const levelB = GOAL_LEVEL_ORDER[getGoalType(goalB)] ?? Number.MAX_SAFE_INTEGER;
                if (levelA !== levelB) return levelA - levelB;
                return getGoalName(goalA).localeCompare(getGoalName(goalB));
            });

        const completedNanoGoalIds = new Set(
            completed
                .filter((goal) => getGoalType(goal) === 'NanoGoal')
                .map((goal) => getGoalId(goal))
                .filter(Boolean)
                .map(String)
        );

        const completedNanoNotes = Array.isArray(session.notes)
            ? session.notes.filter((note) => note?.is_nano_goal && note?.nano_goal_completed)
            : [];

        let nanoCount = completedNanoGoalIds.size;
        completedNanoNotes.forEach((note) => {
            const noteGoalId = note.nano_goal_id ? String(note.nano_goal_id) : null;
            if (noteGoalId && completedNanoGoalIds.has(noteGoalId)) return;
            nanoCount += 1;
        });

        return {
            completedGoals: completed.filter((goal) => getGoalType(goal) !== 'NanoGoal'),
            nanoGoalsCompleted: nanoCount,
        };
    }, [achievedTargets, allGoals, session.notes, sessionEnd, sessionStart]);

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
                <div className={styles.topTitleBlock}>
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
                <div className={styles.metaItem}>
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
                <div className={styles.metaItem}>
                    <div className={styles.fieldLabel}>Session Start</div>
                    {sessionStart ? (
                        <div className={styles.fieldValue}>{formatDate(sessionStart)}</div>
                    ) : (
                        <div className={styles.fieldValueMuted}>-</div>
                    )}
                </div>

                {/* Session End */}
                <div className={styles.metaItem}>
                    <div className={styles.fieldLabel}>Session End</div>
                    {sessionEnd ? (
                        <div className={styles.fieldValue}>{formatDate(sessionEnd)}</div>
                    ) : (
                        <div className={styles.fieldValueMuted}>-</div>
                    )}
                </div>

                {/* Last Modified */}
                <div className={styles.metaItem}>
                    <div className={styles.fieldLabel}>Last Modified</div>
                    <div className={styles.fieldValue}>{formatDate(session.attributes?.updated_at)}</div>
                </div>

                {/* Duration */}
                <div className={styles.metaItem}>
                    <div className={styles.fieldLabel}>Duration</div>
                    <div className={styles.fieldValue} style={{ fontWeight: 500 }}>{duration}</div>
                </div>

                {/* Template */}
                <div className={styles.metaItem}>
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
                nanoGoalsCompleted={nanoGoalsCompleted}
                getGoalColor={getGoalColor}
                getGoalSecondaryColor={getGoalSecondaryColor}
                getGoalIcon={getGoalIcon}
            />

            {/* Bottom Level: Session data with horizontal sections */}
            <div className={styles.cardBottomLevel}>
                {sessionData?.sections && sessionData.sections.length > 0 ? (
                    <>
                        <SessionSectionGrid
                            sections={sessionData.sections}
                            activities={activities}
                            activityInstances={sessionActivityInstances}
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
