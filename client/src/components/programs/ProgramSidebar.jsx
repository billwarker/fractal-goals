import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Draggable } from '@fullcalendar/interaction';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { formatDurationSeconds } from '../../utils/formatters';
import GoalDueText from '../goals/GoalDueText';
import GoalHierarchyList from '../goals/GoalHierarchyList';
import { useProgramGoalsHierarchyViewModel } from '../../hooks/useProgramGoalsHierarchyViewModel';
import { hideCompletedBranches } from '../../utils/goalHierarchyFilters';
import styles from './ProgramSidebar.module.css';

function ProgramSidebar({
    program = null,
    programMetrics,
    activeBlock,
    blockMetrics,
    programGoalSeeds, // Top level goals to display
    onGoalClick, // (goal) => ...
    getGoalDetails, // Function to get full goal details by ID (needed for children)
    onStartSubGoalCreation = null, // (parentGoal) => opens goal creation under the scoped goal
    justCreatedGoalId = null,
    defaultShowCompleted = false,
    dueToday = null, // The user's today (YYYY-MM-DD): shows each open goal's due chip on the left.
    dueDragEnabled = false, // Open goals can be dragged onto a calendar day to set their due date.
    compact = false,
    hideMetricsHeader = false,
    hideMetrics = false,
    hideGoals = false,
    hideGoalsHeader = false,
    flushMetricsPadding = false,
    embedded = false, // Flows inside another scroller (the calendar overview) without its own frame.
    className = ''
}) {
    const {
        getGoalColor,
        getGoalSecondaryColor,
        getGoalIcon,
        getLevelByName,
    } = useGoalLevels();
    const hierarchyNodes = useProgramGoalsHierarchyViewModel({
        goalSeeds: programGoalSeeds,
        getGoalDetails,
        startDate: program?.start_date,
        endDate: program?.end_date,
    });
    const isAuthoritativeMetrics = Boolean(programMetrics?.calculation_version);
    // A goal's icon scopes the hierarchy to it; the scoped goal offers "+" to add a child.
    const [scopedGoalId, setScopedGoalId] = useState(null);
    const [showCompleted, setShowCompleted] = useState(defaultShowCompleted);
    const visibleNodes = useMemo(
        () => (showCompleted ? hierarchyNodes : hideCompletedBranches(hierarchyNodes)),
        [hierarchyNodes, showCompleted],
    );
    const hasCompleted = hierarchyNodes.length !== hideCompletedBranches(hierarchyNodes).length;
    const canCreate = Boolean(onStartSubGoalCreation);
    const goalsListRef = useRef(null);
    useEffect(() => {
        if (!dueDragEnabled || !goalsListRef.current) return undefined;
        // The calendar receives these as external drops; nothing is added as an event.
        const draggable = new Draggable(goalsListRef.current, {
            itemSelector: '[data-goal-due-drag="true"]',
            minDistance: 6,
            eventData: (element) => ({ title: element.dataset.goalName || '', create: false }),
        });
        return () => draggable.destroy();
    }, [dueDragEnabled]);

    return (
        <div className={`${styles.sidebar} ${compact ? styles.compactSidebar : ''} ${flushMetricsPadding ? styles.flushMetricsPadding : ''} ${embedded ? styles.embedded : ''} ${className}`}>
            {/* Fixed Top Section */}
            {!hideMetrics && (
                <div className={`${styles.topSection} ${compact ? styles.compactTopSection : ''}`}>
                    <div className={styles.metricsScroll}>
                        {/* Program Metrics Section */}
                        {programMetrics && (
                            <div className={`${styles.metricsBlock} ${compact ? styles.compactMetricsBlock : ''}`}>
                                {hideMetricsHeader ? null : <h3 className={styles.sectionHeader}>Program Metrics</h3>}
                                {isAuthoritativeMetrics ? (
                                    <div className={styles.metricsList}>
                                        <div className={styles.metricValuePrimary}>
                                            {programMetrics.consistency.rate == null ? '—' : `${Math.round(programMetrics.consistency.rate * 100)}%`} {programMetrics.consistency.mode === 'density' ? 'Active-day Density' : 'Consistency'}
                                        </div>
                                        <div><span className={styles.metricLabel}>Goals completed:</span> {programMetrics.outcomes.goals_completed_in_window} / {programMetrics.outcomes.goals_in_scope}</div>
                                        <div><span className={styles.metricLabel}>Current streak:</span> {programMetrics.consistency.current_streak} days</div>
                                        <div><span className={styles.metricLabel}>Program progress:</span> {programMetrics.program.progress.rate == null ? '—' : `${Math.round(programMetrics.program.progress.rate * 100)}%`}</div>
                                    </div>
                                ) : <div className={styles.metricsList}>
                                    <div className={styles.metricValuePrimary}>
                                        {programMetrics.primaryMetricValue ?? programMetrics.daysRemaining} {programMetrics.primaryMetricLabel || 'Days Remaining'}
                                    </div>
                                    <div><span className={styles.metricLabel}>Program Days:</span> {programMetrics.completedProgramDays ?? programMetrics.completedSessions} / {programMetrics.scheduledProgramDays ?? programMetrics.scheduledSessions}</div>
                                    <div><span className={styles.metricLabel}>Duration:</span> {formatDurationSeconds ? formatDurationSeconds(programMetrics.totalDuration) : Math.round(programMetrics.totalDuration / 60) + ' min'}</div>
                                    <div><span className={styles.metricLabel}>Goals:</span> {programMetrics.goalsMet} / {programMetrics.totalGoals}</div>
                                </div>}
                            </div>
                        )}

                        {/* Current Block Metrics Section */}
                        {activeBlock && blockMetrics && (
                            <div className={`${styles.metricsBlock} ${compact ? styles.compactMetricsBlock : ''}`}>
                                <h3 className={styles.sectionHeader}>Current Block Metrics</h3>
                                <div className={styles.metricsList}>
                                    <div className={styles.metricValuePrimary} style={{ color: blockMetrics.color }}>
                                        {blockMetrics.consistency ? `${blockMetrics.consistency.met_days} / ${blockMetrics.consistency.scheduled_days_observed} Days Met` : `${blockMetrics.daysRemaining} Days Remaining`}
                                    </div>
                                    <div><span className={styles.metricLabel}>Goals completed:</span> {blockMetrics.goals ? `${blockMetrics.goals.completed} / ${blockMetrics.goals.due}` : `${blockMetrics.goalsMet ?? 0} / ${blockMetrics.totalGoals ?? 0}`}</div>
                                    <div><span className={styles.metricLabel}>Duration:</span> {formatDurationSeconds(blockMetrics.linked_duration_seconds ?? blockMetrics.totalDuration)}</div>
                                    <div><span className={styles.metricLabel}>Linked sessions:</span> {blockMetrics.linked_sessions ?? blockMetrics.completedSessions}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Scrollable Bottom Section */}
            {!hideGoals && (
                <div className={styles.bottomSection}>
                    {hideGoalsHeader ? null : <h3 className={styles.sectionHeader}>Program Goals</h3>}
                    {(hasCompleted || showCompleted || canCreate) && hierarchyNodes.length > 0 ? (
                        <div className={styles.goalsToolbar}>
                            {canCreate ? (
                                <p className={styles.goalsHint}>
                                    {scopedGoalId ? 'Use + to add a goal under it.' : 'Select a goal’s icon to add a goal under it.'}
                                    {dueDragEnabled ? ' Drag a goal onto a day to set its due date.' : ''}
                                </p>
                            ) : <span />}
                            {hasCompleted || showCompleted ? (
                                <label className={styles.showCompleted}>
                                    <input
                                        type="checkbox"
                                        checked={showCompleted}
                                        onChange={(event) => setShowCompleted(event.target.checked)}
                                    />
                                    Show completed
                                </label>
                            ) : null}
                        </div>
                    ) : null}
                    <div ref={goalsListRef} className={styles.goalsScroll}>
                        <GoalHierarchyList
                            getGoalRowAttributes={dueDragEnabled ? (goal) => (
                                (goal.completed ?? goal.attributes?.completed) ? null : {
                                    'data-goal-due-drag': 'true',
                                    'data-goal-name': goal.name,
                                }
                            ) : undefined}
                            getGoalRightSlot={dueToday ? (goal) => (
                                (goal.completed ?? goal.attributes?.completed) ? null : (
                                    <GoalDueText
                                        deadline={goal.deadline ?? goal.attributes?.deadline}
                                        today={dueToday}
                                    />
                                )
                            ) : undefined}
                            variant="session"
                            nodes={visibleNodes}
                            onGoalClick={onGoalClick}
                            onGoalIconClick={canCreate
                                ? (goal) => setScopedGoalId((current) => (String(current) === String(goal.id) ? null : String(goal.id)))
                                : undefined}
                            isGoalIconSelected={(goal) => String(goal.id) === String(scopedGoalId)}
                            getGoalIconActionLabel={(goal, selected) => (selected ? `Clear scope for ${goal.name}` : `Scope to ${goal.name}`)}
                            showGoalHighlightHalo={canCreate}
                            onStartSubGoalCreation={onStartSubGoalCreation || undefined}
                            justCreatedGoalId={justCreatedGoalId}
                            getScopedCharacteristics={getLevelByName}
                            getGoalColor={getGoalColor}
                            getGoalSecondaryColor={getGoalSecondaryColor}
                            getGoalIcon={getGoalIcon}
                            completedColor={getGoalColor('Completed')}
                            completedSecondaryColor={getGoalSecondaryColor('Completed')}
                            emptyState="No goals associated"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default ProgramSidebar;
