/**
 * PreviousNotesSection - Shows notes from previous sessions for an activity
 */

import React, { useState } from 'react';
import Linkify from '../atoms/Linkify';
import { useTimezone } from '../../contexts/TimezoneContext';

function PreviousNotesSection({ notes, activityName }) {
    const [isExpanded, setIsExpanded] = useState(true);
    const { timezone } = useTimezone();

    // Format date for grouping
    const formatSessionDate = (isoString) => {
        if (!isoString) return 'Unknown date';
        try {
            const date = new Date(isoString);
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                timeZone: timezone
            });
        } catch (e) {
            return 'Unknown date';
        }
    };

    // Group notes by session
    const groupedNotes = notes.reduce((acc, note) => {
        const sessionId = note.session_id || 'unknown';
        const sessionDate = note.session_date || note.created_at;
        const sessionName = note.session_name || 'Session';

        const key = `${sessionId}-${sessionDate}`;
        if (!acc[key]) {
            acc[key] = {
                sessionId,
                sessionDate,
                sessionName,
                notes: []
            };
        }
        acc[key].notes.push(note);
        return acc;
    }, {});

    const sessionGroups = Object.values(groupedNotes)
        .sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate));

    if (!notes || notes.length === 0) {
        return null;
    }

    return (
        <div className="previous-notes-section">
            <div
                className="previous-notes-header"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="previous-notes-toggle">
                    {isExpanded ? '▼' : '▶'}
                </span>
                <h4>Previous Sessions ({notes.length})</h4>
            </div>

            {isExpanded && (
                <div className="previous-notes-content">
                    {sessionGroups.map((group, idx) => (
                        <div key={idx} className="previous-session-group">
                            <div className="previous-session-date">
                                📅 {formatSessionDate(group.sessionDate)}
                                <span className="previous-session-name">{group.sessionName}</span>
                            </div>
                            <div className="previous-session-notes">
                                {group.notes.map(note => (
                                    <div key={note.id} className="previous-note-item">
                                        <Linkify>{note.content}</Linkify>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default PreviousNotesSection;
