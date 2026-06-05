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
import { isSMART } from '../../utils/smartHelpers';
import CardCornerActionButton from '../common/CardCornerActionButton';
import CompletionCheckBadge from '../common/CompletionCheckBadge';
import GoalNameBadge from '../common/GoalNameBadge';
import MetaField from '../common/MetaField';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { useRootProgressSettings } from '../../hooks/useRootProgressSettings';
import { useEffectiveDeltaDisplayMode } from '../../hooks/useEffectiveDeltaDisplayMode';
import SessionSectionGrid from './SessionSectionGrid';
import ActivityCard from './ActivityCard';
import styles from './SessionCardExpanded.module.css';
import {
    getTemplateColor,
    isQuickSession,
} from '../../utils/sessionRuntime';

const GOAL_LEVEL_ORDER = {
    UltimateGoal: 0,
    LongTermGoal: 1,
    MidTermGoal: 2,
    ShortTermGoal: 3,
    ImmediateGoal: 4,
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

function getGoalChildren(goal) {
    return Array.isArray(goal?.children) ? goal.children : [];
}

function getGoalLevelRank(goal) {
    const explicitRank = goal?.level_rank ?? goal?.attributes?.level_rank;
    if (Number.isFinite(explicitRank)) return explicitRank;
    return GOAL_LEVEL_ORDER[getGoalType(goal)] ?? Number.MAX_SAFE_INTEGER;
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

const AccomplishmentsSection = memo(function AccomplishmentsSection({
    completedGoals,
    getGoalColor,
    getGoalSecondaryColor,
    getGoalIcon,
    completedGoalColor,
    completedGoalSecondaryColor
}) {
    if (completedGoals.length === 0) {
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
                    const iconColor = completedGoalColor || goalColor;
                    const iconSecondaryColor = completedGoalSecondaryColor || goalSecondaryColor;

                    return (
                        <GoalNameBadge
                            key={getGoalId(goal) || `${goalType}-${getGoalName(goal)}`}
                            className={styles.accomplishmentBadge}
                            goal={goal}
                            label={getGoalName(goal)}
                            color={iconColor}
                            secondaryColor={iconSecondaryColor}
                            shape={getGoalIcon(goal)}
                            isSmart={isSMART(goal)}
                            iconSize={16}
                        />
                    );
                })}
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
    const { progressSettings } = useRootProgressSettings(rootId);
    const deltaDisplayMode = useEffectiveDeltaDisplayMode(null, progressSettings);
    const sessionData = session.attributes?.session_data;
    const quickSession = isQuickSession(session);
    const templateColor = getTemplateColor(session);
    const sessionCompleted = Boolean(session.completed ?? session.attributes?.completed);
    const sessionPaused = Boolean(session.is_paused ?? session.attributes?.is_paused);
    const sessionInProgress = !sessionCompleted && !sessionPaused;
    let sessionStatusLabel = 'In-progress session';
    if (sessionPaused) {
        sessionStatusLabel = 'Paused session';
    } else if (sessionCompleted) {
        sessionStatusLabel = 'Completed session';
    }
    const sessionStart = sessionData?.session_start || session?.session_start || session?.attributes?.session_start;
    const sessionEnd = sessionData?.session_end || session?.session_end || session?.attributes?.session_end;
    const programInfo = session.program_info || null;
    const programColor = programInfo?.program_color || 'var(--color-brand-primary)';
    const blockColor = programInfo?.block_color || programColor;
    const completedGoalColor = getGoalColor('Completed');
    const completedGoalSecondaryColor = getGoalSecondaryColor('Completed');
    const completedSessionGoals = Array.isArray(session.completed_goals) ? session.completed_goals : [];

    const completedGoals = useMemo(() => {
        return collectUniqueGoals(completedSessionGoals)
            .sort((goalA, goalB) => {
                const levelA = getGoalLevelRank(goalA);
                const levelB = getGoalLevelRank(goalB);
                if (levelA !== levelB) return levelA - levelB;
                return getGoalName(goalA).localeCompare(getGoalName(goalB));
            });
    }, [completedSessionGoals]);

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
                            style={sessionData?.template_name ? {
                                borderColor: templateColor,
                                color: templateColor,
                                background: `color-mix(in srgb, ${templateColor} 14%, transparent)`,
                            } : undefined}
                        >
                            {session.name}
                        </Link>
                        <CompletionCheckBadge
                            checked={sessionCompleted}
                            inProgress={sessionInProgress}
                            paused={sessionPaused}
                            label={sessionStatusLabel}
                        />
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
                    {programInfo ? (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <Link
                                to={`/${rootId}/programs/${programInfo.program_id}`}
                                className={styles.programLink}
                                style={{
                                    color: programColor,
                                    '--program-link-color': programColor,
                                }}
                            >
                                {programInfo.program_name}
                            </Link>
                            <span className={styles.programSubtext}>
                                <span
                                    className={styles.programBlockName}
                                    style={{ color: blockColor }}
                                >
                                    {programInfo.block_name}
                                </span>
                                <span className={styles.programSeparator}> • </span>
                                <span>{programInfo.day_name}</span>
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
                getGoalColor={getGoalColor}
                getGoalSecondaryColor={getGoalSecondaryColor}
                getGoalIcon={getGoalIcon}
                completedGoalColor={completedGoalColor}
                completedGoalSecondaryColor={completedGoalSecondaryColor}
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
                                        deltaDisplayMode={deltaDisplayMode}
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
                            deltaDisplayMode={deltaDisplayMode}
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
