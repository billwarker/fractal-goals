import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentApi } from '../../utils/api';
import { queryKeys } from '../../hooks/queryKeys';
import styles from './AgentConnectionsPanel.module.css';

const endpoint = import.meta.env.VITE_AGENT_MCP_RESOURCE_URI || '';

function AgentConnectionsPanel() {
    const queryClient = useQueryClient();
    const [copied, setCopied] = useState(false);
    const connectionsQuery = useQuery({
        queryKey: queryKeys.aiConnections(),
        queryFn: async () => (await agentApi.listConnections()).data.items || [],
        refetchOnWindowFocus: true,
    });
    const revoke = useMutation({
        mutationFn: (grantId) => agentApi.revokeConnection(grantId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.aiConnections() }),
    });

    const copyEndpoint = async () => {
        if (!endpoint || !navigator.clipboard?.writeText) return;
        await navigator.clipboard.writeText(endpoint);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
    };

    return (
        <div className={styles.panel}>
            <section className={styles.section}>
                <h3>Connect an AI product</h3>
                <p>Add Fractal Goals as a remote MCP connector in your AI product. The product will send you here to choose fractals and permissions before it can read or propose changes.</p>
                {endpoint ? (
                    <div className={styles.endpointRow}>
                        <code>{endpoint}</code>
                        <button type="button" onClick={copyEndpoint}>{copied ? 'Copied' : 'Copy server URL'}</button>
                    </div>
                ) : (
                    <p className={styles.muted}>The MCP server URL is not configured for this app deployment.</p>
                )}
                <p className={styles.muted}>AI proposals never write until you approve them here. Revoking a connection blocks future access and stops any queued work that has not run.</p>
            </section>

            <section className={styles.section} aria-labelledby="agent-connections-title">
                <h3 id="agent-connections-title">Connected services</h3>
                {connectionsQuery.isLoading && <p className={styles.muted}>Loading connections…</p>}
                {connectionsQuery.isError && (
                    <p className={styles.error} role="alert">
                        Connections are unavailable: {connectionsQuery.error?.response?.data?.error || connectionsQuery.error?.message || 'Please try again.'}
                    </p>
                )}
                {!connectionsQuery.isLoading && !connectionsQuery.isError && connectionsQuery.data?.length === 0 && (
                    <p className={styles.muted}>No AI products are connected to this account.</p>
                )}
                {(connectionsQuery.data || []).map((connection) => (
                    <article className={styles.connection} key={connection.id}>
                        <div>
                            <strong>{connection.client_name}</strong>
                            <p>Fractals: {(connection.root_ids || []).join(', ') || 'None'}</p>
                            <p>Permissions: {(connection.scopes || []).join(', ') || 'None'}</p>
                            <p>Connected {connection.created_at ? new Date(connection.created_at).toLocaleDateString() : 'recently'}</p>
                        </div>
                        <button
                            type="button"
                            disabled={revoke.isPending}
                            onClick={() => revoke.mutate(connection.id)}
                        >Revoke</button>
                    </article>
                ))}
                {revoke.isError && <p className={styles.error} role="alert">Could not revoke this connection. Please retry.</p>}
            </section>
        </div>
    );
}

export default AgentConnectionsPanel;
