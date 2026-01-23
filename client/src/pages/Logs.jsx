import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import './Logs.css';

/**
 * Logs Page - Standalone view for application event logs
 */
function Logs() {
    const { rootId } = useParams();
    const navigate = useNavigate();

    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const limit = 50;

    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        fetchLogs(true);
    }, [rootId, navigate]);

    const fetchLogs = async (refresh = false) => {
        try {
            setLoading(true);
            const currentOffset = refresh ? 0 : offset;
            const res = await fractalApi.getLogs(rootId, limit, currentOffset);

            const newLogs = res.data.logs || [];

            if (refresh) {
                setLogs(newLogs);
                setOffset(newLogs.length);
            } else {
                setLogs(prev => [...prev, ...newLogs]);
                setOffset(prev => prev + newLogs.length);
            }

            setHasMore(newLogs.length === limit);
        } catch (err) {
            console.error("Failed to fetch logs:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleClearLogs = async () => {
        if (!window.confirm("Are you sure you want to clear all logs? This cannot be undone.")) return;

        try {
            await fractalApi.clearLogs(rootId);
            setLogs([]);
            setOffset(0);
            setHasMore(false);
        } catch (err) {
            console.error("Failed to clear logs:", err);
        }
    };

    return (
        <div className="logs-page-container">
            <div className="logs-page-header">
                <div className="header-left">
                    <h1>Application Events</h1>
                    <p className="header-subtitle">Audit trail and history of activities</p>
                </div>
                <div className="logs-header-actions">
                    <button className="refresh-logs-btn" onClick={() => fetchLogs(true)}>REFRESH</button>
                    <button className="clear-logs-btn" onClick={handleClearLogs}>CLEAR ALL</button>
                </div>
            </div>

            <div className="logs-page-body">
                {loading && logs.length === 0 ? (
                    <div className="logs-loading">Loading events...</div>
                ) : logs.length === 0 ? (
                    <div className="logs-empty">No events captured yet for this fractal.</div>
                ) : (
                    <div className="logs-list-container">
                        <div className="logs-grid-header">
                            <span className="col-timestamp">Datetime</span>
                            <span className="col-event">Event</span>
                            <span className="col-description">Description</span>
                            <span className="col-source">Source</span>
                        </div>
                        <div className="logs-scroll-area">
                            {logs.map(log => (
                                <div key={log.id} className="log-item">
                                    <span className="log-timestamp col-timestamp">
                                        {new Date(log.timestamp).toLocaleString()}
                                    </span>
                                    <span className="col-event">
                                        <span className={`log-event-tag ${(log.event_type || 'system').split('.')[0]} ${(log.event_type || '').endsWith('.deleted') ? 'deleted' : ''}`}>
                                            {log.event_type}
                                        </span>
                                    </span>
                                    <span className="log-description col-description">
                                        <div className="description-text">{log.description}</div>
                                        {log.entity_id && (
                                            <span className="log-entity-id" title={log.entity_id}>
                                                ID: {log.entity_id}
                                            </span>
                                        )}
                                    </span>
                                    <span className="log-source col-source">{log.source || 'system'}</span>
                                </div>
                            ))}

                            {hasMore && (
                                <button
                                    className="load-more-logs"
                                    onClick={() => fetchLogs()}
                                    disabled={loading}
                                >
                                    {loading ? 'Loading...' : 'Load More Events'}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Logs;
