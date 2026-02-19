import React from 'react';
import GoalIcon from './atoms/GoalIcon';
import { useTheme } from '../contexts/ThemeContext';

/**
 * TargetCard Component
 * Displays an activity target with metrics and completion status
 */
function TargetCard({ target, activityDefinitions, onEdit, onDelete, onClick, isCompleted, isEditMode = false }) {
    // Find the activity definition
    const activityDef = activityDefinitions.find(a => a.id === target.activity_id);

    const { getScopedCharacteristics, getGoalColor, getGoalSecondaryColor } = useTheme();
    const targetChar = getScopedCharacteristics('Target')?.icon || 'twelve-point-star';
    const targetColor = getGoalColor('Target');
    const targetSecondaryColor = getGoalSecondaryColor('Target');

    const statusObj = isCompleted ? {
        color: targetColor,
        icon: <GoalIcon shape={targetChar} color={targetColor} secondaryColor={targetSecondaryColor} size={20} />
    } : {
        color: 'var(--color-text-muted)',
        icon: <GoalIcon shape={targetChar} color="var(--color-text-muted)" size={20} />
    };

    if (!activityDef) {
        // In view mode, don't show targets with missing activities
        if (!isEditMode) {
            return null;
        }
        // In edit mode, show a warning so user can delete it
        return (
            <div style={{
                padding: '12px',
                background: 'var(--color-bg-card-alt)',
                border: '1px solid #f44336',
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <span style={{ color: '#f44336', fontSize: '13px' }}>
                    Activity not found (may have been deleted)
                </span>
                <button
                    onClick={onDelete}
                    style={{
                        padding: '4px 8px',
                        background: 'transparent',
                        border: '1px solid #f44336',
                        borderRadius: '3px',
                        color: '#f44336',
                        cursor: 'pointer',
                        fontSize: '11px'
                    }}
                >
                    Delete
                </button>
            </div>
        );
    }

    return (
        <div
            onClick={onClick}
            style={{
                padding: '12px',
                background: 'var(--color-bg-card-alt)',
                border: `1px solid ${isCompleted ? targetColor : 'var(--color-border)'}`,
                borderLeft: `4px solid ${isCompleted ? targetColor : 'var(--color-warning, #ff9800)'}`,
                borderRadius: '6px',
                marginBottom: '10px',
                cursor: onClick ? 'pointer' : 'default',
                transition: 'background-color 0.2s',
                color: 'var(--color-text-primary)',
                position: 'relative'
            }}
            onMouseEnter={(e) => {
                if (onClick) e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)';
            }}
            onMouseLeave={(e) => {
                if (onClick) e.currentTarget.style.backgroundColor = 'var(--color-bg-card-alt)';
            }}
        >
            {onDelete && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                    style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        background: 'transparent',
                        border: 'none',
                        color: '#f44336',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        padding: '0 4px',
                        lineHeight: '1',
                        opacity: 0.75,
                        transition: 'opacity 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.opacity = '1'}
                    onMouseLeave={(e) => e.target.style.opacity = '0.75'}
                    title="Delete Target"
                >
                    ×
                </button>
            )}

            {/* Header with name and completion status */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '8px'
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flex: 1
                }}>
                    <span style={{
                        fontSize: '16px',
                        color: statusObj.color
                    }}>
                        {statusObj.icon}
                    </span>
                    <div>
                        <div style={{
                            fontWeight: 600,
                            fontSize: '14px',
                            color: statusObj.color
                        }}>
                            {target.name || activityDef.name}
                        </div>
                        {target.description && (
                            <div style={{
                                fontSize: '11px',
                                color: 'var(--color-text-muted)',
                                marginTop: '2px'
                            }}>
                                {target.description}
                            </div>
                        )}
                    </div>
                </div>

                {isEditMode && onEdit && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: onDelete ? '20px' : 0 }}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit();
                            }}
                            style={{
                                padding: '4px 8px',
                                background: 'transparent',
                                border: '1px solid var(--color-border)',
                                borderRadius: '3px',
                                color: 'var(--color-text-secondary)',
                                cursor: 'pointer',
                                fontSize: '11px'
                            }}
                        >
                            Edit
                        </button>
                    </div>
                )}
            </div>

            {/* Progress Bar for Accumulation/Frequency */}
            {(target.type === 'sum' || target.type === 'frequency') && (
                <div style={{ paddingLeft: '28px', marginTop: '6px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '2px' }}>
                        <span>Progress</span>
                        <span>
                            {target.current_value !== undefined ? target.current_value : 0} / {target.target_value || target.metrics?.[0]?.value || '?'}
                        </span>
                    </div>
                    <div style={{ height: '6px', width: '100%', background: 'var(--color-bg-input)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{
                            height: '100%',
                            width: `${Math.min(100, target.progress || 0)}%`,
                            background: isCompleted ? targetColor : 'var(--color-primary)',
                            borderRadius: '3px',
                            transition: 'width 0.5s ease-out'
                        }} />
                    </div>
                    {target.time_scope === 'program_block' && (
                        <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px', fontStyle: 'italic' }}>
                            Linked to Program Block
                        </div>
                    )}
                </div>
            )}

            {/* Target metrics */}
            <div style={{
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
                paddingLeft: '28px'
            }}>
                {target.metrics?.map(metric => {
                    const metricDef = activityDef.metric_definitions?.find(m => m.id === metric.metric_id);
                    if (!metricDef) return null;

                    const operator = metric.operator || '>=';

                    return (
                        <div
                            key={metric.metric_id}
                            style={{
                                background: 'var(--color-bg-input)',
                                padding: '4px 10px',
                                borderRadius: '4px',
                                border: '1px solid var(--color-border)',
                                fontSize: '12px'
                            }}
                        >
                            <span style={{ color: 'var(--color-text-muted)' }}>{metricDef.name}</span>
                            {' '}
                            <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', margin: '0 2px' }}>{operator}</span>
                            {' '}
                            <span style={{ fontWeight: 'bold', color: isCompleted ? targetColor : 'var(--color-text-primary)' }}>
                                {metric.value} {metricDef.unit}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default TargetCard;
