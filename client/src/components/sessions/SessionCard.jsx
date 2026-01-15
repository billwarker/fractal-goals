/**
 * SessionCard - Individual session card for the sessions list
 * 
 * Displays session summary info with visual selection state.
 * Optimized for list rendering - minimal props, no data fetching.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { GOAL_COLORS, getGoalTextColor } from '../../utils/goalColors';
import { formatDateInTimezone } from '../../utils/dateUtils';
import { useTimezone } from '../../contexts/TimezoneContext';
import './SessionCard.css';

function SessionCard({
    session,
    rootId,
    parentGoals = {},
    isSelected = false,
    onSelect,
    onNavigate
}) {
    const navigate = useNavigate();
    const timezone = useTimezone();

    const sessionData = session.session_data || {};

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return formatDateInTimezone(dateString, timezone, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    const handleClick = (e) => {
        e.stopPropagation();
        onSelect?.(session.id);
    };

    const handleNavigate = (e) => {
        e.stopPropagation();
        if (onNavigate) {
            onNavigate(session.id);
        } else {
            navigate(`/${rootId}/session/${session.id}`);
        }
    };

    // Calculate total duration
    const totalSeconds = session.total_duration_seconds || 0;

    return (
        <div
            className={`session-card ${isSelected ? 'selected' : ''} ${session.is_completed ? 'completed' : ''}`}
            onClick={handleClick}
        >
            {/* Header Row */}
            <div className="session-card-header">
                <div className="session-card-date">
                    {formatDate(session.session_start)}
                </div>
                <div className="session-card-meta">
                    <span className="session-card-duration">
                        {formatDuration(totalSeconds)}
                    </span>
                    {session.is_completed && (
                        <span className="session-card-completed-badge">✓</span>
                    )}
                    <span className="session-card-notes-count">
                        📝 {session.notes_count || 0}
                    </span>
                </div>
            </div>

            {/* Template Name */}
            {sessionData.template_name && (
                <div className="session-card-template">
                    {sessionData.template_name}
                </div>
            )}

            {/* Associated Goals */}
            {session.goals && session.goals.length > 0 && (
                <div className="session-card-goals">
                    {session.goals.slice(0, 3).map(goal => {
                        const goalType = goal.goal_type || 'ImmediateGoal';
                        const bgColor = GOAL_COLORS[goalType] || '#4caf50';
                        const textColor = getGoalTextColor(goalType);
                        const parentGoal = parentGoals[goal.parent_id];

                        return (
                            <span
                                key={goal.id}
                                className="session-card-goal-tag"
                                style={{
                                    backgroundColor: bgColor,
                                    color: textColor
                                }}
                                title={parentGoal ? `${parentGoal.name} → ${goal.name}` : goal.name}
                            >
                                {goal.name}
                            </span>
                        );
                    })}
                    {session.goals.length > 3 && (
                        <span className="session-card-goals-more">
                            +{session.goals.length - 3}
                        </span>
                    )}
                </div>
            )}

            {/* Actions */}
            <button
                className="session-card-open-btn"
                onClick={handleNavigate}
            >
                Open →
            </button>
        </div>
    );
}

export default SessionCard;
