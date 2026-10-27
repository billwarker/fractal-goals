import { queryKeys } from '../hooks/queryKeys';
import { getSectionItems, withSectionItems } from '../hooks/sessionItemMutationUtils';
import notify from '../utils/notify';
import { invalidateQueryKeys, invalidateSessionLists } from '../utils/queryInvalidation';
import { SESSION_OP } from './opKinds';
import {
    applySessionPause,
    applySessionResume,
    applyTimerAction,
} from './sessionOps';
import { addRoundToRun, applyTagChange, cascadeMemberMetric, removeRoundFromRun } from './circuitOps';
import { patchProgressChartSettings } from './progressChartOps';

// Every queued in-session write has a kind. Each kind knows how to show itself
// in the cache before the server answers (`optimistic`), which is also re-run
// whenever fresh server data lands while the op is still queued, so a refetch
// or a reload never hides an unsynced change.

export { SESSION_OP };

export { findSessionForActivity } from './sessionCache';


const SESSION_QUERY_PREFIXES = new Set(['session', 'session-activities', 'session-notes', 'circuit-runs']);

const keysFor = ({ rootId, sessionId }) => ({
    session: queryKeys.session(rootId, sessionId),
    activities: queryKeys.sessionActivities(rootId, sessionId),
    notes: queryKeys.sessionNotes(rootId, sessionId),
    circuits: queryKeys.sessionCircuitRuns(rootId, sessionId),
});

function patchRun(run, action, at, value = null) {
    if (action === 'startRun') {
        return { ...run, status: 'active', time_start: at, time_stop: null, duration_seconds: null };
    }
    if (action === 'completeRun') {
        const start = run.time_start || at;
        const elapsed = Math.max(0, Math.floor((Date.parse(at) - Date.parse(start)) / 1000));
        return {
            ...run,
            status: 'completed',
            time_start: start,
            time_stop: at,
            completed_at: at,
            is_paused: false,
            duration_seconds: Math.max(0, elapsed - (run.total_paused_seconds || 0)),
        };
    }
    if (action === 'updateRunTiming') {
        return { ...run, ...(value || {}) };
    }
    if (action === 'resetRun') {
        return {
            ...run,
            status: 'planned',
            time_start: null,
            time_stop: null,
            duration_seconds: null,
            completed_at: null,
            total_paused_seconds: 0,
        };
    }
    return run;
}

const mapList = (updater) => (previous) => (Array.isArray(previous) ? updater(previous) : previous);

const patchInstanceById /* fields: an object to merge, or a function of the instance returning one */ = (queryClient, meta, instanceId, fields) => queryClient.setQueryData(
    keysFor(meta).activities,
    mapList((list) => list.map((instance) => (instance.id === instanceId
        ? { ...instance, ...(typeof fields === 'function' ? fields(instance) : fields) } : instance))),
);

// Tags and comparison choices decide which history a timeline lists; refetch once the server has them.
const invalidateTimelines = (queryClient, rootId) => invalidateQueryKeys(queryClient, [['activity-progress-timeline', rootId]], { refetchType: 'all' });

const patchRunById = (queryClient, meta, runId, patch) => queryClient.setQueryData(
    keysFor(meta).circuits,
    mapList((runs) => runs.map((run) => (run.id === runId ? patch(run) : run))),
);

/** Circuit member/slot instances created offline, so circuit views can resolve members before sync. */
function addInstances(queryClient, meta) {
    if (!meta.instances?.length) return;
    queryClient.setQueryData(keysFor(meta).activities, (previous) => {
        const list = Array.isArray(previous) ? previous : [];
        const known = new Set(list.map((instance) => instance.id));
        const added = meta.instances.filter((instance) => !known.has(instance.id));
        return added.length ? [...list, ...added] : list;
    });
}

