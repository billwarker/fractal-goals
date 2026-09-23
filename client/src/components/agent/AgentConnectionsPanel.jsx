import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentApi } from '../../utils/api';
import { queryKeys } from '../../hooks/queryKeys';
import styles from './AgentConnectionsPanel.module.css';

const endpoint = import.meta.env.VITE_AGENT_MCP_RESOURCE_URI || '';
const providerSetup = [
    {
        id: 'chatgpt',
        label: 'ChatGPT',
        url: 'https://chatgpt.com',
        guide: 'https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt',
        instructions: 'Open Settings → Apps, create a custom MCP app, and paste the Fractal server URL.',
    },
    {
        id: 'claude',
        label: 'Claude',
        url: 'https://claude.ai',
        guide: 'https://support.anthropic.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp',
        instructions: 'Open Settings → Connectors, add a custom remote MCP connector, and paste the Fractal server URL.',
    },
];

function AgentConnectionsPanel({ enabled = true }) {
    const queryClient = useQueryClient();
    const [copied, setCopied] = useState(false);
    const connectionsQuery = useQuery({
        queryKey: queryKeys.aiConnections(),
        queryFn: async () => (await agentApi.listConnections()).data.items || [],
        refetchOnWindowFocus: true,
    });
    const embeddedProvidersQuery = useQuery({
        queryKey: queryKeys.aiEmbeddedProviders(),
        queryFn: async () => (await agentApi.listEmbeddedProviders()).data,
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
            <section className={styles.section} aria-labelledby="embedded-assistant-title">
                <h3 id="embedded-assistant-title">Embedded assistant</h3>
                <p>Use the Fractal Goals chat window to plan changes across goals, sessions, activities, metrics, programs, notes, and templates. Every change is previewed here before it can run.</p>
                {embeddedProvidersQuery.isLoading && <p className={styles.muted}>Checking embedded provider availability…</p>}
                {embeddedProvidersQuery.isError && <p className={styles.error} role="alert">Embedded assistant availability is unavailable right now. Try again later.</p>}
                {!embeddedProvidersQuery.isLoading && !embeddedProvidersQuery.isError && (
                    <>
                        <p className={styles.modelNote}>{embeddedProvidersQuery.data?.billing_notice || 'Embedded requests use the provider account configured for this Fractal deployment.'}</p>
                        {(embeddedProvidersQuery.data?.providers || []).length > 0 ? (
                            <div className={styles.providers} aria-label="Embedded providers">
                                {embeddedProvidersQuery.data.providers.map((provider) => (
                                    <article className={styles.providerCard} key={provider.id}>
                                        <h4>{provider.id === 'openai' ? 'OpenAI' : 'Anthropic'}</h4>
                                        <p>Available model: <strong>{provider.model}</strong></p>
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <p className={styles.muted}>No embedded provider is enabled for this deployment yet.</p>
                        )}
                    </>
                )}
            </section>
            <section className={styles.section}>
                <h3>{enabled ? 'Connect ChatGPT or Claude' : 'AI connections are paused'}</h3>
                {enabled ? (
                    <>
                        <p>Add Fractal Goals in the AI product you already use. Sign in to that product there, then it will return you to Fractal to approve the fractals and permissions it can access.</p>
                        <p className={styles.modelNote}>Choose an available model inside ChatGPT or Claude; the provider handles its subscription usage. Fractal does not receive a provider subscription token or use its API keys. Connector features depend on your provider plan: ChatGPT currently limits MCP write actions to Business, Enterprise, and Edu, while Pro supports read and fetch. Claude remote connectors are available on Pro, Max, Team, and Enterprise plans.</p>
                    </>
                ) : (
                    <p role="status">New AI connections are unavailable while this integration is disabled. Existing connections remain listed below so you can revoke them.</p>
                )}
                {enabled && endpoint ? (
                    <div className={styles.endpointRow}>
                        <code>{endpoint}</code>
                        <button type="button" onClick={copyEndpoint}>{copied ? 'Copied' : 'Copy server URL'}</button>
                    </div>
                ) : enabled ? (
                    <p className={styles.muted}>The MCP server URL is not configured for this app deployment.</p>
                ) : null}
                {enabled && (
                    <div className={styles.providers} aria-label="Provider setup instructions">
                        {providerSetup.map((provider) => (
                            <article className={styles.providerCard} key={provider.id}>
                                <h4>{provider.label}</h4>
                                <p>{provider.instructions}</p>
                                <div>
                                    <a href={provider.url} target="_blank" rel="noreferrer">Open {provider.label}</a>
                                    <a href={provider.guide} target="_blank" rel="noreferrer">View setup guide</a>
                                </div>
                            </article>
                        ))}
                    </div>
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
