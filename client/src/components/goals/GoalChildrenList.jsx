import React from 'react';
import { findGoalById, getTypeDisplayName } from '../../utils/goalHelpers';
import { useTheme } from '../../contexts/ThemeContext';

function GoalChildrenList({
    treeData,
    goalId,
    goalColor,
    childType
}) {
    const { getGoalColor } = useTheme();
    const node = findGoalById(treeData, goalId);
    const children = node?.children || [];

    if (children.length === 0) return null;

    return (
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '14px', marginTop: '4px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: goalColor, fontWeight: 'bold' }}>
                Associated {getTypeDisplayName(childType)}s
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {children.map(child => {
                    const childId = child.attributes?.id || child.id;
                    const childCompleted = child.attributes?.completed || child.completed;
                    const childColor = getGoalColor(childType);
                    return (
                        <div
                            key={childId}
                            style={{
                                padding: '10px 12px',
                                background: 'var(--color-bg-card-alt)',
                                borderLeft: `3px solid ${childColor}`,
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                opacity: childCompleted ? 0.7 : 1
                            }}
                        >
                            <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--color-text-primary)' }}>
                                {child.name}
                            </span>
                            {childCompleted && (
                                <span style={{ color: '#4caf50', fontSize: '11px', fontWeight: 'bold' }}>
                                    ✓ Done
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
