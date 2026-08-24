import React from 'react';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { formatDurationSeconds } from '../../utils/formatters';
import GoalHierarchyList from '../goals/GoalHierarchyList';
import { useProgramGoalsHierarchyViewModel } from '../../hooks/useProgramGoalsHierarchyViewModel';
import styles from './ProgramSidebar.module.css';

function ProgramSidebar({
    program = null,
    programMetrics,
    activeBlock,
    blockMetrics,
    programGoalSeeds, // Top level goals to display
    onGoalClick, // (goal) => ...
    getGoalDetails, // Function to get full goal details by ID (needed for children)
    compact = false,
    hideMetricsHeader = false,
    hideMetrics = false,
    hideGoals = false,
    hideGoalsHeader = false,
    flushMetricsPadding = false,
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

    return (
        <div className={`${styles.sidebar} ${compact ? styles.compactSidebar : ''} ${flushMetricsPadding ? styles.flushMetricsPadding : ''} ${className}`}>
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
                                            {programMetrics.adherence.rate == null ? '—' : `${Math.round(programMetrics.adherence.rate * 100)}%`} {programMetrics.adherence.mode === 'density' ? 'Active-day Density' : 'Adherence'}
                                        </div>
                                        <div><span className={styles.metricLabel}>Alignment:</span> {programMetrics.alignment.duration_seconds.rate == null ? '—' : `${Math.round(programMetrics.alignment.duration_seconds.rate * 100)}%`}</div>
                                        <div><span className={styles.metricLabel}>Current streak:</span> {programMetrics.adherence.current_streak} days</div>
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
                                        {blockMetrics.adherence ? `${blockMetrics.adherence.met_days} / ${blockMetrics.adherence.scheduled_days_observed} Days Met` : `${blockMetrics.daysRemaining} Days Remaining`}
                                    </div>
                                    <div><span className={styles.metricLabel}>Alignment:</span> {blockMetrics.alignment ? (blockMetrics.alignment.duration_seconds.rate == null ? '—' : `${Math.round(blockMetrics.alignment.duration_seconds.rate * 100)}%`) : `${blockMetrics.completedProgramDays ?? blockMetrics.completedSessions} / ${blockMetrics.scheduledProgramDays ?? blockMetrics.scheduledSessions}`}</div>
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
                    <div className={styles.goalsScroll}>
                        <GoalHierarchyList
                            variant="session"
                            nodes={hierarchyNodes}
                            onGoalClick={onGoalClick}
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
