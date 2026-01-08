/**
 * SidePaneHeader - Header component for the SidePane
 * Displays context title with optional back button
 */

import React from 'react';
import { useSidePane } from './SidePaneContext';

const SidePaneHeader = ({ title, showBack, onBack, onClose }) => {
    const { activeContext } = useSidePane();

    // Get icon based on entity type
    const getContextIcon = () => {
        const type = activeContext?.type;
        switch (type) {
            case 'session': return '⏱️';
            case 'goal': return '🎯';
            case 'activity_instance': return '🏋️';
            case 'program': return '📅';
            case 'program_day': return '📆';
            case 'page': return '📄';
            default: return '📋';
        }
    };

    return (
        <div className="sidepane-header">
            <div className="sidepane-header-left">
                {showBack && (
                    <button
                        className="sidepane-back-btn"
                        onClick={onBack}
                        title="Go back"
                    >
                        ←
                    </button>
                )}
                <span className="sidepane-context-icon">{getContextIcon()}</span>
                <h3 className="sidepane-title">{title}</h3>
            </div>

            <button
                className="sidepane-close-btn"
                onClick={onClose}
                title="Close panel"
            >
                ×
            </button>
        </div>
    );
};

export default SidePaneHeader;
