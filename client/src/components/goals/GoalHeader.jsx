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
    goalSecondaryColor,
    textColor,
    parentGoal,
    onClose, // Callback to close modal when navigating
    onCollapse, // Mobile panel collapse toggle
    deadline,
    isCompact = false, // Prop to control collapsed state
    goalStatus = 'active',
    headerActions = null,
    headerTabs = null,
}) {
    const { timezone } = useTimezone();
    const normalizedStatus = goalStatus === 'frozen' || goalStatus === 'paused'
        ? 'paused'
        : goalStatus === 'inactive'
            ? 'inactive'
            : 'active';
    const statusConfig = {
        active: {
            label: 'Active',
            borderColor: 'color-mix(in srgb, var(--color-brand-success) 62%, var(--color-border))',
            background: 'color-mix(in srgb, var(--color-brand-success) 16%, transparent)',
            color: 'var(--color-brand-success)',
        },
        inactive: {
            label: 'Inactive',
            borderColor: 'var(--color-border)',
            background: 'color-mix(in srgb, var(--color-bg-card) 72%, transparent)',
            color: 'var(--color-text-secondary)',
        },
        paused: {
            label: 'Paused',
            borderColor: 'color-mix(in srgb, #60a5fa 62%, var(--color-border))',
            background: 'color-mix(in srgb, #60a5fa 14%, transparent)',
            color: '#93c5fd',
        },
    }[normalizedStatus];
    const levelBadgeBackground = goalSecondaryColor
        ? `linear-gradient(135deg, ${goalColor} 0%, color-mix(in srgb, ${goalSecondaryColor} 72%, ${goalColor}) 100%)`
        : goalColor;
    const levelBadgeBorder = goalSecondaryColor
        ? `1px solid color-mix(in srgb, ${goalSecondaryColor} 78%, ${goalColor})`
        : '1px solid transparent';
    const levelBadgeShadow = goalSecondaryColor
        ? `inset 0 0 0 1px color-mix(in srgb, ${goalSecondaryColor} 24%, transparent)`
        : 'none';

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            paddingBottom: '14px',
            marginBottom: '0',
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {onCollapse && (
                        <button
                            onClick={onCollapse}
                            title="Collapse panel"
                            style={{
                                background: 'transparent',
                                border: '1px solid var(--color-border)',
                                color: '#888',
                                fontSize: '16px',
                                cursor: 'pointer',
                                width: '30px',
                                height: '30px',
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            ▼
                        </button>
                    )}
                    {onClose && (
                        <button
                            onClick={onClose}
                            aria-label="Close"
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--color-text-muted)',
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
            </div>


            {/* Collapsible Section: Badges, Status, Dates */}
            <div style={{
                display: isCompact ? 'none' : 'flex', // Standard display toggle, no animation
                flexDirection: 'column',
                gap: '10px'
            }}>
                {/* Second Row: Badges, Status, and Header Actions */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {mode === 'create' && (
                            <span style={{ color: '#4caf50', fontSize: '13px', fontWeight: 'bold' }}>
                                + Create
                            </span>
                        )}
                        <div style={{
                            padding: '4px 10px',
                            background: levelBadgeBackground,
                            color: textColor,
                            border: levelBadgeBorder,
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            boxShadow: levelBadgeShadow,
                        }}>
                            {getTypeDisplayName(goalType)}
                        </div>

                        {/* Only show SMART indicator in non-create mode, or if we have enough data */}
                        {mode !== 'create' && (
                            <SMARTIndicator
                                goal={goal}
                                goalType={goalType}
                                color={goalColor}
                                secondaryColor={goalSecondaryColor}
                                textColor={textColor}
                            />
                        )}
                        {mode !== 'create' && (
                            <>
                                <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    minHeight: '22px',
                                    padding: '0 8px',
                                    border: `1px solid ${statusConfig.borderColor}`,
                                    borderRadius: '999px',
                                    background: statusConfig.background,
                                    color: statusConfig.color,
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    lineHeight: 1,
                                    whiteSpace: 'nowrap',
                                }}>
                                    {statusConfig.label}
                                </span>
                            </>
                        )}

                        {mode === 'create' && parentGoal && (
                            <span style={{ color: '#888', fontSize: '12px' }}>
                                under "{parentGoal.name}"
                            </span>
                        )}
                    </div>

                    {headerActions}
                </div>

                {/* Third Row: Dates */}
                {(mode !== 'create' && (goal?.attributes?.created_at || goal?.attributes?.deadline || deadline)) && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                            {goal?.attributes?.created_at && (
                                <div style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ color: goalColor, opacity: 0.9, textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.5px', fontWeight: 'bold' }}>Created</span>
                                    <span style={{ color: 'var(--color-text-secondary)', fontWeight: '500' }}>
                                        {formatDateInTimezone(goal.attributes.created_at, timezone, { month: 'short', day: 'numeric', year: 'numeric', hour: undefined, minute: undefined })}
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
                    </div>
                )}
            </div>

            {mode !== 'create' && headerTabs}
        </div>
    );
}

export default GoalHeader;
