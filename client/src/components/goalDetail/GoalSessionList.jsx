import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * GoalSessionList Component
 * 
 * Displays associated practice sessions for ShortTermGoals (child sessions) 
 * and ImmediateGoals (parent sessions).
 */
const GoalSessionList = ({
    goalType,
    sessions,
    goalId,
    rootId,
    onClose, // Callback to close modal when navigating
    headerColor // New prop for header color
}) => {
    const navigate = useNavigate();

    // Session relationships
    const isShortTermGoal = goalType === 'ShortTermGoal';
    const isImmediateGoal = goalType === 'ImmediateGoal';

    if (!isShortTermGoal && !isImmediateGoal) return null;

    // Filter Sessions

    // For STGs: Find sessions that have this goal in their short_term_goals array OR parent_ids
    const childSessions = isShortTermGoal
        ? sessions.filter(session => {
            if (!session) return false;
            // Check new format: short_term_goals array
            const shortTermGoals = session.short_term_goals || [];
            if (shortTermGoals.some(stg => stg?.id === goalId)) return true;

            // Check legacy format: attributes.parent_ids
            const parentIds = session.attributes?.parent_ids || [];
            return parentIds.includes(goalId);
        })
        : [];

    // For IGs: Find sessions that have this goal in their immediate_goals array OR goal_ids
    const associatedSessions = isImmediateGoal
        ? sessions.filter(session => {
            if (!session) return false;
            // Check new format: immediate_goals array
            const immediateGoals = session.immediate_goals || [];
            if (immediateGoals.some(ig => ig?.id === goalId)) return true;

            // Check legacy format: attributes.goal_ids
            const goalIds = session.attributes?.goal_ids || [];
            return goalIds.includes(goalId);
        })
        : [];

    const handleSessionClick = (sessionId) => {
        if (onClose) onClose();
        navigate(`/${rootId}/session/${sessionId}`);
    };

    return (
        <>
            {/* Sessions - For ShortTermGoals (Goal is Parent of Session) */}
            {isShortTermGoal && (
                <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: headerColor || '#aaa', fontWeight: 'bold' }}>
                        Associated Sessions ({childSessions.length})
                    </label>
                    {childSessions.length === 0 ? (
                        <div style={{ fontSize: '13px', color: '#666', fontStyle: 'italic' }}>
                            No sessions yet
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {childSessions.slice(0, 5).map(session => (
                                <div
                                    key={session.id}
                                    onClick={() => handleSessionClick(session.id)}
                                    style={{
                                        padding: '8px 10px',
                                        background: '#2a2a2a',
                                        border: '1px solid #444',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        fontSize: '13px'
                                    }}
                                >
                                    <span style={{ color: 'white' }}>{session.name}</span>
                                    {session.attributes?.created_at && (
                                        <span style={{ fontSize: '11px', color: '#888' }}>
                                            {new Date(session.attributes.created_at).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>
                            ))}
                            {childSessions.length > 5 && (
                                <div style={{ fontSize: '12px', color: '#888', fontStyle: 'italic', paddingLeft: '4px' }}>
                                    ... and {childSessions.length - 5} more
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Associated Sessions - For ImmediateGoals (Goal is Child of Session) */}
            {isImmediateGoal && (
                <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: headerColor || '#aaa', fontWeight: 'bold' }}>
                        Associated Sessions ({associatedSessions.length})
                    </label>
                    {associatedSessions.length === 0 ? (
                        <div style={{ fontSize: '13px', color: '#666', fontStyle: 'italic' }}>
                            No associated sessions yet
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {associatedSessions.slice(0, 5).map(session => (
                                <div
                                    key={session.id}
                                    onClick={() => handleSessionClick(session.id)}
                                    style={{
                                        padding: '8px 10px',
                                        background: '#2a2a2a',
                                        border: '1px solid #9c27b0', // Purple for parent link
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        fontSize: '13px'
                                    }}
                                >
                                    <span style={{ color: 'white' }}>{session.name}</span>
                                    {session.attributes?.created_at && (
                                        <span style={{ fontSize: '11px', color: '#888' }}>
                                            {new Date(session.attributes.created_at).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>
                            ))}
                            {associatedSessions.length > 5 && (
                                <div style={{ fontSize: '12px', color: '#888', fontStyle: 'italic', paddingLeft: '4px' }}>
                                    ... and {associatedSessions.length - 5} more
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </>
    );
};

export default GoalSessionList;
