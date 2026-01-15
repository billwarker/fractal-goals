/**
 * SessionsList - Scrollable list of session cards
 * 
 * Displays all sessions with filtering. Manages selection state.
 * Left panel of the Sessions page master-detail layout.
 */

import React from 'react';
import SessionCard from './SessionCard';
import './SessionsList.css';

function SessionsList({
    sessions = [],
    rootId,
    parentGoals = {},
    selectedSessionId,
    onSelectSession,
    onNavigateToSession,
    filterCompleted = 'all',
    onFilterChange,
    loading = false
}) {
    // Filter sessions based on completion status
    const filteredSessions = sessions.filter(session => {
        if (filterCompleted === 'completed') return session.is_completed;
        if (filterCompleted === 'active') return !session.is_completed;
        return true;
    });

    if (loading) {
        return (
            <div className="sessions-list">
                <div className="sessions-list-loading">
                    Loading sessions...
                </div>
            </div>
        );
    }

    return (
        <div className="sessions-list">
            {/* Filter Controls */}
            <div className="sessions-list-header">
                <h2 className="sessions-list-title">Sessions</h2>
                <div className="sessions-list-filters">
                    <button
                        className={`filter-btn ${filterCompleted === 'all' ? 'active' : ''}`}
                        onClick={() => onFilterChange?.('all')}
                    >
                        All ({sessions.length})
                    </button>
                    <button
                        className={`filter-btn ${filterCompleted === 'active' ? 'active' : ''}`}
                        onClick={() => onFilterChange?.('active')}
                    >
                        Active
                    </button>
                    <button
                        className={`filter-btn ${filterCompleted === 'completed' ? 'active' : ''}`}
                        onClick={() => onFilterChange?.('completed')}
                    >
                        Completed
                    </button>
                </div>
            </div>

            {/* Sessions List */}
            <div className="sessions-list-content">
                {filteredSessions.length === 0 ? (
                    <div className="sessions-list-empty">
                        {sessions.length === 0
                            ? 'No sessions found. Start by clicking "+ ADD SESSION" in the navigation.'
                            : 'No sessions match the current filter.'
                        }
                    </div>
                ) : (
                    filteredSessions.map(session => (
                        <SessionCard
                            key={session.id}
                            session={session}
                            rootId={rootId}
                            parentGoals={parentGoals}
                            isSelected={selectedSessionId === session.id}
                            onSelect={onSelectSession}
                            onNavigate={onNavigateToSession}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

export default SessionsList;