/** Mirror of the server's append_circuit_run_item on the cached session. */
function insertCircuitItem(sessionData, { sectionIndex = 0, itemIndex = null, runId }) {
    const sections = Array.isArray(sessionData?.sections) && sessionData.sections.length
        ? [...sessionData.sections]
        : [{ name: 'Main', items: [] }];
    const section = sections[sectionIndex];
    if (!section) return sessionData;
    const items = getSectionItems(section).filter((item) => !(item?.type === 'circuit' && item.circuit_run_id === runId));
    const entry = { type: 'circuit', circuit_run_id: runId };
    if (Number.isInteger(itemIndex) && itemIndex >= 0 && itemIndex <= items.length) items.splice(itemIndex, 0, entry);
    else items.push(entry);
    sections[sectionIndex] = withSectionItems(section, items);
    return { ...(sessionData || {}), sections };
}

const OPTIMISTIC = {
    [SESSION_OP.INSTANCE_UPDATE]: (queryClient, op) => {
        patchInstanceById(queryClient, op.meta, op.meta.instanceId, op.meta.updates);
    },
    [SESSION_OP.ACTIVITY_ADD]: (queryClient, op) => {
        const { placeholder } = op.meta;
        queryClient.setQueryData(keysFor(op.meta).activities, (previous) => {
            const list = Array.isArray(previous) ? previous : [];
            return list.some((instance) => instance.id === placeholder.id) ? list : [...list, placeholder];
        });
    },
    [SESSION_OP.ACTIVITY_REMOVE]: (queryClient, op) => {
        queryClient.setQueryData(keysFor(op.meta).activities, mapList((list) => (
            list.filter((instance) => instance.id !== op.meta.instanceId)
        )));
    },
    [SESSION_OP.TIMER]: (queryClient, op) => {
        const { instanceId, action, sessionPaused, extraData } = op.meta;
        queryClient.setQueryData(keysFor(op.meta).activities, mapList((list) => applyTimerAction(list, {
            instanceId,
            action,
            at: op.meta.occurredAt,
            sessionPaused,
            extraData,
        })));
    },
    [SESSION_OP.PAUSE]: (queryClient, op) => {
        const keys = keysFor(op.meta);
        const next = applySessionPause(
            queryClient.getQueryData(keys.session),
            queryClient.getQueryData(keys.activities),
            op.meta.occurredAt,
        );
        queryClient.setQueryData(keys.session, next.session);
        queryClient.setQueryData(keys.activities, next.instances);
    },
    [SESSION_OP.RESUME]: (queryClient, op) => {
        const keys = keysFor(op.meta);
        const next = applySessionResume(
            queryClient.getQueryData(keys.session),
            queryClient.getQueryData(keys.activities),
            op.meta.occurredAt,
        );
        queryClient.setQueryData(keys.session, next.session);
        queryClient.setQueryData(keys.activities, next.instances);
    },
    [SESSION_OP.UPDATE]: (queryClient, op) => {
        const body = op.body || {};
        queryClient.setQueryData(keysFor(op.meta).session, (previous) => {
            if (!previous) return previous;
            const next = { ...previous };
            if (body.session_data) {
                next.attributes = { ...(previous.attributes || {}), session_data: body.session_data };
            }
            if (body.completed !== undefined) {
                next.completed = body.completed;
                next.completed_at = body.completed ? op.meta.occurredAt : null;
                if (next.attributes) next.attributes = { ...next.attributes, completed: body.completed };
            }
            return next;
        });
    },
    [SESSION_OP.CIRCUIT_RUN]: (queryClient, op) => {
        const { runId, action, occurredAt, value } = op.meta;
        queryClient.setQueryData(keysFor(op.meta).circuits, mapList((runs) => (
            action === 'deleteRun'
                ? runs.filter((run) => run.id !== runId)
                : runs.map((run) => (run.id === runId ? patchRun(run, action, occurredAt, value) : run))
        )));
    },
    [SESSION_OP.CIRCUIT_MEMBER]: (queryClient, op) => {
        const { runId, memberId, metrics } = op.meta;
        const asServerMetrics = (metrics || []).map((metric) => ({
            ...metric,
            metric_definition_id: metric.metric_definition_id || metric.metric_id,
            metric_id: metric.metric_id || metric.metric_definition_id,
            split_id: metric.split_id ?? metric.split_definition_id ?? null,
        }));
        queryClient.setQueryData(keysFor(op.meta).circuits, mapList((runs) => runs.map((run) => (
            run.id !== runId ? run : {
                ...run,
                rounds: (run.rounds || []).map((round) => ({
                    ...round,
                    members: (round.members || []).map((member) => (
                        member.id === memberId ? { ...member, metrics: asServerMetrics } : member
                    )),
                })),
            }
        ))));
    },
    [SESSION_OP.CIRCUIT_CREATE]: (queryClient, op) => {
        const { placeholder, sectionIndex, itemIndex } = op.meta;
        const keys = keysFor(op.meta);
        addInstances(queryClient, op.meta);
        queryClient.setQueryData(keys.circuits, (previous) => {
            const runs = Array.isArray(previous) ? previous : [];
            return runs.some((run) => run.id === placeholder.id) ? runs : [...runs, placeholder];
        });
        queryClient.setQueryData(keys.session, (previous) => {
            if (!previous) return previous;
            const sessionData = previous.attributes?.session_data;
            return {
                ...previous,
                attributes: {
                    ...(previous.attributes || {}),
                    session_data: insertCircuitItem(sessionData, { sectionIndex, itemIndex, runId: placeholder.id }),
                },
            };
        });
    },
    [SESSION_OP.CIRCUIT_ROUND_ADD]: (queryClient, op) => {
        addInstances(queryClient, op.meta);
        patchRunById(queryClient, op.meta, op.meta.runId, (run) => addRoundToRun(run, op.meta.round));
    },
    [SESSION_OP.CIRCUIT_ROUND_REMOVE]: (queryClient, op) => {
        patchRunById(queryClient, op.meta, op.meta.runId, (run) => removeRoundFromRun(run, op.meta.roundId));
    },
    [SESSION_OP.CIRCUIT_CASCADE]: (queryClient, op) => {
        patchRunById(queryClient, op.meta, op.meta.runId, (run) => cascadeMemberMetric(run, op.meta));
    },
    [SESSION_OP.CIRCUIT_TAG]: (queryClient, op) => {
        patchRunById(queryClient, op.meta, op.meta.runId, (run) => applyTagChange(run, op.meta));
    },
    [SESSION_OP.INSTANCE_TAGS]: (queryClient, op) => {
        patchInstanceById(queryClient, op.meta, op.meta.instanceId, { tags: op.meta.tags });
    },
    [SESSION_OP.SET_TAGS]: (queryClient, op) => {
        const { instanceId, setId, tags } = op.meta;
        patchInstanceById(queryClient, op.meta, instanceId, (instance) => ({
            sets: (instance.sets || []).map((set) => (set.id === setId ? { ...set, tags } : set)),
        }));
    },
    // Merge: the queued choice keeps the session's template/program day and version.
    [SESSION_OP.PROGRESS_COMPARISON]: (queryClient, op) => patchInstanceById(queryClient, op.meta, op.meta.instanceId,
        (instance) => ({ comparison_context: { ...instance.comparison_context, ...op.meta.comparisonContext } })),
    [SESSION_OP.PROGRESS_CHART]: (queryClient, op) => patchProgressChartSettings(queryClient, op.meta),
    [SESSION_OP.INSTANCE_GOAL_LINK]: (queryClient, op) => {
        const { instanceId, goalId, remove } = op.meta;
        queryClient.setQueryData(keysFor(op.meta).activities, mapList((list) => list.map((instance) => {
            if (instance.id !== instanceId) return instance;
            const ids = new Set(instance.associated_goal_ids || []);
            if (remove) ids.delete(goalId);
            else ids.add(goalId);
            return { ...instance, associated_goal_ids: [...ids].sort() };
        })));
    },
    [SESSION_OP.NOTE_CREATE]: (queryClient, op) => {
        const { note } = op.meta;
        queryClient.setQueryData(keysFor(op.meta).notes, (previous) => {
            const list = Array.isArray(previous) ? previous : [];
            return list.some((entry) => entry.id === note.id) ? list : [note, ...list];
        });
    },
    [SESSION_OP.NOTE_UPDATE]: (queryClient, op) => {
        queryClient.setQueryData(keysFor(op.meta).notes, mapList((list) => list.map((note) => (
            note.id === op.meta.noteId ? { ...note, ...op.body, ...(op.meta.attachments ? { attachments: op.meta.attachments } : {}) } : note
        ))));
    },
    [SESSION_OP.NOTE_DELETE]: (queryClient, op) => {
        queryClient.setQueryData(keysFor(op.meta).notes, mapList((list) => (
            list.filter((note) => note.id !== op.meta.noteId)
        )));
    },
};

