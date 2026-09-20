import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from '../atoms/Modal';
import { agentApi } from '../../utils/api';
import { queryKeys } from '../../hooks/queryKeys';
import { FEATURE_FLAGS, isFeatureEnabled, useFeatureFlags } from '../../hooks/useFeatureFlags';
import AgentEmbeddedChatPanel from './AgentEmbeddedChatPanel';
import styles from './AgentTaskDrawer.module.css';

const getErrorMessage = (error) => error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Please try again.';
const EMPTY_ITEMS = [];
const formatPreviewValue = (value) => {
    if (value === null) return 'None';
    if (Array.isArray(value)) {
        if (!value.length) return 'None';
        return value.some((item) => item && typeof item === 'object')
            ? JSON.stringify(value)
            : value.join(', ');
    }
    return typeof value === 'string' ? value : JSON.stringify(value);
};

function AgentTaskDrawer({ rootId, onClose }) {
    const queryClient = useQueryClient();
    const [requestText, setRequestText] = useState('');
    const [grantId, setGrantId] = useState('');
    const [selectedTaskId, setSelectedTaskId] = useState('');
    const [handoff, setHandoff] = useState('');
    const [copied, setCopied] = useState(false);
    const lastCursor = useRef({});
    const { flags } = useFeatureFlags();
    const connectorsEnabled = isFeatureEnabled(flags, FEATURE_FLAGS.aiAgentConnectors);
    const embeddedEnabled = isFeatureEnabled(flags, FEATURE_FLAGS.aiAgentEmbedded);

    const connectionsQuery = useQuery({
        queryKey: queryKeys.aiConnections(),
        queryFn: async () => (await agentApi.listConnections()).data.items || [],
        enabled: connectorsEnabled,
        refetchOnWindowFocus: true,
    });
    const eligibleConnections = useMemo(
        () => (connectionsQuery.data ?? EMPTY_ITEMS).filter((connection) => connection.root_ids?.includes(rootId)),
        [connectionsQuery.data, rootId],
    );
    const selectedGrantId = eligibleConnections.some((connection) => connection.id === grantId)
        ? grantId
        : eligibleConnections[0]?.id || '';

    const tasksQuery = useQuery({
        queryKey: queryKeys.aiTasks(rootId),
        queryFn: async () => (await agentApi.listTasks(rootId)).data.items || [],
        enabled: Boolean(rootId && (connectorsEnabled || embeddedEnabled)),
        refetchInterval: 15_000,
        refetchOnWindowFocus: true,
    });
    const contextQuery = useQuery({
        queryKey: queryKeys.aiContext(rootId),
        queryFn: async () => (await agentApi.getContext(rootId)).data,
        enabled: Boolean(rootId && connectorsEnabled),
        staleTime: 30_000,
    });
    const [contextByRoot, setContextByRoot] = useState({});
    const rootContext = contextByRoot[rootId] || { selected: {}, notice: '' };
    const selectedContext = rootContext.selected;
    const contextNotice = rootContext.notice;
    const updateRootContext = (update) => setContextByRoot((current) => ({
        ...current,
        [rootId]: { ...(current[rootId] || { selected: {}, notice: '' }), ...update },
    }));
    const tasks = tasksQuery.data ?? EMPTY_ITEMS;
    const selectedTask = tasks.find((task) => task.id === selectedTaskId) || tasks[0] || null;
    const proposalsQuery = useQuery({
        queryKey: queryKeys.aiTaskProposals(selectedTask?.id),
        queryFn: async () => (await agentApi.listTaskProposals(selectedTask.id)).data.items || [],
        enabled: Boolean(selectedTask?.id && (connectorsEnabled || embeddedEnabled)),
        refetchInterval: 8_000,
        refetchOnWindowFocus: true,
    });
    const runsQuery = useQuery({
        queryKey: queryKeys.aiRuns(rootId),
        queryFn: async () => (await agentApi.listRuns(rootId)).data.items || [],
        enabled: Boolean(rootId && (connectorsEnabled || embeddedEnabled)),
        refetchInterval: 8_000,
        refetchOnWindowFocus: true,
    });
    const changeCursorQuery = useQuery({
        queryKey: queryKeys.aiChangeCursor(rootId),
        queryFn: async () => (await agentApi.getChangeCursor(rootId)).data.cursor,
        enabled: Boolean(rootId && (connectorsEnabled || embeddedEnabled)),
        refetchInterval: 10_000,
        refetchOnWindowFocus: true,
    });
    useEffect(() => {
        const cursor = changeCursorQuery.data;
        if (typeof cursor !== 'number') return;
        const previousCursor = lastCursor.current[rootId];
        if (previousCursor !== undefined && cursor > previousCursor) {
            [
                queryKeys.goalsTree(rootId),
                queryKeys.goals(rootId),
                queryKeys.activities(rootId),
                queryKeys.programs(rootId),
                ['program', rootId],
                queryKeys.programDayReadModelRoot(rootId),
                queryKeys.sessions(rootId),
                queryKeys.sessionRoot(rootId),
                queryKeys.sessionTemplates(rootId),
                queryKeys.fractalTree(rootId),
                queryKeys.allNotesRoot(rootId),
                queryKeys.goalNotesRoot(rootId),
                queryKeys.sessionNotesRoot(rootId),
            ].forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
        }
        lastCursor.current[rootId] = cursor;
    }, [changeCursorQuery.data, queryClient, rootId]);

    const createTask = useMutation({
        mutationFn: (data) => agentApi.createTask(data),
        onSuccess: async ({ data }) => {
            setRequestText('');
            setSelectedTaskId(data.id);
            const providerUrl = import.meta.env.VITE_AGENT_MCP_RESOURCE_URI || '';
            setHandoff([
                `Use the Fractal Goals MCP connector${providerUrl ? ` at ${providerUrl}` : ''}.`,
                `Read task ${data.id}, clarify anything ambiguous, and submit a proposal for review.`,
                `Request: ${data.request_text}`,
            ].join('\n'));
            await queryClient.invalidateQueries({ queryKey: queryKeys.aiTasks(rootId) });
        },
    });
    const decide = useMutation({
        mutationFn: ({ proposal, decision }) => agentApi.decideProposal(proposal.id, {
            decision,
            proposal_hash: proposal.proposal_hash,
        }),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.aiTasks(rootId) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.aiTaskProposals(selectedTask?.id) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.aiRuns(rootId) }),
            ]);
        },
    });
    const cancelRun = useMutation({
        mutationFn: (runId) => agentApi.cancelRun(runId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.aiRuns(rootId) }),
    });
    const undoRun = useMutation({
        mutationFn: (runId) => agentApi.createUndoProposal(runId),
        onSuccess: async ({ data }) => {
            setSelectedTaskId(data.task_id);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.aiTasks(rootId) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.aiTaskProposals(data.task_id) }),
            ]);
        },
    });

    const copyHandoff = async () => {
        if (!handoff || !navigator.clipboard?.writeText) return;
        await navigator.clipboard.writeText(handoff);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
    };

    const handleCreateTask = (event) => {
        event.preventDefault();
        if (!requestText.trim() || !selectedGrantId) return;
        const context = Object.fromEntries(
            Object.entries(selectedContext).filter(([, ids]) => ids?.length),
        );
        createTask.mutate({
            root_id: rootId,
            grant_id: selectedGrantId,
            request_text: requestText.trim(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            context,
        });
    };

    const contextGroups = [
        ['goal_ids', 'Goals', contextQuery.data?.goals?.items || []],
        ['activity_ids', 'Activities', contextQuery.data?.activities?.items || []],
        ['program_ids', 'Programs', contextQuery.data?.programs?.items || []],
        ['template_ids', 'Session templates', contextQuery.data?.templates?.items || []],
    ];

    const proposals = proposalsQuery.data || [];
    const latestProposal = proposals[0];
    const taskRuns = (runsQuery.data || []).filter((run) => (
        run.proposal_id && proposals.some((proposal) => proposal.id === run.proposal_id)
    ));

    return (
        <Modal isOpen onClose={onClose} title="Ask AI" size="lg" className={styles.dialog}>
            <div className={styles.content}>
                <p className={styles.intro}>
                    {connectorsEnabled && embeddedEnabled
                        ? 'Continue with a connected AI product or chat here. Review every proposed change before it runs.'
                        : embeddedEnabled
                            ? 'Chat with the app-funded assistant here. Review every proposed change before it runs.'
                            : 'Describe the work here, continue in your connected AI product, then review every proposed change before it runs.'}
                </p>

                {connectorsEnabled && <form className={styles.form} onSubmit={handleCreateTask}>
                    <label htmlFor="agent-connection">AI connection</label>
                    <select
                        id="agent-connection"
                        value={selectedGrantId}
                        onChange={(event) => setGrantId(event.target.value)}
                        disabled={connectionsQuery.isLoading || eligibleConnections.length === 0}
                    >
                        <option value="">Choose a connected service</option>
                        {eligibleConnections.map((connection) => (
                            <option key={connection.id} value={connection.id}>{connection.client_name}</option>
                        ))}
                    </select>
                    <fieldset className={styles.contextFields}>
                        <legend>Focus this handoff on specific items (optional)</legend>
                        <p>Only selected items from this fractal will be included in the task brief.</p>
                        {contextGroups.map(([key, label, items]) => (
                            <label key={key} htmlFor={`agent-context-${key}`}>
                                {label}
                                <select
                                id={`agent-context-${key}`}
                                    multiple
                                    size={Math.min(4, Math.max(2, items.length))}
                                    value={selectedContext[key] || []}
                                    onChange={(event) => {
                                        const ids = Array.from(event.target.selectedOptions, (option) => option.value);
                                        const boundedIds = ids.slice(0, 25);
                                        updateRootContext({
                                            notice: ids.length > 25 ? 'Choose up to 25 items in each group.' : '',
                                            selected: { ...selectedContext, [key]: boundedIds },
                                        });
                                    }}
                                    disabled={contextQuery.isLoading || items.length === 0}
                                >
                                    {items.map((item) => (
                                        <option key={item.id} value={item.id}>{item.name}</option>
                                    ))}
                                </select>
                            </label>
                        ))}
                        {contextNotice && <p role="status">{contextNotice}</p>}
                        {contextQuery.isError && (
                            <p className={styles.error} role="alert">Could not load item choices: {getErrorMessage(contextQuery.error)}</p>
                        )}
                    </fieldset>
                    <label htmlFor="agent-request">What would you like help with?</label>
                    <textarea
                        id="agent-request"
                        rows={4}
                        maxLength={2000}
                        value={requestText}
                        onChange={(event) => setRequestText(event.target.value)}
                        placeholder="For example: Create a four-week practice plan for this fractal. Ask me before choosing dates."
                    />
                    <div className={styles.formFooter}>
                        <span>{requestText.length}/2000</span>
                        <button type="submit" disabled={!selectedGrantId || !requestText.trim() || createTask.isPending}>
                            {createTask.isPending ? 'Saving…' : 'Create handoff'}
                        </button>
                    </div>
                    {eligibleConnections.length === 0 && !connectionsQuery.isLoading && (
                        <p className={styles.notice}>Connect an AI service in Settings before creating a handoff.</p>
                    )}
                    {connectionsQuery.isError && <p className={styles.error} role="alert">Could not load connections: {getErrorMessage(connectionsQuery.error)}</p>}
                    {createTask.isError && <p className={styles.error} role="alert">Could not save the task: {getErrorMessage(createTask.error)}</p>}
                </form>}

                <AgentEmbeddedChatPanel
                    rootId={rootId}
                    enabled={embeddedEnabled}
                    onProposalTaskReady={setSelectedTaskId}
                />

                {connectorsEnabled && handoff && (
                    <section className={styles.section} aria-labelledby="agent-handoff-heading">
                        <h3 id="agent-handoff-heading">Continue in your AI product</h3>
                        <p>Copy this handoff and paste it into a conversation where the Fractal Goals connector is enabled.</p>
                        <pre className={styles.handoff}>{handoff}</pre>
                        <button type="button" onClick={copyHandoff}>{copied ? 'Copied' : 'Copy handoff'}</button>
                    </section>
                )}

                <section className={styles.section} aria-labelledby="agent-review-heading">
                    <div className={styles.sectionHeading}>
                        <h3 id="agent-review-heading">Review and activity</h3>
                        <label className={styles.taskSelectLabel}>
                            <span className={styles.visuallyHidden}>Select task</span>
                            <select
                                value={selectedTask?.id || ''}
                                onChange={(event) => setSelectedTaskId(event.target.value)}
                                disabled={tasks.length === 0}
                            >
                                {tasks.length === 0 && <option value="">No tasks yet</option>}
                                {tasks.map((task) => (
                                    <option key={task.id} value={task.id}>{task.request_text.slice(0, 70)}</option>
                                ))}
                            </select>
                        </label>
                    </div>

                    {tasksQuery.isLoading && <p className={styles.notice}>Loading task history…</p>}
                    {tasksQuery.isError && <p className={styles.error} role="alert">Could not load task history: {getErrorMessage(tasksQuery.error)}</p>}
                    {selectedTask && <p className={styles.taskRequest}>{selectedTask.request_text}</p>}
                    {proposalsQuery.isLoading && <p className={styles.notice}>Checking for proposals…</p>}
                    {latestProposal && (
                        <article className={styles.proposal}>
                            <div className={styles.proposalHeading}>
                                <strong>Proposal {latestProposal.revision}</strong>
                                <span className={styles.status}>{latestProposal.status.replaceAll('_', ' ')}</span>
                            </div>
                            {(latestProposal.preview || []).map((item) => (
                                <div className={styles.previewItem} key={item.operation_id}>
                                    <strong>{item.action}</strong>
                                    {item.name && <span>{item.name}</span>}
                                    {item.deadline && <span>Due {item.deadline}</span>}
                                    {item.start_date && <span>Starts {String(item.start_date).slice(0, 10)}</span>}
                                    {item.end_date && <span>Ends {String(item.end_date).slice(0, 10)}</span>}
                                    {item.date && <span>Date {String(item.date).slice(0, 10)}</span>}
                                    {item.day_of_week?.length > 0 && <span>Repeats {item.day_of_week.join(', ')}</span>}
                                    {item.templates?.length > 0 && (
                                        <span>Templates: {item.templates.map((template) => template.name).join(', ')}</span>
                                    )}
                                    {item.changes && (
                                        <dl className={styles.changeList}>
                                            {Object.entries(item.changes).map(([field, value]) => (
                                                <React.Fragment key={field}>
                                                    <dt>{field.replaceAll('_', ' ')}</dt>
                                                    <dd>
                                                        {Object.prototype.hasOwnProperty.call(item.before || {}, field) && (
                                                            <span><strong>Before:</strong> {formatPreviewValue(item.before[field])}</span>
                                                        )}
                                                        <span><strong>Proposed:</strong> {formatPreviewValue(value)}</span>
                                                    </dd>
                                                </React.Fragment>
                                            ))}
                                        </dl>
                                    )}
                                    {item.content && <p>{item.content}</p>}
                                    {Array.isArray(item.before_goal_names) && (
                                        <span>Goals before: {item.before_goal_names.join(', ') || 'None'}</span>
                                    )}
                                    {Array.isArray(item.goal_names) && (
                                        <span>{item.before_goal_names ? 'Goals after' : 'Associated goals'}: {item.goal_names.join(', ') || 'None'}</span>
                                    )}
                                    {Array.isArray(item.before_template_names) && (
                                        <span>Templates before: {item.before_template_names.join(', ') || 'None'}</span>
                                    )}
                                    {Array.isArray(item.template_names) && (
                                        <span>Templates after: {item.template_names.join(', ') || 'None'}</span>
                                    )}
                                </div>
                            ))}
                            {latestProposal.status === 'awaiting_approval' && (
                                <div className={styles.reviewActions}>
                                    <button
                                        type="button"
                                        disabled={decide.isPending}
                                        onClick={() => decide.mutate({ proposal: latestProposal, decision: 'reject' })}
                                    >Reject</button>
                                    <button
                                        type="button"
                                        disabled={decide.isPending}
                                        onClick={() => decide.mutate({ proposal: latestProposal, decision: 'approve' })}
                                    >Approve and run</button>
                                </div>
                            )}
                        </article>
                    )}
                    {decide.isError && <p className={styles.error} role="alert">Could not record your decision: {getErrorMessage(decide.error)}</p>}

                    {taskRuns.map((run) => (
                        <article className={styles.run} key={run.id}>
                            <div className={styles.proposalHeading}>
                                <strong>Run</strong><span className={styles.status}>{run.status.replaceAll('_', ' ')}</span>
                            </div>
                            {run.operations?.map((operation) => (
                                <p key={operation.id}>
                                    {operation.type.replaceAll('_', ' ')}: {operation.status}
                                    {operation.result?.name ? ` — ${operation.result.name}` : ''}
                                    {operation.error?.message ? ` — ${operation.error.message}` : ''}
                                </p>
                            ))}
                            {run.operations?.filter((operation) => operation.result?.href).map((operation) => (
                                <a
                                    className={styles.resultLink}
                                    href={operation.result.href}
                                    key={`${operation.id}-link`}
                                >Open {operation.result.name || operation.type.replaceAll('_', ' ')} in Fractal Goals</a>
                            ))}
                            {['queued', 'running'].includes(run.status) && (
                                <button
                                    type="button"
                                    disabled={cancelRun.isPending}
                                    onClick={() => cancelRun.mutate(run.id)}
                                >Cancel remaining work</button>
                            )}
                            {['succeeded', 'partially_succeeded'].includes(run.status)
                                && run.operations?.some((operation) => operation.status === 'succeeded')
                                && run.operations.filter((operation) => operation.status === 'succeeded')
                                    .every((operation) => operation.result?.inverse?.undo_supported) && (
                                <button
                                    type="button"
                                    disabled={undoRun.isPending}
                                    onClick={() => undoRun.mutate(run.id)}
                                >Review undo</button>
                            )}
                            {!run.operations?.length && <p>Run details will appear as the worker processes this proposal.</p>}
                        </article>
                    ))}
                    {runsQuery.isError && <p className={styles.error} role="alert">Could not load run history: {getErrorMessage(runsQuery.error)}</p>}
                    {cancelRun.isError && <p className={styles.error} role="alert">Could not cancel this run: {getErrorMessage(cancelRun.error)}</p>}
                    {undoRun.isError && <p className={styles.error} role="alert">Could not prepare a safe inverse: {getErrorMessage(undoRun.error)}</p>}
                </section>
            </div>
        </Modal>
    );
}

export default AgentTaskDrawer;
