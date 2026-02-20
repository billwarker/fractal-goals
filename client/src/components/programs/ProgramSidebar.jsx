import React from 'react';
import { useTheme } from '../../contexts/ThemeContext'
import { useGoalLevels } from '../../contexts/GoalLevelsContext';;
import { formatDurationSeconds } from '../../utils/formatters';
import { formatLiteralDate } from '../../utils/dateUtils';
import styles from './ProgramSidebar.module.css';

// Start component
function ProgramSidebar({
    programMetrics,
    activeBlock,
    blockMetrics,
    programGoalSeeds, // Top level goals to display
    onGoalClick, // (goal) => ...
    getGoalDetails, // Function to get full goal details by ID (needed for children)
    compact = false
}) {
    const { getGoalColor } = useGoalLevels();;

    // Recursive renderer
    const renderGoalItem = (goal, parentColors = []) => {
        const goalType = goal.type || goal.attributes?.type;
        const color = getGoalColor(goalType);
        const name = goal.name || goal.attributes?.name;
        const deadline = goal.deadline || goal.attributes?.deadline;
        const isCompleted = goal.completed || goal.attributes?.completed;
        const completedAt = goal.completed_at || goal.attributes?.completed_at;
        const currentColor = isCompleted ? 'var(--color-brand-success)' : color;

        // Full lineage for this level
        const lineageColors = [...parentColors, currentColor];

        return (
            <div key={goal.id} className={styles.goalItemWrapper}>
                {/* Fixed vertical stripes for this entire subtree row */}
                <div className={styles.lineageStripes}>
                    {lineageColors.map((stripeColor, idx) => (
                        <div
                            key={idx}
                            className={styles.connectingStripe}
                            style={{
                                backgroundColor: stripeColor,
                                left: `${idx * 4}px`,
                                zIndex: 10 + idx
                            }}
                        />
                    ))}
                </div>

                <div
                    onClick={() => onGoalClick(goal)}
                    className={`${styles.goalCard} ${isCompleted ? styles.goalCardCompleted : ''}`}
                >
                    <div
                        className={styles.cardContent}
                        style={{ paddingLeft: `${lineageColors.length * 4 + 12}px` }}
                    >
                        <div className={styles.goalType} style={{ color: currentColor }}>
                            {goalType?.replace(/([A-Z])/g, ' $1').trim()}
                        </div>
                        <div className={`${styles.goalName} ${isCompleted ? styles.goalNameCompleted : ''}`} style={{
                            color: isCompleted ? 'var(--color-brand-success)' : 'var(--color-text-primary)'
                        }}>
                            {name}
                        </div>
                        {(deadline || (isCompleted && completedAt)) && (
                            <div className={styles.goalDeadline}>
                                {isCompleted ? (
                                    <>Completed: {formatLiteralDate(completedAt, 'MMM D')}</>
                                ) : (
                                    <>Deadline: {formatLiteralDate(deadline, 'MMM D')}</>
                                )}
                            </div>
                        )}
                    </div>
                    {isCompleted && (
                        <div className={styles.checkIcon}>✓</div>
                    )}
                </div>
                {goal.children && goal.children.length > 0 && (
                    <div className={styles.childrenContainer}>
                        {goal.children.map(child => {
                            const fullChild = getGoalDetails(child.id);
                            return fullChild ? renderGoalItem(fullChild, lineageColors) : null;
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={`${styles.sidebar} ${compact ? styles.compactSidebar : ''}`}>
            {/* Fixed Top Section */}
            <div className={`${styles.topSection} ${compact ? styles.compactTopSection : ''}`}>
                <h3 className={styles.sectionHeader}>Program Metrics</h3>
                <div className={styles.metricsScroll}>
                    {/* Program Metrics Section */}
                    {programMetrics && (
                        <div className={compact ? styles.compactMetricsBlock : ''} style={{ marginBottom: '24px' }}>
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
                        <div className={compact ? styles.compactMetricsBlock : ''}>
                            <h3 className={styles.sectionHeader}>Current Block Metrics</h3>
                            <div className={styles.metricsList}>
                                <div className={styles.blockHeader}>
                                    <span className={styles.blockName} style={{ color: blockMetrics.color }}>{blockMetrics.name}</span>
                                    <span style={{ color: blockMetrics.color, fontWeight: 600, fontSize: '16px' }}>
                                        • {blockMetrics.daysRemaining} Days Remaining
                                    </span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div><span className={styles.metricLabel}>Sessions:</span> {blockMetrics.completedSessions} / {blockMetrics.scheduledSessions}</div>
                                    <div><span className={styles.metricLabel}>Duration:</span> {formatDurationSeconds ? formatDurationSeconds(blockMetrics.totalDuration) : Math.round(blockMetrics.totalDuration / 60) + ' min'}</div>
                                    <div><span className={styles.metricLabel}>Goals:</span> {blockMetrics.goalsMet} / {blockMetrics.totalGoals}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Scrollable Bottom Section */}
            <div className={styles.bottomSection}>
                <h3 className={styles.sectionHeader}>Program Goals</h3>
                <div className={styles.goalsScroll}>
                    <div className={styles.goalsList}>
                        {programGoalSeeds.length === 0 ? (
                            <div className={styles.emptyState}>No goals associated</div>
                        ) : programGoalSeeds.map(goal => renderGoalItem(goal, []))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ProgramSidebar;
