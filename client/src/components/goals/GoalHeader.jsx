import React from 'react';
import { getTypeDisplayName } from '../../utils/goalHelpers';
import SMARTIndicator from '../SMARTIndicator';
import { useTimezone } from '../../contexts/TimezoneContext';
import { formatDateInTimezone } from '../../utils/dateUtils';

function GoalHeader({
    mode,
    name,
    goal,
    goalType,
    goalColor,
    textColor,
    parentGoal,
    isCompleted,
    onClose, // Callback to close modal when navigating
    deadline,
    headerColor, // New prop for header color
    isCompact = false // Prop to control collapsed state
}) {
    const { timezone } = useTimezone();

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            paddingBottom: '20px', // More space before the border line
            marginBottom: '24px', // Reverted to standard spacing
            borderBottom: `2px solid ${goalColor}`,
            position: 'sticky',
            top: '-24px', // Stick to the very top (covering parent padding)
            background: 'var(--color-bg-surface)',
            zIndex: 20,
            // Negative margins to span full width of modal padding for sticky header
            marginRight: '-24px',
            marginLeft: '-24px',
            paddingLeft: '24px',
            paddingRight: '24px',
            marginTop: '-24px',
            paddingTop: '24px',
            isolation: 'isolate',
        }}>
            {/* Top Row: Name and Close Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                <div style={{
                    fontSize: '24px', // Fixed font size, no scaling
                    fontWeight: 'bold',
                    color: goalColor,
                    lineHeight: '1.2',
                    // Allow normal wrapping
                    whiteSpace: 'normal',
                }}>
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


            {/* Collapsible Section: Badges, Status, Dates */}
            <div style={{
                display: isCompact ? 'none' : 'flex', // Standard display toggle, no animation
                flexDirection: 'column',
                gap: '12px'
            }}>
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
                            ✓ Completed {goal?.attributes?.completed_at ? `on ${formatDateInTimezone(goal.attributes.completed_at, timezone, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
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
                                    {formatDateInTimezone(goal.attributes.created_at, timezone, { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                            </div>
                        )}
                        {(deadline || goal?.attributes?.deadline) && (
                            <div style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ color: goalColor, opacity: 0.9, textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.5px', fontWeight: 'bold' }}>Due</span>
                                <span style={{ color: 'var(--color-text-secondary)', fontWeight: '500' }}>
                                    {(() => {
                                        const d = deadline || goal?.attributes?.deadline;
                                        // Deadlines are often YYYY-MM-DD.
                                        // If we use formatDateInTimezone on YYYY-MM-DD it treats it as UTC and shifts it.
                                        // If it's YYYY-MM-DD we probably want to display it as is, or use the "local date" logic.
                                        if (d && d.length === 10 && !d.includes('T')) {
                                            const [year, month, day] = d.split('-').map(Number);
                                            return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                        }
                                        return formatDateInTimezone(d, timezone, { month: 'short', day: 'numeric', year: 'numeric' });
                                    })()}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default GoalHeader;
