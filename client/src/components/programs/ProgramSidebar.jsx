import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { formatDate, formatDurationSeconds } from '../../utils/formatters';
import styles from './ProgramSidebar.module.css';

// Helper to format date if not imported
const defaultFormatDate = (d) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// Start component
function ProgramSidebar({
    programMetrics,
    activeBlock,
    blockMetrics,
    programGoalSeeds, // Top level goals to display
    onGoalClick, // (goal) => ...
    getGoalDetails, // Function to get full goal details by ID (needed for children)
}) {
    const { getGoalColor } = useTheme();

    // Recursive renderer
    const renderGoalItem = (goal, depth = 0) => {
        const goalType = goal.type || goal.attributes?.type;
        const color = getGoalColor(goalType);
        const isCompleted = goal.completed || goal.attributes?.completed;
        const completedAt = goal.completed_at || goal.attributes?.completed_at;

        return (
            <div key={goal.id} className={styles.goalItemWrapper} style={{ marginLeft: depth > 0 ? `${depth * 16}px` : 0 }}>
                <div
                    onClick={() => onGoalClick(goal)}
                    className={`${styles.goalItem} ${isCompleted ? styles.goalItemCompleted : ''}`}
                    style={{
                        background: !isCompleted ? 'var(--color-bg-card-alt)' : undefined,
                        borderLeft: `3px solid ${isCompleted ? 'var(--color-brand-success)' : color}`,
                        borderBottom: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)'
                    }}
                >
                    {isCompleted && (
                        <div className={styles.checkIcon}>✓</div>
                    )}
                    <div className={styles.goalType} style={{ color: isCompleted ? 'var(--color-brand-success)' : color }}>
                        {goalType?.replace(/([A-Z])/g, ' $1').trim()}
                    </div>
                    <div className={`${styles.goalName} ${isCompleted ? styles.goalNameCompleted : ''}`} style={{
                        color: isCompleted ? 'var(--color-brand-success)' : 'var(--color-text-primary)',
                    }}>
                        {goal.name}
                    </div>
                    {goal.deadline && (
                        <div className={styles.goalDeadline}>
                            {isCompleted ? (
                                <>Completed: {defaultFormatDate(completedAt)}</>
                            ) : (
                                <>Deadline: {defaultFormatDate(goal.deadline)}</>
                            )}
                        </div>
                    )}
                </div>
                {goal.children && goal.children.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {goal.children.map(child => {
                            const fullChild = getGoalDetails(child.id);
                            return fullChild ? renderGoalItem(fullChild, depth + 1) : null;
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={styles.sidebar}>
            {/* Fixed Top Section */}
            <div className={styles.topSection}>
                {/* Program Metrics Section */}
                {programMetrics && (
                    <div style={{ marginBottom: '24px' }}>
                        <h3 className={styles.sectionHeader}>Program Metrics</h3>
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
                    <div>
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

            {/* Scrollable Bottom Section */}
            <div className={styles.bottomSection}>
                <h3 className={styles.sectionHeader}>Program Goals</h3>
                <div className={styles.goalsList}>
                    {programGoalSeeds.length === 0 ? (
                        <div className={styles.emptyState}>No goals associated</div>
                    ) : programGoalSeeds.map(goal => renderGoalItem(goal))}
                </div>
            </div>
        </div>
    );
}

export default ProgramSidebar;
