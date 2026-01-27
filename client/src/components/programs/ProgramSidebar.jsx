import React from 'react';
import { getGoalColor } from '../../utils/goalColors';
import { formatDate, formatDurationSeconds } from '../../utils/formatters'; // Assuming these exist or I need to find where they are from

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
    // Recursive renderer
    const renderGoalItem = (goal, depth = 0) => {
        const goalType = goal.type || goal.attributes?.type;
        const color = getGoalColor(goalType);
        const isCompleted = goal.completed || goal.attributes?.completed;
        const completedAt = goal.completed_at || goal.attributes?.completed_at;

        return (
            <div key={goal.id} style={{ marginLeft: depth > 0 ? `${depth * 16}px` : 0 }}>
                <div
                    onClick={() => onGoalClick(goal)}
                    style={{
                        background: isCompleted ? '#1a2e1a' : '#252525',
                        borderLeft: `3px solid ${isCompleted ? '#4caf50' : color}`,
                        padding: '10px',
                        borderRadius: '0 4px 4px 0',
                        position: 'relative',
                        marginBottom: '8px',
                        cursor: 'pointer',
                        transition: 'transform 0.1s ease-in-out',
                    }}
                    onMouseOver={e => e.currentTarget.style.transform = 'translateX(4px)'}
                    onMouseOut={e => e.currentTarget.style.transform = 'translateX(0)'}
                >
                    {isCompleted && (
                        <div style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            background: '#4caf50',
                            borderRadius: '50%',
                            width: '18px',
                            height: '18px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            color: 'white'
                        }}>✓</div>
                    )}
                    <div style={{ color: isCompleted ? '#4caf50' : color, fontSize: '10px', fontWeight: 600, marginBottom: '2px' }}>
                        {goalType?.replace(/([A-Z])/g, ' $1').trim()}
                    </div>
                    <div style={{
                        color: isCompleted ? '#8bc34a' : 'white',
                        fontSize: '13px',
                        fontWeight: 400,
                        textDecoration: isCompleted ? 'line-through' : 'none',
                        opacity: isCompleted ? 0.9 : 1
                    }}>
                        {goal.name}
                    </div>
                    {goal.deadline && (
                        <div style={{ fontSize: '11px', color: isCompleted ? '#66bb6a' : '#888', marginTop: '2px' }}>
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
                            // Find child in flat goals to ensure we have latest data
                            const fullChild = getGoalDetails(child.id);
                            return fullChild ? renderGoalItem(fullChild, depth + 1) : null;
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{ width: '350px', borderRight: '1px solid #333', background: '#1e1e1e', display: 'flex', flexDirection: 'column' }}>
            {/* Fixed Top Section */}
            <div style={{ padding: '24px', borderBottom: '1px solid #333' }}>
                {/* Program Metrics Section */}
                {programMetrics && (
                    <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ color: '#888', textTransform: 'uppercase', fontSize: '12px', marginBottom: '12px', letterSpacing: '1px' }}>Program Metrics</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#ddd' }}>
                            <div style={{ color: '#3A86FF', fontWeight: 600, fontSize: '16px', marginBottom: '4px' }}>
                                {programMetrics.daysRemaining} Days Remaining
                            </div>
                            <div><span style={{ color: '#888', fontSize: '12px' }}>Sessions:</span> {programMetrics.completedSessions} / {programMetrics.scheduledSessions}</div>
                            <div><span style={{ color: '#888', fontSize: '12px' }}>Duration:</span> {formatDurationSeconds ? formatDurationSeconds(programMetrics.totalDuration) : Math.round(programMetrics.totalDuration / 60) + ' min'}</div>
                            <div><span style={{ color: '#888', fontSize: '12px' }}>Goals:</span> {programMetrics.goalsMet} / {programMetrics.totalGoals}</div>
                        </div>
                    </div>
                )}

                {/* Current Block Metrics Section */}
                {activeBlock && blockMetrics && (
                    <div>
                        <h3 style={{ color: '#888', textTransform: 'uppercase', fontSize: '12px', marginBottom: '12px', letterSpacing: '1px' }}>Current Block Metrics</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#ddd' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                <span style={{ color: blockMetrics.color, fontWeight: 600, fontSize: '16px' }}>{blockMetrics.name}</span>
                                <span style={{ color: blockMetrics.color, fontWeight: 600, fontSize: '16px' }}>
                                    • {blockMetrics.daysRemaining} Days Remaining
                                </span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div><span style={{ color: '#888', fontSize: '12px' }}>Sessions:</span> {blockMetrics.completedSessions} / {blockMetrics.scheduledSessions}</div>
                                <div><span style={{ color: '#888', fontSize: '12px' }}>Duration:</span> {formatDurationSeconds ? formatDurationSeconds(blockMetrics.totalDuration) : Math.round(blockMetrics.totalDuration / 60) + ' min'}</div>
                                <div><span style={{ color: '#888', fontSize: '12px' }}>Goals:</span> {blockMetrics.goalsMet} / {blockMetrics.totalGoals}</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Scrollable Bottom Section */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                <h3 style={{ color: '#888', textTransform: 'uppercase', fontSize: '12px', marginBottom: '12px', letterSpacing: '1px' }}>Program Goals</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {programGoalSeeds.length === 0 ? (
                        <div style={{ color: '#666', fontStyle: 'italic', fontSize: '13px' }}>No goals associated</div>
                    ) : programGoalSeeds.map(goal => renderGoalItem(goal))}
                </div>
            </div>
        </div>
    );
}

export default ProgramSidebar;
