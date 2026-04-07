/**
 * SessionCardExpanded - Full session card with all details
 * 
 * Displays session header, goals, targets achieved, and sections/activities.
 * This is the main session card component for the Sessions page.
 * Optimized with React.memo for list rendering performance.
 */

import React, { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { formatDuration, calculateSessionDuration } from '../../hooks/useSessionDuration';
import { getAchievedTargetsForSession } from '../../utils/targetUtils';
import { isSMART } from '../../utils/smartHelpers';
import CardCornerActionButton from '../common/CardCornerActionButton';
import CompletionCheckBadge from '../common/CompletionCheckBadge';
import GoalAccomplishmentChip from '../common/GoalAccomplishmentChip';
import MetaField from '../common/MetaField';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import SessionSectionGrid from './SessionSectionGrid';
import ActivityCard from './ActivityCard';
import styles from './SessionCardExpanded.module.css';
import {
    getReadableTextColor,
    getTemplateColor,
    isQuickSession,
} from '../../utils/sessionRuntime';

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
                        <GoalAccomplishmentChip
                            key={getGoalId(goal) || `${goalType}-${getGoalName(goal)}`}
                            className={styles.accomplishmentChip}
                            label={getGoalName(goal)}
                            color={goalColor}
                            secondaryColor={goalSecondaryColor}
                            shape={getGoalIcon(goal)}
                            isSmart={isSMART(goal)}
                        />
                    );
                })}
                {hasNanoGoals && (
                    <GoalAccomplishmentChip
                        className={styles.accomplishmentChip}
                        label={`${nanoGoalsCompleted} Nano Goal${nanoGoalsCompleted === 1 ? '' : 's'} Completed`}
                        color={getGoalColor('NanoGoal')}
                        secondaryColor={getGoalSecondaryColor('NanoGoal')}
                        shape={getGoalIcon('NanoGoal')}
                    />
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
    onRequestDelete,
    getGoalColor,
    formatDate
}) {
    const { getGoalIcon, getGoalSecondaryColor } = useGoalLevels();
    const sessionData = session.attributes?.session_data;
    const quickSession = isQuickSession(session);
    const templateColor = getTemplateColor(session);
    const templateTextColor = getReadableTextColor(templateColor);
    const sessionStart = sessionData?.session_start || session?.session_start || session?.attributes?.session_start;
    const sessionEnd = sessionData?.session_end || session?.session_end || session?.attributes?.session_end;
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
        if (quickSession && !sessionEnd) {
            return '-';
        }
        const seconds = calculateSessionDuration(session);
        return formatDuration(seconds);
    }, [quickSession, session, sessionEnd]);

    const handleClick = () => {
        onSelect?.(session.id);
    };

    const handleDeleteClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        onRequestDelete?.(session);
    };

    const quickActivities = useMemo(() => {
        if (!quickSession) return [];
        const orderedIds = Array.isArray(sessionData?.activity_ids) ? sessionData.activity_ids : [];
        const instanceMap = new Map((sessionActivityInstances || []).map((instance) => [instance.id, instance]));
        if (orderedIds.length > 0) {
            return orderedIds
                .map((id) => instanceMap.get(id))
                .filter(Boolean)
                .map((instance) => ({
                    ...instance,
                    type: 'activity',
                    activity_id: instance.activity_definition_id,
                    instance_id: instance.id,
                    name: instance.name || 'Activity',
                }));
        }
        return (sessionActivityInstances || []).map((instance) => ({
            ...instance,
            type: 'activity',
            activity_id: instance.activity_definition_id,
            instance_id: instance.id,
            name: instance.name || 'Activity',
        }));
    }, [quickSession, sessionActivityInstances, sessionData?.activity_ids]);

    return (
        <div
            id={`session-card-${session.id}`}
            onClick={handleClick}
            className={`${styles.sessionCard} ${isSelected ? styles.sessionCardSelected : ''}`}
        >
            <CardCornerActionButton
                className={styles.deleteBtn}
                onClick={handleDeleteClick}
                label={`Delete session ${session.name}`}
                title="Delete Session"
            />

            {/* Top Level: High-level session info */}
            <div className={styles.cardTopLevel}>
                {/* Session Name (Link) */}
                <div className={styles.topTitleBlock}>
                    <div className={styles.topTitleRow}>
                        <Link
                            to={quickSession
                                ? `/${rootId}/sessions?quickSessionId=${session.id}`
                                : `/${rootId}/session/${session.id}`}
                            className={`${styles.cardHeaderTitle} ${sessionData?.template_name ? styles.cardHeaderTitleTemplate : ''}`}
                            style={sessionData?.template_name ? { backgroundColor: templateColor, color: templateTextColor } : undefined}
                        >
                            {session.name}
                        </Link>
                        {session.attributes?.completed && (
                            <CompletionCheckBadge />
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
                <MetaField
                    className={styles.metaItem}
                    label="Session Start"
                    value={sessionStart ? formatDate(sessionStart) : '-'}
                    muted={!sessionStart}
                />

                {/* Session End */}
                <MetaField
                    className={styles.metaItem}
                    label="Session End"
                    value={sessionEnd ? formatDate(sessionEnd) : '-'}
                    muted={!sessionEnd}
                />

                {/* Last Modified */}
                <MetaField
                    className={styles.metaItem}
                    label="Last Modified"
                    value={formatDate(session.attributes?.updated_at)}
                />

                {/* Duration */}
                <MetaField
                    className={styles.metaItem}
                    label="Duration"
                    value={duration}
                    emphasize
                />
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
                {quickSession ? (
                    quickActivities.length > 0 ? (
                        <div className={styles.quickActivityList}>
                            {quickActivities.map((activity, index) => {
                                const activityDefinition = activities?.find((entry) => entry.id === activity.activity_id) || null;

                                return (
                                    <ActivityCard
                                        key={activity.instance_id || activity.id || `${activity.name}-${index}`}
                                        activity={activity}
                                        activityDefinition={activityDefinition}
                                    />
                                );
                            })}
                        </div>
                    ) : (
                        <p className={styles.emptyState} style={{ padding: '20px', margin: 0 }}>
                            No activities recorded for this quick session
                        </p>
                    )
                ) : sessionData?.sections && sessionData.sections.length > 0 ? (
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
