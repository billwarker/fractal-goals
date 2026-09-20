import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../hooks/queryKeys';
import { agentApi } from '../../utils/api';
import styles from './AgentTaskDrawer.module.css';

const EMPTY_ITEMS = [];
const getErrorMessage = (error) => error?.response?.data?.error
    || error?.response?.data?.message
    || error?.message
    || 'Please try again.';

function AgentEmbeddedChatPanel({ rootId, enabled, onProposalTaskReady }) {
    const queryClient = useQueryClient();
    const [message, setMessage] = useState('');
    const [provider, setProvider] = useState('');
    const [conversationId, setConversationId] = useState('');
    const providersQuery = useQuery({
        queryKey: queryKeys.aiEmbeddedProviders(),
        queryFn: async () => (await agentApi.listEmbeddedProviders()).data,
        enabled,
    });
    const conversationsQuery = useQuery({
        queryKey: queryKeys.aiEmbeddedConversations(rootId),
        queryFn: async () => (await agentApi.listEmbeddedConversations(rootId)).data.items || [],
        enabled: Boolean(rootId && enabled),
        refetchInterval: 10_000,
        refetchOnWindowFocus: true,
    });
    const conversationQuery = useQuery({
        queryKey: queryKeys.aiEmbeddedConversation(conversationId),
        queryFn: async () => (await agentApi.getEmbeddedConversation(conversationId)).data,
        enabled: Boolean(conversationId && enabled),
        refetchInterval: (query) => query.state.data?.runs?.some((run) => ['queued', 'running'].includes(run.status))
            ? 2500
            : false,
        refetchOnWindowFocus: true,
    });
    const availableProviders = providersQuery.data?.providers || EMPTY_ITEMS;
    const selectedProvider = availableProviders.some((item) => item.id === provider)
        ? provider
        : availableProviders[0]?.id || '';
    const conversation = conversationQuery.data;
    const activeRun = conversation?.runs?.find((run) => ['queued', 'running'].includes(run.status));
    const proposalTaskId = conversation?.runs?.find((run) => run.proposal_task_id)?.proposal_task_id;

    useEffect(() => {
        if (!proposalTaskId) return;
        onProposalTaskReady(proposalTaskId);
        queryClient.invalidateQueries({ queryKey: queryKeys.aiTasks(rootId) });
    }, [onProposalTaskReady, proposalTaskId, queryClient, rootId]);

    const submitMessage = useMutation({
        mutationFn: ({ currentConversationId, selectedProvider: providerId, content }) => currentConversationId
            ? agentApi.sendEmbeddedMessage(currentConversationId, { message: content })
            : agentApi.startEmbeddedConversation({
                root_id: rootId,
                provider: providerId,
                message: content,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            }),
        onSuccess: async ({ data }) => {
            setConversationId(data.conversation_id);
            setMessage('');
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.aiEmbeddedConversations(rootId) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.aiEmbeddedConversation(data.conversation_id) }),
            ]);
        },
    });
    const cancelRun = useMutation({
        mutationFn: (runId) => agentApi.cancelEmbeddedRun(runId),
        onSuccess: () => queryClient.invalidateQueries({
            queryKey: queryKeys.aiEmbeddedConversation(conversationId),
        }),
    });

    const handleSubmit = (event) => {
        event.preventDefault();
        if (!message.trim() || activeRun) return;
        submitMessage.mutate({
            currentConversationId: conversationId,
            selectedProvider,
            content: message.trim(),
        });
    };

    if (!enabled) return null;

    return (
        <section className={styles.section} aria-labelledby="agent-embedded-heading">
            <h3 id="agent-embedded-heading">Chat in Fractal Goals</h3>
            <p>{providersQuery.data?.billing_notice || 'Messages use the configured provider API and are billed to the app provider account.'}</p>
            <label htmlFor="agent-embedded-conversation">Conversation</label>
            <select
                id="agent-embedded-conversation"
                value={conversationId}
                onChange={(event) => setConversationId(event.target.value)}
            >
                <option value="">New conversation</option>
                {(conversationsQuery.data || []).map((item) => (
                    <option key={item.id} value={item.id}>
                        {item.provider} · {new Date(item.updated_at).toLocaleString()}
                    </option>
                ))}
            </select>
            {!conversationId && (
                <>
                    <label htmlFor="agent-embedded-provider">Provider</label>
                    <select
                        id="agent-embedded-provider"
                        value={selectedProvider}
                        onChange={(event) => setProvider(event.target.value)}
                        disabled={availableProviders.length === 0}
                    >
                        {availableProviders.length === 0 && <option value="">No provider configured</option>}
                        {availableProviders.map((item) => (
                            <option key={item.id} value={item.id}>{item.id} · {item.model}</option>
                        ))}
                    </select>
                </>
            )}
            {providersQuery.isError && (
                <p className={styles.error} role="alert">Provider settings are unavailable: {getErrorMessage(providersQuery.error)}</p>
            )}
            {providersQuery.data && availableProviders.length === 0 && (
                <p className={styles.notice}>An administrator must enable an embedded provider and configure its API key and model before chat can run.</p>
            )}
            {conversation?.messages?.length > 0 && (
                <div className={styles.embeddedMessages} aria-live="polite" aria-label="Conversation messages">
                    {conversation.messages.map((item) => (
                        <article className={item.role === 'assistant' ? styles.assistantMessage : styles.userMessage} key={item.id}>
                            <strong>{item.role === 'assistant' ? 'Assistant' : 'You'}</strong>
                            <p>{item.content}</p>
                        </article>
                    ))}
                </div>
            )}
            {activeRun && (
                <div className={styles.runBudget} role="status">
                    Assistant working · {activeRun.steps_used}/{activeRun.step_budget} tool steps · {activeRun.tokens_used}/{activeRun.token_budget} tokens
                    <button type="button" onClick={() => cancelRun.mutate(activeRun.id)} disabled={cancelRun.isPending}>Cancel</button>
                </div>
            )}
            <form className={styles.form} onSubmit={handleSubmit}>
                <label htmlFor="agent-embedded-message">Message</label>
                <textarea
                    id="agent-embedded-message"
                    rows={3}
                    maxLength={4000}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Ask for a plan, context, or a proposal to review."
                />
                <div className={styles.formFooter}>
                    <span>{message.length}/4000</span>
                    <button type="submit" disabled={
                        !message.trim()
                        || activeRun
                        || (!conversationId && !selectedProvider)
                        || submitMessage.isPending
                    }>
                        {submitMessage.isPending ? 'Sending…' : 'Send'}
                    </button>
                </div>
            </form>
            {submitMessage.isError && <p className={styles.error} role="alert">Could not send the message: {getErrorMessage(submitMessage.error)}</p>}
            {cancelRun.isError && <p className={styles.error} role="alert">Could not cancel the assistant: {getErrorMessage(cancelRun.error)}</p>}
            {conversationQuery.isError && <p className={styles.error} role="alert">Could not load this conversation: {getErrorMessage(conversationQuery.error)}</p>}
        </section>
    );
}

export default AgentEmbeddedChatPanel;
