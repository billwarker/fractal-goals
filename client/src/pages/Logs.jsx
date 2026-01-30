import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatDateInTimezone } from '../utils/dateUtils';
import './Logs.css';

/**
 * Logs Page - Standalone view for application event logs
 */
function Logs() {
    const { rootId } = useParams();
    const navigate = useNavigate();
    const { timezone } = useTimezone();

    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [eventTypes, setEventTypes] = useState([]);
    const pageSize = 50;

    // Filter states
    const [eventType, setEventType] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        fetchLogs();
    }, [rootId, page, eventType, startDate, endDate]);

    const fetchLogs = async () => {
        try {
            setLoading(true);
            const offset = (page - 1) * pageSize;
            const res = await fractalApi.getLogs(rootId, {
                limit: pageSize,
                offset: offset,
                event_type: eventType !== 'all' ? eventType : undefined,
                start_date: startDate ? new Date(startDate).toISOString() : undefined,
                end_date: endDate ? new Date(endDate).toISOString() : undefined
            });

            setLogs(res.data.logs || []);
            setTotal(res.data.pagination.total || 0);
            if (res.data.event_types) {
                setEventTypes(res.data.event_types);
            }
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
            setTotal(0);
            setPage(1);
        } catch (err) {
            console.error("Failed to clear logs:", err);
        }
    };

    const totalPages = Math.ceil(total / pageSize);

    return (
        <div className="logs-page-container">
            <div className="logs-page-header">
                <div className="header-left">
                    <h1>Application Events</h1>
                    <p className="header-subtitle">Audit trail and history of activities</p>
                </div>
                <div className="logs-header-actions">
                    <button className="refresh-logs-btn" onClick={() => fetchLogs()}>REFRESH</button>
                    <button className="clear-logs-btn" onClick={handleClearLogs}>CLEAR ALL</button>
                </div>
            </div>

            <div className="logs-filters">
                <div className="filter-group">
                    <label>Event Type</label>
                    <select value={eventType} onChange={(e) => { setEventType(e.target.value); setPage(1); }}>
                        <option value="all">All Events</option>
                        {eventTypes.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>
                <div className="filter-group">
                    <label>From</label>
                    <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} />
                </div>
                <div className="filter-group">
                    <label>To</label>
                    <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} />
                </div>
                <div className="logs-stats">
                    Total: {total} events
                </div>
            </div>

            <div className="logs-page-body">
                {loading && logs.length === 0 ? (
                    <div className="logs-loading">Loading events...</div>
                ) : logs.length === 0 ? (
                    <div className="logs-empty">No events matching your filters.</div>
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
                                        {formatDateInTimezone(log.timestamp, timezone, {
                                            month: 'numeric',
                                            day: 'numeric',
                                            year: 'numeric',
                                            hour: 'numeric',
                                            minute: 'numeric',
                                            second: 'numeric',
                                            hour12: true
                                        })}
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
                        </div>

                        {totalPages > 1 && (
                            <div className="logs-pagination">
                                <button
                                    disabled={page === 1}
                                    onClick={() => setPage(p => p - 1)}
                                    className="page-btn"
                                >
                                    Previous
                                </button>
                                <span className="page-info">
                                    Page {page} of {totalPages}
                                </span>
                                <button
                                    disabled={page === totalPages}
                                    onClick={() => setPage(p => p + 1)}
                                    className="page-btn"
                                >
                                    Next
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default Logs;