export function applyOptimistic(queryClient, op) {
    OPTIMISTIC[op.kind]?.(queryClient, op);
}

function replaceInstance(queryClient, op, instance) {
    if (!instance?.id) return;
    queryClient.setQueryData(keysFor(op.meta).activities, mapList((list) => {
        const exists = list.some((entry) => entry.id === instance.id);
        return exists ? list.map((entry) => (entry.id === instance.id ? instance : entry)) : [...list, instance];
    }));
}

export function invalidateSessionAfterSync(queryClient, rootId, sessionId) {
    invalidateQueryKeys(queryClient, [
        queryKeys.session(rootId, sessionId),
        queryKeys.sessionActivities(rootId, sessionId),
        queryKeys.sessionCircuitRuns(rootId, sessionId),
        queryKeys.sessionGoalsView(rootId, sessionId),
        queryKeys.sessionNotes(rootId, sessionId),
        queryKeys.sessionProgressSummary(sessionId),
        queryKeys.sessionsEvidenceGoalsRoot(rootId),
        queryKeys.sessionsFlowtreeMetricsRoot(rootId),
        queryKeys.programDayReadModelRoot(rootId),
        queryKeys.activityHistoryRoot(rootId),
        queryKeys.progressRoot(),
    ]);
    invalidateSessionLists(queryClient, rootId, queryKeys);
}

