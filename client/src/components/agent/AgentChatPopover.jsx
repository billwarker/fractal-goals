import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentApi } from '../../utils/api';
import { queryKeys } from '../../hooks/queryKeys';
import { FEATURE_FLAGS, isFeatureEnabled, useFeatureFlags } from '../../hooks/useFeatureFlags';
import AgentProposalReview from './AgentProposalReview';
import { getErrorMessage } from './agentChatFormatting';
import styles from './AgentChatPopover.module.css';

const EMPTY = [];

/** Persistent embedded assistant shell. Closing it hides the view; server/query state survives route changes. */
function AgentChatPopover({ rootId, isOpen, onClose }) {
    const queryClient = useQueryClient();
    const composerRef = useRef(null);
    const openerRef = useRef(null);
    const [message, setMessage] = useState('');
    const [provider, setProvider] = useState('');
    const [conversationId, setConversationId] = useState('');
    const { flags } = useFeatureFlags();
    const embeddedEnabled = isFeatureEnabled(flags, FEATURE_FLAGS.aiAgentEmbedded);

    useEffect(() => {
        if (isOpen) {
            openerRef.current = document.activeElement;
            composerRef.current?.focus();
        } else if (openerRef.current?.isConnected) openerRef.current.focus();
    }, [isOpen]);
    useEffect(() => {
        if (!isOpen) return undefined;
        const handleKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const providersQuery = useQuery({
        queryKey: queryKeys.aiEmbeddedProviders(),
        queryFn: async () => (await agentApi.listEmbeddedProviders()).data,
        enabled: Boolean(isOpen && embeddedEnabled),
        staleTime: 30_000,
        refetchOnWindowFocus: true,
    });
    const providers = providersQuery.data?.providers || EMPTY;
    const selectedProvider = providers.some((item) => item.id === provider) ? provider : providers[0]?.id || '';
    const conversationsQuery = useQuery({
        queryKey: queryKeys.aiEmbeddedConversations(rootId),
        queryFn: async () => (await agentApi.listEmbeddedConversations(rootId)).data.items || EMPTY,
        enabled: Boolean(isOpen && rootId && embeddedEnabled),
        staleTime: 5_000,
        refetchOnWindowFocus: true,
    });
    const conversations = conversationsQuery.data || EMPTY;
    const activeConversationId = conversations.some((item) => item.id === conversationId)
        ? conversationId : conversations[0]?.id || '';
    const conversationQuery = useQuery({
        queryKey: queryKeys.aiEmbeddedConversation(activeConversationId),
        queryFn: async () => (await agentApi.getEmbeddedConversation(activeConversationId)).data,
        enabled: Boolean(isOpen && activeConversationId && embeddedEnabled),
        refetchInterval: isOpen ? 3_000 : false,
        refetchOnWindowFocus: true,
    });
    const conversation = conversationQuery.data;
    const messages = conversation?.messages || EMPTY;
    const latestRun = conversation?.runs?.[0];
    const proposal = latestRun?.proposal;

    const invalidateEmbedded = async (id = activeConversationId) => Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.aiEmbeddedConversations(rootId) }),
        id && queryClient.invalidateQueries({ queryKey: queryKeys.aiEmbeddedConversation(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.aiRuns(rootId) }),
    ]);
    const sendMessage = useMutation({
        mutationFn: async () => {
            const payload = { message: message.trim(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' };
            if (activeConversationId) return agentApi.sendEmbeddedMessage(activeConversationId, payload);
            return agentApi.startEmbeddedConversation({ root_id: rootId, provider: selectedProvider, ...payload });
        },
        onSuccess: async ({ data }) => {
            setMessage('');
            if (data?.conversation_id) setConversationId(data.conversation_id);
            await invalidateEmbedded(data?.conversation_id || activeConversationId);
        },
    });
    const decide = useMutation({
        mutationFn: ({ item, decision }) => agentApi.decideProposal(item.id, { decision, proposal_hash: item.proposal_hash }),
        onSuccess: () => invalidateEmbedded(),
    });
    const cancelRun = useMutation({
        mutationFn: (runId) => agentApi.cancelEmbeddedRun(runId),
        onSuccess: () => invalidateEmbedded(),
    });
    const handleSubmit = (event) => {
        event.preventDefault();
        if (!message.trim() || !selectedProvider || sendMessage.isPending) return;
        sendMessage.mutate();
    };
    const statusText = useMemo(() => {
        if (sendMessage.isPending) return 'Thinking…';
        if (latestRun?.status === 'queued' || latestRun?.status === 'running') return 'Working…';
        if (latestRun?.status === 'failed') return 'The assistant could not finish this turn.';
        return 'Ready';
    }, [latestRun?.status, sendMessage.isPending]);

    if (!isOpen) return null;
    return (
        <aside className={styles.dialog} role="dialog" aria-modal="false" aria-labelledby="agent-chat-title">
            <header className={styles.header}>
                <div className={styles.headerTitle}><span className={styles.statusDot} aria-hidden="true" /><div><h2 id="agent-chat-title">Ask AI</h2><p>{statusText}</p></div></div>
                <button className={styles.minimizeButton} type="button" onClick={onClose} aria-label="Minimize AI assistant" title="Minimize"><span aria-hidden="true">−</span></button>
            </header>
            <div className={styles.content}>
                {!embeddedEnabled && <p className={styles.notice} role="status">The embedded assistant is disabled for this deployment. An administrator must enable it after configuring provider keys, pricing, privacy approval, and spend limits.</p>}
                {embeddedEnabled && providers.length === 0 && !providersQuery.isLoading && <p className={styles.notice} role="status">No embedded provider is available. Configure an approved OpenAI or Anthropic API provider and its spend controls, then enable the provider flag.</p>}
                {providersQuery.isError && <p className={styles.error} role="alert">Could not load embedded providers: {getErrorMessage(providersQuery.error)}</p>}
                <div className={styles.messageList} aria-live="polite">
                    {messages.length === 0 && <article className={`${styles.message} ${styles.assistantMessage}`}><strong>Fractal AI</strong><p>Tell me what you want to change. I can inspect this fractal and prepare changes to review. Nothing is written until you approve a preview.</p><p>Embedded requests use the configured Fractal Goals provider account and its daily spend limits.</p></article>}
                    {messages.map((item) => <article className={`${styles.message} ${item.role === 'user' ? styles.userMessage : styles.assistantMessage}`} key={item.id}><strong>{item.role === 'user' ? 'You' : 'Fractal AI'}</strong><p>{item.content}</p></article>)}
                    {conversationQuery.isLoading && <p className={styles.notice}>Loading conversation…</p>}
                    {conversationQuery.isError && <p className={styles.error} role="alert">Could not load this conversation: {getErrorMessage(conversationQuery.error)}</p>}
                </div>
                {proposal && <section className={styles.section} aria-labelledby="agent-review-heading"><div className={styles.sectionHeading}><h3 id="agent-review-heading">Review proposed changes</h3><span className={styles.status}>{proposal.status.replaceAll('_', ' ')}</span></div><AgentProposalReview proposal={proposal} isPending={decide.isPending} onDecision={(decision) => decide.mutate({ item: proposal, decision })} error={decide.error} />{latestRun && ['queued', 'running'].includes(latestRun.status) && <button type="button" disabled={cancelRun.isPending} onClick={() => cancelRun.mutate(latestRun.id)}>Cancel assistant turn</button>}</section>}
                {embeddedEnabled && <form className={styles.form} onSubmit={handleSubmit}><label htmlFor="agent-provider">Provider</label><select id="agent-provider" value={selectedProvider} onChange={(event) => setProvider(event.target.value)} disabled={providers.length === 0 || sendMessage.isPending}><option value="">Choose a provider</option>{providers.map((item) => <option key={item.id} value={item.id}>{item.id === 'openai' ? 'OpenAI' : 'Anthropic'} · {item.model}</option>)}</select><div className={styles.composer}><textarea id="agent-request" ref={composerRef} aria-label="Message" rows={3} maxLength={4000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask Fractal AI to create or update goals, sessions, activities, metrics, programs, notes, and more…" /><div className={styles.formFooter}><span>{message.length}/4000</span><button type="submit" disabled={!selectedProvider || !message.trim() || sendMessage.isPending}>{sendMessage.isPending ? 'Sending…' : 'Send'}</button></div></div>{sendMessage.isError && <p className={styles.error} role="alert">Could not send the message: {getErrorMessage(sendMessage.error)}</p>}</form>}
            </div>
        </aside>
    );
}

export default AgentChatPopover;
