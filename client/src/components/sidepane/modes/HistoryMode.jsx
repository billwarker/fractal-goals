/**
 * HistoryMode - Shows changelog/activity log for the current context
 */

import React from 'react';
import { useSidePane } from '../SidePaneContext';

const HistoryMode = () => {
    const { activeContext } = useSidePane();

    if (!activeContext) {
        return (
            <div className="history-mode-empty">
                <p>Select an item to view history</p>
            </div>
        );
    }

    // For now, show a placeholder - full implementation would track entity changes
    return (
        <div className="history-mode">
            <div className="history-placeholder">
                <span className="history-icon">📜</span>
                <h4>History</h4>
                <p>Activity history for <strong>{activeContext.name}</strong></p>
                <p className="history-hint">
                    Coming soon: Track changes, completions, and updates.
                </p>
            </div>

            {/* Created/Updated info from context */}
            {activeContext.details?.createdAt && (
                <div className="history-events">
                    <div className="history-event">
                        <span className="history-event-icon">✨</span>
                        <div className="history-event-content">
                            <span className="history-event-title">Created</span>
                            <span className="history-event-time">
                                {formatDateTime(activeContext.details.createdAt)}
                            </span>
                        </div>
                    </div>

                    {activeContext.details?.updatedAt &&
                        activeContext.details.updatedAt !== activeContext.details.createdAt && (
                            <div className="history-event">
                                <span className="history-event-icon">✏️</span>
                                <div className="history-event-content">
                                    <span className="history-event-title">Last Updated</span>
                                    <span className="history-event-time">
                                        {formatDateTime(activeContext.details.updatedAt)}
                                    </span>
                                </div>
                            </div>
                        )}

                    {activeContext.details?.completedAt && (
                        <div className="history-event completed">
                            <span className="history-event-icon">✅</span>
                            <div className="history-event-content">
                                <span className="history-event-title">Completed</span>
                                <span className="history-event-time">
                                    {formatDateTime(activeContext.details.completedAt)}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const formatDateTime = (dt) => {
    if (!dt) return '';
    try {
        const date = new Date(dt);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    } catch {
        return '';
    }
};

export default HistoryMode;
