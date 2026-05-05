import React from 'react';
import { useGoalLevels } from '../contexts/GoalLevelsContext';
import CloseIcon from './atoms/CloseIcon';
import GoalIcon from './atoms/GoalIcon';
import { DeletedEntityCard } from './ui/DeletedEntityFallback';
import styles from './TargetCard.module.css';

/**
 * TargetCard Component
 * Displays an activity target with metrics and completion status
 */
function TargetCard({ target, activityDefinitions, onEdit, onDelete, onClick, isCompleted, isEditMode = false, goalType = null }) {
    // Find the activity definition
    const activityDef = activityDefinitions.find(a => a.id === target.activity_id);

    const { getLevelByName, getGoalColor, getGoalSecondaryColor, getGoalIcon } = useGoalLevels();

    // Normalize backend types like 'short_term_goal' -> 'Short Term Goal'
    const normalizeType = (str) => {
        if (!str) return 'Target';
        return str.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };

    // Use the owning goal's icon, falling back to Target icon if unavailable
    const resolvedType = normalizeType(goalType || target._goalType);
    const iconShape = getGoalIcon ? getGoalIcon(resolvedType) : (getLevelByName(resolvedType)?.icon || 'twelve-point-star');
    const iconColor = getGoalColor(resolvedType);
    const iconSecondaryColor = getGoalSecondaryColor(resolvedType);
    const completionColor = getGoalColor('Completed');
    const accentColor = isCompleted ? completionColor : iconColor;
    const accentSecondaryColor = isCompleted ? getGoalSecondaryColor('Completed') : iconSecondaryColor;
    const cardBorderColor = isCompleted ? accentColor : 'var(--color-border)';
    const metricBorderColor = isCompleted ? `${accentColor}55` : 'var(--color-border)';
    const metricLabelColor = isCompleted ? `${accentColor}cc` : 'var(--color-text-muted)';
    const metricValueColor = isCompleted ? accentColor : 'var(--color-text-primary)';
    const cardStyleVars = {
        '--target-card-accent': accentColor,
        '--target-card-border': cardBorderColor,
        '--target-card-shadow': isCompleted ? `${`0 0 0 1px ${accentColor}22 inset`}` : 'none',
        '--target-card-progress': isCompleted ? accentColor : 'var(--color-primary)',
        '--target-card-metric-border': metricBorderColor,
        '--target-card-metric-label': metricLabelColor,
        '--target-card-metric-value': metricValueColor,
    };

    const statusObj = isCompleted ? {
        color: accentColor,
        icon: <GoalIcon shape={iconShape} color={accentColor} secondaryColor={accentSecondaryColor} size={20} />
    } : {
        color: accentColor,
        icon: <GoalIcon shape={iconShape} color={iconColor} secondaryColor={iconSecondaryColor} size={20} style={{ opacity: 0.55 }} />
    };

    if (!activityDef) {
        // In view mode, don't show targets with missing activities
        if (!isEditMode) {
            return null;
        }
        // In edit mode, show a warning so user can delete it
        return <DeletedEntityCard entityName="Activity" onDelete={onDelete} />;
    }

    return (
        <div
            onClick={onClick}
            className={`${styles.card} ${onClick ? styles.clickable : ''}`}
            style={cardStyleVars}
        >
            <div className={styles.header}>
                <div className={styles.titleRow}>
                    <div className={styles.titleMain}>
                        <span className={styles.iconWrap}>
                            {statusObj.icon}
                        </span>
                        <div className={styles.title}>
                            {activityDef.name}
                        </div>
                    </div>
                    <div className={styles.headerControls}>
                        {isEditMode && onEdit && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit();
                                }}
                                className={styles.editButton}
                            >
                                Edit
                            </button>
                        )}
                        {onDelete && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete();
                                }}
                                className={styles.deleteButton}
                                title="Delete Target"
                                aria-label="Delete target"
                            >
                                <CloseIcon size={14} />
                            </button>
                        )}
                    </div>
                </div>

                {target.description && (
                    <div className={styles.description}>
                        {target.description}
                    </div>
                )}
            </div>

            {target.type === 'completion' && (
                <div className={styles.completionLabel}>
                    {isCompleted ? '✓ Completed' : 'Completion target'}
                </div>
            )}

            {(target.type === 'sum' || target.type === 'frequency') && (
                <div className={styles.progressWrap}>
                    <div className={styles.progressMeta}>
                        <span>Progress</span>
                        <span>
                            {target.current_value !== undefined ? target.current_value : 0} / {target.target_value || target.metrics?.[0]?.value || '?'}
                        </span>
                    </div>
                    <div className={styles.progressTrack}>
                        <div className={styles.progressBar} style={{ width: `${Math.min(100, target.progress || 0)}%` }} />
                    </div>
                    {target.time_scope === 'program_block' && (
                        <div className={styles.programBlockHint}>
                            Linked to Program Block
                        </div>
                    )}
                </div>
            )}

            {target.type !== 'completion' && target.metrics?.length > 0 && (
                <div className={styles.metrics}>
                    {target.metrics.map(metric => {
                        const metricDef = activityDef.metric_definitions?.find(m => m.id === metric.metric_id);
                        if (!metricDef) return null;

                        const operator = metric.operator || '>=';

                        return (
                            <div key={metric.metric_id} className={styles.metricChip}>
                                <span className={styles.metricLabel}>{metricDef.name}</span>
                                {' '}
                                <span className={styles.metricOperator}>{operator}</span>
                                {' '}
                                <span className={styles.metricValue}>
                                    {metric.value} {metricDef.unit}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default TargetCard;
