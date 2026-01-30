import React from 'react';
import { getTypeDisplayName } from '../../utils/goalHelpers';
import SMARTIndicator from '../SMARTIndicator';

function GoalHeader({
    mode,
    name,
    goal,
    goalType,
    goalColor,
    textColor,
    parentGoal,
    isCompleted,
    onClose,
    deadline
}) {
    // Construct goal object for SMART calculation if needed
    // But mostly we pass what's needed for display

    // NOTE: In the original, goalForSmart was constructed in the parent and passed to SMARTIndicator.
    // We should pass goalForSmart from the parent to this component if we want to keep that logic centralized,
    // or reconstruct it here. Reconstructing it here requires passing all the override fields.
    // For simplicity, let's assume the parent passes the ready-to-use `goalForSmart` object prop for the indicator, OR we pass the raw goal and let the parent handle the SMART logic.
    // Looking at the original code, `SMARTIndicator` took `goal={goalForSmart}`.
    // Let's accept `smartGoal` as a prop.

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            paddingBottom: '16px',
            marginBottom: '16px',
            borderBottom: `2px solid ${goalColor}`
        }}>
            {/* Top Row: Name and Close Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: goalColor, lineHeight: '1.2' }}>
                    {mode === 'create' ? (name || 'New Goal') : (name || goal.name)}
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#888',
                            fontSize: '24px',
                            cursor: 'pointer',
                            padding: '0',
                            lineHeight: 1,
                            height: '24px',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                    >
                        ×
                    </button>
                )}
            </div>

            {/* Second Row: Badges and Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {mode === 'create' && (
                    <span style={{ color: '#4caf50', fontSize: '13px', fontWeight: 'bold' }}>
                        + Create
                    </span>
                )}
                <div style={{
                    padding: '4px 10px',
                    background: goalColor,
                    color: textColor,
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 'bold'
                }}>
                    {getTypeDisplayName(goalType)}
                </div>

                {/* Only show SMART indicator in non-create mode, or if we have enough data */}
                {mode !== 'create' && (
                    <SMARTIndicator goal={goal} goalType={goalType} />
                )}

                {mode === 'create' && parentGoal && (
                    <span style={{ color: '#888', fontSize: '12px' }}>
                        under "{parentGoal.name}"
                    </span>
                )}
                {mode !== 'create' && isCompleted && (
                    <span style={{ color: '#4caf50', fontSize: '13px', fontWeight: 'bold' }}>
                        ✓ Completed
                    </span>
                )}
            </div>

            {/* Third Row: Dates */}
            {(mode !== 'create' && (goal?.attributes?.created_at || goal?.attributes?.deadline || deadline)) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {goal?.attributes?.created_at && (
                        <div style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: goalColor, opacity: 0.9, textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.5px', fontWeight: 'bold' }}>Created</span>
                            <span style={{ color: 'var(--color-text-secondary)', fontWeight: '500' }}>
                                {new Date(goal.attributes.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                        </div>
                    )}
                    {(deadline || goal?.attributes?.deadline) && (
                        <div style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: goalColor, opacity: 0.9, textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.5px', fontWeight: 'bold' }}>Due</span>
                            <span style={{ color: 'var(--color-text-secondary)', fontWeight: '500' }}>
                                {deadline
                                    ? new Date(deadline + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                                    : (goal?.attributes?.deadline ? new Date(goal.attributes.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'None')
                                }
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default GoalHeader;
