/**
 * SessionInfoPanel - Compact session metadata display for the side pane
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTimezone } from '../../contexts/TimezoneContext';
import { formatDateInTimezone } from '../../utils/dateUtils';
import { getGoalColor, getGoalTextColor } from '../../utils/goalColors';

function SessionInfoPanel({
    session,
    sessionData,
    parentGoals,
    rootId,
    onGoalClick,
    totalDuration
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    const timezone = useTimezone();

    const formatDate = (dateString) => {
        if (!dateString) return '—';
        return formatDateInTimezone(dateString, timezone, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '—';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${String(secs).padStart(2, '0')}`;
    };

    return (
        <div className="session-info-panel">
            {/* Session Title */}
            <div className="session-info-title">
                <h2>{session.name}</h2>
                <button
                    className="session-info-toggle"
                    onClick={() => setIsExpanded(!isExpanded)}
                    title={isExpanded ? 'Collapse' : 'Expand'}
                >
                    {isExpanded ? '▲' : '▼'}
                </button>
            </div>

            {/* Always visible summary */}
            <div className="session-info-summary">
                <div className="session-info-row">
                    <span className="label">Duration:</span>
                    <span className="value duration">{formatDuration(totalDuration)}</span>
                </div>
                {session.program_info && (
                    <div className="session-info-row">
                        <span className="label">Program:</span>
                        <Link
                            to={`/${rootId}/programs/${session.program_info.program_id}`}
                            className="value link"
                        >
                            {session.program_info.program_name}
                        </Link>
                    </div>
                )}
            </div>

            {/* Expandable details */}
            {isExpanded && (
                <div className="session-info-details">
                    <div className="session-info-row">
                        <span className="label">Template:</span>
                        <span className="value">{sessionData?.template_name || '—'}</span>
                    </div>
                    <div className="session-info-row">
                        <span className="label">Started:</span>
                        <span className="value">{formatDate(sessionData?.session_start)}</span>
                    </div>
                    <div className="session-info-row">
                        <span className="label">Ended:</span>
                        <span className="value">{formatDate(sessionData?.session_end)}</span>
                    </div>
                    <div className="session-info-row">
                        <span className="label">Created:</span>
                        <span className="value">{formatDate(session.created_at)}</span>
                    </div>
                    <div className="session-info-row">
                        <span className="label">Planned:</span>
                        <span className="value">{sessionData?.total_duration_minutes || '—'} min</span>
                    </div>
                </div>
            )}

            {/* Goals section */}
            {(parentGoals?.length > 0 || session.immediate_goals?.length > 0) && (
                <div className="session-info-goals">
                    {parentGoals?.length > 0 && (
                        <div className="goals-group">
                            <span className="goals-label">Short-Term Goals:</span>
                            <div className="goals-badges">
                                {parentGoals.map(goal => {
                                    const goalColor = getGoalColor(goal.type || 'ShortTermGoal');
                                    return (
                                        <div
                                            key={goal.id}
                                            className="goal-badge"
                                            style={{
                                                borderColor: goalColor,
                                                color: goalColor
                                            }}
                                            onClick={() => onGoalClick?.(goal)}
                                        >
                                            {goal.name}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    {session.immediate_goals?.length > 0 && (
                        <div className="goals-group">
                            <span className="goals-label">Immediate Goals:</span>
                            <div className="goals-badges">
                                {session.immediate_goals.map(goal => {
                                    const goalColor = getGoalColor(goal.type || 'ImmediateGoal');
                                    return (
                                        <div
                                            key={goal.id}
                                            className="goal-badge"
                                            style={{
                                                borderColor: goalColor,
                                                color: goalColor
                                            }}
                                            onClick={() => onGoalClick?.(goal)}
                                        >
                                            {goal.name}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default SessionInfoPanel;
