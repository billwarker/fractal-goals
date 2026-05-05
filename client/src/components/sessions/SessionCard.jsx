/**
 * SessionCard - Individual session card for the sessions list
 * 
 * Displays session summary info with visual selection state.
 * Optimized for list rendering - minimal props, no data fetching.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { formatDateInTimezone } from '../../utils/dateUtils';
import { useTimezone } from '../../contexts/TimezoneContext';
import { getTemplateColor } from '../../utils/sessionRuntime';
import CompletionCheckBadge from '../common/CompletionCheckBadge';
import './SessionCard.css';

function SessionCard({
    session,
    rootId,
    isSelected = false,
    onSelect,
    onNavigate
}) {
    const navigate = useNavigate();
    const { timezone } = useTimezone();
    const { getGoalColor, getGoalTextColor } = useGoalLevels();

    const sessionData = session.attributes?.session_data || session.session_data || {};
    const templateColor = getTemplateColor(session);
    const sessionGoals = [
        ...(Array.isArray(session.short_term_goals) ? session.short_term_goals : []),
        ...(Array.isArray(session.immediate_goals) ? session.immediate_goals : []),
    ];
    const notesCount = Array.isArray(session.notes) ? session.notes.length : (session.notes_count || 0);
    const sessionCompleted = Boolean(session.completed || session.attributes?.completed);
    const sessionPaused = Boolean(session.is_paused ?? session.attributes?.is_paused);
    let statusLabel = 'Incomplete session';
    if (sessionPaused) {
        statusLabel = 'Paused session';
    } else if (sessionCompleted) {
        statusLabel = 'Completed session';
    }

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
            className={`session-card ${isSelected ? 'selected' : ''} ${sessionCompleted ? 'completed' : ''} ${sessionPaused ? 'paused' : ''}`}
            onClick={handleClick}
        >
            {/* Header Row */}
            <div className="session-card-header">
                <div className="session-card-date">
                    {formatDate(session.session_start || sessionData.session_start || session.created_at)}
                </div>
                <div className="session-card-meta">
                    <span className="session-card-duration">
                        {formatDuration(totalSeconds)}
                    </span>
                    <CompletionCheckBadge
                        checked={sessionCompleted}
                        paused={sessionPaused}
                        className="session-card-completed-badge"
                        label={statusLabel}
                    />
                    <span className="session-card-notes-count">
                        📝 {notesCount}
                    </span>
                </div>
            </div>

            <div className="session-card-name">
                {session.name || sessionData.template_name || 'Untitled Session'}
            </div>

            {/* Template Name */}
            {sessionData.template_name && (
                <div
                    className="session-card-template"
                    style={{
                        borderColor: templateColor,
                        color: templateColor,
                        background: `color-mix(in srgb, ${templateColor} 14%, transparent)`,
                    }}
                >
                    {sessionData.template_name}
                </div>
            )}

            {/* Associated Goals */}
            {sessionGoals.length > 0 && (
                <div className="session-card-goals">
                    {sessionGoals.slice(0, 3).map(goal => {
                        const goalType = goal.type || goal.attributes?.type || 'ImmediateGoal';
                        const bgColor = getGoalColor(goalType);
                        const textColor = getGoalTextColor(goalType);

                        return (
                            <span
                                key={goal.id}
                                className="session-card-goal-tag"
                                style={{
                                    backgroundColor: bgColor,
                                    color: textColor
                                }}
                                title={goal.name}
                            >
                                {goal.name}
                            </span>
                        );
                    })}
                    {sessionGoals.length > 3 && (
                        <span className="session-card-goals-more">
                            +{sessionGoals.length - 3}
                        </span>
                    )}
                </div>
            )}

            {/* Actions */}
            <button
                type="button"
                className="session-card-open-btn"
                onClick={handleNavigate}
            >
                Open →
            </button>
        </div>
    );
}

export default SessionCard;
