import React, { useState, useEffect } from 'react';
import Linkify from '../components/atoms/Linkify';
import { useParams, useNavigate } from 'react-router-dom';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatDateInTimezone } from '../utils/dateUtils';
import { useLogsData } from '../hooks/useLogsData';
import useIsMobile from '../hooks/useIsMobile';
import { useAuth } from '../contexts/AuthContext';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import Button from '../components/atoms/Button';
import notify from '../utils/notify';
import './Logs.css';

/**
 * Application event history with admin-only retention controls.
 */
function Logs() {
    const { rootId } = useParams();
    const navigate = useNavigate();
    const { timezone } = useTimezone();
    const isMobile = useIsMobile();
    const { user } = useAuth();
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    const [page, setPage] = useState(1);
    const pageSize = 50;

    // Filter states
    const [eventType, setEventType] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(() => {
        if (!rootId) {
            navigate('/');
        }
    }, [rootId, navigate]);

    const {
        logs,
        total,
        eventTypes,
        isLoading: loading,
        refetch,
        clearLogs,
        isClearing,
    } = useLogsData(rootId, { page, pageSize, eventType, startDate, endDate });

    const totalPages = Math.ceil(total / pageSize);

    const handleClearLogs = async () => {
        if (isClearing || !user?.is_admin) return;
        setShowClearConfirm(false);
        try {
            await clearLogs();
            setPage(1);
            notify.success('Logs cleared');
        } catch (error) {
            notify.error('Failed to clear logs: ' + (error.response?.data?.error || error.message));
        }
    };

    return (
        <div className="logs-page-container">
            <div className="logs-page-header">
                <div className="header-main">
                    {!isMobile ? <h1>Application Events</h1> : null}
                    <div className="logs-filters">
                        <div className="filter-group">
                            <label>Type</label>
                            <select value={eventType} onChange={(e) => { setEventType(e.target.value); setPage(1); }}>
                                <option value="all">All</option>
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
                            {total} events
                        </div>
                    </div>
                </div>
                <div className="logs-header-actions">
                    <Button unstyled className="refresh-logs-btn" disabled={isClearing} onClick={() => refetch()}>REFRESH</Button>
                    {user?.is_admin && (
                        <Button unstyled className="clear-logs-btn" disabled={isClearing} onClick={() => setShowClearConfirm(true)}>
                            {isClearing ? 'CLEARING…' : 'CLEAR LOGS'}
                        </Button>
                    )}
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
                                        <div className="description-text"><Linkify>{log.description}</Linkify></div>
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
            <DeleteConfirmModal
                isOpen={showClearConfirm}
                onClose={() => setShowClearConfirm(false)}
                onConfirm={handleClearLogs}
                title="Clear all logs?"
                message="Permanently delete all application event logs for this fractal, including events outside the current filters. Your goals, sessions, and activities will remain unchanged."
                confirmText="Clear all logs"
            />
        </div>
    );
}

export default Logs;
