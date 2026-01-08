/**
 * AnalyticsMode - Shows analytics and previous instances for the current context
 */

import React, { useState, useEffect } from 'react';
import { useSidePane } from '../SidePaneContext';
import { fractalApi } from '../../../utils/api';
import { format } from 'date-fns';

const AnalyticsMode = () => {
    const { activeContext } = useSidePane();
    const config = activeContext?.analyticsConfig;

    if (!activeContext) {
        return (
            <div className="analytics-mode-empty">
                <p>Select an item to view analytics</p>
            </div>
        );
    }

    if (!config) {
        return (
            <div className="analytics-mode-empty">
                <span className="analytics-icon">📊</span>
                <p>No analytics available for this item</p>
            </div>
        );
    }

    switch (config.type) {
        case 'previous_instances':
            return (
                <PreviousInstancesView
                    activityDefinitionId={config.activityDefinitionId}
                    currentInstanceId={config.currentInstanceId}
                    rootId={activeContext.rootId}
                    limit={config.limit || 10}
                />
            );

        case 'session_stats':
            return (
                <SessionStatsView
                    sessionId={config.sessionId}
                    rootId={activeContext.rootId}
                />
            );

        case 'weekly_progress':
            return (
                <WeeklyProgressView
                    programId={config.programId}
                    rootId={activeContext.rootId}
                />
            );

        default:
            return (
                <div className="analytics-mode-empty">
                    <p>Unknown analytics type: {config.type}</p>
                </div>
            );
    }
};

// Previous activity instances view
const PreviousInstancesView = ({ activityDefinitionId, currentInstanceId, rootId, limit }) => {
    const [instances, setInstances] = useState([]);
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('instances'); // 'instances' | 'notes'

    useEffect(() => {
        const fetchData = async () => {
            if (!activityDefinitionId || !rootId) return;

            setLoading(true);
            try {
                // Fetch previous notes for this activity definition
                const notesResponse = await fractalApi.getNotesForActivity(
                    rootId,
                    activityDefinitionId,
                    {
                        limit,
                        exclude_instance: currentInstanceId
                    }
                );
                setNotes(notesResponse.notes || []);

                // Note: We'd need an endpoint for previous instances
                // For now, we'll show notes only
                setInstances([]);
            } catch (err) {
                console.error('Failed to fetch analytics:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [activityDefinitionId, currentInstanceId, rootId, limit]);

    if (loading) {
        return <div className="analytics-loading">Loading analytics...</div>;
    }

    return (
        <div className="analytics-mode previous-instances">
            <div className="analytics-tabs">
                <button
                    className={activeTab === 'notes' ? 'active' : ''}
                    onClick={() => setActiveTab('notes')}
                >
                    Previous Notes ({notes.length})
                </button>
                <button
                    className={activeTab === 'instances' ? 'active' : ''}
                    onClick={() => setActiveTab('instances')}
                >
                    History
                </button>
            </div>

            {activeTab === 'notes' ? (
                <div className="previous-notes">
                    {notes.length === 0 ? (
                        <div className="analytics-empty">
                            <p>No previous notes for this activity</p>
                        </div>
                    ) : (
                        notes.map(note => (
                            <div key={note.id} className="previous-note-card">
                                <div className="previous-note-header">
                                    <span className="previous-note-date">
                                        {formatDate(note.entity_context?.session_date || note.created_at)}
                                    </span>
                                </div>
                                <div className="previous-note-content">
                                    {note.content}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : (
                <div className="previous-instances-list">
                    <div className="analytics-placeholder">
                        <p>Coming soon: View performance history</p>
                    </div>
                </div>
            )}
        </div>
    );
};

// Session stats view
const SessionStatsView = ({ sessionId, rootId }) => {
    return (
        <div className="analytics-mode session-stats">
            <div className="analytics-placeholder">
                <span className="analytics-icon">📊</span>
                <h4>Session Statistics</h4>
                <p>Coming soon: Session performance metrics</p>
            </div>
        </div>
    );
};

// Weekly progress view for programs
const WeeklyProgressView = ({ programId, rootId }) => {
    return (
        <div className="analytics-mode weekly-progress">
            <div className="analytics-placeholder">
                <span className="analytics-icon">📈</span>
                <h4>Weekly Progress</h4>
                <p>Coming soon: Program completion tracking</p>
            </div>
        </div>
    );
};

const formatDate = (dt) => {
    if (!dt) return '';
    try {
        return format(new Date(dt), 'MMM d, yyyy');
    } catch {
        return '';
    }
};

export default AnalyticsMode;