/** Wire session op kinds to the query cache. Returns a cleanup function. */
export function registerSessionOpHandlers(outbox, queryClient) {
    const scopeRoots = new Map();
    let pendingScopes = new Set();

    const ack = (op, response) => {
        const data = response?.data;
        const { instanceId, sessionId } = op.meta;
        switch (op.kind) {
            case SESSION_OP.INSTANCE_UPDATE:
            case SESSION_OP.ACTIVITY_ADD:
                if (!outbox.hasPendingEntity(instanceId)) replaceInstance(queryClient, op, data);
                break;
            case SESSION_OP.TIMER: {
                if (!data) break;
                const { completed_activity: completedActivity, ...instance } = data;
                if (!outbox.hasPendingEntity(instanceId)) replaceInstance(queryClient, op, instance);
                if (completedActivity && !outbox.hasPendingEntity(completedActivity.id)) {
                    replaceInstance(queryClient, op, completedActivity);
                }
                break;
            }
            case SESSION_OP.PAUSE:
            case SESSION_OP.RESUME:
            case SESSION_OP.UPDATE:
                if (data?.id && !outbox.hasPendingEntity(sessionId)) {
                    queryClient.setQueryData(keysFor(op.meta).session, data);
                }
                break;
            case SESSION_OP.CIRCUIT_RUN:
            case SESSION_OP.CIRCUIT_MEMBER:
            case SESSION_OP.CIRCUIT_CREATE:
            case SESSION_OP.CIRCUIT_ROUND_ADD:
            case SESSION_OP.CIRCUIT_ROUND_REMOVE:
            case SESSION_OP.CIRCUIT_CASCADE:
            case SESSION_OP.CIRCUIT_TAG:
                if (op.meta.action === 'deleteRun' || !data?.id || outbox.hasPendingEntity(op.meta.runId)) break;
                queryClient.setQueryData(keysFor(op.meta).circuits, mapList((runs) => (
                    runs.map((run) => (run.id === data.id ? data : run))
                )));
                break;
            case SESSION_OP.INSTANCE_TAGS:
            case SESSION_OP.SET_TAGS:
                invalidateTimelines(queryClient, op.meta.rootId);
                // The new assignment version keeps later online edits' concurrency checks valid.
                if (data?.version == null || outbox.hasPendingEntity(op.meta.setId || instanceId)) break;
                queryClient.setQueryData(keysFor(op.meta).activities, mapList((list) => list.map((instance) => {
                    if (instance.id !== instanceId) return instance;
                    // Tags change what the instance compares against, so its progress arrives with the ack.
                    const progress = data.progress_comparison !== undefined
                        ? { progress_comparison: data.progress_comparison } : {};
                    if (!op.meta.setId) return { ...instance, ...progress, tag_assignment_version: data.version };
                    return {
                        ...instance,
                        ...progress,
                        sets: (instance.sets || []).map((set) => (
                            set.id === op.meta.setId ? { ...set, tag_assignment_version: data.version } : set
                        )),
                    };
                })));
                break;
            case SESSION_OP.PROGRESS_CHART: // the series refetches with the timelines
            case SESSION_OP.PROGRESS_COMPARISON:
                invalidateTimelines(queryClient, op.meta.rootId);
                if (!data?.comparison_context || outbox.hasPendingEntity(instanceId)) break;
                patchInstanceById(queryClient, op.meta, instanceId, {
                    comparison_context: data.comparison_context,
                    progress_comparison: data.progress_comparison,
                });
                break;
            case SESSION_OP.INSTANCE_GOAL_LINK:
                if (Array.isArray(data?.associated_goal_ids) && !outbox.hasPendingEntity(instanceId)) {
                    patchInstanceById(queryClient, op.meta, instanceId, { associated_goal_ids: data.associated_goal_ids });
                }
                invalidateQueryKeys(queryClient, [
                    queryKeys.fractalTree(op.meta.rootId),
                    queryKeys.goals(op.meta.rootId),
                    queryKeys.goalTimelinesRoot(op.meta.rootId),
                    queryKeys.goalConditionRoot(op.meta.rootId),
                    queryKeys.goalAnalytics(op.meta.rootId),
                ]);
                break;
            case SESSION_OP.QUICK_COMPLETE:
                // The new session shows up in lists once its scope drains (invalidateSessionAfterSync).
                break;
            case SESSION_OP.NOTE_CREATE:
            case SESSION_OP.NOTE_UPDATE:
                if (data?.id && !outbox.hasPendingEntity(data.id)) {
                    queryClient.setQueryData(keysFor(op.meta).notes, mapList((list) => (
                        list.map((note) => (note.id === data.id ? { ...note, ...data } : note))
                    )));
                }
                break;
            default:
                break;
        }
    };

    const reject = (op, error) => {
        notify.error(`A change couldn't be saved: ${error?.message || 'the server rejected it'}`);
        if (!outbox.hasPending(op.scope)) invalidateSessionAfterSync(queryClient, op.meta.rootId, op.meta.sessionId);
    };

    const unregister = Object.values(SESSION_OP).map((kind) => outbox.registerHandler(kind, {
        optimistic: (op) => applyOptimistic(queryClient, op),
        onAck: ack,
        onReject: reject,
    }));

    const reapply = (scope) => {
        outbox.pendingOps(scope).forEach((op) => applyOptimistic(queryClient, op));
    };

    // Server data that lands while ops are queued must not hide them.
    const unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
        if (event?.type !== 'updated' || event.action?.type !== 'success' || event.action.manual) return;
        const [prefix, , scope] = event.query.queryKey || [];
        if (!SESSION_QUERY_PREFIXES.has(prefix) || !scope || !outbox.hasPending(scope)) return;
        reapply(scope);
    });

    // One refresh per session once its queue drains, instead of one per write.
    const unsubscribeOutbox = outbox.subscribe(() => {
        const next = new Set();
        outbox.pendingOps().forEach((op) => {
            if (!op.scope) return;
            next.add(op.scope);
            if (op.meta?.rootId) scopeRoots.set(op.scope, op.meta.rootId);
        });
        pendingScopes.forEach((scope) => {
            if (next.has(scope)) return;
            const rootId = scopeRoots.get(scope);
            if (rootId) invalidateSessionAfterSync(queryClient, rootId, scope);
        });
        pendingScopes = next;
    });

    void outbox.ready().then(() => {
        new Set(outbox.pendingOps().map((op) => op.scope).filter(Boolean)).forEach(reapply);
    });

    return () => {
        unregister.forEach((off) => off());
        unsubscribeCache();
        unsubscribeOutbox();
    };
}
