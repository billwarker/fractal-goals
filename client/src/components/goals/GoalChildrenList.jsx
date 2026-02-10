import React from 'react';
import { findGoalById, getTypeDisplayName } from '../../utils/goalHelpers';
import { isSMART } from '../../utils/smartHelpers';
import { useTheme } from '../../contexts/ThemeContext';
import GoalIcon from '../atoms/GoalIcon';

/**
 * Format a date as "Feb 10th, 2026"
 */
function formatCompletedDate(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date)) return null;

    const month = date.toLocaleString('en-US', { month: 'short' });
    const day = date.getDate();
    const year = date.getFullYear();

    // Ordinal suffix
    const suffix = (d) => {
        if (d >= 11 && d <= 13) return 'th';
        switch (d % 10) {
            case 1: return 'st';
            case 2: return 'nd';
            case 3: return 'rd';
            default: return 'th';
        }
    };

    return `${month} ${day}${suffix(day)}, ${year}`;
}

function GoalChildrenList({
    treeData,
    goalId,
    goalColor,
    childType,
    onGoalSelect
}) {
    const { getGoalColor, getGoalSecondaryColor } = useTheme();
    const node = findGoalById(treeData, goalId);
    const children = node?.children || [];

    if (children.length === 0) return null;

    const completedColor = getGoalColor('CompletedGoal');
    const completedSecondaryColor = getGoalSecondaryColor('CompletedGoal');

    return (
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '14px', marginTop: '4px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: goalColor, fontWeight: 'bold' }}>
                Associated {getTypeDisplayName(childType)}s
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {children.map(child => {
                    const childId = child.attributes?.id || child.id;
                    const childCompleted = child.attributes?.completed || child.completed;
                    const childCompletedAt = child.attributes?.completed_at || child.completed_at;
                    const childIsSmart = isSMART(child);

                    // Use completion colors if completed, otherwise goal-level colors
                    const iconColor = childCompleted ? completedColor : getGoalColor(childType);
                    const iconSecondaryColor = childCompleted ? completedSecondaryColor : getGoalSecondaryColor(childType);
                    const textColor = childCompleted ? completedColor : getGoalColor(childType);

                    return (
                        <div
                            key={childId}
                            onClick={() => onGoalSelect && onGoalSelect(child)}
                            style={{
                                padding: '10px 12px',
                                background: 'var(--color-bg-card-alt)',
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                opacity: childCompleted ? 0.7 : 1,
                                cursor: 'pointer',
                                transition: 'background-color 0.2s ease'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-surface-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-card-alt)'}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <GoalIcon
                                    color={iconColor}
                                    secondaryColor={iconSecondaryColor}
                                    isSmart={childIsSmart}
                                    size={30}
                                />
                                <span style={{ fontSize: '13px', fontWeight: 'bold', color: textColor }}>
                                    {child.name}
                                </span>
                            </div>
                            {childCompleted && (
                                <span style={{ color: completedColor, fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                    ✓ {childCompletedAt ? `Completed on ${formatCompletedDate(childCompletedAt)}` : 'Done'}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default GoalChildrenList;
