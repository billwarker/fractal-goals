import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTimezone } from '../../contexts/TimezoneContext';
import { formatDateInTimezone } from '../../utils/dateUtils';

/**
 * GoalSessionList Component
 * 
 * Displays associated practice sessions for goals attached to sessions.
 */
const GoalSessionList = ({
    sessions,
    goalId,
    rootId,
    onClose, // Callback to close modal when navigating
    headerColor // New prop for header color
}) => {
    const navigate = useNavigate();
    const { timezone } = useTimezone();

    const associatedSessions = sessions.filter(session => {
        if (!session) return false;
        const sessionGoals = Array.isArray(session.session_goals) ? session.session_goals : [];
        return sessionGoals.some(goal => goal?.id === goalId);
    });

    const handleSessionClick = (sessionId) => {
        if (onClose) onClose();
        navigate(`/${rootId}/session/${sessionId}`);
    };

    return (
        <>
            <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: headerColor || 'var(--color-text-muted)', fontWeight: 'bold' }}>
                    Associated Sessions ({associatedSessions.length})
                </label>
                {associatedSessions.length === 0 ? (
                    <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
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
                                    background: 'var(--color-bg-card-alt)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    fontSize: '13px'
                                }}
                            >
                                <span style={{ color: 'var(--color-text-primary)' }}>{session.name}</span>
                                {session.attributes?.created_at && (
                                    <span style={{ fontSize: '11px', color: '#888' }}>
                                        {formatDateInTimezone(session.attributes.created_at, timezone, { month: 'numeric', day: 'numeric', year: 'numeric' })}
                                    </span>
                                )}
                            </div>
                        ))}
                        {associatedSessions.length > 5 && (
                            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic', paddingLeft: '4px' }}>
                                ... and {associatedSessions.length - 5} more
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
};

export default GoalSessionList;
