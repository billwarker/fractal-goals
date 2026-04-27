import React from 'react';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { formatDurationSeconds } from '../../utils/formatters';
import GoalHierarchyList from '../goals/GoalHierarchyList';
import { useProgramGoalsHierarchyViewModel } from '../../hooks/useProgramGoalsHierarchyViewModel';
import styles from './ProgramSidebar.module.css';

function ProgramSidebar({
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
    });

    return (
        <div className={`${styles.sidebar} ${compact ? styles.compactSidebar : ''} ${className}`}>
            {/* Fixed Top Section */}
            {!hideMetrics && (
                <div className={`${styles.topSection} ${compact ? styles.compactTopSection : ''}`}>
                    <div className={styles.metricsScroll}>
                        {/* Program Metrics Section */}
                        {programMetrics && (
                            <div className={`${styles.metricsBlock} ${compact ? styles.compactMetricsBlock : ''}`}>
                                {hideMetricsHeader ? null : <h3 className={styles.sectionHeader}>Program Metrics</h3>}
                                <div className={styles.metricsList}>
                                    <div className={styles.metricValuePrimary}>
                                        {programMetrics.daysRemaining} Days Remaining
                                    </div>
                                    <div><span className={styles.metricLabel}>Sessions:</span> {programMetrics.completedSessions} / {programMetrics.scheduledSessions}</div>
                                    <div><span className={styles.metricLabel}>Duration:</span> {formatDurationSeconds ? formatDurationSeconds(programMetrics.totalDuration) : Math.round(programMetrics.totalDuration / 60) + ' min'}</div>
                                    <div><span className={styles.metricLabel}>Goals:</span> {programMetrics.goalsMet} / {programMetrics.totalGoals}</div>
                                </div>
                            </div>
                        )}

                        {/* Current Block Metrics Section */}
                        {activeBlock && blockMetrics && (
                            <div className={`${styles.metricsBlock} ${compact ? styles.compactMetricsBlock : ''}`}>
                                <h3 className={styles.sectionHeader}>Current Block Metrics</h3>
                                <div className={styles.metricsList}>
                                    <div className={styles.metricValuePrimary} style={{ color: blockMetrics.color }}>
                                        {blockMetrics.daysRemaining} Days Remaining
                                    </div>
                                    <div><span className={styles.metricLabel}>Sessions:</span> {blockMetrics.completedSessions} / {blockMetrics.scheduledSessions}</div>
                                    <div><span className={styles.metricLabel}>Duration:</span> {formatDurationSeconds ? formatDurationSeconds(blockMetrics.totalDuration) : Math.round(blockMetrics.totalDuration / 60) + ' min'}</div>
                                    <div><span className={styles.metricLabel}>Goals:</span> {blockMetrics.goalsMet} / {blockMetrics.totalGoals}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Scrollable Bottom Section */}
            {!hideGoals && (
                <div className={styles.bottomSection}>
                    <h3 className={styles.sectionHeader}>Program Goals</h3>
                    <div className={styles.goalsScroll}>
                        <GoalHierarchyList
                            variant="session"
                            nodes={hierarchyNodes}
                            onGoalClick={onGoalClick}
                            getScopedCharacteristics={getLevelByName}
                            getGoalColor={getGoalColor}
                            getGoalSecondaryColor={getGoalSecondaryColor}
                            getGoalIcon={getGoalIcon}
                            completedColor="var(--color-brand-success)"
                            completedSecondaryColor="var(--color-brand-success)"
                            emptyState="No goals associated"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default ProgramSidebar;
