import React, { useState, useEffect } from 'react';
import Linkify from '../atoms/Linkify';
import { fractalApi } from '../../utils/api';
import './LogsModal.css';

/**
 * LogsModal - Displays a searchable and filterable list of application event logs.
 */
function LogsModal({ isOpen, onClose, rootId }) {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const limit = 50;

    useEffect(() => {
        if (isOpen && rootId) {
            fetchLogs(true);
        }
    }, [isOpen, rootId]);

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

    if (!isOpen) return null;

    return (
        <div className="logs-modal-overlay" onClick={onClose}>
            <div className="logs-modal-content" onClick={e => e.stopPropagation()}>
                <div className="logs-modal-header">
                    <h2>Application Logs</h2>
                    <div className="logs-header-actions">
                        <button className="clear-logs-btn" onClick={handleClearLogs}>CLEAR ALL</button>
                        <button className="close-logs-btn" onClick={onClose}>&times;</button>
                    </div>
                </div>

                <div className="logs-modal-body">
                    {loading && logs.length === 0 ? (
                        <div className="logs-loading">Loading logs...</div>
                    ) : logs.length === 0 ? (
                        <div className="logs-empty">No logs captured yet.</div>
                    ) : (
                        <div className="logs-list">
                            <div className="logs-grid-header">
                                <span>Timestamp</span>
                                <span>Event</span>
                                <span>Description</span>
                                <span>Source</span>
                            </div>
                            {logs.map(log => (
                                <div key={log.id} className="log-item">
                                    <span className="log-timestamp">
                                        {new Date(log.timestamp).toLocaleString()}
                                    </span>
                                    <span className={`log-event-type ${log.event_type.split('.')[0]}`}>
                                        {log.event_type}
                                    </span>
                                    <span className="log-description">
                                        <Linkify>{log.description}</Linkify>
                                        {log.entity_id && (
                                            <span className="log-entity-id" title={log.entity_id}>
                                                ID: {log.entity_id.substring(0, 8)}...
                                            </span>
                                        )}
                                    </span>
                                    <span className="log-source">{log.source}</span>
                                </div>
                            ))}

                            {hasMore && (
                                <button
                                    className="load-more-logs"
                                    onClick={() => fetchLogs()}
                                    disabled={loading}
                                >
                                    {loading ? 'Loading...' : 'Load More'}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default LogsModal;
