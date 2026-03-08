import React, { useMemo, useState } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import Linkify from '../atoms/Linkify';
import { fractalApi } from '../../utils/api';
import { queryKeys } from '../../hooks/queryKeys';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import Button from '../atoms/Button';
import './LogsModal.css';
/**
 * LogsModal - Displays a searchable and filterable list of application event logs.
 */
function LogsModalInner({ onClose, rootId }) {
    const queryClient = useQueryClient();
    const [pageCount, setPageCount] = useState(1);
    const limit = 50;

    const logQueries = useQueries({
        queries: rootId
            ? Array.from({ length: pageCount }, (_, index) => {
                const page = index + 1;
                return {
                    queryKey: queryKeys.logs(rootId, page, limit),
                    queryFn: async () => {
                        const res = await fractalApi.getLogs(rootId, {
                            limit,
                            offset: index * limit,
                        });
                        return res.data;
                    },
                    enabled: true,
                };
            })
            : [],
    });

    const logs = useMemo(
        () => logQueries.flatMap((query) => query.data?.logs || []),
        [logQueries]
    );
    const loading = logQueries.some((query) => query.isLoading);
    const lastPageLogs = logQueries[logQueries.length - 1]?.data?.logs || [];
    const hasMore = lastPageLogs.length === limit;

    const clearLogsMutation = useMutation({
        mutationFn: async () => fractalApi.clearLogs(rootId),
        onSuccess: async () => {
            queryClient.setQueriesData(
                { queryKey: queryKeys.logs(rootId) },
                (current) => current ? { ...current, logs: [], pagination: { ...(current.pagination || {}), total: 0 } } : current
            );
            setPageCount(1);
            await queryClient.invalidateQueries({ queryKey: queryKeys.logs(rootId) });
        },
    });

    const handleClearLogs = async () => {
        if (!window.confirm("Are you sure you want to clear all logs? This cannot be undone.")) return;

        try {
            await clearLogsMutation.mutateAsync();
        } catch (err) {
            console.error("Failed to clear logs:", err);
        }
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title="Application Logs"
            size="lg"
        >
            <ModalBody>
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
                                onClick={() => setPageCount((current) => current + 1)}
                                disabled={loading}
                            >
                                {loading ? 'Loading...' : 'Load More'}
                            </button>
                        )}
                    </div>
                )}
            </ModalBody>

            <ModalFooter>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <Button variant="danger" onClick={handleClearLogs} isLoading={clearLogsMutation.isPending}>
                        Clear All Logs
                    </Button>
                    <Button variant="secondary" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </ModalFooter>
        </Modal>
    );
}

function LogsModal({ isOpen, onClose, rootId }) {
    if (!isOpen) {
        return null;
    }

    return <LogsModalInner key={rootId || 'logs-modal'} onClose={onClose} rootId={rootId} />;
}

export default LogsModal;
